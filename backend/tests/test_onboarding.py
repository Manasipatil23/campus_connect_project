"""End-to-end onboarding: college signup -> admin approval -> student signup -> TPO approval
-> company connects -> drive -> shared experience. Run: python -m tests.test_onboarding
(uses the local database and removes what it creates)."""
import os

os.environ["SMTP_HOST"] = ""  # tests never send real email (dev mode)
os.environ["CHECK_EMAIL_DELIVERABILITY"] = "false"  # test addresses use made-up domains
os.environ["ADMIN_EMAILS"] = "test.admin@campusconnect.dev"  # only this address may be admin during the test

from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.auth import hash_password
from app.config import DB_NAME, MONGO_URL
from app.db import client_options
from app.main import app
from tests import fixtures


def run():
    db = MongoClient(MONGO_URL, **client_options(MONGO_URL))[DB_NAME]
    col_id = None
    since = fixtures.started()
    H = lambda t: {"Authorization": f"Bearer {t}"}

    def check(r, expect, label):
        assert r.status_code == expect, f"{label}: expected {expect}, got {r.status_code} {r.text}"
        print(f"  ok  {label} ({r.status_code})")
        return r.json()

    try:
        with TestClient(app) as c:
            code = c.post("/api/auth/send-code", json={"email": "tpo@testinst.edu.in", "kind": "college", "domain": "testinst.edu.in"}).json()["dev_code"]
            body = dict(name="Test Institute of Engineering", aishe_code="C-99881", institution_type="Private",
                        affiliated_university="University of Testing", established_year=1999, naac_grade="A",
                        website="https://www.testinst.edu.in", address="12, Long Test Road, Nashik", city="Nashik",
                        state="Maharashtra", pincode="422001", phone="02532345678", email_domain="testinst.edu.in",
                        student_email_domain="student.testinst.edu.in", tpo_name="Test Officer", tpo_designation="TPO",
                        tpo_email="tpo@testinst.edu.in", tpo_phone="9820011111", code="000000", password="password123")
            check(c.post("/api/auth/register/college", json=body), 400, "college: wrong code rejected")
            r = check(c.post("/api/auth/register/college", json={**body, "code": code}), 200, "college: registered")
            tpo, col_id = r["token"], r["user"]["college_id"]
            assert r["user"]["status"] == "pending" and r["user"]["college"]["status"] == "pending"
            check(c.get("/api/college/students", headers=H(tpo)), 403, "college: pending TPO locked out")
            check(c.get("/api/colleges").__class__ and c.post("/api/auth/send-code", json={"email": "x@student.testinst.edu.in", "kind": "student", "college_id": col_id}), 400, "student: can't join unapproved college")

            # platform admin: only the address in ADMIN_EMAILS, password set through an emailed code
            db.users.insert_one({"email": "rogue.admin@campusconnect.dev", "name": "Rogue", "role": "admin", "status": "active",
                                 "password_hash": hash_password("password123")})
            check(c.post("/api/auth/login", json={"email": "rogue.admin@campusconnect.dev", "password": "password123"}), 403,
                  "admin: an admin account not on the list can't sign in")
            check(c.post("/api/auth/admin/send-code", json={"email": "someone@campusconnect.dev"}), 403, "admin: setup refused for other emails")
            check(c.post("/api/auth/admin/send-code", json={"email": "tpo@testinst.edu.in"}), 403, "admin: a TPO can't make themselves admin")
            ac = check(c.post("/api/auth/admin/send-code", json={"email": "Test.Admin@campusconnect.dev"}), 200, "admin: code sent to the approved address")["dev_code"]
            check(c.post("/api/auth/admin/setup", json={"email": "test.admin@campusconnect.dev", "code": "000000", "password": "adminpass1"}), 400,
                  "admin: wrong code rejected")
            adm = check(c.post("/api/auth/admin/setup", json={"email": "test.admin@campusconnect.dev", "code": ac, "password": "adminpass1",
                                                              "name": "Test Admin"}), 200, "admin: password set, signed in")["token"]
            check(c.post("/api/auth/login", json={"email": "test.admin@campusconnect.dev", "password": "adminpass1", "role": "admin"}), 200,
                  "admin: signs in on the admin form")
            check(c.post("/api/auth/login", json={"email": "tpo@testinst.edu.in", "password": "password123", "role": "admin"}), 403,
                  "admin: the admin form refuses other accounts")
            check(c.post(f"/api/admin/colleges/{col_id}/decision", json={"decision": "approve"}, headers=H(adm)), 400, "admin: tier required")
            check(c.post(f"/api/admin/colleges/{col_id}/decision", json={"decision": "approve", "tier": 2}, headers=H(adm)), 200, "admin: college approved")
            entry = db.approvals.find_one({"kind": "college", "target_id": col_id})
            assert entry and entry["decision"] == "approved" and entry["tier"] == 2 and entry["email"] == "tpo@testinst.edu.in"
            print("  ok  mongodb: college approval stored in `approvals`")
            check(c.get("/api/college/students", headers=H(tpo)), 200, "college: TPO active after approval")

            check(c.post("/api/auth/send-code", json={"email": "stu@gmail.com", "kind": "student", "college_id": col_id}), 400, "student: must use college domain")
            sc = c.post("/api/auth/send-code", json={"email": "riya@student.testinst.edu.in", "kind": "student", "college_id": col_id}).json()["dev_code"]
            r = check(c.post("/api/auth/register/student", json=dict(first_name="Riya", last_name="Test", email="riya@student.testinst.edu.in",
                        code=sc, password="password123", college_id=col_id, roll_number="22ce001", branch="Computer",
                        grad_year=2026, phone="9820022222")), 200, "student: registered")
            st = r["token"]
            check(c.get("/api/drives", headers=H(st)), 403, "student: pending locked out")
            sid = c.get("/api/college/students", headers=H(tpo)).json()[0]["id"]
            check(c.post(f"/api/college/students/{sid}/decision", json={"decision": "approve"}, headers=H(tpo)), 200, "college: approves student")
            entry = db.approvals.find_one({"kind": "student", "target_id": sid})
            assert entry and entry["decision"] == "approved" and entry["email"] == "riya@student.testinst.edu.in" and entry["decided_by"]["role"] == "coordinator"
            print("  ok  mongodb: student approval stored in `approvals`")
            assert db.users.find_one({"email": "riya@student.testinst.edu.in"})["status"] == "active"
            print("  ok  mongodb: student record saved and marked active")
            check(c.get("/api/drives", headers=H(st)), 200, "student: active")

            rec = c.post("/api/auth/login", json={"email": "recruiter@campusconnect.dev", "password": "recruiter123"}).json()["token"]
            drive = dict(company="x", role="Analyst", description="SQL and Python analytics role for graduates.", ctc_lpa=6, college_id=col_id)
            check(c.post("/api/drives", json=drive, headers=H(rec)), 403, "company: can't post before connecting")
            cn = check(c.post("/api/connections", json={"college_id": col_id, "message": "hi"}, headers=H(rec)), 200, "company: requests connection")
            check(c.post(f"/api/connections/{cn['id']}/decision", json={"decision": "approve"}, headers=H(rec)), 400, "company: can't accept own request")
            check(c.post(f"/api/connections/{cn['id']}/decision", json={"decision": "approve"}, headers=H(tpo)), 200, "college: accepts connection")
            d = check(c.post("/api/drives", json=drive, headers=H(rec)), 200, "company: posts drive after connecting")

            check(c.post("/api/experiences", json=dict(drive_id=d["id"], round_type="HR interview", difficulty=3, outcome="cleared", questions=["Why us"]), headers=H(st)), 400, "experience: can't verify a drive you didn't apply to")
            e = check(c.post("/api/experiences", json=dict(company="Some Co", role="SDE", round_type="Technical interview", difficulty=3, outcome="cleared", questions=["Explain closures"]), headers=H(st)), 200, "experience: shared")
            assert e["author"] is None and e["verified"] is False and e["college"]
            check(c.post(f"/api/experiences/{e['id']}/helpful", headers=H(st)), 200, "experience: marked helpful")
    finally:
        if col_id:
            db.colleges.delete_one({"_id": ObjectId(col_id)})
            gone = [str(u["_id"]) for u in db.users.find({"college_id": col_id}, {"_id": 1})]
            db.notifications.delete_many({"user_id": {"$in": gone}})
            db.users.delete_many({"college_id": col_id})
            db.connections.delete_many({"college_id": col_id})
            db.approvals.delete_many({"$or": [{"target_id": col_id}, {"college_id": col_id}]})
            db.drives.delete_many({"college_id": col_id})
        db.users.delete_many({"email": {"$in": ["rogue.admin@campusconnect.dev", "test.admin@campusconnect.dev"]}})
        db.experiences.delete_many({"company": "Some Co"})
        db.email_codes.delete_many({})
        fixtures.reset(db, since)
    print("all onboarding checks passed")


if __name__ == "__main__":
    run()
