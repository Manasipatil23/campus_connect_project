"""Placement cell: decides which students may join, and connects with companies."""
from datetime import datetime, timezone

from bson import ObjectId
from collections import Counter
from datetime import timedelta
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile

from ..auth import require_role
from ..db import db, serialize
from ..config import APP_URL
from ..schemas import ProfileReminderIn, BulkDecisionIn, ConnectIn, DecisionIn, MessageIn, NameReviewIn
from ..workflow import CONNECTION_STATUS, email_decision, email_note, record_approval, college_staff, company_staff, log_update, notify, now
from .drives import oid

router = APIRouter(prefix="/api", tags=["college", "connections"])
coordinator = require_role("coordinator")
org_member = require_role("coordinator", "recruiter")

STUDENT_FIELDS = {"password_hash": 0, "resume": 0}


@router.get("/college/students")
async def college_students(status: str = "pending", user: dict = Depends(coordinator)):
    cur = db.users.find({"role": "student", "college_id": user["college_id"], "status": status}, STUDENT_FIELDS)
    return [serialize(s) async for s in cur.sort("created_at", -1)]


ACTIVE_DAYS, QUIET_DAYS = 7, 30


def _aware(d):
    return d if d is None or d.tzinfo else d.replace(tzinfo=timezone.utc)


def activity(s: dict) -> str:
    """active: used the site in the last 7 days · quiet: 8-30 days · inactive: longer, or never since approval."""
    seen, approved = _aware(s.get("last_seen_at") or s.get("last_login_at")), _aware(s.get("reviewed_at"))
    if not seen or (approved and seen < approved):
        return "inactive"
    days = (now() - seen).days
    return "active" if days <= ACTIVE_DAYS else "quiet" if days <= QUIET_DAYS else "inactive"


class EnrolmentIn(BaseModel):
    grad_year: int = Field(ge=2020, le=2035)
    branches: Dict[str, int]


@router.put("/college/enrolment")
async def set_enrolment(body: EnrolmentIn, user: dict = Depends(coordinator)):
    """Official number of students per branch for a batch (from the college's own records)."""
    branches = {b.strip(): int(n) for b, n in body.branches.items() if b.strip()}
    if any(n < 0 or n > 5000 for n in branches.values()):
        raise HTTPException(400, "Each branch needs a number between 0 and 5000")
    await db.colleges.update_one({"_id": oid(user["college_id"])}, {"$set": {
        f"enrolment.{body.grad_year}": {"branches": branches, "updated_at": now(), "updated_by": user["name"]}}})
    return {"grad_year": body.grad_year, "branches": branches, "total": sum(branches.values())}


@router.get("/college/student-stats")
async def student_stats(grad_year: Optional[int] = None, user: dict = Depends(coordinator)):
    """The college's student body, from the student records themselves: totals, branch by branch,
    batches and CGPA spread. Approved students only (sign-ups waiting are counted separately)."""
    base = {"role": "student", "college_id": user["college_id"]}
    counts = {s: await db.users.count_documents({**base, "status": s}) for s in ("active", "pending", "rejected")}
    batches = Counter()
    async for u in db.users.find({**base, "status": "active"}, {"profile.grad_year": 1}):
        batches[(u.get("profile") or {}).get("grad_year")] += 1
    q = {**base, "status": "active"}
    if grad_year:
        q["profile.grad_year"] = grad_year
    students = await db.users.find(q, {"profile": 1, "placement": 1, "resume.updated_at": 1, "last_seen_at": 1,
                                       "last_login_at": 1, "reviewed_at": 1}).to_list(None)
    college = await db.colleges.find_one({"_id": oid(user["college_id"])}, {"enrolment": 1})
    pending_by_branch = Counter()
    async for u in db.users.find({**base, "status": "pending", **({"profile.grad_year": grad_year} if grad_year else {})},
                                 {"profile.branch": 1}):
        pending_by_branch[(u.get("profile") or {}).get("branch") or "Not set"] += 1
    # official numbers: the chosen batch, or all batches added together
    enrolled = Counter()
    for y, e in ((college or {}).get("enrolment") or {}).items():
        if not grad_year or str(grad_year) == str(y):
            enrolled.update(e.get("branches", {}))

    def summarise(group):
        n = len(group)
        cgpas = [s["profile"]["cgpa"] for s in group if (s.get("profile") or {}).get("cgpa") is not None]
        placed = sum(1 for s in group if (s.get("placement") or {}).get("status") == "placed")
        return {
            "students": n, "placed": placed, "placement_rate": round(100 * placed / n, 1) if n else 0,
            "avg_cgpa": round(sum(cgpas) / len(cgpas), 2) if cgpas else None,
            "with_backlogs": sum(1 for s in group if ((s.get("profile") or {}).get("backlogs") or 0) > 0),
            "resumes": sum(1 for s in group if s.get("resume")),
            "profiles_incomplete": n - len(cgpas),
            # a common recruiter bar: CGPA 7+ and no active backlogs
            "ready_pool": sum(1 for s in group if ((s.get("profile") or {}).get("cgpa") or 0) >= 7
                              and not (s.get("profile") or {}).get("backlogs")),
            **{k: sum(1 for s in group if activity(s) == k) for k in ("active", "quiet", "inactive")},
        }

    by_branch = {}
    for s in students:
        by_branch.setdefault((s.get("profile") or {}).get("branch") or "Not set", []).append(s)
    for b in enrolled:
        by_branch.setdefault(b, [])
    branches = sorted(({"branch": b, **summarise(g), "enrolled": enrolled.get(b), "pending": pending_by_branch.get(b, 0)}
                       for b, g in by_branch.items()), key=lambda r: -(r["enrolled"] or r["students"]))

    bands = [("Below 6", 0, 6), ("6 – 7", 6, 7), ("7 – 8", 7, 8), ("8 – 9", 8, 9), ("9+", 9, 11)]
    cg = [(s.get("profile") or {}).get("cgpa") for s in students]
    cgpa_bands = [{"band": label, "students": sum(1 for c in cg if c is not None and lo <= c < hi)} for label, lo, hi in bands]

    return {
        "counts": counts,
        "batches": sorted(({"grad_year": y, "students": n} for y, n in batches.items() if y), key=lambda r: r["grad_year"]),
        "grad_year": grad_year,
        "totals": {**summarise(students), "branches": len(branches),
                   "enrolled": sum(enrolled.values()) or None, "pending": sum(pending_by_branch.values())},
        "enrolment": {y: e for y, e in ((college or {}).get("enrolment") or {}).items()},
        "branches": branches,
        "cgpa_bands": cgpa_bands,
    }


@router.get("/college/students/activity")
async def student_activity(state: str = "inactive", branch: Optional[str] = None, user: dict = Depends(coordinator)):
    """Approved students by how recently they used Campus Connect."""
    q = {"role": "student", "college_id": user["college_id"], "status": "active"}
    if branch:
        q["profile.branch"] = branch
    rows = []
    async for s in db.users.find(q, {"name": 1, "email": 1, "roll_number": 1, "profile.branch": 1, "last_seen_at": 1,
                                     "last_login_at": 1, "reviewed_at": 1, "last_reminded_at": 1}).sort("name", 1):
        a = activity(s)
        if state == "all" or a == state or (state == "needs_nudge" and a != "active"):
            rows.append({"id": str(s["_id"]), "name": s["name"], "email": s["email"], "roll_number": s.get("roll_number"),
                         "branch": (s.get("profile") or {}).get("branch"), "activity": a,
                         "last_seen_at": s.get("last_seen_at") or s.get("last_login_at"),
                         "last_reminded_at": s.get("last_reminded_at")})
    return rows


class RemindIn(BaseModel):
    student_ids: List[str] = Field(default=[], max_length=500)
    audience: Optional[Literal["quiet", "inactive", "needs_nudge"]] = None
    message: Optional[str] = Field(default=None, max_length=1000)


@router.post("/college/students/remind")
async def remind_students(body: RemindIn, user: dict = Depends(coordinator)):
    """Email (and notify in the app) students who haven't been using Campus Connect.
    Each student gets at most one reminder a day; replies go to the placement officer."""
    from fastapi.concurrency import run_in_threadpool
    from ..email_templates import message as email_message
    from ..emailing import EMAIL_DEV_MODE, send_email
    q = {"role": "student", "college_id": user["college_id"], "status": "active"}
    if body.student_ids:
        q["_id"] = {"$in": [oid(i) for i in body.student_ids]}
    elif not body.audience:
        raise HTTPException(400, "Choose students or a group to remind")
    college = await db.colleges.find_one({"_id": oid(user["college_id"])}, {"name": 1})
    cutoff = now() - timedelta(hours=24)
    sent = skipped = failed = 0
    async for s in db.users.find(q):
        a = activity(s)
        if body.audience and not (a == body.audience or (body.audience == "needs_nudge" and a != "active")):
            continue
        if _aware(s.get("last_reminded_at")) and _aware(s["last_reminded_at"]) > cutoff:
            skipped += 1
            continue
        first = s.get("first_name") or s["name"].split()[0]
        text = (body.message or "Placement drives, round dates and results are posted on Campus Connect. "
                "Please sign in, keep your profile and resume up to date, and check what's open for you.")
        subj, mail, html = email_message(
            f"{college['name']} placement cell: please check Campus Connect", f"Hi {first},", text,
            f"{user['name']}\n{user.get('designation') or 'Placement cell'}, {college['name']}",
            ("Open Campus Connect", f"{APP_URL}/login"))
        result = await run_in_threadpool(send_email, s["email"], subj, mail, user["email"], html)
        if result == "failed":
            failed += 1
            continue
        await notify([str(s["_id"])], "Reminder from your placement cell", text[:140], "/", "announcement")
        await db.users.update_one({"_id": s["_id"]}, {"$set": {"last_reminded_at": now()}})
        sent += 1
    return {"sent": sent, "skipped_recently_reminded": skipped, "failed": failed, "email_dev_mode": EMAIL_DEV_MODE}


# details every student must fill in before drives can use their profile
REQUIRED_DETAILS = [
    ("cgpa", "CGPA", lambda u, p: p.get("cgpa") in (None, "", 0)),
    ("branch", "Branch", lambda u, p: not p.get("branch")),
    ("grad_year", "Graduation year", lambda u, p: not p.get("grad_year")),
    ("phone", "Mobile number", lambda u, p: not u.get("phone")),
    ("resume", "Resume", lambda u, p: not (u.get("resume") or {}).get("text")),
    ("skills", "Skills", lambda u, p: not p.get("skills")),
]


def missing_details(u: dict) -> List[str]:
    p = u.get("profile") or {}
    return [label for _, label, empty in REQUIRED_DETAILS if empty(u, p)]


@router.get("/college/students/incomplete")
async def incomplete_profiles(user: dict = Depends(coordinator)):
    """Approved students who haven't filled in all the required details."""
    out = []
    async for s in db.users.find({"role": "student", "college_id": user["college_id"], "status": "active"}, {"password_hash": 0}):
        miss = missing_details(s)
        if miss:
            out.append({"id": str(s["_id"]), "name": s["name"], "email": s["email"], "roll_number": s.get("roll_number"),
                        "branch": (s.get("profile") or {}).get("branch"), "grad_year": (s.get("profile") or {}).get("grad_year"),
                        "missing": miss, "last_reminded_at": s.get("last_profile_reminder_at")})
    out.sort(key=lambda x: (-len(x["missing"]), x["name"]))
    return {"required": [label for _, label, _ in REQUIRED_DETAILS], "students": out}


@router.post("/college/students/profile-reminder")
async def profile_reminder(body: ProfileReminderIn, background: BackgroundTasks, user: dict = Depends(coordinator)):
    """Auto-written notice to students with missing details: it appears in their Notices, as a
    notification naming *their* missing fields, and by email. At most once a day per student."""
    q = {"role": "student", "college_id": user["college_id"], "status": "active"}
    if body.student_ids:
        q["_id"] = {"$in": [oid(i) for i in body.student_ids]}
    college = await db.colleges.find_one({"_id": oid(user["college_id"])}, {"name": 1})
    recent = now() - timedelta(hours=24)
    t, sent, skipped = now(), [], 0
    async for s in db.users.find(q, {"password_hash": 0}):
        miss = missing_details(s)
        if not miss:
            continue
        if _aware(s.get("last_profile_reminder_at")) and _aware(s["last_profile_reminder_at"]) > recent:
            skipped += 1
            continue
        sid, first = str(s["_id"]), s.get("first_name") or s["name"].split()[0]
        listed = ", ".join(miss)
        await notify([sid], "Action needed: complete your profile",
                     f"Please add your {listed}. This is mandatory for placement drives.", "/profile", "announcement")
        background.add_task(email_note, s["email"], s["name"], "Mandatory: complete your Campus Connect profile",
                            f"Your Campus Connect profile is missing: {listed}.\n\n"
                            "Filling these in is mandatory. Drives check your CGPA, branch and graduation year for eligibility, "
                            "and companies screen your resume and skills, so an incomplete profile can keep you out of drives.\n\n"
                            "Please sign in and complete your profile as soon as possible.", user)
        await db.users.update_one({"_id": s["_id"]}, {"$set": {"last_profile_reminder_at": t}})
        sent.append(sid)
    if sent:
        required = ", ".join(label for _, label, _ in REQUIRED_DETAILS)
        await db.announcements.insert_one({
            "title": "Mandatory: complete your profile",
            "body": ("Our records show your Campus Connect profile is incomplete. Every student must fill in: "
                     f"{required}.\n\nDrives use these details to check your eligibility, and companies screen your resume "
                     "and skills. Please open your Profile and Resume pages and complete them as soon as possible."),
            "audience": "profile_incomplete", "audience_label": "Students with incomplete profiles", "recipient_ids": sent,
            "college_id": user["college_id"], "by_id": user["id"], "by_name": user["name"], "auto": True, "created_at": t})
        await log_update(entity="announcement", entity_id="profile-reminder", college_id=user["college_id"], action="announcement",
                         summary=f"Profile reminder sent to {len(sent)} students", by=user, notified=f"{len(sent)} students")
    return {"sent": len(sent), "skipped_recently_reminded": skipped, "college": college["name"] if college else None}


@router.post("/college/students/{student_id}/decision")
async def decide_student(student_id: str, body: DecisionIn, user: dict = Depends(coordinator)):
    student = await db.users.find_one({"_id": oid(student_id), "role": "student", "college_id": user["college_id"]})
    if not student:
        raise HTTPException(404, "Student not found at your college")
    status = "active" if body.decision == "approve" else "rejected"
    changed = await db.users.update_one({"_id": student["_id"], "status": {"$ne": status}}, {"$set": {
        "status": status, "reviewed_at": datetime.now(timezone.utc), "review_note": body.note}})
    if not changed.modified_count:  # repeated click: already decided this way, nothing more to record or email
        return {"id": student_id, "status": status, "unchanged": True}
    await record_approval(kind="student", target_id=student_id, name=student["name"], email=student["email"],
                          decision=body.decision, by=user, note=body.note, college_id=user["college_id"])
    await email_decision(student["email"], student["name"], body.decision == "approve", "Campus Connect account", body.note, user)
    return {"id": student_id, "status": status}


@router.post("/college/students/bulk-decision")
async def bulk_decide(body: BulkDecisionIn, background: BackgroundTasks, user: dict = Depends(coordinator)):
    """Approve many sign-ups at once ("everyone except these"), optionally rejecting the exceptions.
    Only students still waiting at this college are touched; emails go out in the background."""
    approve = set(body.approve)
    reject = set(body.reject) - approve
    if not approve and not reject:
        raise HTTPException(400, "Choose at least one student")
    ids = [oid(i) for i in approve | reject]
    found = [s async for s in db.users.find({"_id": {"$in": ids}, "role": "student", "college_id": user["college_id"],
                                              "status": "pending"}, {"name": 1, "email": 1})]
    t = datetime.now(timezone.utc)
    counts = {"approved": 0, "rejected": 0, "skipped": len(approve | reject) - len(found)}
    for s in found:
        sid = str(s["_id"])
        decision = "approve" if sid in approve else "reject"
        note = body.note if decision == "reject" else None
        await db.users.update_one({"_id": s["_id"], "status": "pending"}, {"$set": {
            "status": "active" if decision == "approve" else "rejected", "reviewed_at": t, "review_note": note}})
        await record_approval(kind="student", target_id=sid, name=s["name"], email=s["email"], decision=decision,
                              by=user, note=note, college_id=user["college_id"])
        background.add_task(email_decision, s["email"], s["name"], decision == "approve", "Campus Connect account", note, user)
        counts["approved" if decision == "approve" else "rejected"] += 1
    return counts


@router.post("/college/students/roster-match")
async def roster_match(file: UploadFile = File(...), user: dict = Depends(coordinator)):
    """Compare an official student list (CSV, Excel, PDF, Word, text) with the sign-ups waiting for
    approval. Approves nothing: the placement cell reviews the matches, then approves them in one go."""
    from ..roster import match, read_rows
    rows = read_rows(file.filename or "", await file.read())
    if not rows:
        raise HTTPException(400, "No rows found in that file")
    q = {"role": "student", "college_id": user["college_id"]}
    waiting = [serialize(s) async for s in db.users.find({**q, "status": "pending"}, STUDENT_FIELDS)]
    approved = [s async for s in db.users.find({**q, "status": "active"}, {"name": 1, "roll_number": 1, "email": 1})]
    out = match(rows, waiting, approved)
    out["file"] = file.filename
    return out


@router.get("/college/students/name-changes")
async def name_changes(user: dict = Depends(coordinator)):
    """Students whose name change the placement cell hasn't signed off yet."""
    cur = db.users.find({"role": "student", "college_id": user["college_id"],
                         "name_change.status": {"$in": ["pending", "asked"]}}, STUDENT_FIELDS)
    return [serialize(s) async for s in cur.sort("name_change.at", -1)]


@router.post("/college/students/{student_id}/name-review")
async def review_name(student_id: str, body: NameReviewIn, background: BackgroundTasks, user: dict = Depends(coordinator)):
    """After a student renames themselves: accept it, ask them about it, undo it, or suspend (and later
    reactivate) the account."""
    s = await db.users.find_one({"_id": oid(student_id), "role": "student", "college_id": user["college_id"]})
    if not s:
        raise HTTPException(404, "Student not found at your college")
    nc, t, msg = s.get("name_change") or {}, now(), (body.message or "").strip()
    sets, review = {}, {"by": user["name"], "at": t}
    if body.action in ("ok", "revert") and nc.get("status") not in ("pending", "asked"):
        raise HTTPException(400, "There's no name change waiting for review")
    if body.action == "message" and len(msg) < 3:
        raise HTTPException(400, "Write the message for the student")

    if body.action == "ok":
        sets["name_change.status"] = "ok"
    elif body.action == "message":
        sets["name_change.status"] = "asked" if nc.get("status") in ("pending", "asked") else nc.get("status")
        await notify([student_id], "Message from your placement cell", msg[:300], "/profile", "message")
        background.add_task(email_note, s["email"], s["name"], "A message from your placement cell", msg, user)
    elif body.action == "revert":
        sets.update({"first_name": nc["old_first_name"], "last_name": nc["old_last_name"], "name": nc["old_name"],
                     "name_change.status": "reverted"})
        why = msg or "It doesn't match the name in college records."
        await notify([student_id], "Your name change was undone",
                     f"Your name is back to {nc['old_name']}. {why}", "/profile", "message")
    elif body.action == "suspend":
        if s.get("status") != "active":
            raise HTTPException(400, "Only active accounts can be suspended")
        why = msg or "Please contact your placement cell."
        sets.update({"status": "suspended", "review_note": why, "suspended_at": t})
        if nc.get("status") in ("pending", "asked"):
            sets["name_change.status"] = "suspended"
        background.add_task(email_note, s["email"], s["name"], "Your Campus Connect account is on hold",
                         f"Your placement cell has put your account on hold.\n\nReason: {why}\n\n"
                         "You can't use Campus Connect until they reactivate it. Reply to this email to reach them.", user)
    elif body.action == "reactivate":
        if s.get("status") != "suspended":
            raise HTTPException(400, "This account isn't suspended")
        sets.update({"status": "active", "review_note": None})
        await notify([student_id], "Your account is active again", msg or "Your placement cell restored your access.", "/", "message")
    if body.action != "message" or sets.get("name_change.status"):
        sets["name_change.review"] = review if nc else None
    sets = {k: v for k, v in sets.items() if not (k == "name_change.review" and v is None)}
    if sets:
        await db.users.update_one({"_id": s["_id"]}, {"$set": sets})
    await log_update(entity="student", entity_id=student_id, college_id=user["college_id"], action=f"name_{body.action}",
                     summary={"ok": "Name change accepted", "message": "Placement cell messaged the student",
                              "revert": "Name change undone", "suspend": "Account suspended",
                              "reactivate": "Account reactivated"}[body.action], by=user)
    return serialize(await db.users.find_one({"_id": s["_id"]}, STUDENT_FIELDS))


# ---- connections between colleges and companies ---------------------------

def _side(user: dict):
    return ("college_id", user["college_id"]) if user["role"] == "coordinator" else ("company_id", user["company_id"])


async def _connections_for(user: dict) -> dict:
    field, mine = _side(user)
    return {c["company_id" if field == "college_id" else "college_id"]: c
            async for c in db.connections.find({field: mine})}


@router.get("/directory/companies")
async def company_directory(user: dict = Depends(coordinator)):
    conns = await _connections_for(user)
    drives = {}
    async for row in db.drives.aggregate([{"$group": {"_id": "$company", "n": {"$sum": 1}}}]):
        drives[row["_id"]] = row["n"]
    out = []
    async for c in db.companies.find({"status": "approved"}).sort("name", 1):
        item = serialize(c)
        conn = conns.get(item["id"])
        item["connection"] = {"id": str(conn["_id"]), "status": conn["status"], "requested_by": conn["requested_by"]} if conn else None
        item["drives_posted"] = drives.get(c["name"], 0)
        out.append(item)
    return out


@router.get("/directory/colleges")
async def college_directory(user: dict = Depends(require_role("recruiter"))):
    conns = await _connections_for(user)
    students = {}
    async for row in db.users.aggregate([{"$match": {"role": "student", "status": "active"}},
                                         {"$group": {"_id": "$college_id", "n": {"$sum": 1}}}]):
        students[row["_id"]] = row["n"]
    out = []
    async for c in db.colleges.find({"status": "approved"}).sort([("tier", 1), ("name", 1)]):
        item = serialize(c)
        conn = conns.get(item["id"])
        item["connection"] = {"id": str(conn["_id"]), "status": conn["status"], "requested_by": conn["requested_by"]} if conn else None
        item["students"] = students.get(item["id"], 0)
        out.append(item)
    return out


@router.post("/connections")
async def request_connection(body: ConnectIn, user: dict = Depends(org_member)):
    if user["role"] == "coordinator":
        if not body.company_id or not await db.companies.find_one({"_id": oid(body.company_id), "status": "approved"}):
            raise HTTPException(400, "Choose an approved company")
        key = {"college_id": user["college_id"], "company_id": body.company_id}
        by = "college"
    else:
        if not body.college_id or not await db.colleges.find_one({"_id": oid(body.college_id), "status": "approved"}):
            raise HTTPException(400, "Choose an approved college")
        key = {"college_id": body.college_id, "company_id": user["company_id"]}
        by = "company"
    existing = await db.connections.find_one(key)
    if existing and existing["status"] in ("pending", "accepted"):
        raise HTTPException(409, "Already connected" if existing["status"] == "accepted" else "Request already pending")
    doc = {**key, "status": "pending", "requested_by": by, "requested_by_user": user["id"],
           "message": body.message, "created_at": datetime.now(timezone.utc)}
    if existing:
        await db.connections.replace_one({"_id": existing["_id"]}, doc)
        doc["_id"] = existing["_id"]
    else:
        doc["_id"] = (await db.connections.insert_one(doc)).inserted_id
    me = await _org_name(user)
    receivers = await (company_staff(key["company_id"]) if by == "college" else college_staff(key["college_id"]))
    await notify(receivers, "New connection request", f"{me} wants to connect" + (f": “{body.message}”" if body.message else ""),
                 "/inbox", "connection", email_from=user,
                 email_body=f"{me} would like to connect on Campus Connect." + (f"\n\n“{body.message}”" if body.message else "")
                 + "\n\nOpen your inbox to accept or decline.")
    await log_update(entity="connection", entity_id=str(doc["_id"]), college_id=key["college_id"], company_id=key["company_id"],
                     action="requested", summary=f"Connection requested by {me}", by=user)
    return serialize(doc)


async def _org_name(user: dict) -> str:
    if user["role"] == "coordinator":
        c = await db.colleges.find_one({"_id": ObjectId(user["college_id"])}, {"name": 1})
    else:
        c = await db.companies.find_one({"_id": ObjectId(user["company_id"])}, {"name": 1})
    return c["name"] if c else "Someone"


async def _other_side(conn: dict, user: dict):
    return await (company_staff(conn["company_id"]) if user["role"] == "coordinator" else college_staff(conn["college_id"]))


@router.post("/connections/{conn_id}/decision")
async def respond_connection(conn_id: str, body: DecisionIn, user: dict = Depends(org_member)):
    conn = await db.connections.find_one({"_id": oid(conn_id)})
    field, mine = _side(user)
    if not conn or conn[field] != mine:
        raise HTTPException(404, "Request not found")
    if conn["status"] != "pending":
        raise HTTPException(400, f"Request is already {conn['status']}")
    if conn["requested_by"] == ("college" if user["role"] == "coordinator" else "company"):
        raise HTTPException(400, "Waiting for the other side to respond")
    status = "accepted" if body.decision == "approve" else "declined"
    note = (body.note or "").strip() or None
    await db.connections.update_one({"_id": conn["_id"]}, {"$set": {"status": status, "responded_at": datetime.now(timezone.utc),
                                                                    "response_note": note}})
    me = await _org_name(user)
    text = f"{me} {status} your request." + (" You can now coordinate drives." if status == "accepted" else "")
    await notify(await _other_side(conn, user), f"Connection {status}", text + (f" Note: “{note}”" if note else ""), "/connect", "connection",
                 email_from=user, email_body=text + (f"\n\nTheir note:\n“{note}”" if note else ""))
    await log_update(entity="connection", entity_id=conn_id, college_id=conn["college_id"], company_id=conn["company_id"],
                     action=status, summary=f"Connection {status} by {me}", by=user)
    return {"id": conn_id, "status": status}


@router.post("/connections/{conn_id}/cancel")
async def cancel_connection(conn_id: str, user: dict = Depends(org_member)):
    """The requester withdraws a pending request (or either side ends an active connection)."""
    conn = await db.connections.find_one({"_id": oid(conn_id)})
    field, mine = _side(user)
    if not conn or conn[field] != mine:
        raise HTTPException(404, "Connection not found")
    mine_side = "college" if user["role"] == "coordinator" else "company"
    if conn["status"] == "pending" and conn["requested_by"] != mine_side:
        raise HTTPException(400, "Decline the request instead")
    if conn["status"] not in ("pending", "accepted"):
        raise HTTPException(400, f"Connection is already {conn['status']}")
    await db.connections.update_one({"_id": conn["_id"]}, {"$set": {"status": "cancelled", "cancelled_at": now(),
                                                                    "cancelled_by": mine_side}})
    me = await _org_name(user)
    await notify(await _other_side(conn, user), "Connection cancelled", f"{me} cancelled the connection.", "/connect", "connection")
    await log_update(entity="connection", entity_id=conn_id, college_id=conn["college_id"], company_id=conn["company_id"],
                     action="cancelled", summary=f"Connection cancelled by {me}", by=user)
    return {"id": conn_id, "status": "cancelled"}


# ---- shared communication (also the college's company communication log) -------------
@router.get("/connections/{conn_id}/messages")
async def messages(conn_id: str, user: dict = Depends(org_member)):
    conn = await db.connections.find_one({"_id": oid(conn_id)})
    field, mine = _side(user)
    if not conn or conn[field] != mine:
        raise HTTPException(404, "Connection not found")
    rows = await db.messages.find({"connection_id": conn_id}).sort("at", 1).to_list(500)
    me_side = "college" if user["role"] == "coordinator" else "company"
    await db.messages.update_many({"connection_id": conn_id, "from_side": {"$ne": me_side}}, {"$set": {"read_" + me_side: True}})
    return [{**serialize(m), "mine": m["from_side"] == me_side} for m in rows]


@router.post("/connections/{conn_id}/messages")
async def send_message(conn_id: str, body: MessageIn, user: dict = Depends(org_member)):
    conn = await db.connections.find_one({"_id": oid(conn_id)})
    field, mine = _side(user)
    if not conn or conn[field] != mine:
        raise HTTPException(404, "Connection not found")
    if conn["status"] not in ("pending", "accepted"):
        raise HTTPException(400, "This connection isn't active")
    if conn["status"] == "pending" and body.kind not in ("info_request", "message"):
        raise HTTPException(400, "Only questions can be sent before the request is accepted")
    side = "college" if user["role"] == "coordinator" else "company"
    drive_label = None
    if body.drive_id:
        d = await db.drives.find_one({"_id": oid(body.drive_id), "college_id": conn["college_id"]})
        drive_label = f"{d['company']} · {d['role']}" if d else None
    doc = {"connection_id": conn_id, "college_id": conn["college_id"], "company_id": conn["company_id"],
           "from_side": side, "by_id": user["id"], "by_name": user["name"], "text": body.text, "kind": body.kind,
           "drive_id": body.drive_id, "drive_label": drive_label, "at": now()}
    doc["_id"] = (await db.messages.insert_one(doc)).inserted_id
    if body.kind == "info_request":
        await db.connections.update_one({"_id": conn["_id"]}, {"$set": {"info_requested": True}})
    me = await _org_name(user)
    kind = {"info_request": "asked for more information", "date_confirmation": "sent a date confirmation",
            "document_request": "requested a document"}.get(body.kind, "sent a message")
    await notify(await _other_side(conn, user), f"{me} {kind}", body.text[:140], f"/connect?thread={conn_id}", "message",
                 email_from=user, email_body=body.text)
    return {**serialize(doc), "mine": True}


@router.get("/connections")
async def my_connections(user: dict = Depends(org_member)):
    field, mine = _side(user)
    other_coll, other_field = ("companies", "company_id") if field == "college_id" else ("colleges", "college_id")
    conns = await db.connections.find({field: mine}).sort("created_at", -1).to_list(None)
    others = {str(o["_id"]): o async for o in db[other_coll].find({"_id": {"$in": [ObjectId(c[other_field]) for c in conns]}})}
    me_side = "college" if field == "college_id" else "company"
    unread = {}
    async for row in db.messages.aggregate([{"$match": {field: mine, "from_side": {"$ne": me_side}, "read_" + me_side: {"$ne": True}}},
                                            {"$group": {"_id": "$connection_id", "n": {"$sum": 1}}}]):
        unread[row["_id"]] = row["n"]
    from .org import contacts_of
    other_kind = "company" if me_side == "college" else "college"
    out = []
    for c in conns:
        incoming = c["requested_by"] != me_side
        # a request carries the requester's contact; both sides see each other once accepted
        share = c["status"] == "accepted" or (c["status"] == "pending" and incoming)
        out.append({**serialize(c), "other": serialize(others[c[other_field]]) if c[other_field] in others else None,
                    "incoming": incoming, "status_label": CONNECTION_STATUS.get(c["status"], c["status"]),
                    "unread": unread.get(str(c["_id"]), 0),
                    "contacts": await contacts_of(other_kind, c[other_field]) if share else None})
    return out
