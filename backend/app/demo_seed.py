"""Fictional demo data for product walkthroughs and demo videos.

    python -m app.demo_seed            # add the demo college, company, people, drives and applications
    python -m app.demo_seed --remove   # remove every demo record (and nothing else)

Everything here is made up. Every email address ends in `.example`, a domain reserved for
examples that can never belong to anyone, and every record is tagged `demo: True` (or belongs to
the demo college / company), so `--remove` deletes exactly what this script added.

People and organisations are inserted directly (they're "already verified"); everything after
that - the connection, drives, review, publishing, resumes and applications - goes through the
app's own API, so notifications, update history and analytics are exactly what real use produces.

Run it with email off so nothing is sent to the made-up addresses:  SMTP_HOST= python -m app.demo_seed
"""
import sys
from datetime import date, datetime, timedelta, timezone

from bson import ObjectId
from pymongo import MongoClient

from .auth import hash_password
from .config import DB_NAME, MONGO_URL
from .db import client_options
from .schemas import season_batch

PASSWORD = "Demo@2027"
TAG = {"demo": True}

COLLEGE = {
    "name": "Rivermont Institute of Engineering", "short": "RIE", "aishe_code": "C-90417", "institution_type": "Private",
    "affiliated_university": "Deccan Technical University", "established_year": 2004, "naac_grade": "A", "nirf_rank": None,
    "website": "https://www.rivermont.example", "address": "Plot 12, Riverside Knowledge Park, Baner", "city": "Pune",
    "state": "Maharashtra", "pincode": "411045", "phone": "02041234567", "email_domain": "rivermont.example",
    "student_email_domain": "student.rivermont.example", "tier": 2, "status": "approved",
    "about": "An engineering college in Pune with 1,800 students across computer, IT, AI & DS and electronics.",
}
TPO = {"name": "Kavya Deshpande", "designation": "Training & Placement Officer", "email": "tpo@rivermont.example", "phone": "9800000101"}

COMPANIES = [
    {"org": {"name": "Skyforge Cloud Solutions", "website": "https://www.skyforge.example", "email_domain": "skyforge.example",
             "industry": "Cloud & IT services", "size": "201-1000", "hq_city": "Bengaluru", "cin": "U72900KA2015PTC000417",
             "about": "Skyforge helps mid-size companies move to the cloud and run it well: migration, cost and reliability.",
             "status": "approved"},
     "hr": {"name": "Arjun Malhotra", "designation": "Campus Hiring Lead", "email": "hr@skyforge.example", "phone": "9800000202"}},
    {"org": {"name": "Lumen Data Labs", "website": "https://www.lumendata.example", "email_domain": "lumendata.example",
             "industry": "Analytics", "size": "51-200", "hq_city": "Hyderabad", "cin": "U72200TG2019PTC000318",
             "about": "Lumen builds analytics dashboards and forecasting tools for retail and logistics teams.",
             "status": "approved"},
     "hr": {"name": "Farah Siddiqui", "designation": "Talent Partner", "email": "talent@lumendata.example", "phone": "9800000303"}},
]

RESUMES = {
    "ananya": """Ananya Kulkarni
B.E. Computer Engineering, Rivermont Institute of Engineering, CGPA 8.6
Skills: Python, SQL, AWS, Linux, Docker, Git, Power BI
Experience: Cloud intern at a Pune startup - moved 12 services to AWS EC2 and S3 with Docker, cut hosting cost by 30%.
Projects: Serverless expense tracker on AWS Lambda and DynamoDB used by 150 students; log analytics pipeline in Python over 2M rows; uptime dashboard in Power BI.
Certifications: AWS Certified Cloud Practitioner. Achievements: Smart India Hackathon finalist.""",
    "rohan": """Rohan Verma
B.E. Information Technology, CGPA 7.4
Skills: SQL, Excel, Power BI, Python
Projects: Retail sales dashboard in Power BI on SQL data; student attendance analysis in Python and pandas.
Experience: Summer intern, data entry and reporting for a local logistics firm.""",
    "sneha": """Sneha Iyer
B.E. Electronics and Telecommunication, CGPA 6.4
Skills: C, Embedded C, MATLAB, Excel
Projects: IoT soil-moisture monitor with Arduino; signal filtering in MATLAB.""",
    "kabir": """Kabir Shah
B.E. Computer Engineering, CGPA 7.9
Skills: Python, Linux, AWS, SQL, Java
Projects: Deployed a Flask app on AWS EC2 with Nginx; Linux shell scripts to automate backups for a college lab of 60 machines.
Experience: Web development intern, built REST APIs in Java Spring Boot.""",
    "meera": """Meera Joshi
B.Tech. Artificial Intelligence and Data Science, CGPA 8.2
Skills: Python, SQL, Machine Learning, Power BI, Excel, Statistics
Experience: Data analyst intern - built Power BI dashboards on SQL data used by 3 teams and cut weekly reporting time by 40%.
Projects: Customer churn model in Python (scikit-learn, F1 0.81); sales forecasting over 1M rows.
Certifications: Google Data Analytics.""",
}

STUDENTS = [
    # key, first, last, roll, branch, cgpa, backlogs, internships, projects, certifications, skills
    ("ananya", "Ananya", "Kulkarni", "RIE27CS014", "Computer", 8.6, 0, 1, 3, 2, ["python", "sql", "aws", "linux", "docker"]),
    ("rohan", "Rohan", "Verma", "RIE27IT031", "IT", 7.4, 0, 1, 2, 0, ["sql", "excel", "power bi", "python"]),
    ("sneha", "Sneha", "Iyer", "RIE27EX007", "EXTC", 6.4, 1, 0, 2, 0, ["c", "matlab", "excel"]),
    ("kabir", "Kabir", "Shah", "RIE27CS022", "Computer", 7.9, 0, 1, 2, 0, ["python", "linux", "aws", "sql", "java"]),
    ("meera", "Meera", "Joshi", "RIE27AD009", "AI & DS", 8.2, 0, 1, 2, 1, ["python", "sql", "machine learning", "power bi"]),
]

CLOUD_JD = """Skyforge is hiring Cloud Analysts for its Pune delivery centre.

What you'll do
- Help customers move applications to AWS: plan, migrate and verify.
- Monitor cloud workloads, fix issues and report on cost and uptime.
- Automate routine work with Python and Linux shell scripts.

What we look for
- Comfort with Linux, basic networking and at least one cloud platform (AWS preferred).
- Python scripting and SQL for reporting.
- Docker is a plus.

Selection: online assessment (aptitude, cloud & Linux MCQ, coding), a technical interview and an HR interview."""

DATA_JD = """Skyforge's analytics team is hiring Data Analysts to turn customers' cloud usage and billing data into decisions.

What you'll do
- Write SQL to pull and clean usage data; build Power BI dashboards for customers.
- Find cost and performance trends with Python and present them clearly.

What we look for
- Strong SQL and Excel, working Python (pandas), and a dashboard tool such as Power BI.
- Clear written and spoken communication.

Selection: online assessment (aptitude, SQL & data interpretation), a technical interview and an HR interview."""


def _now():
    return datetime.now(timezone.utc)


def _day(n: int) -> str:
    return (date.today() + timedelta(days=n)).isoformat()


def remove(db) -> dict:
    """Delete every demo record, and only demo records."""
    college_ids = [str(c["_id"]) for c in db.colleges.find(TAG, {"_id": 1})]
    company_ids = [str(c["_id"]) for c in db.companies.find(TAG, {"_id": 1})]
    user_ids = [str(u["_id"]) for u in db.users.find(TAG, {"_id": 1})]
    drive_ids = [str(d["_id"]) for d in db.drives.find({"$or": [{"college_id": {"$in": college_ids}},
                                                                 {"company_id": {"$in": company_ids}}]}, {"_id": 1})]
    by_org = {"$or": [{"college_id": {"$in": college_ids}}, {"company_id": {"$in": company_ids}}]}
    app_ids = [str(a["_id"]) for a in db.applications.find({"$or": [{"drive_id": {"$in": drive_ids}}, {"student_id": {"$in": user_ids}}]}, {"_id": 1})]
    out = {
        "application_files": db.application_files.delete_many({"application_id": {"$in": app_ids}}).deleted_count,
        "applications": db.applications.delete_many({"$or": [{"drive_id": {"$in": drive_ids}}, {"student_id": {"$in": user_ids}}]}).deleted_count,
        "drives": db.drives.delete_many({"_id": {"$in": [ObjectId(i) for i in drive_ids]}}).deleted_count,
        "change_requests": db.change_requests.delete_many({"drive_id": {"$in": drive_ids}}).deleted_count,
        "updates": db.updates.delete_many({"$or": [by_org["$or"][0], by_org["$or"][1], {"drive_id": {"$in": drive_ids}}]}).deleted_count,
        "connections": db.connections.delete_many(by_org).deleted_count,
        "messages": db.messages.delete_many(by_org).deleted_count,
        "issues": db.issues.delete_many({"college_id": {"$in": college_ids}}).deleted_count,
        "announcements": db.announcements.delete_many({"college_id": {"$in": college_ids}}).deleted_count,
        "experiences": db.experiences.delete_many({"$or": [{"college_id": {"$in": college_ids}}, {"author_id": {"$in": user_ids}}]}).deleted_count,
        "approvals": db.approvals.delete_many({"$or": [{"target_id": {"$in": user_ids + college_ids + company_ids}},
                                                       {"college_id": {"$in": college_ids}}]}).deleted_count,
        "notifications": db.notifications.delete_many({"user_id": {"$in": user_ids}}).deleted_count,
        "resume_files": db.resume_files.delete_many({"student_id": {"$in": user_ids}}).deleted_count,
        "jd_files": db.jd_files.delete_many({"uploaded_by": {"$in": user_ids}}).deleted_count,
        "email_codes": db.email_codes.delete_many({"email": {"$regex": r"\.example$"}}).deleted_count,
        "users": db.users.delete_many(TAG).deleted_count,
        "colleges": db.colleges.delete_many(TAG).deleted_count,
        "companies": db.companies.delete_many(TAG).deleted_count,
    }
    return {k: v for k, v in out.items() if v}


def _user(db, doc: dict) -> str:
    t = _now()
    doc = {**doc, **TAG, "password_hash": hash_password(PASSWORD), "status": "active", "email_verified": True,
           "created_at": t, "reviewed_at": t, "last_seen_at": t}
    return str(db.users.insert_one(doc).inserted_id)


def add(db) -> dict:
    from fastapi.testclient import TestClient
    from .main import app

    if db.colleges.find_one(TAG):
        raise SystemExit("Demo data is already there. Run with --remove first to start fresh.")
    season, t = season_batch(), _now()
    college_id = str(db.colleges.insert_one({**COLLEGE, **TAG, "created_at": t, "reviewed_at": t}).inserted_id)
    _user(db, {**TPO, "role": "coordinator", "college_id": college_id})
    companies = {}
    for c in COMPANIES:
        cid = str(db.companies.insert_one({**c["org"], **TAG, "created_at": t, "reviewed_at": t}).inserted_id)
        _user(db, {**c["hr"], "role": "recruiter", "company_id": cid, "company": c["org"]["name"]})
        companies[c["org"]["name"]] = cid
    for i, (key, first, last, roll, branch, *_) in enumerate(STUDENTS):
        _user(db, {"name": f"{first} {last}", "first_name": first, "last_name": last, "email": f"{key}@student.rivermont.example",
                   "role": "student", "college_id": college_id, "roll_number": roll, "phone": f"98000004{i:02d}",
                   "profile": {"branch": branch, "grad_year": season}, "placement": {"status": "unplaced"}})

    with TestClient(app) as c:
        def login(email):
            r = c.post("/api/auth/login", json={"email": email, "password": PASSWORD})
            assert r.status_code == 200, r.text
            return {"Authorization": f"Bearer {r.json()['token']}"}

        def ok(r):
            assert r.status_code < 300, r.text
            return r.json()

        tpo, hr, lumen = login(TPO["email"]), login("hr@skyforge.example"), login("talent@lumendata.example")

        # students complete their profiles and add resumes
        heads = {}
        for i, (key, first, last, roll, branch, cgpa, backlogs, interns, projects, certs, skills) in enumerate(STUDENTS):
            h = heads[key] = login(f"{key}@student.rivermont.example")
            ok(c.put("/api/students/me/profile", headers=h, json={
                "branch": branch, "cgpa": cgpa, "backlogs": backlogs, "grad_year": season, "internships": interns,
                "projects": projects, "certifications": certs, "skills": skills, "phone": f"98000004{i:02d}",
                "linkedin": f"https://www.linkedin.com/in/{first.lower()}-{last.lower()}-demo"}))
            ok(c.post("/api/students/me/resume/text", headers=h, json={"text": RESUMES[key]}))

        # Skyforge asks to connect; the placement cell accepts. Lumen's request is left waiting.
        conn = ok(c.post("/api/connections", headers=hr, json={"college_id": college_id,
                         "message": "We're hiring cloud and data analysts from the 2027 batch and would love to run drives at Rivermont."}))
        ok(c.post(f"/api/connections/{conn['id']}/decision", headers=tpo, json={"decision": "approve",
               "note": "Happy to host Skyforge. Our placement season runs through March."}))
        ok(c.post("/api/connections", headers=lumen, json={"college_id": college_id,
               "message": "Lumen is hiring 4 analytics interns who can convert to full-time. Could we run a drive at Rivermont?"}))

        # Skyforge posts two drives; the placement cell reviews and publishes them
        rounds = [{"name": "Online assessment", "kind": "Online assessment", "date": _day(10), "time": "10:00", "venue": "Online (HackerEarth link by email)"},
                  {"name": "Technical interview", "kind": "Technical interview", "date": _day(15), "time": "11:00", "venue": "Seminar Hall 2, Rivermont"},
                  {"name": "HR interview", "kind": "HR interview", "date": _day(16), "time": "14:00", "venue": "Placement Cell, Rivermont"}]
        drives = {}
        for role, jd, ctc, req, pref, crit, sections in (
                ("Cloud Analyst", CLOUD_JD, 7.5, ["aws", "linux", "python", "sql"], ["docker"],
                 {"min_cgpa": 6.5, "max_backlogs": 0, "branches": ["Computer", "IT", "AI & DS", "EXTC"]},
                 ["Aptitude", "Cloud & Linux MCQ", "Coding"]),
                ("Data Analyst", DATA_JD, 6.5, ["sql", "python", "excel", "power bi"], ["machine learning"],
                 {"min_cgpa": 7.0, "max_backlogs": 0, "branches": ["Computer", "IT", "AI & DS"]},
                 ["Aptitude", "SQL & Data Interpretation", "Coding"])):
            d = ok(c.post("/api/drives", headers=hr, json={
                "company": "Skyforge Cloud Solutions", "role": role, "description": jd, "ctc_lpa": ctc, "location": "Pune",
                "college_id": college_id, "required_skills": req, "preferred_skills": pref, "criteria": crit,
                "deadline": _day(7), "assessment_sections": sections, "rounds": rounds, "criteria_confirmed": True, "submit": True}))
            ok(c.post(f"/api/drives/{d['id']}/review", headers=tpo, json={"decision": "approve", "note": "Details verified. Publishing to eligible students."}))
            ok(c.post(f"/api/drives/{d['id']}/publish", headers=tpo))
            drives[role] = d["id"]

        # a few students have already applied (Ananya hasn't applied to Cloud Analyst yet: that's the demo)
        for key, role in (("kabir", "Cloud Analyst"), ("meera", "Cloud Analyst"), ("rohan", "Data Analyst"),
                          ("meera", "Data Analyst"), ("kabir", "Data Analyst"), ("ananya", "Data Analyst")):
            ok(c.post(f"/api/drives/{drives[role]}/apply", headers=heads[key]))

    return {"college": COLLEGE["name"], "companies": list(companies), "students": len(STUDENTS), "drives": list(drives)}


def main():
    db = MongoClient(MONGO_URL, **client_options(MONGO_URL))[DB_NAME]
    if "--remove" in sys.argv:
        print("removed:", remove(db) or "nothing (no demo data found)")
        return
    print("added:", add(db))
    print(f"\nDemo logins (password for all: {PASSWORD})")
    print(f"  Placement cell  {TPO['email']}")
    for c in COMPANIES:
        print(f"  Company         {c['hr']['email']}  ({c['org']['name']})")
    for key, first, last, *_ in STUDENTS:
        print(f"  Student         {key}@student.rivermont.example  ({first} {last})")


if __name__ == "__main__":
    main()
