"""Placement drives: one shared record that powers the company, college and student portals.

Lifecycle: Draft -> Sent for review -> Needs changes / Approved -> Published -> In progress
-> Completed / Cancelled.

  * The company creates and edits a drive while it is a draft.
  * The placement cell reviews it, then publishes it to students.
  * After review, a company edit to anything students see (JD, eligibility, deadline,
    round dates...) becomes a *change request*. Students keep seeing the confirmed value
    (marked "update pending confirmation") until the placement cell approves it.
  * Every change is written to the update history and the right people are notified.
"""
import uuid

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from ..auth import active_user, require_role
from ..db import db, serialize
from ..ml.ats import evidence_report, extract_skills, normalize_skill, score_resume
from ..ml.eligibility import check_eligibility, eligibility_rules
from ..schemas import (FUNNEL, ROUND_AT_STATUS, STAGE_LABELS, TERMINAL, AssessmentIn, ChangeDecisionIn, DriveIn,
                       DrivePatch, DriveReviewIn, DriveStatusIn, FeedbackIn, HoldIn, JDIn, RoundIn, RoundPatch,
                       ScreeningReviewIn, StatusIn)
from ..workflow import (ACCEPTING, DRIVE_STATUS, FIELD_LABELS, LIVE, ROUND_STATUS, STUDENT_FACING_FIELDS,
                        STUDENT_VISIBLE, affected_students, college_staff, drive_applicants, drive_company_staff,
                        drive_label, eligible_students, log_update, notify, now)

router = APIRouter(prefix="/api", tags=["drives"])
managers = require_role("recruiter", "coordinator")


def oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(404, "Not found")


async def get_drive(drive_id: str) -> dict:
    drive = await db.drives.find_one({"_id": oid(drive_id)})
    if not drive:
        raise HTTPException(404, "Drive not found")
    return drive


# ---- who may do what --------------------------------------------------------------
def is_company(user: dict, drive: dict) -> bool:
    return user["role"] == "recruiter" and (
        drive.get("recruiter_id") == user["id"]
        or (drive.get("company_id") and drive.get("company_id") == user.get("company_id")))


def is_college(user: dict, drive: dict) -> bool:
    return user["role"] == "coordinator" and drive.get("college_id") == user.get("college_id")


def can_manage(user: dict, drive: dict) -> bool:
    """Staff who can see the drive's internal record (company owner or that college)."""
    if is_college(user, drive):
        # a company's private draft isn't the college's business until it's sent for review
        return drive.get("status") != "draft" or not drive.get("recruiter_id")
    return is_company(user, drive)


def owns_hiring(user: dict, drive: dict) -> bool:
    """Recruiters own hiring decisions. The college only runs them for drives it created itself."""
    return is_company(user, drive) or (is_college(user, drive) and not drive.get("recruiter_id"))


def _check_view(user: dict, drive: dict):
    if user["role"] == "student":
        if drive.get("college_id") != user.get("college_id") or drive.get("status") not in STUDENT_VISIBLE:
            raise HTTPException(404, "Drive not found")
    elif user["role"] != "admin" and not can_manage(user, drive):
        raise HTTPException(404, "Drive not found")


async def college_names() -> dict:
    return {str(c["_id"]): c["name"] async for c in db.colleges.find({}, {"name": 1})}


# ---- views ------------------------------------------------------------------------
def student_round(r: dict) -> dict:
    """What a student may see of a round: only confirmed dates are presented as dates."""
    out = {k: r.get(k) for k in ("id", "name", "kind", "venue", "instructions", "updated_at")}
    status = r.get("status", "planned")
    out["status"] = status
    out["status_label"] = ROUND_STATUS.get(status, status)
    out["date"] = r.get("date") if r.get("confirmed") and status != "cancelled" else None
    out["time"] = r.get("time") if out["date"] else None
    out["pending_change"] = bool(r.get("proposed"))
    if status == "cancelled":
        out["note"] = "This round was cancelled."
    elif r.get("proposed"):
        out["note"] = "New date pending confirmation" if out["date"] else "Date being finalised"
        out["status_label"] = "Pending confirmation"
    elif not out["date"]:
        out["note"] = "Date not confirmed yet"
    if status == "rescheduled":
        prev = [h.get("old", {}).get("date") for h in r.get("history", []) if h.get("old", {}).get("date")]
        out["previous_date"] = prev[-1] if prev else None
    return out


def drive_out(d: dict) -> dict:
    item = serialize(d)
    item["status_label"] = DRIVE_STATUS.get(d.get("status"), d.get("status"))
    return item


async def _pending_changes(drive_ids):
    out = {}
    async for row in db.change_requests.aggregate([
            {"$match": {"drive_id": {"$in": list(drive_ids)}, "status": "pending"}},
            {"$group": {"_id": "$drive_id", "n": {"$sum": 1}, "fields": {"$addToSet": "$field"}}}]):
        out[row["_id"]] = row
    return out


@router.get("/drives")
async def list_drives(user: dict = Depends(active_user)):
    if user["role"] == "recruiter":
        query = {"$or": [{"recruiter_id": user["id"]}, {"company_id": user.get("company_id") or "-"}]}
    elif user["role"] == "coordinator":
        query = {"college_id": user.get("college_id"),
                 "$or": [{"status": {"$ne": "draft"}}, {"recruiter_id": None}]}
    elif user["role"] == "student":
        query = {"college_id": user.get("college_id"), "status": {"$in": list(STUDENT_VISIBLE)}}
    else:
        query = {}
    drives = await db.drives.find(query).sort("created_at", -1).to_list(None)
    names = await college_names()
    ids = [str(d["_id"]) for d in drives]

    counts = {}
    async for row in db.applications.aggregate([{"$match": {"drive_id": {"$in": ids}}},
                                                {"$group": {"_id": "$drive_id", "n": {"$sum": 1}}}]):
        counts[row["_id"]] = row["n"]
    pending = await _pending_changes(ids)

    mine = {}
    if user["role"] == "student":
        mine = {a["drive_id"]: a async for a in db.applications.find({"student_id": user["id"]})}

    resume_text = (user.get("resume") or {}).get("text")
    out = []
    for d in drives:
        item = drive_out(d)
        item["applicants"] = counts.get(item["id"], 0)
        item["college"] = names.get(d.get("college_id"))
        p = pending.get(item["id"])
        if user["role"] == "student":
            ok, reasons = check_eligibility(user, d)
            item["eligible"] = ok
            item["ineligible_reasons"] = reasons
            item["accepting"] = d.get("status") in ACCEPTING
            app = mine.get(item["id"])
            item["applied"] = app is not None
            item["application"] = {"id": str(app["_id"]), "status": app["status"]} if app else None
            item["rounds"] = [student_round(r) for r in d.get("rounds", [])]
            item["pending_fields"] = sorted(f for f in (p or {}).get("fields", []) if f in STUDENT_FACING_FIELDS)
            if resume_text:
                item["match_score"] = score_resume(resume_text, d["description"], d.get("required_skills"))["score"]
        else:
            item["pending_changes"] = p["n"] if p else 0
        out.append(item)
    return out


@router.post("/drives/extract-skills")
async def extract_from_jd(body: JDIn, user: dict = Depends(managers)):
    """Step 1 of screening: the system suggests skills from the JD; the recruiter edits and confirms them."""
    return {"skills": extract_skills(body.description)}


def _new_round(r: dict) -> dict:
    return {**r, "id": uuid.uuid4().hex[:8], "status": "planned", "confirmed": False, "proposed": None,
            "history": [], "updated_at": now()}


@router.post("/drives")
async def create_drive(body: DriveIn, user: dict = Depends(managers)):
    doc = body.model_dump(exclude={"submit"})
    if user["role"] == "coordinator":
        doc["college_id"] = user["college_id"]
        doc["company_id"] = None
    else:
        if not doc.get("college_id") or not await db.colleges.find_one({"_id": oid(doc["college_id"]), "status": "approved"}):
            raise HTTPException(400, "Choose the college this drive is for")
        if not await db.connections.find_one({"college_id": doc["college_id"], "company_id": user.get("company_id"),
                                              "status": "accepted"}):
            raise HTTPException(403, "Connect with this college before posting a drive there")
        doc["company"] = user["company"]
        doc["company_id"] = user.get("company_id")
    doc["required_skills"] = sorted({normalize_skill(s) for s in doc["required_skills"] if s.strip()})
    doc["preferred_skills"] = sorted({normalize_skill(s) for s in doc["preferred_skills"] if s.strip()}
                                     - set(doc["required_skills"]))
    doc["assessment_sections"] = [s.strip() for s in doc["assessment_sections"] if s.strip()]
    doc["rounds"] = [_new_round(r) for r in doc["rounds"]]

    if user["role"] == "coordinator":
        status = "approved"  # the college owns it; it can publish when ready
        for r in doc["rounds"]:
            if r.get("date"):
                r.update(status="confirmed", confirmed=True)
    elif body.submit:
        if not body.criteria_confirmed or not doc["required_skills"]:
            raise HTTPException(400, "Review and confirm the screening criteria (required skills) before sending for review")
        status = "review"
    else:
        status = "draft"
    t = now()
    doc.update(recruiter_id=user["id"] if user["role"] == "recruiter" else None, status=status,
               created_at=t, updated_at=t, owner_name=user["name"])
    res = await db.drives.insert_one(doc)
    doc["_id"] = res.inserted_id
    did = str(res.inserted_id)
    n = 0
    if status == "review":
        n = await notify(await college_staff(doc["college_id"]), "New drive to review",
                         f"{drive_label(doc)} was sent for review.", f"/drives/{did}", "drive")
    await log_update(entity="drive", entity_id=did, drive_id=did, college_id=doc["college_id"],
                     company_id=doc.get("company_id"), action="created",
                     summary=f"Drive created ({DRIVE_STATUS[status]})", by=user,
                     notified=f"{n} placement staff" if n else None)
    return drive_out(doc)


@router.get("/drives/{drive_id}")
async def drive_detail(drive_id: str, user: dict = Depends(active_user)):
    drive = await get_drive(drive_id)
    _check_view(user, drive)
    pending = await db.change_requests.find({"drive_id": drive_id, "status": "pending"}).sort("created_at", 1).to_list(None)
    if user["role"] == "student":
        item = drive_out({k: v for k, v in drive.items() if k not in ("rounds", "owner_name", "recruiter_id")})
        item["rounds"] = [student_round(r) for r in drive.get("rounds", [])]
        item["eligible"], item["ineligible_reasons"] = check_eligibility(user, drive)
        item["eligibility_rules"] = eligibility_rules(user, drive)
        item["accepting"] = drive.get("status") in ACCEPTING
        item["pending_fields"] = sorted({c["field"] for c in pending if c["field"] in STUDENT_FACING_FIELDS})
        app = await db.applications.find_one({"drive_id": drive_id, "student_id": user["id"]}, {"status": 1})
        item["application"] = {"id": str(app["_id"]), "status": app["status"]} if app else None
        return item
    item = drive_out(drive)
    item["pending_changes"] = [serialize(c) for c in pending]
    item["can"] = {
        "edit_directly": (is_company(user, drive) and drive["status"] in ("draft", "changes_requested", "review"))
                         or is_college(user, drive),
        "propose": is_company(user, drive) and drive["status"] in ("approved", "published", "in_progress"),
        "submit": is_company(user, drive) and drive["status"] in ("draft", "changes_requested"),
        "review": is_college(user, drive) and drive["status"] == "review",
        "publish": is_college(user, drive) and drive["status"] == "approved",
        "set_status": (is_company(user, drive) or is_college(user, drive)) and drive["status"] not in ("completed", "cancelled"),
        "hire": owns_hiring(user, drive),
        "decide_changes": is_college(user, drive),
    }
    item["role_in_drive"] = "company" if is_company(user, drive) else "college"
    from .org import contacts_of
    item["contacts"] = (await contacts_of("college", drive.get("college_id")) if is_company(user, drive)
                        else await contacts_of("company", drive.get("company_id")))
    item["college"] = (await college_names()).get(drive.get("college_id"))
    return item


@router.get("/drives/{drive_id}/history")
async def drive_history(drive_id: str, user: dict = Depends(active_user)):
    drive = await get_drive(drive_id)
    _check_view(user, drive)
    q = {"drive_id": drive_id}
    if user["role"] == "student":
        q["visibility"] = "students"
    rows = await db.updates.find(q).sort("at", -1).to_list(300)
    out = []
    for r in rows:
        item = serialize(r)
        if user["role"] == "student":
            item.pop("by_id", None)
            item["by_name"] = {"company": drive.get("company"), "college": "Placement cell"}.get(r.get("portal"), "Campus Connect")
        out.append(item)
    return out


# ---- edits and change requests -------------------------------------------------------
def _clean(field: str, value):
    if field in ("required_skills", "preferred_skills"):
        return sorted({normalize_skill(s) for s in value if s.strip()})
    return value


@router.patch("/drives/{drive_id}")
async def patch_drive(drive_id: str, body: DrivePatch, user: dict = Depends(managers)):
    drive = await get_drive(drive_id)
    if not (is_company(user, drive) or is_college(user, drive)):
        raise HTTPException(403, "Not your drive")
    if drive["status"] in ("completed", "cancelled"):
        raise HTTPException(400, f"This drive is {DRIVE_STATUS[drive['status']].lower()}")
    changes = {k: _clean(k, v) for k, v in body.model_dump(exclude_none=True, exclude={"reason"}).items()
               if drive.get(k) != _clean(k, v)}
    if not changes:
        return {"applied": [], "proposed": []}
    did = drive_id
    direct = is_college(user, drive) or drive["status"] in ("draft", "changes_requested", "review")
    if direct:
        changes["updated_at"] = now()
        await db.drives.update_one({"_id": drive["_id"]}, {"$set": changes})
        visible = drive["status"] in STUDENT_VISIBLE
        for f, v in changes.items():
            if f in ("updated_at", "criteria_confirmed"):
                continue
            await log_update(entity="drive", entity_id=did, drive_id=did, college_id=drive["college_id"],
                             company_id=drive.get("company_id"), action="field_changed", field=f,
                             summary=f"{FIELD_LABELS.get(f, f)} updated" + (f" — {body.reason}" if body.reason else ""),
                             old=drive.get(f), new=v, by=user,
                             visibility="students" if visible and f in STUDENT_FACING_FIELDS else "internal")
        names = ", ".join(FIELD_LABELS.get(f, f) for f in changes if f not in ("updated_at", "criteria_confirmed"))
        link = f"/drives/{did}"
        if is_college(user, drive):
            await notify(await drive_company_staff(drive), "Placement cell updated a drive",
                         f"{drive_label(drive)}: {names}", link, "drive")
            if drive["status"] in STUDENT_VISIBLE and any(f in STUDENT_FACING_FIELDS for f in changes):
                await notify(await affected_students(drive), "Drive details updated",
                             f"{drive_label(drive)}: {names} changed.", link, "drive")
        elif drive["status"] == "review":
            await notify(await college_staff(drive["college_id"]), "Drive edited during review",
                         f"{drive_label(drive)}: {names}", link, "drive")
        return {"applied": [f for f in changes if f != "updated_at"], "proposed": []}

    # company editing an approved / published drive -> one change request per field
    proposed = []
    for f, v in changes.items():
        if f == "criteria_confirmed":
            continue
        existing = await db.change_requests.find_one({"drive_id": did, "target": "drive", "field": f, "status": "pending"})
        doc = {"drive_id": did, "college_id": drive["college_id"], "company_id": drive.get("company_id"),
               "target": "drive", "field": f, "label": FIELD_LABELS.get(f, f), "old": drive.get(f), "new": v,
               "reason": body.reason, "status": "pending", "proposed_by": user["id"], "proposed_by_name": user["name"],
               "portal": "company", "created_at": now()}
        if existing:
            await db.change_requests.update_one({"_id": existing["_id"]}, {"$set": doc})
        else:
            await db.change_requests.insert_one(doc)
        await log_update(entity="drive", entity_id=did, drive_id=did, college_id=drive["college_id"],
                         company_id=drive.get("company_id"), action="change_proposed", field=f,
                         summary=f"{FIELD_LABELS.get(f, f)} change proposed — awaiting placement cell",
                         old=drive.get(f), new=v, by=user, approval="pending")
        proposed.append(f)
    await notify(await college_staff(drive["college_id"]), "Change needs your confirmation",
                 f"{drive_label(drive)}: {', '.join(FIELD_LABELS.get(f, f) for f in proposed)}", f"/drives/{did}", "change")
    return {"applied": [], "proposed": proposed}


@router.get("/drives/{drive_id}/changes")
async def drive_changes(drive_id: str, user: dict = Depends(managers)):
    drive = await get_drive(drive_id)
    if not can_manage(user, drive):
        raise HTTPException(404, "Drive not found")
    rows = await db.change_requests.find({"drive_id": drive_id}).sort("created_at", -1).to_list(200)
    return [serialize(r) for r in rows]


@router.get("/changes")
async def pending_change_queue(user: dict = Depends(managers)):
    q = {"status": "pending"}
    if user["role"] == "coordinator":
        q["college_id"] = user["college_id"]
    else:
        q["company_id"] = user.get("company_id")
    rows = await db.change_requests.find(q).sort("created_at", 1).to_list(200)
    drives = {str(d["_id"]): d async for d in db.drives.find({"_id": {"$in": [oid(r["drive_id"]) for r in rows]}})}
    return [{**serialize(r), "drive": drive_label(drives.get(r["drive_id"], {}))} for r in rows]


@router.post("/changes/{change_id}/decision")
async def decide_change(change_id: str, body: ChangeDecisionIn, user: dict = Depends(require_role("coordinator"))):
    ch = await db.change_requests.find_one({"_id": oid(change_id)})
    if not ch or ch["college_id"] != user["college_id"]:
        raise HTTPException(404, "Change request not found")
    if ch["status"] != "pending":
        raise HTTPException(400, f"Already {ch['status']}")
    drive = await get_drive(ch["drive_id"])
    did, t = ch["drive_id"], now()
    approved = body.decision == "approve"
    await db.change_requests.update_one({"_id": ch["_id"]}, {"$set": {
        "status": "approved" if approved else "rejected", "decided_by": user["id"], "decided_by_name": user["name"],
        "decided_at": t, "decision_note": body.note}})
    visible = drive["status"] in STUDENT_VISIBLE
    n_students = 0

    if ch["target"] == "round":
        rounds = drive.get("rounds", [])
        r = next((x for x in rounds if x["id"] == ch["round_id"]), None)
        if not r:
            raise HTTPException(404, "Round no longer exists")
        prop = r.get("proposed") or {}
        if approved:
            old = {k: r.get(k) for k in ("date", "time", "venue")}
            if prop.get("cancel"):
                r["status"] = "cancelled"
            else:
                was_confirmed = r.get("confirmed")
                for k in ("date", "time", "venue", "instructions"):
                    if prop.get(k) is not None:
                        r[k] = prop[k]
                r["status"] = "rescheduled" if was_confirmed and old.get("date") != r.get("date") else "confirmed"
                r["confirmed"] = True
            r["history"] = r.get("history", []) + [{"old": old, "new": {k: r.get(k) for k in ("date", "time", "venue")},
                                                     "proposed_by": ch["proposed_by_name"], "confirmed_by": user["name"],
                                                     "at": t, "reason": ch.get("reason")}]
        else:
            r["status"] = prop.get("prev_status", "confirmed" if r.get("confirmed") else "planned")
        r["proposed"] = None
        r["updated_at"] = t
        await db.drives.update_one({"_id": drive["_id"]}, {"$set": {"rounds": rounds, "updated_at": t}})
        if approved and visible:
            msg = (f"{r['name']} was cancelled." if r["status"] == "cancelled"
                   else f"{r['name']} is now on {r.get('date')}{' at ' + r['time'] if r.get('time') else ''}.")
            n_students = await notify(await affected_students(drive), f"Schedule update · {drive_label(drive)}",
                                      msg, f"/drives/{did}", "schedule")
        await log_update(entity="drive", entity_id=did, drive_id=did, college_id=drive["college_id"],
                         company_id=drive.get("company_id"), action="schedule_" + ("confirmed" if approved else "rejected"),
                         field=f"round:{r['name']}",
                         summary=(f"{r['name']}: " + ("change confirmed by placement cell" if approved else "proposed change not accepted")),
                         old=ch["old"], new=ch["new"], by=user, approval="approved" if approved else "rejected",
                         visibility="students" if approved and visible else "internal",
                         notified=f"{n_students} students" if n_students else None)
    else:
        f = ch["field"]
        if approved:
            await db.drives.update_one({"_id": drive["_id"]}, {"$set": {f: ch["new"], "updated_at": t}})
            if visible:
                n_students = await notify(await affected_students({**drive, f: ch["new"]}), f"Drive updated · {drive_label(drive)}",
                                          f"{ch['label']} was updated.", f"/drives/{did}", "drive")
        await log_update(entity="drive", entity_id=did, drive_id=did, college_id=drive["college_id"],
                         company_id=drive.get("company_id"), action="change_" + ("approved" if approved else "rejected"),
                         field=f, summary=f"{ch['label']} change " + ("approved and published" if approved else "not accepted"),
                         old=ch["old"], new=ch["new"], by=user, approval="approved" if approved else "rejected",
                         visibility="students" if approved and visible else "internal",
                         notified=f"{n_students} students" if n_students else None)
    await notify([ch["proposed_by"]], "Change " + ("confirmed" if approved else "not accepted"),
                 f"{drive_label(drive)}: {ch['label']}" + (f" — {body.note}" if body.note else ""), f"/drives/{did}", "change")
    return {"id": change_id, "status": "approved" if approved else "rejected"}


# ---- lifecycle -------------------------------------------------------------------
@router.post("/drives/{drive_id}/submit")
async def submit_for_review(drive_id: str, user: dict = Depends(require_role("recruiter"))):
    drive = await get_drive(drive_id)
    if not is_company(user, drive):
        raise HTTPException(403, "Not your drive")
    if drive["status"] not in ("draft", "changes_requested"):
        raise HTTPException(400, f"Drive is {DRIVE_STATUS[drive['status']].lower()}")
    if not drive.get("criteria_confirmed") or not drive.get("required_skills"):
        raise HTTPException(400, "Confirm the screening criteria (required skills) before sending for review")
    await db.drives.update_one({"_id": drive["_id"]}, {"$set": {"status": "review", "updated_at": now(), "review_note": None}})
    n = await notify(await college_staff(drive["college_id"]), "Drive sent for review",
                     f"{drive_label(drive)} is waiting for your review.", f"/drives/{drive_id}", "drive")
    await log_update(entity="drive", entity_id=drive_id, drive_id=drive_id, college_id=drive["college_id"],
                     company_id=drive.get("company_id"), action="status", field="status", old=drive["status"],
                     new="review", summary="Sent for review", by=user, approval="pending", notified=f"{n} placement staff")
    return {"id": drive_id, "status": "review"}


@router.post("/drives/{drive_id}/review")
async def review_drive(drive_id: str, body: DriveReviewIn, user: dict = Depends(require_role("coordinator"))):
    drive = await get_drive(drive_id)
    if not is_college(user, drive):
        raise HTTPException(403, "Not your college's drive")
    if drive["status"] != "review":
        raise HTTPException(400, "Only drives sent for review can be reviewed")
    if body.decision == "changes" and not body.note:
        raise HTTPException(400, "Tell the company what to change")
    new = {"approve": "approved", "changes": "changes_requested", "decline": "cancelled"}[body.decision]
    update = {"status": new, "review_note": body.note, "reviewed_by": user["id"], "reviewed_at": now(), "updated_at": now()}
    if new == "approved":
        # approving the drive verifies the tentative round dates it was submitted with
        rounds = drive.get("rounds", [])
        for r in rounds:
            if r.get("date") and r.get("status") == "planned":
                r.update(status="confirmed", confirmed=True, updated_at=now())
        update["rounds"] = rounds
    await db.drives.update_one({"_id": drive["_id"]}, {"$set": update})
    label = {"approved": "Drive approved", "changes_requested": "Changes requested", "cancelled": "Drive declined"}[new]
    n = await notify(await drive_company_staff(drive), f"{label} · {drive_label(drive)}", body.note or "", f"/drives/{drive_id}", "drive")
    await log_update(entity="drive", entity_id=drive_id, drive_id=drive_id, college_id=drive["college_id"],
                     company_id=drive.get("company_id"), action="status", field="status", old="review", new=new,
                     summary=label + (f": {body.note}" if body.note else ""), by=user,
                     approval="approved" if new == "approved" else "rejected", notified=f"{n} company users")
    return {"id": drive_id, "status": new}


@router.post("/drives/{drive_id}/publish")
async def publish_drive(drive_id: str, user: dict = Depends(require_role("coordinator"))):
    drive = await get_drive(drive_id)
    if not is_college(user, drive):
        raise HTTPException(403, "Not your college's drive")
    if drive["status"] != "approved":
        raise HTTPException(400, "Approve the drive before publishing it")
    t = now()
    await db.drives.update_one({"_id": drive["_id"]}, {"$set": {"status": "published", "published_at": t,
                                                                "published_by": user["id"], "updated_at": t}})
    drive["status"] = "published"
    students = await eligible_students(drive)
    n = await notify(students, f"New drive · {drive_label(drive)}",
                     f"{drive['ctc_lpa']} LPA" + (f" · apply by {drive['deadline']}" if drive.get("deadline") else ""),
                     f"/drives/{drive_id}", "drive")
    await notify(await drive_company_staff(drive), "Drive published to students",
                 f"{drive_label(drive)} is live for {n} eligible students.", f"/drives/{drive_id}", "drive")
    await log_update(entity="drive", entity_id=drive_id, drive_id=drive_id, college_id=drive["college_id"],
                     company_id=drive.get("company_id"), action="status", field="status", old="approved",
                     new="published", summary="Published to students", by=user, visibility="students",
                     notified=f"{n} eligible students")
    return {"id": drive_id, "status": "published", "notified": n}


@router.post("/drives/{drive_id}/status")
async def set_drive_status(drive_id: str, body: DriveStatusIn, user: dict = Depends(managers)):
    drive = await get_drive(drive_id)
    if not (is_company(user, drive) or is_college(user, drive)):
        raise HTTPException(403, "Not your drive")
    cur, new = drive["status"], body.status
    allowed = {"in_progress": ("published",), "completed": ("published", "in_progress"),
               "cancelled": ("draft", "review", "changes_requested", "approved", "published", "in_progress")}
    if cur not in allowed[new]:
        raise HTTPException(400, f"Can't move a drive from {DRIVE_STATUS[cur]} to {DRIVE_STATUS[new]}")
    if new == "cancelled" and not body.reason:
        raise HTTPException(400, "Give a reason for cancelling")
    await db.drives.update_one({"_id": drive["_id"]}, {"$set": {"status": new, "status_reason": body.reason, "updated_at": now()}})
    visible = cur in STUDENT_VISIBLE
    label = {"in_progress": "Applications closed — selection in progress", "completed": "Drive completed",
             "cancelled": "Drive cancelled"}[new]
    other = await (college_staff(drive["college_id"]) if is_company(user, drive) else drive_company_staff(drive))
    await notify(other, f"{label} · {drive_label(drive)}", body.reason or "", f"/drives/{drive_id}", "drive")
    n = 0
    if visible and new in ("cancelled", "in_progress"):
        n = await notify(await drive_applicants(drive_id) if new == "in_progress" else await affected_students(drive),
                         f"{label} · {drive_label(drive)}", body.reason or "", f"/drives/{drive_id}", "drive")
    await log_update(entity="drive", entity_id=drive_id, drive_id=drive_id, college_id=drive["college_id"],
                     company_id=drive.get("company_id"), action="status", field="status", old=cur, new=new,
                     summary=label + (f": {body.reason}" if body.reason else ""), by=user,
                     visibility="students" if visible else "internal", notified=f"{n} students" if n else None)
    return {"id": drive_id, "status": new}


# ---- schedule (rounds) -----------------------------------------------------------------
@router.post("/drives/{drive_id}/rounds")
async def add_round(drive_id: str, body: RoundIn, user: dict = Depends(managers)):
    drive = await get_drive(drive_id)
    if not (is_company(user, drive) or is_college(user, drive)):
        raise HTTPException(403, "Not your drive")
    if drive["status"] in ("completed", "cancelled"):
        raise HTTPException(400, "This drive is closed")
    r = _new_round(body.model_dump())
    if is_college(user, drive) and r.get("date"):
        r.update(status="confirmed", confirmed=True)
    await db.drives.update_one({"_id": drive["_id"]}, {"$push": {"rounds": r}, "$set": {"updated_at": now()}})
    if is_company(user, drive) and drive["status"] not in ("draft", "changes_requested"):
        await notify(await college_staff(drive["college_id"]), "New round to confirm",
                     f"{drive_label(drive)}: {r['name']}" + (f" on {r['date']}" if r.get("date") else ""), f"/drives/{drive_id}", "schedule")
    await log_update(entity="drive", entity_id=drive_id, drive_id=drive_id, college_id=drive["college_id"],
                     company_id=drive.get("company_id"), action="round_added", field=f"round:{r['name']}",
                     summary=f"Round added: {r['name']} ({ROUND_STATUS[r['status']]})", new={"date": r.get("date")}, by=user,
                     visibility="students" if r["confirmed"] and drive["status"] in STUDENT_VISIBLE else "internal")
    return r


@router.patch("/drives/{drive_id}/rounds/{round_id}")
async def change_round(drive_id: str, round_id: str, body: RoundPatch, user: dict = Depends(managers)):
    drive = await get_drive(drive_id)
    if not (is_company(user, drive) or is_college(user, drive)):
        raise HTTPException(403, "Not your drive")
    rounds = drive.get("rounds", [])
    r = next((x for x in rounds if x["id"] == round_id), None)
    if not r:
        raise HTTPException(404, "Round not found")
    if r.get("status") == "cancelled":
        raise HTTPException(400, "This round was cancelled")
    fields = {k: v for k, v in body.model_dump(exclude={"cancel", "reason"}).items() if v is not None and v != r.get(k)}
    if not fields and not body.cancel:
        return {"round": r, "mode": "unchanged"}
    old = {k: r.get(k) for k in ("date", "time", "venue")}
    t = now()
    early = drive["status"] in ("draft", "changes_requested", "review")
    visible = drive["status"] in STUDENT_VISIBLE

    if is_college(user, drive) or (is_company(user, drive) and early):
        # placement cell confirms its own changes; companies edit freely before approval
        was_confirmed = r.get("confirmed")
        if body.cancel:
            r["status"] = "cancelled"
        else:
            r.update(fields)
            if is_college(user, drive):
                r["status"] = "rescheduled" if was_confirmed and "date" in fields else "confirmed"
                r["confirmed"] = bool(r.get("date"))
        r["history"] = r.get("history", []) + [{"old": old, "new": {k: r.get(k) for k in ("date", "time", "venue")},
                                                 "by": user["name"], "at": t, "reason": body.reason}]
        r["proposed"], r["updated_at"] = None, t
        # a direct college change supersedes any open company proposal for this round
        await db.change_requests.update_many({"drive_id": drive_id, "round_id": round_id, "status": "pending"},
                                             {"$set": {"status": "superseded", "decided_at": t}})
        await db.drives.update_one({"_id": drive["_id"]}, {"$set": {"rounds": rounds, "updated_at": t}})
        n = 0
        if is_college(user, drive) and visible and r.get("confirmed"):
            msg = f"{r['name']} was cancelled." if body.cancel else f"{r['name']}: {r.get('date')}{' ' + r['time'] if r.get('time') else ''}"
            n = await notify(await affected_students(drive), f"Schedule update · {drive_label(drive)}", msg, f"/drives/{drive_id}", "schedule")
            await notify(await drive_company_staff(drive), "Placement cell updated the schedule",
                         f"{drive_label(drive)}: {msg}", f"/drives/{drive_id}", "schedule")
        await log_update(entity="drive", entity_id=drive_id, drive_id=drive_id, college_id=drive["college_id"],
                         company_id=drive.get("company_id"), action="schedule_changed", field=f"round:{r['name']}",
                         summary=f"{r['name']}: " + ("cancelled" if body.cancel else ROUND_STATUS[r["status"]].lower())
                         + (f" — {body.reason}" if body.reason else ""),
                         old=old, new={k: r.get(k) for k in ("date", "time", "venue")}, by=user,
                         visibility="students" if visible and r.get("confirmed") else "internal",
                         notified=f"{n} students" if n else None)
        return {"round": r, "mode": "applied"}

    # company changing an approved schedule -> pending until the placement cell confirms
    prop = {**fields, "cancel": body.cancel, "reason": body.reason, "by": user["name"], "at": t,
            "prev_status": r.get("status") if r.get("status") != "pending" else (r.get("proposed") or {}).get("prev_status", "confirmed")}
    r["proposed"], r["status"], r["updated_at"] = prop, "pending", t
    await db.drives.update_one({"_id": drive["_id"]}, {"$set": {"rounds": rounds, "updated_at": t}})
    new = {"cancel": True} if body.cancel else {**old, **{k: v for k, v in fields.items() if k in ("date", "time", "venue")}}
    await db.change_requests.update_many({"drive_id": drive_id, "round_id": round_id, "status": "pending"},
                                         {"$set": {"status": "superseded", "decided_at": t}})
    await db.change_requests.insert_one({
        "drive_id": drive_id, "college_id": drive["college_id"], "company_id": drive.get("company_id"),
        "target": "round", "round_id": round_id, "field": f"round:{r['name']}",
        "label": f"{r['name']} " + ("cancellation" if body.cancel else "schedule"),
        "old": old, "new": new, "reason": body.reason, "status": "pending", "proposed_by": user["id"],
        "proposed_by_name": user["name"], "portal": "company", "created_at": t})
    n = await notify(await college_staff(drive["college_id"]), "Schedule change to confirm",
                     f"{drive_label(drive)}: {r['name']} " + ("cancellation" if body.cancel else f"→ {new.get('date')}"),
                     f"/drives/{drive_id}", "schedule")
    await log_update(entity="drive", entity_id=drive_id, drive_id=drive_id, college_id=drive["college_id"],
                     company_id=drive.get("company_id"), action="schedule_proposed", field=f"round:{r['name']}",
                     summary=f"{r['name']}: change proposed — pending confirmation" + (f" ({body.reason})" if body.reason else ""),
                     old=old, new=new, by=user, approval="pending",
                     visibility="students" if visible and r.get("confirmed") else "internal",
                     notified=f"{n} placement staff")
    return {"round": r, "mode": "proposed"}


@router.post("/drives/{drive_id}/rounds/{round_id}/confirm")
async def confirm_round(drive_id: str, round_id: str, user: dict = Depends(require_role("coordinator"))):
    """Placement cell verifies a planned date (one the company set, never changed)."""
    drive = await get_drive(drive_id)
    if not is_college(user, drive):
        raise HTTPException(403, "Not your college's drive")
    rounds = drive.get("rounds", [])
    r = next((x for x in rounds if x["id"] == round_id), None)
    if not r or r.get("status") != "planned" or not r.get("date"):
        raise HTTPException(400, "Only planned rounds with a date can be confirmed")
    r.update(status="confirmed", confirmed=True, updated_at=now())
    await db.drives.update_one({"_id": drive["_id"]}, {"$set": {"rounds": rounds}})
    visible = drive["status"] in STUDENT_VISIBLE
    n = 0
    if visible:
        n = await notify(await affected_students(drive), f"Date confirmed · {drive_label(drive)}",
                         f"{r['name']} on {r['date']}{' at ' + r['time'] if r.get('time') else ''}", f"/drives/{drive_id}", "schedule")
    await notify(await drive_company_staff(drive), "Round date confirmed", f"{drive_label(drive)}: {r['name']} on {r['date']}",
                 f"/drives/{drive_id}", "schedule")
    await log_update(entity="drive", entity_id=drive_id, drive_id=drive_id, college_id=drive["college_id"],
                     company_id=drive.get("company_id"), action="schedule_confirmed", field=f"round:{r['name']}",
                     summary=f"{r['name']} confirmed for {r['date']}", new={"date": r["date"], "time": r.get("time")},
                     by=user, approval="approved", visibility="students" if visible else "internal",
                     notified=f"{n} students" if n else None)
    return r


# ---- applications ------------------------------------------------------------------
@router.post("/drives/{drive_id}/apply")
async def apply(drive_id: str, user: dict = Depends(require_role("student"))):
    drive = await get_drive(drive_id)
    if drive.get("college_id") != user.get("college_id") or drive.get("status") not in STUDENT_VISIBLE:
        raise HTTPException(404, "Drive not found")
    if drive.get("status") not in ACCEPTING:
        raise HTTPException(400, "Applications for this drive are closed")
    if drive.get("deadline") and drive["deadline"] < now().date().isoformat():
        raise HTTPException(400, f"Applications closed on {drive['deadline']}")
    ok, reasons = check_eligibility(user, drive)
    if not ok:
        raise HTTPException(400, "Not eligible: " + "; ".join(reasons))
    resume = user.get("resume")
    if not resume:
        raise HTTPException(400, "Upload your resume before applying")
    ats = score_resume(resume["text"], drive["description"], drive.get("required_skills"))
    t = now()
    doc = {
        "student_id": user["id"],
        "drive_id": drive_id,
        "status": "applied",
        "ats_score": ats["score"],
        "ats": ats,
        # snapshot what the screener saw, so later edits don't change the comparison
        "resume_snapshot": resume["text"],
        "profile_snapshot": user.get("profile", {}),
        "applied_at": t,
        "history": [{"status": "applied", "at": t, "by": "student"}],
    }
    try:
        res = await db.applications.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(409, "You have already applied to this drive")
    doc["_id"] = res.inserted_id
    return serialize(doc)


@router.get("/drives/{drive_id}/applicants")
async def applicants(drive_id: str, user: dict = Depends(managers)):
    drive = await get_drive(drive_id)
    if not can_manage(user, drive):
        raise HTTPException(403, "Not your drive")
    apps = await db.applications.find({"drive_id": drive_id}, {"resume_snapshot": 0}).sort("ats_score", -1).to_list(None)
    students = {
        str(s["_id"]): s
        async for s in db.users.find({"_id": {"$in": [ObjectId(a["student_id"]) for a in apps]}})
    }
    out = []
    for rank, a in enumerate(apps, 1):
        s = students.get(a["student_id"], {})
        p = a.get("profile_snapshot") or s.get("profile", {})
        item = {**serialize(a), "rank": rank, "name": s.get("name"), "email": s.get("email"),
                "branch": p.get("branch"), "cgpa": p.get("cgpa"), "internships": p.get("internships"),
                "screening_shared": bool((a.get("screening_review") or {}).get("share_with_student")),
                "feedback_count": len(a.get("feedback", []))}
        item.pop("feedback", None)
        out.append(item)
    view = drive_out(drive)
    view["can_hire"] = owns_hiring(user, drive)
    return {"drive": view, "applicants": out}


async def _app_and_drive(app_id: str, user: dict, hiring: bool = True):
    app = await db.applications.find_one({"_id": oid(app_id)})
    if not app:
        raise HTTPException(404, "Application not found")
    drive = await get_drive(app["drive_id"])
    if hiring and not owns_hiring(user, drive):
        raise HTTPException(403, "Hiring decisions on this drive belong to the company")
    if not hiring and not can_manage(user, drive):
        raise HTTPException(403, "Not your drive")
    return app, drive


# kept for other routers
_managed_app = _app_and_drive


@router.patch("/applications/{app_id}")
async def update_status(app_id: str, body: StatusIn, user: dict = Depends(managers)):
    app, drive = await _app_and_drive(app_id, user)
    cur, new = app["status"], body.status
    if cur in TERMINAL:
        raise HTTPException(400, f"Application is already {STAGE_LABELS[cur].lower()}")
    if new != "rejected" and FUNNEL.index(new) != FUNNEL.index(cur) + 1:
        raise HTTPException(400, f"Next step after {cur} is {FUNNEL[FUNNEL.index(cur) + 1]}")
    if new == "assessment_cleared" and not app.get("assessment"):
        raise HTTPException(400, "Record assessment scores before clearing the assessment")

    t = now()
    update = {"status": new, "on_hold": False, "updated_at": t}
    if new == "rejected":
        update["rejected_round"] = ROUND_AT_STATUS[cur]
    await db.applications.update_one(
        {"_id": app["_id"]}, {"$set": update, "$push": {"history": {"status": new, "at": t, "by": user["name"],
                                                                     "portal": "company" if user["role"] == "recruiter" else "college",
                                                                     "reason": body.reason}}})
    if new == "accepted":
        await db.users.update_one(
            {"_id": ObjectId(app["student_id"])},
            {"$set": {"placement": {"status": "placed", "company": drive["company"],
                                    "ctc_lpa": drive["ctc_lpa"], "drive_id": app["drive_id"], "at": t}}},
        )
    link = f"/applications/{app_id}"
    title = {"shortlisted": "Shortlisted after resume screening", "assessment_cleared": "You cleared the assessment",
             "offered": "You have an offer", "accepted": "Offer acceptance recorded",
             "rejected": "Application update"}[new]
    await notify([app["student_id"]], f"{title} · {drive_label(drive)}",
                 "Respond to the offer from your tracker." if new == "offered" else "Open your tracker for details.",
                 link, "application")
    if new in ("offered", "accepted"):
        await notify(await college_staff(drive["college_id"]), f"Offer {'released' if new == 'offered' else 'accepted'}",
                     drive_label(drive), f"/drives/{app['drive_id']}", "offer")
    await log_update(entity="application", entity_id=app_id, drive_id=app["drive_id"], college_id=drive["college_id"],
                     company_id=drive.get("company_id"), action="stage", field="status", old=cur, new=new,
                     summary=f"Candidate moved to {STAGE_LABELS[new]}" + (f" — {body.reason}" if body.reason else ""),
                     by=user, extra={"student_id": app["student_id"]})
    return {"id": app_id, **update}


@router.post("/applications/{app_id}/hold")
async def hold(app_id: str, body: HoldIn, user: dict = Depends(managers)):
    app, drive = await _app_and_drive(app_id, user)
    if app["status"] in TERMINAL:
        raise HTTPException(400, "Application is closed")
    t = now()
    await db.applications.update_one({"_id": app["_id"]}, {
        "$set": {"on_hold": body.on_hold, "hold_reason": body.reason if body.on_hold else None, "updated_at": t},
        "$push": {"history": {"status": "on_hold" if body.on_hold else "resumed", "at": t, "by": user["name"], "reason": body.reason}}})
    await notify([app["student_id"]], f"{'On hold' if body.on_hold else 'Back in process'} · {drive_label(drive)}",
                 body.reason or "", f"/applications/{app_id}", "application")
    await log_update(entity="application", entity_id=app_id, drive_id=app["drive_id"], college_id=drive["college_id"],
                     company_id=drive.get("company_id"), action="hold", summary="Put on hold" if body.on_hold else "Taken off hold",
                     by=user, extra={"student_id": app["student_id"]})
    return {"id": app_id, "on_hold": body.on_hold}


@router.put("/applications/{app_id}/assessment")
async def record_assessment(app_id: str, body: AssessmentIn, user: dict = Depends(managers)):
    app, drive = await _app_and_drive(app_id, user)
    if app["status"] != "shortlisted":
        raise HTTPException(400, "Scores can be recorded for resume-shortlisted candidates in the assessment round")
    sections = {k: max(0.0, min(100.0, float(v))) for k, v in body.sections.items()}
    expected = drive.get("assessment_sections") or list(sections)
    if set(sections) != set(expected):
        raise HTTPException(400, f"Provide scores for: {', '.join(expected)}")
    assessment = {"sections": sections, "recorded_at": now()}
    await db.applications.update_one({"_id": app["_id"]}, {"$set": {"assessment": assessment}})
    return {"id": app_id, "assessment": assessment}


# ---- JD -> resume screening workspace -------------------------------------------------
def screening_view(app: dict, drive: dict) -> dict:
    report = evidence_report(app.get("resume_snapshot", ""), drive.get("required_skills", []),
                             drive.get("preferred_skills", []))
    review = app.get("screening_review") or {}
    overrides = review.get("overrides", {})
    for row in report:
        row["ai_level"] = row["level"]
        if row["skill"] in overrides:
            row["level"] = overrides[row["skill"]]
            row["corrected"] = row["level"] != row["ai_level"]
    req = [r for r in report if r["kind"] == "required"]
    return {"criteria": report, "match_score": app.get("ats_score"),
            "summary": {lvl: sum(r["level"] == lvl for r in req) for lvl in ("strong", "partial", "not_shown")},
            "criteria_confirmed": bool(drive.get("criteria_confirmed")), "review": review}


@router.get("/applications/{app_id}/screening")
async def get_screening(app_id: str, user: dict = Depends(managers)):
    app, drive = await _app_and_drive(app_id, user, hiring=False)
    student = await db.users.find_one({"_id": ObjectId(app["student_id"])}, {"profile": 1, "placement": 1, "college_id": 1})
    view = screening_view(app, drive)
    # academic eligibility is reported separately from the resume match on purpose
    view["eligibility"] = eligibility_rules({**(student or {}), "profile": app.get("profile_snapshot") or (student or {}).get("profile", {})}, drive)
    view["status"] = app["status"]
    return view


@router.put("/applications/{app_id}/screening")
async def review_screening(app_id: str, body: ScreeningReviewIn, user: dict = Depends(managers)):
    app, drive = await _app_and_drive(app_id, user)
    was_shared = bool((app.get("screening_review") or {}).get("share_with_student"))
    review = {**body.model_dump(), "reviewed_by": user["name"], "reviewed_at": now()}
    await db.applications.update_one({"_id": app["_id"]}, {"$set": {"screening_review": review}})
    if body.share_with_student and not was_shared:
        await notify([app["student_id"]], f"Screening feedback · {drive_label(drive)}",
                     "The recruiter shared how your resume matched the role's criteria.", f"/applications/{app_id}", "feedback")
    await log_update(entity="application", entity_id=app_id, drive_id=app["drive_id"], college_id=drive["college_id"],
                     company_id=drive.get("company_id"), action="screening_review",
                     summary="Screening reviewed" + (" and shared with candidate" if body.share_with_student else ""),
                     by=user, extra={"student_id": app["student_id"]})
    return screening_view({**app, "screening_review": review}, drive)


@router.post("/applications/{app_id}/feedback")
async def add_feedback(app_id: str, body: FeedbackIn, user: dict = Depends(managers)):
    app, drive = await _app_and_drive(app_id, user)
    if body.share_with_student and not ((body.strengths or "").strip() or (body.improvements or "").strip()):
        raise HTTPException(400, "Add strengths or improvement areas to share with the candidate")
    fb = {**body.model_dump(), "id": uuid.uuid4().hex[:8], "by": user["name"], "at": now(),
          "scores": {k: max(1, min(5, int(v))) for k, v in body.scores.items()}}
    await db.applications.update_one({"_id": app["_id"]}, {"$push": {"feedback": fb}})
    if body.share_with_student:
        await notify([app["student_id"]], f"Interview feedback · {drive_label(drive)}",
                     f"Feedback from the {body.round} is available.", f"/applications/{app_id}", "feedback")
    return fb


@router.get("/applications/{app_id}/feedback")
async def list_feedback(app_id: str, user: dict = Depends(managers)):
    app, drive = await _app_and_drive(app_id, user, hiring=False)
    rows = app.get("feedback", [])
    if not owns_hiring(user, drive):  # placement staff don't see interviewers' private notes
        rows = [{k: v for k, v in f.items() if k not in ("private_notes", "scores")} for f in rows]
    return rows


@router.post("/applications/{app_id}/feedback/{fb_id}/share")
async def share_feedback(app_id: str, fb_id: str, user: dict = Depends(managers)):
    app, drive = await _app_and_drive(app_id, user)
    fbs = app.get("feedback", [])
    fb = next((f for f in fbs if f["id"] == fb_id), None)
    if not fb:
        raise HTTPException(404, "Feedback not found")
    fb["share_with_student"] = True
    await db.applications.update_one({"_id": app["_id"]}, {"$set": {"feedback": fbs}})
    await notify([app["student_id"]], f"Interview feedback · {drive_label(drive)}",
                 f"Feedback from the {fb['round']} is available.", f"/applications/{app_id}", "feedback")
    return fb
