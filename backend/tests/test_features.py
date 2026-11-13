"""JD upload (PDF / Word), bulk approval of sign-ups, and student name changes reviewed by the
placement cell. Run: python -m tests.test_features (needs only the demo logins; creates its own
data and removes it afterwards)."""
import os

os.environ["SMTP_HOST"] = ""  # tests never send real email (dev mode)
os.environ["CHECK_EMAIL_DELIVERABILITY"] = "false"  # test addresses use made-up domains
os.environ["ALLOW_PERSONAL_EMAIL"] = "false"  # tests check the strict email rules

import io
import zipfile

from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app.auth import hash_password
from app.config import DB_NAME, MONGO_URL
from app.db import client_options
from app.main import app
from tests import fixtures
from app.schemas import season_batch

SEASON = season_batch()  # the batch being placed this season

H = lambda t: {"Authorization": f"Bearer {t}"}
JD = "Data Analyst at Nimbus. You will build Power BI dashboards on SQL data and automate reports in Python."


def check(cond, label):
    assert cond, label
    print(f"  ok  {label}")


def make_docx(text: str) -> bytes:
    body = "".join(f"<w:p><w:r><w:t>{line}</w:t></w:r></w:p>" for line in text.split(". "))
    xml = ('<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/'
           f'wordprocessingml/2006/main"><w:body>{body}</w:body></w:document>')
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("[Content_Types].xml", "<Types/>")
        z.writestr("word/document.xml", xml)
    return buf.getvalue()


def make_pdf(text: str) -> bytes:
    """A minimal one-page PDF with real (extractable) text."""
    stream = f"BT /F1 11 Tf 40 760 Td ({text}) Tj ET".encode()
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
            b"<< /Length %d >>\nstream\n" % len(stream) + stream + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
    out, offsets = io.BytesIO(), []
    out.write(b"%PDF-1.4\n")
    for i, o in enumerate(objs, 1):
        offsets.append(out.tell())
        out.write(b"%d 0 obj\n" % i + o + b"\nendobj\n")
    xref = out.tell()
    out.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1))
    for off in offsets:
        out.write(b"%010d 00000 n \n" % off)
    out.write(b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF" % (len(objs) + 1, xref))
    return out.getvalue()


def run():
    db = MongoClient(MONGO_URL, **client_options(MONGO_URL))[DB_NAME]
    since, drive_ids, temp_students = fixtures.started(), [], []
    stu_doc = db.users.find_one({"email": "student@campusconnect.dev"})
    try:
        with TestClient(app) as c:
            login = lambda e, p: c.post("/api/auth/login", json={"email": e, "password": p}).json()["token"]
            tpo, stu = login("tpo@campusconnect.dev", "tpo123"), login("student@campusconnect.dev", "student123")
            college_id = c.get("/api/auth/me", headers=H(tpo)).json()["college_id"]

            # ---- JD upload -------------------------------------------------------------
            up = lambda name, data: c.post("/api/drives/jd-file", headers=H(tpo), files={"file": (name, data)})
            r = up("jd.docx", make_docx(JD))
            check(r.status_code == 200 and "Power BI dashboards" in r.json()["text"], "Word JD is read")
            check({"sql", "python", "power bi"} <= set(r.json()["skills"]), f"skills suggested from the Word JD: {r.json()['skills']}")
            r = up("jd.pdf", make_pdf(JD))
            check(r.status_code == 200 and "SQL data" in r.json()["text"], "PDF JD is read")
            pdf_id = r.json()["file_id"]
            check(up("jd.doc", b"old word file").status_code == 400, "old .doc files get a clear message")
            check(up("jd.png", b"\x89PNG").status_code == 400, "images are refused")
            check(c.post("/api/drives/jd-file", headers=H(stu), files={"file": ("jd.pdf", make_pdf(JD))}).status_code == 403,
                  "students can't upload JDs")

            d = c.post("/api/drives", headers=H(tpo), json={
                "company": "Features Test Co", "role": "Features Analyst", "description": JD, "ctc_lpa": 6,
                "required_skills": ["sql"], "criteria_confirmed": True, "jd_file_id": pdf_id}).json()
            drive_ids.append(d["id"])
            check(d["jd_file"]["name"] == "jd.pdf", "JD file attached to the drive")
            c.post(f"/api/drives/{d['id']}/publish", headers=H(tpo))
            dl = c.get(f"/api/drives/{d['id']}/jd-file", headers=H(stu))
            check(dl.status_code == 200 and dl.content.startswith(b"%PDF") and "jd.pdf" in dl.headers["content-disposition"],
                  "students download the original JD")
            again = c.post("/api/drives", headers=H(tpo), json={"company": "X", "role": "Y", "description": JD, "ctc_lpa": 6, "jd_file_id": pdf_id})
            check(again.status_code == 400, "a JD file can't be attached to a second drive")

            # ---- a drive's graduating batch can be corrected after publishing --------------------
            from app.schemas import open_batches
            season = open_batches()[0]
            rec = login("recruiter@campusconnect.dev", "recruiter123")
            fixtures.ensure_connection(db, college_id, c.get("/api/auth/me", headers=H(rec)).json()["company_id"])
            wrong = c.post("/api/drives", headers=H(rec), json={
                "company": "x", "role": "Batch Fix Analyst", "description": JD, "ctc_lpa": 6, "college_id": college_id,
                "required_skills": ["sql"], "criteria_confirmed": True, "submit": True, "criteria": {"grad_years": [season - 1]}}).json()
            drive_ids.append(wrong["id"])
            check(wrong["criteria"]["grad_years"] == [season], "a new drive is always for this season's batch, whatever was sent")
            db.drives.update_one({"_id": ObjectId(wrong["id"])}, {"$set": {"criteria.grad_years": [season - 1]}})  # an old drive from before the rule
            c.post(f"/api/drives/{wrong['id']}/review", headers=H(tpo), json={"decision": "approve"})
            c.post(f"/api/drives/{wrong['id']}/publish", headers=H(tpo))
            db.users.update_one({"email": "student@campusconnect.dev"}, {"$set": {"profile.grad_year": season}})
            sd = c.get(f"/api/drives/{wrong['id']}", headers=H(stu)).json()
            check(not sd["eligible"] and sd["ineligible_reasons"] == [f"This drive is for the {season - 1} batch; you graduate in {season}"],
                  "wrong batch explained in plain words")
            r = c.patch(f"/api/drives/{wrong['id']}", headers=H(rec), json={"criteria": {"min_cgpa": None, "grad_years": [season - 5]}}).json()
            check(r.get("proposed") == ["criteria"], "company proposes the batch fix")
            ch = next(x for x in c.get("/api/changes", headers=H(tpo)).json() if x["drive_id"] == wrong["id"])
            c.post(f"/api/changes/{ch['id']}/decision", headers=H(tpo), json={"decision": "approve"})
            check(c.get(f"/api/drives/{wrong['id']}", headers=H(stu)).json()["eligible"], "after the placement cell confirms, the student is eligible")
            db.change_requests.delete_many({"drive_id": wrong["id"]})

            # ---- junior batch: only interview experiences --------------------------------------
            db.users.update_one({"email": "student@campusconnect.dev"}, {"$set": {"profile.grad_year": SEASON + 1}})
            me = c.get("/api/auth/me", headers=H(stu)).json()
            check(me["junior"] is True and me["season_batch"] == SEASON, f"a {SEASON + 1} student is marked junior")
            blocked = [p for p in ("/api/drives", "/api/students/me/dashboard", "/api/students/me/analytics", "/api/announcements",
                                   "/api/issues", f"/api/drives/{d['id']}") if c.get(p, headers=H(stu)).status_code != 403]
            check(not blocked, f"junior can't see drives, results, insights or notices {blocked or ''}")
            check(c.get("/api/experiences", headers=H(stu)).status_code == 200 and c.get("/api/experiences/companies", headers=H(stu)).status_code == 200,
                  "junior can read interview experiences")
            check(c.post("/api/experiences", headers=H(stu), json={"company": "X", "role": "Y", "round_type": "Other", "difficulty": 3,
                                                                    "outcome": "awaiting"}).status_code == 403, "junior can't post experiences")
            check(c.put("/api/students/me/name", headers=H(stu), json={"first_name": "Demo", "last_name": "Student"}).status_code == 200,
                  "junior can still manage their own profile")
            r = c.post("/api/announcements", headers=H(tpo), json={"title": "Season notice test", "body": "Only for this season.", "audience": "all"}).json()
            check(str(stu_doc["_id"]) not in (db.announcements.find_one({"_id": ObjectId(r["id"])}) or {}).get("recipient_ids", []),
                  "notices to all students skip the junior batch")
            db.announcements.delete_one({"_id": ObjectId(r["id"])})
            db.users.update_one({"email": "student@campusconnect.dev"}, {"$set": {"profile.grad_year": SEASON}})
            check(c.get("/api/drives", headers=H(stu)).status_code == 200, f"a {SEASON} student sees drives again")

            # ---- bulk approval: everyone except --------------------------------------------
            for i in range(4):
                temp_students.append(db.users.insert_one({
                    "name": f"Bulk Student {i}", "email": f"bulk{i}@student.wit.edu.in", "role": "student", "status": "pending",
                    "college_id": college_id, "roll_number": f"BULK{i}", "password_hash": hash_password("password123"),
                    "profile": {"branch": "IT", "grad_year": SEASON}, "created_at": fixtures.started()}).inserted_id)
            ids = [str(x) for x in temp_students]
            r = c.post("/api/college/students/bulk-decision", headers=H(tpo), json={"approve": ids[:3]}).json()
            check(r == {"approved": 3, "rejected": 0, "skipped": 0}, "approve everyone except one")
            check(db.users.find_one({"_id": temp_students[3]})["status"] == "pending", "the one left out is still waiting")
            r = c.post("/api/college/students/bulk-decision", headers=H(tpo), json={"reject": [ids[3]], "note": "Roll number not found"}).json()
            check(r["rejected"] == 1 and db.users.find_one({"_id": temp_students[3]})["review_note"] == "Roll number not found",
                  "the left-out student rejected with a reason")
            r = c.post("/api/college/students/bulk-decision", headers=H(tpo), json={"approve": ids}).json()
            check(r == {"approved": 0, "rejected": 0, "skipped": 4}, "already-decided students are skipped")
            check(db.approvals.count_documents({"target_id": {"$in": ids}}) == 4, "every bulk decision is stored as an approval")
            check(c.post("/api/college/students/bulk-decision", headers=H(stu), json={"approve": ids}).status_code == 403,
                  "students can't approve anyone")

            # ---- name changes ---------------------------------------------------------------
            r = c.put("/api/students/me/name", headers=H(stu), json={"first_name": "  Demo ", "last_name": "Kumar  Student"})
            check(r.status_code == 200 and r.json()["name"] == "Demo Kumar Student", "student changes their name (spaces tidied)")
            note = db.notifications.find_one({"user_id": str(db.users.find_one({"email": "tpo@campusconnect.dev"})["_id"]),
                                              "title": {"$regex": "^Name changed"}, "created_at": {"$gte": since}})
            check(note and "Demo Student → Demo Kumar Student" in note["title"], "placement cell notified of the name change")
            check(c.get("/api/auth/me", headers=H(stu)).json()["email"] == "student@campusconnect.dev", "email unchanged")
            queue = c.get("/api/college/students/name-changes", headers=H(tpo)).json()
            sid = str(stu_doc["_id"])
            check(any(s["id"] == sid for s in queue), "the change waits in the placement cell's review list")

            check(c.post(f"/api/college/students/{sid}/name-review", headers=H(tpo), json={"action": "message"}).status_code == 400,
                  "a message needs text")
            c.post(f"/api/college/students/{sid}/name-review", headers=H(tpo), json={"action": "message", "message": "Please share your marksheet."})
            sn = [n["title"] for n in c.get("/api/notifications", headers=H(stu)).json()["items"]]
            check("Message from your placement cell" in sn, "student gets the placement cell's message")
            c.post(f"/api/college/students/{sid}/name-review", headers=H(tpo), json={"action": "revert", "message": "Doesn't match records."})
            check(c.get("/api/auth/me", headers=H(stu)).json()["name"] == "Demo Student", "placement cell undoes the name change")
            check(not any(s["id"] == sid for s in c.get("/api/college/students/name-changes", headers=H(tpo)).json()), "reviewed change leaves the list")

            c.put("/api/students/me/name", headers=H(stu), json={"first_name": "Demo", "last_name": "Fake"})
            c.post(f"/api/college/students/{sid}/name-review", headers=H(tpo), json={"action": "suspend", "message": "Identity check"})
            check(c.get("/api/drives", headers=H(stu)).status_code == 403, "suspended student is locked out")
            check(c.get("/api/auth/me", headers=H(stu)).json()["status"] == "suspended", "and sees the on-hold status")
            c.post(f"/api/college/students/{sid}/name-review", headers=H(tpo), json={"action": "reactivate"})
            check(c.get("/api/drives", headers=H(stu)).status_code == 200, "reactivated student has access again")
    finally:
        for did in drive_ids:
            db.drives.delete_one({"_id": ObjectId(did)})
        db.jd_files.delete_many({"created_at": {"$gte": since}})
        ids = [str(x) for x in temp_students]
        db.approvals.delete_many({"target_id": {"$in": ids}})
        db.notifications.delete_many({"user_id": {"$in": ids}})
        db.users.delete_many({"_id": {"$in": temp_students}})
        db.users.update_one({"email": "student@campusconnect.dev"}, {
            "$set": {"name": stu_doc["name"], "first_name": stu_doc.get("first_name"), "last_name": stu_doc.get("last_name"), "status": "active"},
            "$unset": {"name_change": "", "name_history": "", "suspended_at": "", "review_note": ""}})
        fixtures.reset(db, since)
        db.notifications.delete_many({"created_at": {"$gte": since}})
    print("all feature checks passed")


if __name__ == "__main__":
    run()
