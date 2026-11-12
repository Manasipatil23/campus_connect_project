"""Company / placement-cell contact sharing and privacy.

Contacts (name, designation, email, phone) are visible to: the receiver of a connection
request (the requester's contact), both sides of an accepted connection, and staff on a
shared drive. Never to students. Run: python -m tests.test_contacts (needs only the demo
logins; creates its own data and removes it afterwards).
"""
import os

os.environ["SMTP_HOST"] = ""  # tests never send real email (dev mode)

import json

from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.config import DB_NAME, MONGO_URL
from app.db import client_options
from app.main import app
from tests import fixtures

H = lambda t: {"Authorization": f"Bearer {t}"}


def check(cond, label):
    assert cond, label
    print(f"  ok  {label}")


def run():
    db = MongoClient(MONGO_URL, **client_options(MONGO_URL))[DB_NAME]
    since, created_conn, temp_company, drive_id = fixtures.started(), None, None, None
    try:
        with TestClient(app) as c:
            login = lambda e, p: c.post("/api/auth/login", json={"email": e, "password": p}).json()["token"]
            rec = login("recruiter@campusconnect.dev", "recruiter123")
            tpo = login("tpo@campusconnect.dev", "tpo123")
            stu = login("student@campusconnect.dev", "student123")
            college_id = c.get("/api/auth/me", headers=H(tpo)).json()["college_id"]
            company_id = c.get("/api/auth/me", headers=H(rec)).json()["company_id"]
            created_conn = fixtures.ensure_connection(db, college_id, company_id)

            # a second company asks the college to connect
            temp_company = fixtures.make_company(db, "Contacts Test Co", "hr@contacts-test.dev")
            other = login("hr@contacts-test.dev", "recruiter123")
            check(c.post("/api/connections", json={"college_id": college_id, "message": "Hello"}, headers=H(other)).status_code == 200,
                  "second company sends a request")

            wb = next(x for x in c.get("/api/connections", headers=H(rec)).json() if x["college_id"] == college_id)
            check(any(p["email"] == "tpo@campusconnect.dev" for p in wb["contacts"]), "company sees TPO contact once connected")

            incoming = next(x for x in c.get("/api/connections", headers=H(tpo)).json() if x["company_id"] == temp_company)
            check(incoming["contacts"] and incoming["contacts"][0]["email"] == "hr@contacts-test.dev",
                  "college sees the requester's contact on an incoming request")
            out = next(x for x in c.get("/api/connections", headers=H(other)).json() if x["college_id"] == college_id)
            check(out["contacts"] is None, "requester does not see the college's contact before acceptance")

            # a drive sent for review is shared by both sides
            d = c.post("/api/drives", headers=H(rec), json={
                "company": "x", "role": "Contacts Test Role", "description": "SQL and Python analyst role for the contacts test.",
                "ctc_lpa": 6, "college_id": college_id, "required_skills": ["sql"], "criteria_confirmed": True, "submit": True}).json()
            drive_id = d["id"]
            dd = c.get(f"/api/drives/{drive_id}", headers=H(rec)).json()
            check(any(p["email"] == "tpo@campusconnect.dev" for p in dd["contacts"]), "drive page shows placement-cell contact to company")
            dd = c.get(f"/api/drives/{drive_id}", headers=H(tpo)).json()
            check(any(p["email"] == "recruiter@campusconnect.dev" for p in dd["contacts"]), "drive page shows company contact to college")

            check(c.get("/api/org/profile", headers=H(stu)).status_code == 403, "students can't open org profiles")
            leaked = []
            for path in ["/auth/me", "/drives", f"/drives/{drive_id}", "/announcements", "/students/me/dashboard", "/experiences"]:
                body = json.dumps(c.get("/api/" + path.lstrip("/"), headers=H(stu)).json())
                if any(x in body for x in ("tpo@campusconnect.dev", "recruiter@campusconnect.dev", "9820012345", "hr@contacts-test.dev")):
                    leaked.append(path)
            check(not leaked, f"no staff email or phone in any student response {leaked or ''}")

            me = c.get("/api/org/profile", headers=H(rec)).json()
            body = {"person": {"name": me["person"]["name"], "designation": "Campus Hiring Lead", "phone": "not-a-phone"},
                    "company": {k: me["org"].get(k) for k in ("website", "industry", "size", "hq_city", "about")}}
            check(c.put("/api/org/profile", json=body, headers=H(rec)).status_code == 422, "invalid phone rejected")
            body["person"]["phone"] = "9820099999"
            r = c.put("/api/org/profile", json=body, headers=H(rec))
            check(r.status_code == 200 and r.json()["person"]["phone"] == "9820099999", "company updates its contact")
            tc = next(x for x in c.get("/api/connections", headers=H(tpo)).json() if x["company_id"] == company_id)
            check(any(p["phone"] == "9820099999" for p in tc["contacts"]), "connected college sees the updated phone")
    finally:
        db.users.update_one({"email": "recruiter@campusconnect.dev"}, {"$set": {"phone": "9820030000"}})
        if drive_id:
            db.drives.delete_one({"_id": ObjectId(drive_id)})
        fixtures.reset(db, since, connections=[created_conn], companies=[temp_company] if temp_company else [])
    print("all contact checks passed")


if __name__ == "__main__":
    run()
