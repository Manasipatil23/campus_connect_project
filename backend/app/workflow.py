"""Shared workflow: the one place every portal records changes and notifies people.

Rules this module enforces (from the shared-workflow spec):
  * One source of truth - every portal reads the same drive / application records.
  * Draft vs published - students only ever see published drives and confirmed values.
  * Update history - important changes are logged with old value, new value, who, which
    portal, when, and whether they needed approval. Nothing is silently overwritten.
  * Notifications - sent when something relevant to that person changes.
"""
from datetime import datetime, timezone
from typing import Iterable, List, Optional

from bson import ObjectId

from .db import db
from .ml.eligibility import check_eligibility

# ---- status vocabularies shared by all three portals ---------------------------
DRIVE_STATUS = {
    "draft": "Draft",
    "review": "Sent for review",
    "changes_requested": "Needs changes",
    "approved": "Approved",
    "published": "Published",
    "in_progress": "In progress",
    "completed": "Completed",
    "cancelled": "Cancelled",
}
STUDENT_VISIBLE = ("published", "in_progress", "completed")  # students never see drafts or reviews
ACCEPTING = ("published",)                                  # applications open
LIVE = ("published", "in_progress")

ROUND_STATUS = {
    "planned": "Planned",                      # company's tentative date, not yet verified
    "pending": "Pending confirmation",         # a change was proposed and awaits the placement cell
    "confirmed": "Confirmed",
    "rescheduled": "Rescheduled",              # confirmed, after a confirmed change
    "cancelled": "Cancelled",
}
CONNECTION_STATUS = {"pending": "Requested", "accepted": "Accepted", "declined": "Declined", "cancelled": "Cancelled"}
ISSUE_STATUS = {"open": "Open", "in_progress": "In progress", "waiting": "Waiting for information",
                "resolved": "Resolved", "closed": "Closed"}

# drive fields students see; changing them after review needs the placement cell's approval
STUDENT_FACING_FIELDS = ("description", "ctc_lpa", "location", "deadline", "criteria", "required_skills",
                         "preferred_skills", "role", "tier")
FIELD_LABELS = {"description": "Job description", "ctc_lpa": "CTC", "location": "Location", "deadline": "Deadline",
                "criteria": "Eligibility", "required_skills": "Required skills", "preferred_skills": "Preferred skills",
                "role": "Role", "tier": "Tier", "date": "Date", "time": "Time", "venue": "Venue / link"}

PORTAL = {"recruiter": "company", "coordinator": "college", "student": "student", "admin": "admin"}


def now() -> datetime:
    return datetime.now(timezone.utc)


def portal_of(user: dict) -> str:
    return PORTAL.get(user["role"], user["role"])


# ---- update history ---------------------------------------------------------------
async def log_update(*, entity: str, entity_id: str, action: str, summary: str, by: Optional[dict],
                     drive_id: Optional[str] = None, college_id: Optional[str] = None,
                     company_id: Optional[str] = None, field: Optional[str] = None, old=None, new=None,
                     approval: str = "not_required", visibility: str = "internal",
                     notified: Optional[str] = None, extra: Optional[dict] = None) -> dict:
    """Record what changed, who changed it, from which portal, when, whether it needs
    approval, and who was told. `visibility` is "internal" (company + college) or
    "students" (also shown on the student side of that drive)."""
    doc = {
        "entity": entity, "entity_id": entity_id, "action": action, "summary": summary,
        "drive_id": drive_id, "college_id": college_id, "company_id": company_id,
        "field": field, "old": old, "new": new, "approval": approval, "visibility": visibility,
        "by_id": by["id"] if by else None, "by_name": by.get("name") if by else "System",
        "portal": portal_of(by) if by else "system", "notified": notified, "at": now(), **(extra or {}),
    }
    doc["_id"] = (await db.updates.insert_one(doc)).inserted_id
    return doc


# ---- notifications ----------------------------------------------------------------
async def notify(user_ids: Iterable[str], title: str, body: str = "", link: Optional[str] = None,
                 kind: str = "update", exclude: Optional[str] = None) -> int:
    ids = sorted({u for u in user_ids if u and u != exclude})
    if not ids:
        return 0
    t = now()
    await db.notifications.insert_many([{"user_id": u, "title": title, "body": body, "link": link,
                                         "kind": kind, "read": False, "created_at": t} for u in ids])
    return len(ids)


async def college_staff(college_id: Optional[str]) -> List[str]:
    if not college_id:
        return []
    return [str(u["_id"]) async for u in db.users.find(
        {"role": "coordinator", "college_id": college_id, "status": "active"}, {"_id": 1})]


async def company_staff(company_id: Optional[str]) -> List[str]:
    if not company_id:
        return []
    return [str(u["_id"]) async for u in db.users.find(
        {"role": "recruiter", "company_id": company_id, "status": "active"}, {"_id": 1})]


async def drive_company_staff(drive: dict) -> List[str]:
    ids = await company_staff(drive.get("company_id"))
    if drive.get("recruiter_id") and drive["recruiter_id"] not in ids:
        ids.append(drive["recruiter_id"])
    return ids


ACTIVE_APP = {"$nin": ["rejected", "withdrawn", "declined"]}


async def drive_applicants(drive_id: str, active_only: bool = True) -> List[str]:
    q = {"drive_id": drive_id}
    if active_only:
        q["status"] = ACTIVE_APP
    return [a["student_id"] async for a in db.applications.find(q, {"student_id": 1})]


async def eligible_students(drive: dict) -> List[str]:
    out = []
    async for s in db.users.find({"role": "student", "status": "active", "college_id": drive.get("college_id")},
                                 {"profile": 1, "college_id": 1, "placement": 1}):
        if check_eligibility(s, drive)[0]:
            out.append(str(s["_id"]))
    return out


async def affected_students(drive: dict) -> List[str]:
    """Who needs to hear about a change to a published drive: everyone still in the
    process, plus eligible students who could still apply while applications are open."""
    ids = set(await drive_applicants(str(drive["_id"])))
    if drive.get("status") in ACCEPTING:
        ids |= set(await eligible_students(drive))
    return sorted(ids)


def drive_label(drive: dict) -> str:
    return f"{drive.get('company')} · {drive.get('role')}"


def oid_list(ids: Iterable[str]) -> List[ObjectId]:
    return [ObjectId(i) for i in ids if ObjectId.is_valid(i)]


async def record_approval(*, kind: str, target_id: str, name: str, email: Optional[str], decision: str,
                          by: dict, note: Optional[str] = None, tier: Optional[int] = None,
                          college_id: Optional[str] = None) -> dict:
    """Store an approval decision as its own entry in the `approvals` collection:
    who was approved or rejected, their email, by whom, when, and the note."""
    doc = {"kind": kind, "target_id": target_id, "name": name, "email": email,
           "decision": "approved" if decision == "approve" else "rejected", "tier": tier, "note": note,
           "college_id": college_id, "decided_by": {"id": by["id"], "name": by.get("name"), "role": by["role"]},
           "decided_at": now()}
    doc["_id"] = (await db.approvals.insert_one(doc)).inserted_id
    return doc
