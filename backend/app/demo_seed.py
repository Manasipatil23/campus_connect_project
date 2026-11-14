"""Fictional demo data for product walkthroughs and demo videos.

    python -m app.demo_seed            # add the demo colleges, companies, people, drives and applications
    python -m app.demo_seed --remove   # remove every demo record (and nothing else)

Everything here is made up. Every email address ends in `.example`, a domain reserved for
examples that can never belong to anyone, and every record is tagged `demo: True` (or belongs to
a demo college / company), so `--remove` deletes exactly what this script added.

What it sets up:
  * Rivermont Institute of Engineering (verified) with its placement officer and 11 final-year students
  * Skyforge Cloud Solutions (verified, connected) with a Cloud Analyst and a Data Analyst drive,
    reviewed and published by the placement cell, and students' applications
  * Lumen Data Labs (verified) with a connection request to Rivermont waiting for an answer
  * Northfield College of Engineering and Quantra Fintech, registered through the real sign-up
    flow and waiting for the platform admin
  * three students who signed up at Rivermont and are waiting for the placement cell
  * a platform admin login (its address must also be listed in ADMIN_EMAILS in backend/.env)

Verified people and organisations are inserted directly; everything else goes through the app's
own API, so notifications, update history and analytics are exactly what real use produces.
Email is switched off while it runs, so nothing is sent to the made-up addresses.
"""
import os
import sys

# no email, no DNS checks on the made-up domains, no AI calls: set before the app reads its config
os.environ["SMTP_HOST"] = ""
os.environ["CHECK_EMAIL_DELIVERABILITY"] = "false"
os.environ.setdefault("LLM_ENABLED", "off")

from datetime import date, datetime, timedelta, timezone  # noqa: E402

from bson import ObjectId  # noqa: E402
from pymongo import MongoClient  # noqa: E402

from .auth import hash_password  # noqa: E402
from .config import DB_NAME, MONGO_URL  # noqa: E402
from .db import client_options  # noqa: E402
from .schemas import season_batch  # noqa: E402

PASSWORD = "Demo@2027"
TAG = {"demo": True}
ADMIN = {"name": "Vikram Sethi", "email": "admin@campusconnect.example"}

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

# registered through the real sign-up API and left for the platform admin to verify
PENDING_COLLEGE = {
    "name": "Northfield College of Engineering", "short": "NCE", "aishe_code": "C-90533", "institution_type": "Autonomous",
    "affiliated_university": "Vidarbha Technical University", "established_year": 1998, "naac_grade": "A+", "nirf_rank": 142,
    "website": "https://www.northfield.example", "address": "12 Ring Road, Wardha Road Campus", "city": "Nagpur",
    "state": "Maharashtra", "pincode": "440015", "phone": "07122345678", "email_domain": "northfield.example",
    "student_email_domain": "student.northfield.example", "tpo_name": "Rahul Joshi", "tpo_designation": "Head, Training & Placement",
    "tpo_email": "tpo@northfield.example", "tpo_phone": "9800000505",
}
PENDING_COMPANY = {
    "name": "Quantra Fintech", "website": "https://www.quantra.example", "email_domain": "quantra.example", "industry": "Fintech",
    "size": "51-200", "hq_city": "Mumbai", "cin": "U67190MH2020PTC000611",
    "about": "Quantra builds payment reconciliation and fraud analytics for small banks and lenders.",
    "hr_name": "Meghna Iyer", "hr_designation": "Head of Talent", "hr_email": "careers@quantra.example", "hr_phone": "9800000606",
}
PENDING_STUDENTS = [
    ("Ishaan", "Patel", "RIE27CS041", "Computer", "ishaan"),
    ("Tanvi", "Rao", "RIE27IT018", "IT", "tanvi"),
    ("Karan", "Mehta", "RIE27EX099", "EXTC", "karan"),   # not on the college's class list
]

RESUMES = {
    "ananya": """Ananya Kulkarni
Education: B.E. Computer Engineering, Rivermont Institute of Engineering, CGPA 8.6
Skills: Python, SQL, Java, Git
Projects: Library management system in Java; student marks analysis in Python.""",
    "rohan": """Rohan Verma
Education: B.E. Information Technology, Rivermont Institute of Engineering, CGPA 7.4
Skills: SQL, Excel, Power BI, Python
Projects: Retail sales dashboard in Power BI on SQL data for a 40-store chain, cut weekly reporting time by 35%; student attendance analysis in Python and pandas across 1,200 records.
Experience: Summer intern, reporting, at a local logistics firm - automated daily delivery reports in Excel.
Certifications: Data Analytics Essentials.""",
    "kabir": """Kabir Shah
Education: B.E. Computer Engineering, Rivermont Institute of Engineering, CGPA 7.9
Skills: Python, Linux, AWS, SQL, Java
Projects: Deployed a Flask app on AWS EC2 with Nginx; Linux shell scripts to automate backups for a college lab of 60 machines.
Experience: Web development intern - built REST APIs in Java Spring Boot used by 3 internal teams.""",
    "meera": """Meera Joshi
Education: B.Tech. Artificial Intelligence and Data Science, CGPA 8.2
Skills: Python, SQL, Machine Learning, AWS, Linux, Power BI
Experience: Data analyst intern - built Power BI dashboards on SQL data used by 3 teams and cut weekly reporting time by 40%.
Projects: Customer churn model in Python deployed on an AWS EC2 Linux server (F1 0.81); sales forecasting over 1M rows.
Certifications: Google Data Analytics.""",
    "priya": """Priya Shah
Education: B.E. Computer Engineering, CGPA 8.1
Skills: Python, AWS, Linux, SQL, Docker
Projects: Migrated a college club website to AWS S3 and CloudFront; Docker images for 4 lab assignments; SQL reports on cloud billing data.
Experience: Cloud support intern - resolved 120 Linux server tickets in 8 weeks.
Achievements: Winner, inter-college cloud quiz.""",
    "arjun": """Arjun Nair
Education: B.E. Information Technology, CGPA 7.6
Skills: Python, Linux, SQL, AWS
Projects: Bash and Python scripts to monitor Linux servers; AWS EC2 hosting for a hackathon app used by 90 people.
Experience: IT support intern at a hospital - maintained 30 Linux workstations.""",
    "diya": """Diya Menon
Education: B.E. Computer Engineering, CGPA 8.4
Skills: AWS, Linux, Python, SQL, Docker, Kubernetes
Experience: DevOps intern - built CI pipelines and Docker images for 6 microservices on AWS; cut deployment time by 50%.
Projects: Kubernetes cluster on AWS for a college project; Python scripts to tag 400 cloud resources for cost reports in SQL.
Certifications: AWS Certified Cloud Practitioner.""",
    "varun": """Varun Kapoor
Education: B.Tech. Artificial Intelligence and Data Science, CGPA 7.2
Skills: Python, Machine Learning, Deep Learning
Projects: Image classifier in PyTorch; movie recommendation system.""",
    "neha": """Neha Gupta
Education: B.E. Electronics and Telecommunication, CGPA 7.0
Skills: C, MATLAB, Python, Excel
Projects: IoT weather station with Arduino; signal filtering in MATLAB.""",
    "sameer": """Sameer Khan
Education: B.E. Information Technology, CGPA 6.9
Skills: Java, HTML, CSS, JavaScript, SQL
Projects: Hostel booking website in HTML, CSS and JavaScript; Java desktop billing app.""",
    "sneha": """Sneha Iyer
Education: B.E. Electronics and Telecommunication, CGPA 6.4
Skills: C, Embedded C, MATLAB, Excel
Projects: IoT soil-moisture monitor with Arduino; signal filtering in MATLAB.""",
}

STUDENTS = [
    # key, first, last, roll, branch, cgpa, backlogs, internships, projects, certifications, skills
    ("ananya", "Ananya", "Kulkarni", "RIE27CS014", "Computer", 8.6, 0, 1, 3, 2, ["python", "sql", "java", "git"]),
    ("rohan", "Rohan", "Verma", "RIE27IT031", "IT", 7.4, 0, 1, 2, 1, ["sql", "excel", "power bi", "python"]),
    ("kabir", "Kabir", "Shah", "RIE27CS022", "Computer", 7.9, 0, 1, 2, 0, ["python", "linux", "aws", "sql", "java"]),
    ("meera", "Meera", "Joshi", "RIE27AD009", "AI & DS", 8.2, 0, 1, 2, 1, ["python", "sql", "machine learning", "aws"]),
    ("priya", "Priya", "Shah", "RIE27CS030", "Computer", 8.1, 0, 1, 3, 0, ["python", "aws", "linux", "sql", "docker"]),
    ("arjun", "Arjun", "Nair", "RIE27IT044", "IT", 7.6, 0, 1, 2, 0, ["python", "linux", "sql", "aws"]),
    ("diya", "Diya", "Menon", "RIE27CS035", "Computer", 8.4, 0, 1, 2, 1, ["aws", "linux", "python", "docker", "kubernetes"]),
    ("varun", "Varun", "Kapoor", "RIE27AD021", "AI & DS", 7.2, 0, 0, 2, 0, ["python", "machine learning"]),
    ("neha", "Neha", "Gupta", "RIE27EX012", "EXTC", 7.0, 0, 0, 2, 0, ["c", "matlab", "python"]),
    ("sameer", "Sameer", "Khan", "RIE27IT052", "IT", 6.9, 0, 0, 2, 0, ["java", "html/css", "sql"]),
    ("sneha", "Sneha", "Iyer", "RIE27EX007", "EXTC", 6.4, 1, 0, 2, 0, ["c", "matlab", "excel"]),
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

Selection: online assessment (aptitude, technical MCQ, coding), a technical interview and an HR interview."""

DATA_JD = """Skyforge's analytics team is hiring Data Analysts to turn customers' cloud usage and billing data into decisions.

What you'll do
- Write SQL to pull and clean usage data; build Power BI dashboards for customers.
- Find cost and performance trends with Python and present them clearly.

What we look for
- Strong SQL and Excel, working Python (pandas), and a dashboard tool such as Power BI.
- Clear written and spoken communication.

Selection: online assessment (aptitude, SQL & data interpretation), a technical interview and an HR interview."""

APPLICATIONS = [  # student, drive. Ananya applies to Cloud Analyst on camera.
    *[(k, "Cloud Analyst") for k in ("rohan", "kabir", "meera", "priya", "arjun", "diya", "varun", "neha", "sameer")],
    *[(k, "Data Analyst") for k in ("ananya", "rohan", "meera", "kabir")],
]


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
    _user(db, {**ADMIN, "role": "admin"})
    college_id = str(db.colleges.insert_one({**COLLEGE, **TAG, "created_at": t, "reviewed_at": t}).inserted_id)
    _user(db, {**TPO, "role": "coordinator", "college_id": college_id})
    for c in COMPANIES:
        cid = str(db.companies.insert_one({**c["org"], **TAG, "created_at": t, "reviewed_at": t}).inserted_id)
        _user(db, {**c["hr"], "role": "recruiter", "company_id": cid, "company": c["org"]["name"]})
    for i, (key, first, last, roll, branch, *_) in enumerate(STUDENTS):
        _user(db, {"name": f"{first} {last}", "first_name": first, "last_name": last, "email": f"{key}@student.rivermont.example",
                   "role": "student", "college_id": college_id, "roll_number": roll, "phone": f"98000004{i:02d}",
                   "profile": {"branch": branch, "grad_year": season}, "placement": {"status": "unplaced"}})

    with TestClient(app) as c:
        def ok(r):
            assert r.status_code < 300, r.text
            return r.json()

        def login(email):
            return {"Authorization": f"Bearer {ok(c.post('/api/auth/login', json={'email': email, 'password': PASSWORD}))['token']}"}

        def code(email, **kw):
            return ok(c.post("/api/auth/send-code", json={"email": email, **kw}))["dev_code"]

        # new registrations, through the real sign-up flow, waiting for the platform admin
        nc = PENDING_COLLEGE
        ok(c.post("/api/auth/register/college", json={**nc, "password": PASSWORD,
                  "code": code(nc["tpo_email"], kind="college", domain=nc["email_domain"])}))
        qc = PENDING_COMPANY
        ok(c.post("/api/auth/register/company", json={**qc, "password": PASSWORD,
                  "code": code(qc["hr_email"], kind="company", domain=qc["email_domain"])}))
        db.colleges.update_one({"name": nc["name"]}, {"$set": TAG})
        db.companies.update_one({"name": qc["name"]}, {"$set": TAG})
        db.users.update_many({"email": {"$in": [nc["tpo_email"], qc["hr_email"]]}}, {"$set": TAG})

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

        # three new sign-ups at Rivermont, through the real student sign-up flow, waiting for the placement cell
        for first, last, roll, branch, key in PENDING_STUDENTS:
            email = f"{key}@student.rivermont.example"
            ok(c.post("/api/auth/register/student", json={
                "first_name": first, "last_name": last, "email": email, "password": PASSWORD, "college_id": college_id,
                "roll_number": roll, "branch": branch, "grad_year": season, "phone": f"98000005{PENDING_STUDENTS.index((first, last, roll, branch, key)):02d}",
                "code": code(email, kind="student", college_id=college_id)}))
            db.users.update_one({"email": email}, {"$set": TAG})

        # Skyforge asks to connect; the placement cell accepts. Lumen's request is left waiting.
        conn = ok(c.post("/api/connections", headers=hr, json={"college_id": college_id,
                         "message": "We're hiring cloud and data analysts from the 2027 batch and would love to run drives at Rivermont."}))
        ok(c.post(f"/api/connections/{conn['id']}/decision", headers=tpo, json={"decision": "approve",
               "note": "Happy to host Skyforge. Our placement season runs through March."}))
        ok(c.post("/api/connections", headers=lumen, json={"college_id": college_id,
               "message": "Lumen is hiring business data analysts from the 2027 batch. Could we run a drive at Rivermont?"}))

        # Skyforge posts two drives; the placement cell reviews and publishes them
        rounds = [{"name": "Online assessment", "kind": "Online assessment", "date": _day(10), "time": "10:00", "venue": "Online (test link by email)"},
                  {"name": "Technical interview", "kind": "Technical interview", "date": _day(15), "time": "11:00", "venue": "Seminar Hall 2, Rivermont"},
                  {"name": "HR interview", "kind": "HR interview", "date": _day(16), "time": "14:00", "venue": "Placement Cell, Rivermont"}]
        drives = {}
        for role, jd, ctc, req, pref, crit, sections in (
                ("Cloud Analyst", CLOUD_JD, 7.5, ["aws", "linux", "python", "sql"], ["docker"],
                 {"min_cgpa": 6.5, "max_backlogs": 0, "branches": ["Computer", "IT", "AI & DS", "EXTC"]},
                 ["Aptitude", "Technical MCQ", "Coding"]),
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

        for key, role in APPLICATIONS:
            ok(c.post(f"/api/drives/{drives[role]}/apply", headers=heads[key]))

    return {"college": COLLEGE["name"], "companies": [c["org"]["name"] for c in COMPANIES], "students": len(STUDENTS),
            "pending": [PENDING_COLLEGE["name"], PENDING_COMPANY["name"], *[f"{f} {l}" for f, l, *_ in PENDING_STUDENTS]],
            "drives": list(drives), "applications": len(APPLICATIONS)}


def main():
    db = MongoClient(MONGO_URL, **client_options(MONGO_URL))[DB_NAME]
    if "--remove" in sys.argv:
        print("removed:", remove(db) or "nothing (no demo data found)")
        return
    print("added:", add(db))
    print(f"\nDemo logins (password for all: {PASSWORD})")
    print(f"  Platform admin  {ADMIN['email']}  (also add it to ADMIN_EMAILS in backend/.env)")
    print(f"  Placement cell  {TPO['email']}")
    for c in COMPANIES:
        print(f"  Company         {c['hr']['email']}  ({c['org']['name']})")
    for key, first, last, *_ in STUDENTS:
        print(f"  Student         {key}@student.rivermont.example  ({first} {last})")
    print(f"  Waiting for the admin: {PENDING_COLLEGE['tpo_email']}, {PENDING_COMPANY['hr_email']}")


if __name__ == "__main__":
    main()
