from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool

from ..auth import require_role
from ..db import db, serialize
from ..ml.ats import extract_skills, normalize_skill, score_resume
from ..ml.eligibility import check_eligibility
from ..ml.health import health_score
from ..ml.insights import (assessment_insights, headline, reached, resume_insights,
                           rule_suggestions_resume)
from ..ml.llm import personalised_suggestions, review_resume
from ..documents import extract_text
from ..schemas import batch_error, FUNNEL, ROUND_LABELS, STAGE_LABELS, TERMINAL, NameIn, OfferResponseIn, ProfileIn, ResumeTextIn
from ..workflow import ACCEPTING, STUDENT_VISIBLE, college_staff, drive_company_staff, drive_label, log_update, notify, now
from .drives import get_drive, oid, screening_view, student_round

router = APIRouter(prefix="/api/students", tags=["students"])
student_only = require_role("student")


async def _save_resume(user: dict, text: str, filename: str) -> dict:
    ats = score_resume(text)
    review = await run_in_threadpool(review_resume, text, ats)
    resume = {
        "text": text,
        "filename": filename,
        "ats": ats,
        "review": review,
        "updated_at": datetime.now(timezone.utc),
    }
    update = {"resume": resume}
    # merge skills detected in the resume into the profile
    skills = sorted(set(user.get("profile", {}).get("skills", [])) | set(extract_skills(text)))
    if user.get("profile"):
        update["profile.skills"] = skills
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": update})
    return resume


@router.put("/me/profile")
async def update_profile(body: ProfileIn, user: dict = Depends(student_only)):
    # keeping the batch they signed up with is fine; changing it must stay within the open batches
    if body.grad_year != (user.get("profile") or {}).get("grad_year") and batch_error(body.grad_year):
        raise HTTPException(400, batch_error(body.grad_year))
    profile = body.model_dump()
    profile["skills"] = sorted({normalize_skill(s) for s in profile["skills"] if s.strip()})
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"profile": profile}})
    return profile


@router.put("/me/name")
async def change_name(body: NameIn, user: dict = Depends(student_only)):
    """Students may fix their name (email stays fixed). The placement cell is told and can accept it,
    ask about it, undo it, or suspend the account."""
    clean = lambda x: " ".join(x.split())
    first, last = clean(body.first_name), clean(body.last_name)
    if not first or not last:
        raise HTTPException(400, "Enter both first and last name")
    new = f"{first} {last}"
    if new == user["name"]:
        return {"name": new, "first_name": first, "last_name": last, "changed": False}
    prev = user.get("name_change") or {}
    # while a change is still unreviewed, "old" stays the name the placement cell last accepted
    unreviewed = prev.get("status") in ("pending", "asked")
    old_first = prev["old_first_name"] if unreviewed else (user.get("first_name") or user["name"].split()[0])
    old_last = prev["old_last_name"] if unreviewed else (user.get("last_name") or " ".join(user["name"].split()[1:]))
    old_name = prev["old_name"] if unreviewed else user["name"]
    t = now()
    await db.users.update_one({"_id": ObjectId(user["id"])}, {
        "$set": {"first_name": first, "last_name": last, "name": new,
                 "name_change": {"old_first_name": old_first, "old_last_name": old_last, "old_name": old_name,
                                 "new_name": new, "at": t, "status": "pending"}},
        "$push": {"name_history": {"from": user["name"], "to": new, "at": t}}})
    if new == old_name:  # changed back to the accepted name: nothing left to review
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"name_change.status": "ok"}})
    else:
        roll = f" (roll no. {user['roll_number']})" if user.get("roll_number") else ""
        await notify(await college_staff(user["college_id"]), f"Name changed: {old_name} → {new}",
                     f"{new}{roll} changed their name. Check it against your records: accept it, message them, "
                     "undo it, or suspend the account.", "/students?view=names", "student")
    return {"name": new, "first_name": first, "last_name": last, "changed": True}


@router.post("/me/resume")
async def upload_resume(file: UploadFile = File(...), user: dict = Depends(student_only)):
    text = extract_text(file.filename or "", await file.read(), "resume")
    if len(text) < 50:
        raise HTTPException(400, "No readable text found. If it's a scanned image, upload a text PDF or Word file.")
    return await _save_resume(user, text, file.filename or "resume")


@router.post("/me/resume/text")
async def resume_from_text(body: ResumeTextIn, user: dict = Depends(student_only)):
    return await _save_resume(user, body.text, "pasted-resume.txt")


@router.get("/me/resume/match/{drive_id}")
async def match_drive(drive_id: str, user: dict = Depends(student_only)):
    resume = user.get("resume")
    if not resume:
        raise HTTPException(400, "Upload a resume first")
    drive = await db.drives.find_one({"_id": oid(drive_id)})
    if (not drive or drive.get("college_id") != user.get("college_id")
            or drive.get("status") not in ("published", "in_progress", "completed")):
        raise HTTPException(404, "Drive not found")
    ats = score_resume(resume["text"], drive["description"], drive.get("required_skills"))
    review = await run_in_threadpool(review_resume, resume["text"], ats, drive["description"])
    return {"ats": ats, "review": review}


FIT_THRESHOLD = 60  # % of a drive's required skills your resume shows


@router.get("/me/drive-fit")
async def drive_fit(user: dict = Depends(student_only)):
    """Every drive that has come to your campus, how well your resume covers its required
    skills, and whether you applied. A drive "matches your skills" when your resume shows at
    least 60% of its required skills."""
    resume = user.get("resume")
    drives = await db.drives.find({"college_id": user.get("college_id"),
                                   "status": {"$in": list(STUDENT_VISIBLE)}}).sort("created_at", -1).to_list(None)
    apps = {a["drive_id"]: a async for a in db.applications.find({"student_id": user["id"]}, {"drive_id": 1, "status": 1})}
    today = datetime.now(timezone.utc).date().isoformat()
    rows = []
    for d in drives:
        did = str(d["_id"])
        ats = score_resume(resume["text"], d["description"], d.get("required_skills")) if resume else None
        open_now = d.get("status") in ACCEPTING and not (d.get("deadline") and d["deadline"] < today)
        eligible, reasons = check_eligibility(user, d)
        app = apps.get(did)
        rows.append({
            "drive_id": did, "company": d["company"], "role": d["role"], "ctc_lpa": d.get("ctc_lpa"),
            "deadline": d.get("deadline"), "open": open_now,
            "skill_fit": ats["skill_coverage"] if ats else None, "match": ats["score"] if ats else None,
            "matched_skills": ats["matched_skills"] if ats else [], "missing_skills": ats["missing_skills"] if ats else [],
            "fits": bool(ats and ats["skill_coverage"] >= FIT_THRESHOLD),
            "eligible": eligible, "ineligible_reasons": reasons,
            "application": {"id": str(app["_id"]), "status": app["status"]} if app else None,
        })
    rows.sort(key=lambda r: (-(r["skill_fit"] or 0), r["company"]))
    fits = [r for r in rows if r["fits"]]
    not_applied = [r for r in fits if not r["application"]]
    return {
        "has_resume": bool(resume), "threshold": FIT_THRESHOLD,
        "summary": {
            "total": len(rows),
            "fits": len(fits),
            "applied": sum(1 for r in fits if r["application"]),
            "not_applied": len(not_applied),
            "can_still_apply": sum(1 for r in not_applied if r["open"] and r["eligible"]),
            "missed": sum(1 for r in not_applied if not r["open"] and r["eligible"]),
        },
        "drives": rows,
    }


async def student_health(user: dict, apps: Optional[list] = None) -> dict:
    if apps is None:
        apps = await db.applications.find({"student_id": user["id"]}).to_list(None)
    ats_score = (user.get("resume") or {}).get("ats", {}).get("score", 0)
    return health_score(user.get("profile", {}), ats_score, apps)


@router.get("/me/dashboard")
async def dashboard(user: dict = Depends(student_only)):
    apps = await db.applications.find({"student_id": user["id"]}, {"resume_snapshot": 0, "resume_suggestions": 0}
                                      ).sort("applied_at", -1).to_list(None)
    drive_ids = [ObjectId(a["drive_id"]) for a in apps]
    drives = {str(d["_id"]): d async for d in db.drives.find({"_id": {"$in": drive_ids}})}

    open_drives = await db.drives.find({"status": {"$in": list(ACCEPTING)}, "college_id": user.get("college_id")}).to_list(None)
    applied = {a["drive_id"] for a in apps}
    eligible_open = [d for d in open_drives if check_eligibility(user, d)[0] and str(d["_id"]) not in applied]

    return {
        "profile_complete": bool(user.get("profile", {}).get("branch")),
        "has_resume": bool(user.get("resume")),
        "health": await student_health(user, apps),
        "placement": user.get("placement"),
        "ats_score": (user.get("resume") or {}).get("ats", {}).get("score"),
        "applications": [
            {
                **serialize(a),
                "company": drives.get(a["drive_id"], {}).get("company"),
                "role": drives.get(a["drive_id"], {}).get("role"),
                "ctc_lpa": drives.get(a["drive_id"], {}).get("ctc_lpa"),
                "drive_status": drives.get(a["drive_id"], {}).get("status"),
            }
            for a in apps
        ],
        "eligible_open_drives": len(eligible_open),
        "upcoming_rounds": _upcoming(apps, drives),
    }


def _upcoming(apps: list, drives: dict) -> list:
    """Rounds of drives you're still in. Only confirmed dates are presented as dates."""
    out = []
    for a in apps:
        if a["status"] in TERMINAL:
            continue
        d = drives.get(a["drive_id"])
        if not d:
            continue
        for r in d.get("rounds", []):
            sr = student_round(r)
            if sr["status"] == "cancelled" or (sr["date"] and sr["date"] < now().date().isoformat()):
                continue
            out.append({**sr, "drive_id": a["drive_id"], "company": d["company"], "role": d["role"]})
    return sorted(out, key=lambda r: (r["date"] is None, r["date"] or ""))[:8]


def _timeline(app: dict, drive: dict) -> list:
    """Round-by-round view of an application."""
    rounds = [("resume_screening", "shortlisted"), ("assessment", "assessment_cleared"),
              ("interview", "offered"), ("offer", "accepted")]
    out, blocked = [], False
    for key, stage in rounds:
        if blocked:
            state = "not_reached"
        elif reached(app, stage):
            state = "cleared"
        elif app.get("rejected_round") == key:
            state, blocked = "rejected", True
        else:
            state, blocked = ("in_progress" if app["status"] != "rejected" else "not_reached"), True
        at = next((h["at"] for h in app.get("history", []) if h["status"] == stage), None)
        out.append({"round": key, "label": ROUND_LABELS[key], "state": state, "at": at})
    return out


@router.get("/me/applications/{app_id}")
async def application_detail(app_id: str, user: dict = Depends(student_only)):
    app = await db.applications.find_one({"_id": oid(app_id), "student_id": user["id"]})
    if not app:
        raise HTTPException(404, "Application not found")
    drive = await get_drive(app["drive_id"])
    peers = await db.applications.find({"drive_id": app["drive_id"]}).to_list(None)

    insights = {"resume": None, "assessment": None}

    # resume screening: compare with everyone who was shortlisted
    if app["status"] != "applied":
        cleared_apps = [p for p in peers if p["_id"] != app["_id"] and reached(p, "shortlisted")]
        missing = [ObjectId(p["student_id"]) for p in cleared_apps if not p.get("profile_snapshot")]
        profiles = {str(u["_id"]): u.get("profile", {}) async for u in db.users.find({"_id": {"$in": missing}})}
        cohort = [{"app": p, "profile": p.get("profile_snapshot") or profiles.get(p["student_id"], {})} for p in cleared_apps]
        you_user = {**user, "profile": app.get("profile_snapshot") or user.get("profile", {})}
        ins = resume_insights(app, you_user, cohort, drive)
        ins["cleared"] = reached(app, "shortlisted")
        ins["headline"] = ("Your resume was shortlisted." if ins.get("brief") and ins["cleared"]
                           else headline("resume_screening", ins["cleared"]))
        if ins["cleared"]:
            ins["reasons"] = []  # reasons only make sense for a rejection
        if ins["available"] and not ins["cleared"]:
            if not app.get("resume_suggestions"):
                resume_text = app.get("resume_snapshot") or (user.get("resume") or {}).get("text", "")
                sugg = await run_in_threadpool(personalised_suggestions, resume_text, drive, ins,
                                               rule_suggestions_resume(ins))
                await db.applications.update_one({"_id": app["_id"]}, {"$set": {"resume_suggestions": sugg}})
                app["resume_suggestions"] = sugg
            ins["suggestions"] = app["resume_suggestions"]
        insights["resume"] = ins

    # assessment: compare section scores with those who cleared it
    if app.get("assessment"):
        assessed = [p for p in peers if p.get("assessment")]
        ins = assessment_insights(app, assessed)
        ins["cleared"] = reached(app, "assessment_cleared")
        decided = ins["cleared"] or app.get("rejected_round") == "assessment"
        ins["headline"] = (("You cleared the assessment." if ins.get("brief") and ins["cleared"] else headline("assessment", ins["cleared"]))
                           if decided else "Scores recorded — results pending.")
        insights["assessment"] = ins

    # the company's reason when they turned the application down (e.g. "Below the assessment cut-off")
    if app["status"] == "rejected":
        why = next((h.get("reason") for h in reversed(app.get("history", [])) if h.get("status") == "rejected" and h.get("reason")), None)
        target = "assessment" if app.get("rejected_round") == "assessment" else "resume" if app.get("rejected_round") == "resume_screening" else None
        if why and target and insights.get(target):
            insights[target]["company_reason"] = why

    # recruiter-approved explanations only - never private notes or scorecards
    review = app.get("screening_review") or {}
    screening = None
    if review.get("share_with_student"):
        v = screening_view(app, drive)
        screening = {"criteria": v["criteria"], "summary": v["summary"], "note": review.get("note_to_student"),
                     "reviewed_at": review.get("reviewed_at")}
        for c in screening["criteria"]:
            c.pop("ai_level", None)
            c.pop("corrected", None)
    feedback = [{k: f.get(k) for k in ("id", "round", "strengths", "improvements", "at")}
                for f in app.get("feedback", []) if f.get("share_with_student")]
    hidden = ("resume_snapshot", "resume_suggestions", "screening_review", "feedback")
    drive_view = serialize({k: v for k, v in drive.items() if k not in ("rounds", "owner_name", "recruiter_id")})
    drive_view["rounds"] = [student_round(r) for r in drive.get("rounds", [])]
    return {
        "application": {**serialize({k: v for k, v in app.items() if k not in hidden}),
                        "status_label": STAGE_LABELS[app["status"]]},
        "drive": drive_view,
        "timeline": _timeline(app, drive),
        "insights": insights,
        "screening": screening,
        "feedback": feedback,
    }


@router.post("/me/applications/{app_id}/withdraw")
async def withdraw(app_id: str, user: dict = Depends(student_only)):
    app = await db.applications.find_one({"_id": oid(app_id), "student_id": user["id"]})
    if not app:
        raise HTTPException(404, "Application not found")
    if app["status"] in TERMINAL or app["status"] == "offered":
        raise HTTPException(400, "Respond to the offer instead" if app["status"] == "offered" else "Application is already closed")
    drive = await get_drive(app["drive_id"])
    t = now()
    await db.applications.update_one({"_id": app["_id"]}, {"$set": {"status": "withdrawn", "updated_at": t},
                                                           "$push": {"history": {"status": "withdrawn", "at": t, "by": "student"}}})
    await notify(await drive_company_staff(drive), "Candidate withdrew", drive_label(drive), f"/drives/{app['drive_id']}/candidates", "application")
    await notify(await college_staff(drive["college_id"]), "Student withdrew", f"{user['name']} · {drive_label(drive)}",
                 f"/drives/{app['drive_id']}", "application")
    await log_update(entity="application", entity_id=app_id, drive_id=app["drive_id"], college_id=drive["college_id"],
                     company_id=drive.get("company_id"), action="stage", field="status", old=app["status"], new="withdrawn",
                     summary="Candidate withdrew", by=user, extra={"student_id": user["id"]})
    return {"id": app_id, "status": "withdrawn"}


@router.post("/me/applications/{app_id}/offer")
async def respond_offer(app_id: str, body: OfferResponseIn, user: dict = Depends(student_only)):
    app = await db.applications.find_one({"_id": oid(app_id), "student_id": user["id"]})
    if not app:
        raise HTTPException(404, "Application not found")
    if app["status"] != "offered":
        raise HTTPException(400, "There's no open offer on this application")
    drive = await get_drive(app["drive_id"])
    if app.get("drive_cancelled") or drive.get("status") == "cancelled":
        raise HTTPException(400, "This drive was cancelled")
    new = "accepted" if body.decision == "accept" else "declined"
    t = now()
    await db.applications.update_one({"_id": app["_id"]}, {"$set": {"status": new, "updated_at": t},
                                                           "$push": {"history": {"status": new, "at": t, "by": "student"}}})
    if new == "accepted":
        await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"placement": {
            "status": "placed", "company": drive["company"], "ctc_lpa": drive["ctc_lpa"], "drive_id": app["drive_id"], "at": t}}})
    msg = f"{user['name']} {new} the offer"
    await notify(await drive_company_staff(drive), f"Offer {new} · {drive['role']}", msg, f"/drives/{app['drive_id']}/candidates", "offer")
    await notify(await college_staff(drive["college_id"]), f"Offer {new} · {drive_label(drive)}", msg, f"/drives/{app['drive_id']}", "offer")
    await log_update(entity="application", entity_id=app_id, drive_id=app["drive_id"], college_id=drive["college_id"],
                     company_id=drive.get("company_id"), action="offer", field="status", old="offered", new=new,
                     summary=f"Offer {new} by candidate", by=user, extra={"student_id": user["id"]})
    return {"id": app_id, "status": new}


@router.get("/me/analytics")
async def my_analytics(user: dict = Depends(student_only)):
    from ..ml.student_analytics import build

    college_drives = await db.drives.find({"college_id": user.get("college_id")}).to_list(None)
    drive_ids = [str(d["_id"]) for d in college_drives]
    college_apps = await db.applications.find({"drive_id": {"$in": drive_ids}}, {"resume_snapshot": 0}).to_list(None)
    apps = [a for a in college_apps if a["student_id"] == user["id"]]
    my_drives = {a["drive_id"] for a in apps}
    peers = {}
    for a in college_apps:
        if a["drive_id"] in my_drives:
            peers.setdefault(a["drive_id"], []).append(a)
    missing = [ObjectId(p["student_id"]) for ps in peers.values() for p in ps if not p.get("profile_snapshot")]
    peer_profiles = {str(u["_id"]): u.get("profile", {}) async for u in db.users.find({"_id": {"$in": missing}})}
    drives = {str(d["_id"]): d for d in college_drives}
    return build(user, apps, drives, peers, peer_profiles, college_apps, college_drives)
