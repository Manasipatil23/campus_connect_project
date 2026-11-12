"""Platform admin: verifies colleges and companies before they can use Campus Connect."""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from ..auth import require_role
from ..db import db, serialize
from ..schemas import DecisionIn
from ..workflow import email_decision, record_approval
from .drives import oid

router = APIRouter(prefix="/api/admin", tags=["admin"])
admin_only = require_role("admin")


async def _with_contact(org: dict, field: str) -> dict:
    item = serialize(org)
    contact = await db.users.find_one({field: item["id"]}, {"name": 1, "email": 1, "phone": 1, "designation": 1})
    item["contact"] = serialize(contact) if contact else None
    return item


@router.get("/overview")
async def overview(_: dict = Depends(admin_only)):
    async def count(coll, q):
        return await db[coll].count_documents(q)

    return {
        "colleges": {s: await count("colleges", {"status": s}) for s in ("pending", "approved", "rejected")},
        "companies": {s: await count("companies", {"status": s}) for s in ("pending", "approved", "rejected")},
        "students": await count("users", {"role": "student", "status": "active"}),
        "pending_students": await count("users", {"role": "student", "status": "pending"}),
        "drives": await count("drives", {}),
        "connections": await count("connections", {"status": "accepted"}),
        "experiences": await count("experiences", {}),
    }


@router.get("/approvals")
async def approval_log(limit: int = 30, _: dict = Depends(admin_only)):
    """Every approval decision, newest first (colleges, companies and students)."""
    rows = await db.approvals.find().sort("decided_at", -1).to_list(min(limit, 200))
    return [serialize(r) for r in rows]


@router.get("/colleges")
async def list_colleges(status: str = "pending", _: dict = Depends(admin_only)):
    return [await _with_contact(c, "college_id")
            async for c in db.colleges.find({"status": status}).sort("created_at", -1)]


@router.get("/companies")
async def list_companies(status: str = "pending", _: dict = Depends(admin_only)):
    return [await _with_contact(c, "company_id")
            async for c in db.companies.find({"status": status}).sort("created_at", -1)]


async def _decide(coll: str, user_field: str, org_id: str, body: DecisionIn, admin: dict) -> dict:
    org = await db[coll].find_one({"_id": oid(org_id)})
    if not org:
        raise HTTPException(404, "Not found")
    status = "approved" if body.decision == "approve" else "rejected"
    update = {"status": status, "reviewed_at": datetime.now(timezone.utc), "reviewed_by": admin["id"],
              "review_note": body.note}
    if coll == "colleges" and status == "approved":
        if not body.tier and not org.get("tier"):
            raise HTTPException(400, "Assign a tier (1, 2 or 3) when approving a college")
        update["tier"] = body.tier or org.get("tier")
    # only the request that actually changes the status counts: a double-click or retry must not
    # record the approval (or email the decision) twice
    changed = await db[coll].update_one({"_id": org["_id"], "status": {"$ne": status}}, {"$set": update})
    if not changed.modified_count:
        return {"id": org_id, "status": status, "unchanged": True}
    # the college's placement officer / company's HR become active (or stay locked out)
    await db.users.update_many({user_field: org_id, "role": {"$in": ["coordinator", "recruiter"]}},
                               {"$set": {"status": "active" if status == "approved" else "rejected"}})
    contact = await db.users.find_one({user_field: org_id, "role": {"$in": ["coordinator", "recruiter"]}}, {"email": 1})
    await record_approval(kind="college" if coll == "colleges" else "company", target_id=org_id, name=org["name"],
                          email=(contact or {}).get("email"), decision=body.decision, by=admin, note=body.note,
                          tier=update.get("tier"))
    full = await db.users.find_one({user_field: org_id, "role": {"$in": ["coordinator", "recruiter"]}}, {"email": 1, "name": 1})
    await email_decision((full or {}).get("email"), (full or {}).get("name"), status == "approved",
                         f"{'college' if coll == 'colleges' else 'company'} registration for {org['name']}", body.note, admin)
    return {"id": org_id, **update}


@router.post("/colleges/{college_id}/decision")
async def decide_college(college_id: str, body: DecisionIn, admin: dict = Depends(admin_only)):
    return await _decide("colleges", "college_id", college_id, body, admin)


@router.post("/companies/{company_id}/decision")
async def decide_company(company_id: str, body: DecisionIn, admin: dict = Depends(admin_only)):
    return await _decide("companies", "company_id", company_id, body, admin)
