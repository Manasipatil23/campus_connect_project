"""Demo accounts only: no dummy students, drives or numbers.

    .venv/bin/python -m app.seed          # create the demo logins if they're missing (never deletes anything)
    .venv/bin/python -m app.seed --wipe   # DELETE everything except the demo logins, then make sure they exist

Demo logins (one per role) and the two organisations they belong to:
    student@campusconnect.dev   / student123    student at Westbridge Institute of Technology
    tpo@campusconnect.dev       / tpo123        Westbridge's placement cell
    recruiter@campusconnect.dev / recruiter123  HR at Nimbus Analytics
    admin@campusconnect.dev     / admin123      platform admin
"""
import asyncio
import sys
from datetime import datetime, timezone

from .auth import hash_password
from .db import db, ensure_indexes

NOW = datetime.now(timezone.utc)
DEMO_EMAILS = ["student@campusconnect.dev", "tpo@campusconnect.dev", "recruiter@campusconnect.dev", "admin@campusconnect.dev"]
COLLEGE_DOMAIN, COMPANY_DOMAIN = "wit.edu.in", "nimbusanalytics.dev"

# collections that only ever hold activity (all of it is removed by --wipe)
ACTIVITY = ["applications", "drives", "connections", "messages", "experiences", "announcements", "issues",
            "notifications", "updates", "change_requests", "approvals", "history", "email_codes"]

COLLEGE = {
    "name": "Westbridge Institute of Technology", "short": "WIT", "city": "Mumbai", "state": "Maharashtra",
    "tier": 2, "lat": 19.08, "lng": 72.88, "status": "approved", "aishe_code": "C-41000",
    "institution_type": "Autonomous", "affiliated_university": "University of Mumbai", "established_year": 2004,
    "naac_grade": "A", "website": "https://www.wit.edu.in", "address": "57, College Road, Mumbai",
    "pincode": "400057", "phone": "02228608558", "email_domain": COLLEGE_DOMAIN, "student_email_domain": None,
}
COMPANY = {
    "name": "Nimbus Analytics", "website": "https://www.nimbusanalytics.dev", "email_domain": COMPANY_DOMAIN,
    "industry": "Data & analytics", "size": "201-1000", "hq_city": "Pune", "cin": "U72200MH2010PTC200000",
    "about": "Nimbus builds analytics platforms for retail and fintech clients across India.", "status": "approved",
}


async def _org(coll: str, match: dict, doc: dict) -> str:
    found = await db[coll].find_one(match)
    if found:
        return str(found["_id"])
    return str((await db[coll].insert_one({**doc, "created_at": NOW})).inserted_id)


async def ensure_demo_accounts() -> None:
    college_id = await _org("colleges", {"$or": [{"email_domain": COLLEGE_DOMAIN}, {"short": "WIT"}]}, COLLEGE)
    company_id = await _org("companies", {"name": COMPANY["name"]}, COMPANY)
    users = [
        {"email": "admin@campusconnect.dev", "name": "Platform Admin", "role": "admin", "password": "admin123"},
        {"email": "tpo@campusconnect.dev", "name": "Anita Kulkarni", "role": "coordinator", "password": "tpo123",
         "designation": "Training & Placement Officer", "phone": "9820012345", "college_id": college_id},
        {"email": "recruiter@campusconnect.dev", "name": "Priya Menon", "role": "recruiter", "password": "recruiter123",
         "designation": "Campus Hiring Lead", "phone": "9820030000", "company": COMPANY["name"], "company_id": company_id},
        {"email": "student@campusconnect.dev", "name": "Demo Student", "first_name": "Demo", "last_name": "Student",
         "role": "student", "password": "student123", "college_id": college_id, "roll_number": "22CE100",
         "phone": "9820022222", "email_verified": True, "reviewed_at": NOW,
         "profile": {"branch": "Computer", "grad_year": 2026}, "placement": {"status": "unplaced"}},
    ]
    for u in users:
        if await db.users.find_one({"email": u["email"]}):
            continue
        pw = u.pop("password")
        await db.users.insert_one({**u, "password_hash": hash_password(pw), "status": "active", "created_at": NOW})
        print(f"  created {u['email']}")


async def wipe_everything_but_demo() -> None:
    """Remove every dummy record. Keeps only the 4 demo logins and their college and company,
    and resets those to a clean state (no profile data, resume, links or history)."""
    college = await db.colleges.find_one({"$or": [{"email_domain": COLLEGE_DOMAIN}, {"short": "WIT"}]})
    company = await db.companies.find_one({"name": COMPANY["name"]})
    keep_colleges = [college["_id"]] if college else []
    keep_companies = [company["_id"]] if company else []

    for name in ACTIVITY:
        r = await db[name].delete_many({})
        print(f"  {name:16} removed {r.deleted_count}")
    r = await db.users.delete_many({"email": {"$nin": DEMO_EMAILS}})
    print(f"  {'users':16} removed {r.deleted_count} (kept the {len(DEMO_EMAILS)} demo logins)")
    r = await db.colleges.delete_many({"_id": {"$nin": keep_colleges}})
    print(f"  {'colleges':16} removed {r.deleted_count} (kept Westbridge)")
    r = await db.companies.delete_many({"_id": {"$nin": keep_companies}})
    print(f"  {'companies':16} removed {r.deleted_count} (kept Nimbus Analytics)")

    # demo accounts start fresh
    await db.colleges.update_many({}, {"$unset": {"enrolment": "", "about": "", "placement_email": ""}})
    await db.companies.update_many({}, {"$unset": {"careers_email": ""}})
    await db.users.update_one({"email": "student@campusconnect.dev"}, {
        "$set": {"profile": {"branch": "Computer", "grad_year": 2026}, "placement": {"status": "unplaced"}},
        "$unset": {"resume": "", "last_reminded_at": "", "last_seen_at": "", "last_login_at": "", "login_count": ""}})


async def main():
    await ensure_indexes()
    if "--wipe" in sys.argv:
        print("Removing all dummy data (keeping demo logins)…")
        await wipe_everything_but_demo()
    await ensure_demo_accounts()
    print("Demo accounts ready:", ", ".join(DEMO_EMAILS))


if __name__ == "__main__":
    asyncio.run(main())
