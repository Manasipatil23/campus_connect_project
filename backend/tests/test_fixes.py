"""Regression checks for the reported bugs and missing notifications.

Run: python -m tests.test_fixes (needs only the demo logins; creates its own data and
removes it afterwards).
"""
import os

os.environ["SMTP_HOST"] = ""  # tests never send real email (dev mode)
os.environ["CHECK_EMAIL_DELIVERABILITY"] = "false"  # test addresses use made-up domains
os.environ["ALLOW_PERSONAL_EMAIL"] = "false"  # tests check the strict email rules

from datetime import date, timedelta

from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.auth import hash_password
from app.config import DB_NAME, MONGO_URL
from app.db import client_options
from app.main import app
from app.schemas import open_batches
from tests import fixtures
from app.schemas import season_batch

SEASON = season_batch()  # the batch being placed this season

H = lambda t: {"Authorization": f"Bearer {t}"}


def check(cond, label):
    assert cond, label
    print(f"  ok  {label}")


def notes(db, email, since):
    uid = str(db.users.find_one({"email": email})["_id"])
    return [n["title"] for n in db.notifications.find({"user_id": uid, "created_at": {"$gte": since}})]


def run():
    db = MongoClient(MONGO_URL, **client_options(MONGO_URL))[DB_NAME]
    fixtures.season_student(db)
    since, conn, drives, extra_users, other_college = fixtures.started(), None, [], [], None
    try:
        with TestClient(app) as c:
            login = lambda e, p: c.post("/api/auth/login", json={"email": e, "password": p}).json()["token"]
            rec, tpo, stu = (login("recruiter@campusconnect.dev", "recruiter123"), login("tpo@campusconnect.dev", "tpo123"),
                             login("student@campusconnect.dev", "student123"))
            college_id = c.get("/api/auth/me", headers=H(tpo)).json()["college_id"]
            company_id = c.get("/api/auth/me", headers=H(rec)).json()["company_id"]
            conn = fixtures.ensure_connection(db, college_id, company_id)
            fixtures.prepare_student(c, stu)

            def publish(role, branches, ctc=7):
                d = c.post("/api/drives", headers=H(rec), json={
                    "company": "x", "role": role, "description": "SQL, Python and Power BI analyst role for the fixes test.",
                    "ctc_lpa": ctc, "college_id": college_id, "required_skills": ["sql", "python"], "criteria_confirmed": True,
                    "submit": True, "deadline": (date.today() + timedelta(days=5)).isoformat(),
                    "criteria": {"min_cgpa": 6, "branches": branches, "grad_years": [SEASON]}}).json()
                drives.append(d["id"])
                c.post(f"/api/drives/{d['id']}/review", headers=H(tpo), json={"decision": "approve"})
                c.post(f"/api/drives/{d['id']}/publish", headers=H(tpo))
                return d["id"]

            fits = publish("Fixes Analyst", ["Computer"], 12.0)
            it_only = publish("Fixes IT Role", ["IT"])

            # 1. analytics counts approved students only
            pending = db.users.insert_one({"name": "Pending Student", "email": "pending.fix@example.dev", "role": "student",
                                           "status": "pending", "college_id": college_id, "password_hash": hash_password("x" * 8),
                                           "profile": {"branch": "IT", "grad_year": SEASON}}).inserted_id
            extra_users.append(pending)
            k = c.get("/api/analytics/overview", headers=H(tpo)).json()["kpis"]
            stats = c.get("/api/college/student-stats", headers=H(tpo)).json()["totals"]
            check(k["students"] == stats["students"], "analytics and Students page count the same students")

            # 2. best matches: only drives the student is eligible for
            a = c.get("/api/students/me/analytics", headers=H(stu)).json()
            check(any(m["drive_id"] == fits for m in a["open_matches"]) and not any(m["drive_id"] == it_only for m in a["open_matches"]),
                  "best matches leave out drives the student isn't eligible for")

            # c. applying notifies the company and the placement cell
            app_id = c.post(f"/api/drives/{fits}/apply", headers=H(stu)).json()["id"]
            check(any("New application" in t for t in notes(db, "recruiter@campusconnect.dev", since)), "company told about the application")
            check(any("New application" in t for t in notes(db, "tpo@campusconnect.dev", since)), "placement cell told about the application")
            check(not any(m["drive_id"] == fits for m in c.get("/api/students/me/analytics", headers=H(stu)).json()["open_matches"]),
                  "a drive already applied to isn't suggested again")

            # formatting: "12 LPA", readable dates, no empty message
            pub = next(n for n in db.notifications.find({"created_at": {"$gte": since}, "title": {"$regex": "Fixes Analyst"}, "body": {"$regex": "LPA"}}))
            check("12 LPA" in pub["body"] and "12.0" not in pub["body"] and "-" not in pub["body"].split("apply by")[-1],
                  f"publish notification reads well: '{pub['body']}'")
            approved = db.notifications.find_one({"created_at": {"$gte": since}, "title": {"$regex": "^Drive confirmed"}})
            check(approved and approved["body"], "'Drive confirmed' notification has a message")

            # 3. the recruiter can't accept an offer for the student
            for status in ("shortlisted",):
                c.patch(f"/api/applications/{app_id}", headers=H(rec), json={"status": status})
            c.put(f"/api/applications/{app_id}/assessment", headers=H(rec), json={"sections": {"Aptitude": 80, "Coding": 80, "Technical MCQ": 80}})
            c.patch(f"/api/applications/{app_id}", headers=H(rec), json={"status": "assessment_cleared"})
            c.patch(f"/api/applications/{app_id}", headers=H(rec), json={"status": "offered"})
            check(c.patch(f"/api/applications/{app_id}", headers=H(rec), json={"status": "accepted"}).status_code == 400,
                  "recruiter can't record acceptance for the student")

            # 4. cancelling a drive undoes a placement from it
            c.post(f"/api/students/me/applications/{app_id}/offer", headers=H(stu), json={"decision": "accept"})
            check(c.get("/api/auth/me", headers=H(stu)).json()["placement"]["status"] == "placed", "student placed after accepting")
            c.post(f"/api/drives/{fits}/status", headers=H(rec), json={"status": "cancelled", "reason": "Role closed"})
            check(c.get("/api/auth/me", headers=H(stu)).json()["placement"]["status"] == "unplaced", "cancelling the drive undoes the placement")

            # 7. a cancelled or closed application isn't "in progress"
            check(c.get("/api/students/me/analytics", headers=H(stu)).json()["summary"]["in_progress"] == 0, "nothing counted as in progress")

            # 9. resume check: other colleges' drives and bad links
            other_college = str(db.colleges.insert_one({"name": "Other Test College", "status": "approved"}).inserted_id)
            foreign = str(db.drives.insert_one({"college_id": other_college, "status": "published", "company": "X", "role": "Y",
                                                 "description": "Python role elsewhere", "required_skills": []}).inserted_id)
            drives.append(foreign)
            check(c.get(f"/api/students/me/resume/match/{foreign}", headers=H(stu)).status_code == 404, "can't score against another college's drive")
            check(c.get("/api/students/me/resume/match/not-an-id", headers=H(stu)).status_code == 404, "a broken drive link is 404, not a crash")

            # d. withdrawing tells the placement cell; e. completing tells applicants
            c.post(f"/api/drives/{it_only}/status", headers=H(rec), json={"status": "completed"})
            third = publish("Fixes Third", [])
            app2 = c.post(f"/api/drives/{third}/apply", headers=H(stu)).json()["id"]
            c.post(f"/api/students/me/applications/{app2}/withdraw", headers=H(stu))
            check(any("withdrew" in t for t in notes(db, "tpo@campusconnect.dev", since)), "placement cell told when a student withdraws")
            fourth = publish("Fixes Fourth", [])
            c.post(f"/api/drives/{fourth}/apply", headers=H(stu))
            c.post(f"/api/drives/{fourth}/status", headers=H(rec), json={"status": "completed"})
            check(any("Drive completed" in t for t in notes(db, "student@campusconnect.dev", since)), "applicants told when the drive completes")

            # a. a student sign-up notifies the placement cell; b. a college sign-up notifies the admin
            code = c.post("/api/auth/send-code", json={"email": "fix.student@student.wit.edu.in", "kind": "student", "college_id": college_id}).json().get("dev_code")
            assert code, "couldn't request a sign-up code for the test student"
            if code:
                c.post("/api/auth/register/student", json=dict(first_name="Fix", last_name="Student", email="fix.student@student.wit.edu.in",
                       code=code, password="password123", college_id=college_id, roll_number="FIX001", branch="IT", grad_year=open_batches()[0], phone="9820011111"))
                check(any("New student sign-up" in t for t in notes(db, "tpo@campusconnect.dev", since)), "placement cell told about a student sign-up")
    finally:
        db.users.delete_many({"_id": {"$in": extra_users}})
        db.users.delete_many({"email": "fix.student@student.wit.edu.in"})
        db.approvals.delete_many({"decided_at": {"$gte": since}})
        for d in drives:
            db.drives.delete_one({"_id": ObjectId(d)})
            db.applications.delete_many({"drive_id": d})
            db.change_requests.delete_many({"drive_id": d})
        if other_college:
            db.colleges.delete_one({"_id": ObjectId(other_college)})
        db.email_codes.delete_many({"email": "fix.student@student.wit.edu.in"})  # only this test's code, never real sign-ups
        fixtures.reset(db, since, connections=[conn])
        db.notifications.delete_many({"created_at": {"$gte": since}})
    print("all fix checks passed")


if __name__ == "__main__":
    run()
