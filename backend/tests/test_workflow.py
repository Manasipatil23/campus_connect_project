"""The shared workflow end to end (spec section 9), across the company, college and student portals:

connection -> drive draft -> review -> publish -> apply -> screening -> schedule change
(pending, then confirmed) -> stage updates -> offer -> student accepts -> analytics.

Also checks the rules: students never see drafts or unconfirmed dates, hiring decisions
belong to the company, private interviewer notes never reach students, and every change
is in the update history. Run: python -m tests.test_workflow (needs only the demo logins;
it creates its own data and removes it afterwards).
"""
import os

os.environ["SMTP_HOST"] = ""  # tests never send real email (dev mode)
os.environ["CHECK_EMAIL_DELIVERABILITY"] = "false"  # test addresses use made-up domains

from datetime import date, timedelta

from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.config import DB_NAME, MONGO_URL
from app.db import client_options
from app.main import app
from tests import fixtures

H = lambda t: {"Authorization": f"Bearer {t}"}


def check(r, expect, label):
    assert r.status_code == expect, f"{label}: expected {expect}, got {r.status_code} {r.text}"
    print(f"  ok  {label}")
    return r.json()


def run():
    db = MongoClient(MONGO_URL, **client_options(MONGO_URL))[DB_NAME]
    drive_id = None
    since, created_conn = fixtures.started(), None
    try:
        with TestClient(app) as c:
            login = lambda e, p: c.post("/api/auth/login", json={"email": e, "password": p}).json()["token"]
            rec = login("recruiter@campusconnect.dev", "recruiter123")
            tpo = login("tpo@campusconnect.dev", "tpo123")
            stu = login("student@campusconnect.dev", "student123")
            college_id = c.get("/api/auth/me", headers=H(tpo)).json()["college_id"]
            company_id = c.get("/api/auth/me", headers=H(rec)).json()["company_id"]
            created_conn = fixtures.ensure_connection(db, college_id, company_id)
            fixtures.prepare_student(c, stu)

            # 1. the company and college are connected; messaging works both ways
            conn = next(x for x in c.get("/api/connections", headers=H(rec)).json() if x["college_id"] == college_id)
            assert conn["status"] == "accepted"
            check(c.post(f"/api/connections/{conn['id']}/messages", json={"text": "Planning a Data Analyst drive next week"}, headers=H(rec)), 200, "company messages college")
            msgs = check(c.get(f"/api/connections/{conn['id']}/messages", headers=H(tpo)), 200, "college reads thread")
            assert msgs[-1]["text"].startswith("Planning") and not msgs[-1]["mine"]

            # 2. drive: system extracts skills, recruiter confirms criteria, sends for review
            jd = "Data Analyst working with SQL, Python and Power BI dashboards; strong communication with stakeholders."
            skills = check(c.post("/api/drives/extract-skills", json={"description": jd}, headers=H(rec)), 200, "skills extracted from JD")["skills"]
            assert "sql" in skills
            oa = (date.today() + timedelta(days=10)).isoformat()
            body = dict(company="x", role="WF Test Analyst", description=jd, ctc_lpa=7, college_id=college_id,
                        required_skills=skills, criteria={"min_cgpa": 6.0, "grad_years": [2026]},
                        deadline=(date.today() + timedelta(days=5)).isoformat(),
                        rounds=[{"name": "Online assessment", "kind": "Online assessment", "date": oa, "time": "10:00"}])
            check(c.post("/api/drives", json={**body, "submit": True}, headers=H(rec)), 400, "can't submit without confirming criteria")
            d = check(c.post("/api/drives", json=body, headers=H(rec)), 200, "draft created")
            drive_id = d["id"]
            assert d["status"] == "draft"
            check(c.get(f"/api/drives/{drive_id}", headers=H(tpo)), 404, "college can't see company's private draft")
            check(c.get(f"/api/drives/{drive_id}", headers=H(stu)), 404, "student can't see draft")
            check(c.patch(f"/api/drives/{drive_id}", json={"criteria_confirmed": True, "location": "Pune"}, headers=H(rec)), 200, "draft edited directly")
            check(c.post(f"/api/drives/{drive_id}/submit", headers=H(rec)), 200, "sent for review")
            check(c.post(f"/api/drives/{drive_id}/publish", headers=H(tpo)), 400, "can't publish before approval")
            check(c.post(f"/api/drives/{drive_id}/review", json={"decision": "changes"}, headers=H(tpo)), 400, "changes need a note")
            check(c.post(f"/api/drives/{drive_id}/review", json={"decision": "approve"}, headers=H(tpo)), 200, "college approves")
            check(c.get(f"/api/drives/{drive_id}", headers=H(stu)), 404, "approved but unpublished is hidden from students")

            # 3. publish -> students notified, see it with eligibility rules
            pub = check(c.post(f"/api/drives/{drive_id}/publish", headers=H(tpo)), 200, "college publishes")
            assert pub["notified"] > 0
            sd = check(c.get(f"/api/drives/{drive_id}", headers=H(stu)), 200, "student sees published drive")
            assert sd["eligibility_rules"] and all(r["result"] in ("pass", "fail", "needs_confirmation") for r in sd["eligibility_rules"])
            assert sd["rounds"][0]["date"] == oa, "round confirmed on approval shows its date"
            notes = c.get("/api/notifications", headers=H(stu)).json()["items"]
            assert any("WF Test Analyst" in n["title"] for n in notes), "student got a new-drive notification"

            # 4. apply; duplicate blocked; recruiter screens with evidence and shares explanation
            a = check(c.post(f"/api/drives/{drive_id}/apply", headers=H(stu)), 200, "student applies")
            check(c.post(f"/api/drives/{drive_id}/apply", headers=H(stu)), 409, "duplicate application blocked")
            scr = check(c.get(f"/api/applications/{a['id']}/screening", headers=H(rec)), 200, "screening report")
            assert {r["level"] for r in scr["criteria"]} <= {"strong", "partial", "not_shown"} and scr["eligibility"]
            check(c.put(f"/api/applications/{a['id']}/screening", json={"overrides": {"sql": "strong"}, "note_to_student": "Good SQL evidence",
                                                                       "share_with_student": True}, headers=H(tpo)), 403, "college can't make hiring decisions")
            check(c.put(f"/api/applications/{a['id']}/screening", json={"overrides": {"sql": "strong"}, "note_to_student": "Good SQL evidence",
                                                                       "share_with_student": True}, headers=H(rec)), 200, "recruiter reviews and shares screening")
            check(c.patch(f"/api/applications/{a['id']}", json={"status": "shortlisted"}, headers=H(rec)), 200, "recruiter shortlists")

            # 5. schedule change: company proposes, students see "pending", college confirms
            rid = c.get(f"/api/drives/{drive_id}", headers=H(rec)).json()["rounds"][0]["id"]
            new_oa = (date.today() + timedelta(days=12)).isoformat()
            res = check(c.patch(f"/api/drives/{drive_id}/rounds/{rid}", json={"date": new_oa, "reason": "Panel clash"}, headers=H(rec)), 200, "company proposes new date")
            assert res["mode"] == "proposed"
            r0 = c.get(f"/api/drives/{drive_id}", headers=H(stu)).json()["rounds"][0]
            assert r0["date"] == oa and r0["pending_change"] and "pending" in r0["note"].lower(), "student still sees confirmed date + pending note"
            ch = next(x for x in c.get("/api/changes", headers=H(tpo)).json() if x["drive_id"] == drive_id)
            check(c.post(f"/api/changes/{ch['id']}/decision", json={"decision": "approve"}, headers=H(stu)), 403, "students can't confirm changes")
            check(c.post(f"/api/changes/{ch['id']}/decision", json={"decision": "approve"}, headers=H(tpo)), 200, "college confirms")
            r0 = c.get(f"/api/drives/{drive_id}", headers=H(stu)).json()["rounds"][0]
            assert r0["date"] == new_oa and r0["status"] == "rescheduled" and r0["previous_date"] == oa
            hist = c.get(f"/api/drives/{drive_id}/history", headers=H(stu)).json()
            assert any(h["action"] == "schedule_confirmed" for h in hist), "old and new date kept in history"

            # 6. JD change after publish is a proposal, not an edit
            res = check(c.patch(f"/api/drives/{drive_id}", json={"ctc_lpa": 8}, headers=H(rec)), 200, "company proposes CTC change")
            assert res["proposed"] == ["ctc_lpa"]
            assert c.get(f"/api/drives/{drive_id}", headers=H(stu)).json()["ctc_lpa"] == 7
            assert "ctc_lpa" in c.get(f"/api/drives/{drive_id}", headers=H(stu)).json()["pending_fields"]

            # 7. results, private feedback, offer, student accepts
            check(c.put(f"/api/applications/{a['id']}/assessment", json={"sections": {"Aptitude": 80, "Coding": 75, "Technical MCQ": 70}}, headers=H(rec)), 200, "scores recorded")
            check(c.patch(f"/api/applications/{a['id']}", json={"status": "assessment_cleared"}, headers=H(rec)), 200, "cleared OA")
            check(c.post(f"/api/applications/{a['id']}/feedback", json={"round": "Technical interview", "scores": {"Problem solving": 4},
                         "private_notes": "SECRET panel note", "strengths": "Clear SQL reasoning", "improvements": "Practise case studies",
                         "share_with_student": True}, headers=H(rec)), 200, "interview feedback shared")
            check(c.patch(f"/api/applications/{a['id']}", json={"status": "offered"}, headers=H(rec)), 200, "offer released")
            det = check(c.get(f"/api/students/me/applications/{a['id']}", headers=H(stu)), 200, "student tracker")
            assert "SECRET" not in str(det) and det["feedback"][0]["strengths"] and det["screening"]["note"]
            check(c.post(f"/api/students/me/applications/{a['id']}/offer", json={"decision": "accept"}, headers=H(stu)), 200, "student accepts offer")
            assert c.get("/api/auth/me", headers=H(stu)).json()["placement"]["status"] == "placed"

            # 8. analytics come from the records
            ov = c.get("/api/analytics/overview", headers=H(tpo)).json()
            row = next(r for r in ov["companies"] if r["id"] == drive_id)
            assert row["applications"] == 1 and row["accepted"] == 1
            check(c.post(f"/api/drives/{drive_id}/status", json={"status": "completed"}, headers=H(rec)), 200, "drive completed")

            # issues: student raises, college replies, student sees reply but not internal note
            iss = check(c.post("/api/issues", json={"category": "Schedule", "subject": "WF test issue", "description": "Testing the issue flow"}, headers=H(stu)), 200, "student raises issue")
            check(c.patch(f"/api/issues/{iss['id']}", json={"status": "resolved", "reply": "Sorted", "internal_note": "INTERNAL only"}, headers=H(tpo)), 200, "college resolves")
            mine = next(i for i in c.get("/api/issues", headers=H(stu)).json() if i["id"] == iss["id"])
            assert mine["status"] == "resolved" and "INTERNAL" not in str(mine)
            assert c.get("/api/actions", headers=H(tpo)).status_code == 200
    finally:
        if drive_id:
            app_doc = db.applications.find_one({"drive_id": drive_id})
            db.drives.delete_one({"_id": ObjectId(drive_id)})
            db.applications.delete_many({"drive_id": drive_id})
            db.change_requests.delete_many({"drive_id": drive_id})
            db.updates.delete_many({"drive_id": drive_id})
            db.notifications.delete_many({"link": {"$regex": drive_id}})
            if app_doc:
                db.notifications.delete_many({"link": {"$regex": str(app_doc["_id"])}})
                db.users.update_one({"_id": ObjectId(app_doc["student_id"])}, {"$set": {"placement": {"status": "unplaced"}}})
        db.issues.delete_many({"subject": "WF test issue"})
        db.messages.delete_many({"text": "Planning a Data Analyst drive next week"})
        fixtures.reset(db, since, connections=[created_conn])
    print("all workflow checks passed")


if __name__ == "__main__":
    run()
