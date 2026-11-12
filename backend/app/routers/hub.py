"""Cross-portal pieces: notifications, pending actions, announcements and student issues."""
from datetime import timedelta

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from ..auth import active_user, require_role
from ..db import db, serialize
from ..ml.eligibility import check_eligibility
from ..schemas import AnnouncementIn, IssueIn, IssuePatch
from ..workflow import (ACCEPTING, DRIVE_STATUS, ISSUE_STATUS, college_staff, drive_applicants, drive_label,
                        eligible_students, log_update, notify, now)
from .drives import get_drive, is_college, oid

router = APIRouter(prefix="/api", tags=["hub"])
coordinator = require_role("coordinator")
student_only = require_role("student")


# ---- notification centre ----------------------------------------------------------
@router.get("/notifications")
async def my_notifications(limit: int = 40, user: dict = Depends(active_user)):
    rows = await db.notifications.find({"user_id": user["id"]}).sort("created_at", -1).to_list(min(limit, 200))
    unread = await db.notifications.count_documents({"user_id": user["id"], "read": False})
    return {"unread": unread, "items": [serialize(r) for r in rows]}


@router.post("/notifications/read-all")
async def read_all(user: dict = Depends(active_user)):
    await db.notifications.update_many({"user_id": user["id"], "read": False}, {"$set": {"read": True}})
    return {"ok": True}


@router.post("/notifications/{nid}/read")
async def read_one(nid: str, user: dict = Depends(active_user)):
    await db.notifications.update_one({"_id": oid(nid), "user_id": user["id"]}, {"$set": {"read": True}})
    return {"ok": True}


# ---- "what needs me?" -------------------------------------------------------------
@router.get("/actions")
async def pending_actions(user: dict = Depends(active_user)):
    """Items waiting on this user. Each portal owns different steps of the shared workflow."""
    items = []

    def add(kind, title, detail, link, count=1):
        if count:
            items.append({"kind": kind, "title": title, "detail": detail, "link": link, "count": count})

    if user["role"] == "coordinator":
        cid = user["college_id"]
        async for d in db.drives.find({"college_id": cid, "status": "review"}):
            add("review", "Review drive", drive_label(d), f"/drives/{d['_id']}")
        async for d in db.drives.find({"college_id": cid, "status": "approved"}):
            add("publish", "Ready to publish", drive_label(d), f"/drives/{d['_id']}")
        changes = await db.change_requests.find({"college_id": cid, "status": "pending"}).to_list(None)
        drives = {str(d["_id"]): d async for d in db.drives.find({"_id": {"$in": [oid(c["drive_id"]) for c in changes]}})}
        for c in changes:
            add("change", "Confirm change", f"{drive_label(drives.get(c['drive_id'], {}))}: {c['label']}", f"/drives/{c['drive_id']}")
        async for d in db.drives.find({"college_id": cid, "status": {"$in": ["approved", "published", "in_progress"]},
                                       "rounds": {"$elemMatch": {"status": "planned", "date": {"$ne": None}}}}):
            add("schedule", "Confirm round dates", drive_label(d), f"/drives/{d['_id']}")
        add("connection", "Connection requests", "Companies waiting for your answer", "/connect",
            await db.connections.count_documents({"college_id": cid, "status": "pending", "requested_by": "company"}))
        add("issue", "Student issues", "Open or in progress", "/inbox?tab=issues",
            await db.issues.count_documents({"college_id": cid, "status": {"$in": ["open", "in_progress"]}}))
        add("moderation", "Experiences to moderate", "Waiting before they're visible to students", "/inbox?tab=moderation",
            await db.experiences.count_documents({"college_id": cid, "moderation": "pending"}))
        add("students", "Student sign-ups", "Waiting for approval", "/students",
            await db.users.count_documents({"role": "student", "college_id": cid, "status": "pending"}))

    elif user["role"] == "recruiter":
        q = {"$or": [{"recruiter_id": user["id"]}, {"company_id": user.get("company_id") or "-"}]}
        async for d in db.drives.find({**q, "status": "changes_requested"}):
            add("changes", "Placement cell asked for changes", f"{drive_label(d)}: {d.get('review_note') or ''}", f"/drives/{d['_id']}")
        async for d in db.drives.find({**q, "status": "draft"}):
            add("draft", "Draft not sent", drive_label(d), f"/drives/{d['_id']}")
        live = await db.drives.find({**q, "status": {"$in": ["published", "in_progress"]}}).to_list(None)
        for d in live:
            n = await db.applications.count_documents({"drive_id": str(d["_id"]), "status": "applied"})
            add("screen", "Applications to screen", drive_label(d), f"/drives/{d['_id']}/candidates", n)
        add("connection", "Connection requests", "Colleges waiting for your answer", "/connect",
            await db.connections.count_documents({"company_id": user.get("company_id"), "status": "pending", "requested_by": "college"}))
        add("waiting", "Waiting on placement cells", "Changes you proposed", "/inbox",
            await db.change_requests.count_documents({"company_id": user.get("company_id"), "status": "pending"}))

    elif user["role"] == "student":
        apps = await db.applications.find({"student_id": user["id"]}, {"resume_snapshot": 0}).to_list(None)
        drives = {str(d["_id"]): d async for d in db.drives.find({"_id": {"$in": [oid(a["drive_id"]) for a in apps]}})}
        for a in apps:
            d = drives.get(a["drive_id"], {})
            if a["status"] == "offered":
                add("offer", "Respond to your offer", drive_label(d), f"/applications/{a['_id']}")
        applied = {a["drive_id"] for a in apps}
        soon = (now() + timedelta(days=4)).date().isoformat()
        async for d in db.drives.find({"college_id": user.get("college_id"), "status": {"$in": list(ACCEPTING)}}):
            if str(d["_id"]) not in applied and check_eligibility(user, d)[0] and d.get("deadline") and d["deadline"] <= soon:
                add("deadline", f"Deadline {d['deadline']}", drive_label(d), f"/drives/{d['_id']}")
        if not user.get("resume"):
            add("resume", "Upload your resume", "Needed to apply and for JD matching", "/resume")
        add("issue", "Replies on your issues", "The placement cell responded", "/help",
            await db.issues.count_documents({"student_id": user["id"], "unread_by_student": True}))
    return items


# ---- announcements -------------------------------------------------------------------
async def _audience(body: AnnouncementIn, user: dict):
    if body.audience == "all":
        return [str(s["_id"]) async for s in db.users.find({"role": "student", "status": "active",
                                                            "college_id": user["college_id"]}, {"_id": 1})], "All students"
    if body.audience == "branches":
        if not body.branches:
            raise HTTPException(400, "Choose at least one branch")
        return [str(s["_id"]) async for s in db.users.find({"role": "student", "status": "active", "college_id": user["college_id"],
                                                            "profile.branch": {"$in": body.branches}}, {"_id": 1})], ", ".join(body.branches)
    if not body.drive_id:
        raise HTTPException(400, "Choose a drive")
    drive = await get_drive(body.drive_id)
    if not is_college(user, drive):
        raise HTTPException(403, "Not your college's drive")
    if body.audience == "drive_eligible":
        return await eligible_students(drive), f"Eligible for {drive_label(drive)}"
    return await drive_applicants(body.drive_id), f"Applicants of {drive_label(drive)}"


@router.post("/announcements")
async def post_announcement(body: AnnouncementIn, user: dict = Depends(coordinator)):
    ids, label = await _audience(body, user)
    doc = {**body.model_dump(), "college_id": user["college_id"], "audience_label": label, "recipient_ids": ids,
           "by_id": user["id"], "by_name": user["name"], "created_at": now()}
    doc["_id"] = (await db.announcements.insert_one(doc)).inserted_id
    n = await notify(ids, f"Notice: {body.title}", body.body[:140], "/notices", "announcement")
    await log_update(entity="announcement", entity_id=str(doc["_id"]), drive_id=body.drive_id, college_id=user["college_id"],
                     action="announcement", summary=f"Announcement: {body.title}", by=user,
                     visibility="students" if body.drive_id else "internal", notified=f"{n} students")
    out = serialize(doc)
    out["recipients"] = len(ids)
    out.pop("recipient_ids", None)
    return out


@router.get("/announcements")
async def announcements(user: dict = Depends(active_user)):
    if user["role"] == "coordinator":
        q = {"college_id": user["college_id"]}
    elif user["role"] == "student":
        q = {"recipient_ids": user["id"]}
    else:
        raise HTTPException(403, "Announcements are for placement cells and students")
    rows = await db.announcements.find(q).sort("created_at", -1).to_list(100)
    out = []
    for r in rows:
        item = serialize(r)
        item["recipients"] = len(r.get("recipient_ids", []))
        item.pop("recipient_ids", None)
        if user["role"] == "student":
            item.pop("audience_label", None)
        out.append(item)
    return out


# ---- feedback & issue management --------------------------------------------------
def _issue_for_student(i: dict) -> dict:
    item = serialize(i)
    item.pop("internal_notes", None)
    item["status_label"] = ISSUE_STATUS[i["status"]]
    item["owner_name"] = i.get("owner_name")
    return item


@router.post("/issues")
async def raise_issue(body: IssueIn, user: dict = Depends(student_only)):
    drive = None
    if body.drive_id:
        drive = await get_drive(body.drive_id)
        if drive.get("college_id") != user.get("college_id"):
            raise HTTPException(404, "Drive not found")
    t = now()
    doc = {**body.model_dump(), "drive_label": drive_label(drive) if drive else None, "student_id": user["id"],
           "student_name": user["name"], "college_id": user["college_id"], "status": "open", "owner_id": None,
           "owner_name": None, "replies": [], "internal_notes": [], "created_at": t, "updated_at": t,
           "history": [{"status": "open", "at": t, "by": "You"}]}
    doc["_id"] = (await db.issues.insert_one(doc)).inserted_id
    await notify(await college_staff(user["college_id"]), f"New issue: {body.subject}", body.category, "/inbox?tab=issues", "issue")
    return _issue_for_student(doc)


@router.get("/issues")
async def list_issues(user: dict = Depends(active_user)):
    if user["role"] == "student":
        rows = await db.issues.find({"student_id": user["id"]}).sort("updated_at", -1).to_list(100)
        await db.issues.update_many({"student_id": user["id"], "unread_by_student": True}, {"$set": {"unread_by_student": False}})
        return [_issue_for_student(r) for r in rows]
    if user["role"] != "coordinator":
        raise HTTPException(403, "Issues are handled by the placement cell")
    rows = await db.issues.find({"college_id": user["college_id"]}).sort("updated_at", -1).to_list(300)
    return [{**serialize(r), "status_label": ISSUE_STATUS[r["status"]]} for r in rows]


@router.patch("/issues/{issue_id}")
async def update_issue(issue_id: str, body: IssuePatch, user: dict = Depends(coordinator)):
    issue = await db.issues.find_one({"_id": oid(issue_id), "college_id": user["college_id"]})
    if not issue:
        raise HTTPException(404, "Issue not found")
    t = now()
    sets, push = {"updated_at": t}, {}
    if body.assign_to_me or (body.status and not issue.get("owner_id")):
        sets.update(owner_id=user["id"], owner_name=user["name"])
    if body.status and body.status != issue["status"]:
        sets["status"] = body.status
        push["history"] = {"status": body.status, "at": t, "by": user["name"]}
    if body.reply:
        push["replies"] = {"text": body.reply, "by": user["name"], "at": t}
    if body.internal_note:
        push["internal_notes"] = {"text": body.internal_note, "by": user["name"], "at": t}
    student_visible = bool(body.reply or (body.status and body.status != issue["status"]))
    if student_visible:
        sets["unread_by_student"] = True
    await db.issues.update_one({"_id": issue["_id"]}, {"$set": sets, **({"$push": push} if push else {})})
    if student_visible:
        status = ISSUE_STATUS[sets.get("status", issue["status"])]
        await notify([issue["student_id"]], f"Issue update: {issue['subject']}",
                     (body.reply[:140] if body.reply else f"Status: {status}"), "/help", "issue")
    fresh = await db.issues.find_one({"_id": issue["_id"]})
    return {**serialize(fresh), "status_label": ISSUE_STATUS[fresh["status"]]}
