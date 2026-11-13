"""Moving candidates on by score (resume match, assessment, interview), interview scores, and students
seeing the company's exact cut-off. Run: python -m tests.test_cutoffs (needs only the demo logins;
creates its own data and removes it afterwards)."""
import os

os.environ["SMTP_HOST"] = ""  # tests never send real email (dev mode)
os.environ["CHECK_EMAIL_DELIVERABILITY"] = "false"
os.environ["ALLOW_PERSONAL_EMAIL"] = "false"
os.environ["LLM_ENABLED"] = "off"

from datetime import datetime, timezone

from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.auth import hash_password
from app.config import DB_NAME, MONGO_URL
from app.db import client_options
from app.main import app
from tests import fixtures
from app.schemas import season_batch

SEASON = season_batch()
H = lambda t: {"Authorization": f"Bearer {t}"}


def check(cond, label):
    assert cond, label
    print(f"  ok  {label}")


def run():
    db = MongoClient(MONGO_URL, **client_options(MONGO_URL))[DB_NAME]
    since, drive_id, temp, conn = fixtures.started(), None, [], None
    try:
        with TestClient(app) as c:
            login = lambda e, p: c.post("/api/auth/login", json={"email": e, "password": p}).json()["token"]
            rec, tpo = login("recruiter@campusconnect.dev", "recruiter123"), login("tpo@campusconnect.dev", "tpo123")
            college_id = c.get("/api/auth/me", headers=H(tpo)).json()["college_id"]
            conn = fixtures.ensure_connection(db, college_id, c.get("/api/auth/me", headers=H(rec)).json()["company_id"])
            d = c.post("/api/drives", headers=H(rec), json={
                "company": "x", "role": "Cutoff Test Analyst", "description": "SQL and Python analyst role for the cut-off test.",
                "ctc_lpa": 8, "college_id": college_id, "required_skills": ["sql", "python"], "criteria_confirmed": True, "submit": True}).json()
            drive_id = d["id"]
            c.post(f"/api/drives/{drive_id}/review", headers=H(tpo), json={"decision": "approve"})
            c.post(f"/api/drives/{drive_id}/publish", headers=H(tpo))

            # five students with known resume matches
            people = [("Cut A", 92), ("Cut B", 85), ("Cut C", 81), ("Cut D", 70), ("Cut E", 55)]
            apps, tokens = {}, {}
            for i, (name, match) in enumerate(people):
                email = f"cut{i}@student.wit.edu.in"
                uid = db.users.insert_one({"name": name, "email": email, "role": "student", "status": "active", "college_id": college_id,
                                           "password_hash": hash_password("password123"), "profile": {"branch": "Computer", "grad_year": SEASON, "cgpa": 8},
                                           "resume": {"text": fixtures.RESUME, "filename": "r.txt"}, "created_at": datetime.now(timezone.utc)}).inserted_id
                temp.append(uid)
                tokens[name] = login(email, "password123")
                apps[name] = c.post(f"/api/drives/{drive_id}/apply", headers=H(tokens[name])).json()["id"]
                db.applications.update_one({"_id": ObjectId(apps[name])}, {"$set": {"ats_score": match}})

            cut = lambda body, tok=rec: c.post(f"/api/drives/{drive_id}/cutoff", headers=H(tok), json=body)
            check(cut({"stage": "resume", "min_score": 80, "dry_run": True}, tpo).status_code == 403, "the placement cell can't make hiring cuts on a company drive")
            pre = cut({"stage": "resume", "min_score": 80, "dry_run": True}).json()
            check(pre["pass"] == 3 and pre["below"] == 2, "preview: 3 of 5 resumes at 80%+")
            check(db.applications.count_documents({"drive_id": drive_id, "status": "applied"}) == 5, "a preview changes nothing")
            r = cut({"stage": "resume", "min_score": 80, "reject_rest": True}).json()
            check(r["applied"] and db.applications.count_documents({"drive_id": drive_id, "status": "shortlisted"}) == 3
                  and db.applications.count_documents({"drive_id": drive_id, "status": "rejected"}) == 2, "resume cut-off 80%: 3 shortlisted, 2 not selected")
            e_detail = c.get(f"/api/students/me/applications/{apps['Cut E']}", headers=H(tokens["Cut E"])).json()
            check(any("80% or more" in x["detail"] and "55%" in x["detail"] for x in e_detail["insights"]["resume"]["reasons"]),
                  "a rejected student sees the company's exact resume cut-off")

            # assessment: record scores, then clear 70%+ without rejecting the rest
            scores = {"Cut A": [90, 85, 88], "Cut B": [72, 70, 74], "Cut C": [50, 45, 60]}
            for name, (a, b, cc) in scores.items():
                c.put(f"/api/applications/{apps[name]}/assessment", headers=H(rec), json={"sections": {"Aptitude": a, "Coding": b, "Technical MCQ": cc}})
            r = cut({"stage": "assessment", "min_score": 70}).json()
            check(r["pass"] == 2 and r["below"] == 1, "assessment cut-off 70%: 2 pass, 1 below")
            check(db.applications.find_one({"_id": ObjectId(apps["Cut C"])})["status"] == "shortlisted", "without 'mark the rest', the one below stays where they are")
            cut({"stage": "assessment", "min_score": 70, "reject_rest": True})
            cd = c.get(f"/api/students/me/applications/{apps['Cut C']}", headers=H(tokens["Cut C"])).json()["insights"]["assessment"]
            check(cd["cutoff_official"] and cd["cutoff_estimate"] == 70 and any("The company's cut-off was 70% overall" in x["detail"] for x in cd["reasons"]),
                  "the student sees the company's exact assessment cut-off, not an estimate")
            check(any(h.get("reason") == "Below the assessment cut-off (70%)" for h in db.applications.find_one({"_id": ObjectId(apps["Cut C"])})["history"]),
                  "the reason is recorded in the history")

            # interview: scores (with a private note) then offers to 75%+
            check(c.put(f"/api/applications/{apps['Cut A']}/interview-score", headers=H(tpo), json={"score": 80}).status_code == 403,
                  "only the company records interview scores")
            c.put(f"/api/applications/{apps['Cut A']}/interview-score", headers=H(rec), json={"score": 82, "note": "SECRET panel note"})
            c.put(f"/api/applications/{apps['Cut B']}/interview-score", headers=H(rec), json={"score": 64})
            r = cut({"stage": "interview", "min_score": 75, "reject_rest": True}).json()
            check(r["pass"] == 1 and r["below"] == 1, "interview cut-off 75%: 1 offer, 1 not selected")
            check(db.applications.find_one({"_id": ObjectId(apps["Cut A"])})["status"] == "offered", "the top candidate gets the offer")
            b = c.get(f"/api/students/me/applications/{apps['Cut B']}", headers=H(tokens["Cut B"])).json()
            check(b["insights"]["interview"]["score"] == 64 and b["insights"]["interview"]["cutoff"] == 75, "a student without an offer sees their interview score and the cut-off")
            a = c.get(f"/api/students/me/applications/{apps['Cut A']}", headers=H(tokens["Cut A"])).json()
            check("SECRET" not in str(a) and a["application"]["interview_score"] == {"score": 82}, "the private interview note never reaches the student")
            cut_saved = db.drives.find_one({"_id": ObjectId(drive_id)})["cutoffs"]
            check(cut_saved == {"resume": 80, "assessment": 70, "interview": 75}, "each cut-off is saved on the drive")
    finally:
        if drive_id:
            db.drives.delete_one({"_id": ObjectId(drive_id)})
            db.applications.delete_many({"drive_id": drive_id})
            db.updates.delete_many({"drive_id": drive_id})
        ids = [str(x) for x in temp]
        db.notifications.delete_many({"user_id": {"$in": ids}})
        db.users.delete_many({"_id": {"$in": temp}})
        fixtures.reset(db, since, connections=[conn])
        db.notifications.delete_many({"created_at": {"$gte": since}})
    print("all cut-off checks passed")


if __name__ == "__main__":
    run()
