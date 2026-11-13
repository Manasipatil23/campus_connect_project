"""Matching an official student list against sign-ups, and the emails sent for notices, issues,
issue replies and company <-> placement-cell messages. Run: python -m tests.test_roster_email
(needs only the demo logins; creates its own data and removes it afterwards; no real email is sent)."""
import os

os.environ["SMTP_HOST"] = ""  # tests never send real email (dev mode)
os.environ["CHECK_EMAIL_DELIVERABILITY"] = "false"  # test addresses use made-up domains
os.environ["ALLOW_PERSONAL_EMAIL"] = "false"  # tests check the strict email rules

import io
import time
import zipfile

from bson import ObjectId
from fastapi.testclient import TestClient
from pymongo import MongoClient

from app import emailing
from app.auth import hash_password
from app.config import DB_NAME, MONGO_URL
from app.db import client_options
from app.main import app
from tests import fixtures
from app.schemas import season_batch

SEASON = season_batch()  # the batch being placed this season

H = lambda t: {"Authorization": f"Bearer {t}"}
SENT = []   # (kind, recipients, subject, reply_to)


def check(cond, label):
    assert cond, label
    print(f"  ok  {label}")


def capture():
    emailing.send_email = lambda to, subject, body, reply_to=None, html=None: SENT.append(("one", [to], subject, reply_to)) or "sent"
    emailing.send_bulk = lambda rcpts, subject, text, html=None, reply_to=None, batch=50: SENT.append(("bulk", list(rcpts), subject, reply_to)) or {"sent": len(rcpts)}


def wait_for(pred, secs=8):
    end = time.time() + secs
    while time.time() < end:
        if pred():
            return True
        time.sleep(0.2)
    return False


def make_xlsx(rows) -> bytes:
    strings, sheet_rows = [], []
    for r, row in enumerate(rows, 1):
        cells = []
        for c, val in enumerate(row):
            ref = f"{'ABCDEFG'[c]}{r}"
            strings.append(val)
            cells.append(f'<c r="{ref}" t="s"><v>{len(strings) - 1}</v></c>')
        sheet_rows.append(f'<row r="{r}">{"".join(cells)}</row>')
    ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("xl/sharedStrings.xml", f'<sst {ns}>' + "".join(f"<si><t>{s}</t></si>" for s in strings) + "</sst>")
        z.writestr("xl/worksheets/sheet1.xml", f'<worksheet {ns}><sheetData>{"".join(sheet_rows)}</sheetData></worksheet>')
    return buf.getvalue()


def run():
    db = MongoClient(MONGO_URL, **client_options(MONGO_URL))[DB_NAME]
    since, temp, conn = fixtures.started(), [], None
    capture()
    try:
        with TestClient(app) as c:
            login = lambda e, p: c.post("/api/auth/login", json={"email": e, "password": p}).json()["token"]
            tpo, stu, rec = (login("tpo@campusconnect.dev", "tpo123"), login("student@campusconnect.dev", "student123"),
                             login("recruiter@campusconnect.dev", "recruiter123"))
            college_id = c.get("/api/auth/me", headers=H(tpo)).json()["college_id"]
            company_id = c.get("/api/auth/me", headers=H(rec)).json()["company_id"]
            conn = fixtures.ensure_connection(db, college_id, company_id)

            # ---- matching an official list ------------------------------------------------
            people = [("Aarav Shah", "22CE001"), ("Diya Rao", "22IT014"), ("Kabir Mehta", "22EX009"),
                      ("Isha Nair", "22CE077"), ("Rohan Verma", "22ME100")]
            for i, (name, roll) in enumerate(people):
                temp.append(db.users.insert_one({
                    "name": name, "email": f"roster{i}@student.wit.edu.in", "role": "student", "status": "pending",
                    "college_id": college_id, "roll_number": roll, "password_hash": hash_password("password123"),
                    "profile": {"branch": "Computer", "grad_year": SEASON}, "created_at": fixtures.started()}).inserted_id)
            ids = {name: str(temp[i]) for i, (name, _) in enumerate(people)}
            upload = lambda name, data, tok=tpo: c.post("/api/college/students/roster-match", headers=H(tok), files={"file": (name, data)})

            csv = (b"Sr,Student Name,Roll No.,Branch\n1,Aarav Shah,22-CE-001,Computer\n2,Rao Diya,,IT\n"
                   b"3,Kabir Mehra,22EX009,EXTC\n4,Ishaa Nair,,Computer\n5,Neha Joshi,22CE099,Computer\n")
            r = upload("final-list.csv", csv).json()
            how = {m["student"]["name"]: (m["matched_by"], m["sure"]) for m in r["matched"]}
            check(how.get("Aarav Shah") == ("roll number", True), "roll number matches even with dashes (22-CE-001)")
            check(how.get("Diya Rao") == ("name", True), "name matches in any order (Rao Diya)")
            check(how.get("Kabir Mehta") == ("roll number", True), "roll match survives a one-letter name typo")
            check(how.get("Isha Nair", (None, True))[1] is False, "a merely similar name is flagged to check, not ticked")
            check([s["name"] for s in r["not_in_list"]] == ["Rohan Verma"], "sign-up missing from the list is reported")
            check(r["list_only_count"] == 1 and "Neha Joshi" in r["list_only"][0], "list row with no sign-up is reported")
            check(db.users.count_documents({"_id": {"$in": temp}, "status": "pending"}) == 5, "matching alone approves nobody")

            xlsx = make_xlsx([["Name", "Enrollment No", "Email"], ["Rohan Verma", "22ME100", "roster4@student.wit.edu.in"]])
            r = upload("list.xlsx", xlsx).json()
            check([(m["student"]["name"], m["matched_by"]) for m in r["matched"]] == [("Rohan Verma", "email")], "Excel list read and matched by email")
            r = upload("list.txt", b"Final list\n1. Aarav Shah 22CE001 9876543210\n2. Diya Rao\n").json()
            check({m["student"]["name"] for m in r["matched"] if m["sure"]} == {"Aarav Shah", "Diya Rao"}, "plain-text list (phone number ignored)")
            check(upload("list.xls", b"x").status_code == 400, "old .xls gets a clear message")
            check(upload("list.csv", csv, stu).status_code == 403, "students can't upload lists")

            sure = [ids["Aarav Shah"], ids["Diya Rao"], ids["Kabir Mehta"]]
            r = c.post("/api/college/students/bulk-decision", headers=H(tpo), json={"approve": sure}).json()
            check(r["approved"] == 3 and db.users.find_one({"_id": temp[3]})["status"] == "pending",
                  "confirmed matches approved together; the unticked one stays waiting")

            # ---- emails ----------------------------------------------------------------------
            SENT.clear()
            c.post("/api/announcements", headers=H(tpo), json={"title": "Email test notice", "body": "Talk at 3pm in the seminar hall.", "audience": "all"})
            check(wait_for(lambda: any("Email test notice" in s[2] for s in SENT)), "placement-cell notice is emailed to students")
            notice = next(s for s in SENT if "Email test notice" in s[2])
            check(notice[3] == "tpo@campusconnect.dev" and "student@campusconnect.dev" in notice[1], "students get it; replies go to the placement cell")

            SENT.clear()
            iss = c.post("/api/issues", headers=H(stu), json={"category": "Schedule", "subject": "Email test issue", "description": "OA clashes with exam."}).json()
            check(wait_for(lambda: any("Email test issue" in s[2] and "tpo@campusconnect.dev" in s[1] for s in SENT)),
                  "a student's issue is emailed to the placement cell")
            check(next(s for s in SENT if "Email test issue" in s[2])[3] == "student@campusconnect.dev", "replies to it reach the student")
            SENT.clear()
            c.patch(f"/api/issues/{iss['id']}", headers=H(tpo), json={"reply": "We'll move your slot."})
            check(wait_for(lambda: any("Email test issue" in s[2] and "student@campusconnect.dev" in s[1] for s in SENT)),
                  "the placement cell's reply is emailed to the student")

            SENT.clear()
            cn = next(x for x in c.get("/api/connections", headers=H(rec)).json() if x["college_id"] == college_id)
            c.post(f"/api/connections/{cn['id']}/messages", headers=H(rec), json={"text": "Email test: can we do 20 Nov?"})
            check(wait_for(lambda: any("tpo@campusconnect.dev" in s[1] and s[3] == "recruiter@campusconnect.dev" for s in SENT)),
                  "a company's message is emailed to the placement cell")
            SENT.clear()
            c.post(f"/api/connections/{cn['id']}/messages", headers=H(tpo), json={"text": "Email test: 20 Nov works."})
            check(wait_for(lambda: any("recruiter@campusconnect.dev" in s[1] and s[3] == "tpo@campusconnect.dev" for s in SENT)),
                  "the placement cell's reply is emailed to the company")
    finally:
        tids = [str(x) for x in temp]
        db.approvals.delete_many({"target_id": {"$in": tids}})
        db.users.delete_many({"_id": {"$in": temp}})
        db.announcements.delete_many({"title": "Email test notice"})
        db.issues.delete_many({"subject": "Email test issue"})
        db.messages.delete_many({"text": {"$regex": "^Email test"}})
        fixtures.reset(db, since, connections=[conn])
        db.notifications.delete_many({"created_at": {"$gte": since}})
    print("all list-matching and email checks passed")


if __name__ == "__main__":
    run()
