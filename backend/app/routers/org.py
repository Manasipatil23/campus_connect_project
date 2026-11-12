"""Company and placement-cell profiles, and the contact details they share with each other.

Who sees a contact person (name, designation, email, phone):
  * your own organisation, always
  * the other side of a connection request you sent (they need to know who's asking)
  * both sides once a connection is accepted
  * never students, and never organisations you have no connection with
"""
from typing import List, Literal, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..auth import require_role
from ..db import db, serialize
from ..schemas import PHONE
from .drives import oid

router = APIRouter(prefix="/api/org", tags=["org"])
org_member = require_role("coordinator", "recruiter")

CONTACT_FIELDS = {"name": 1, "designation": 1, "email": 1, "phone": 1}
# set by the platform admin's verification: shown, never edited here
VERIFIED = {"company": ["cin", "gstin", "email_domain"],
            "college": ["aishe_code", "naac_grade", "tier", "email_domain", "institution_type", "affiliated_university", "established_year"]}


class PersonIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    designation: str = Field(min_length=2, max_length=80)
    phone: str = Field(pattern=PHONE)


class CompanyIn(BaseModel):
    website: str = Field(pattern=r"^https?://[\w.-]+\.[a-z]{2,}(/.*)?$")
    industry: str = Field(min_length=2, max_length=60)
    size: Literal["1-50", "51-200", "201-1000", "1001-5000", "5000+"]
    hq_city: str = Field(min_length=2, max_length=60)
    about: str = Field(min_length=20, max_length=1000)
    careers_email: Optional[str] = Field(default=None, max_length=120)


class CollegeIn(BaseModel):
    website: str = Field(pattern=r"^https?://[\w.-]+\.[a-z]{2,}(/.*)?$")
    address: str = Field(min_length=10, max_length=300)
    city: str = Field(min_length=2, max_length=60)
    state: str = Field(min_length=2, max_length=60)
    pincode: str = Field(pattern=r"^[1-9]\d{5}$")
    phone: str = Field(pattern=r"^(\+91[\s-]?)?[0-9]{10,11}$")
    about: Optional[str] = Field(default=None, max_length=1000)
    placement_email: Optional[str] = Field(default=None, max_length=120)


class OrgProfileIn(BaseModel):
    person: PersonIn
    company: Optional[CompanyIn] = None
    college: Optional[CollegeIn] = None


def _kind(user: dict):
    return ("college", "colleges", "college_id") if user["role"] == "coordinator" else ("company", "companies", "company_id")


async def contacts_of(kind: str, org_id: Optional[str]) -> List[dict]:
    """The people at an organisation who handle placements."""
    if not org_id:
        return []
    role, field = ("coordinator", "college_id") if kind == "college" else ("recruiter", "company_id")
    return [{k: u.get(k) for k in CONTACT_FIELDS} async for u in
            db.users.find({"role": role, field: org_id, "status": "active"}, CONTACT_FIELDS)]


@router.get("/profile")
async def my_profile(user: dict = Depends(org_member)):
    kind, coll, field = _kind(user)
    org = await db[coll].find_one({"_id": oid(user[field])})
    if not org:
        raise HTTPException(404, "Organisation not found")
    connections = await db.connections.count_documents({field: user[field], "status": "accepted"})
    return {
        "kind": kind,
        "person": {k: user.get(k) for k in CONTACT_FIELDS},
        "org": serialize(org),
        "verified_fields": VERIFIED[kind],
        "colleagues": [c for c in await contacts_of(kind, user[field]) if c["email"] != user["email"]],
        "shared_with": connections,
    }


@router.put("/profile")
async def update_profile(body: OrgProfileIn, user: dict = Depends(org_member)):
    kind, coll, field = _kind(user)
    org_update = body.company if kind == "company" else body.college
    if not org_update:
        raise HTTPException(400, f"Send the {kind} details")
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": body.person.model_dump()})
    await db[coll].update_one({"_id": oid(user[field])}, {"$set": org_update.model_dump()})
    return await my_profile({**user, **body.person.model_dump()})
