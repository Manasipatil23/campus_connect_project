"""Populate MongoDB with a realistic demo dataset.

Run:  python -m app.seed      (wipes the campus_connect database first)

Demo logins (password in parentheses):
  student@campusconnect.dev    (student123)    student at Westbridge Institute of Technology
  tpo@campusconnect.dev        (tpo123)        placement coordinator, Westbridge
  recruiter@campusconnect.dev  (recruiter123)  Nimbus Analytics

All colleges, companies and people are fictional.
"""
import asyncio
import math
import random
import statistics
from datetime import datetime, timedelta, timezone

from .auth import hash_password
from .db import client, db, ensure_indexes
from .ml.ats import extract_skills, score_resume
from .ml.eligibility import check_eligibility

rng = random.Random(7)
NOW = datetime.now(timezone.utc)
BRANCHES = ["Computer", "IT", "EXTC", "Electronics", "Mechanical", "AI & DS"]
FIRST = ["Aarav", "Diya", "Kabir", "Ananya", "Rohan", "Isha", "Vihaan", "Meera", "Arjun", "Sara", "Neel", "Tara",
         "Aditya", "Riya", "Karan", "Pooja", "Siddharth", "Nisha", "Yash", "Kavya", "Omkar", "Sneha", "Dev", "Priya"]
LAST = ["Shah", "Patel", "Iyer", "Desai", "Kulkarni", "Joshi", "Mehta", "Rao", "Nair", "Gupta", "Pawar", "Bhat"]
SKILL_POOL = ["python", "java", "c++", "javascript", "react", "node.js", "sql", "mongodb", "fastapi", "django",
              "machine learning", "deep learning", "nlp", "data analysis", "power bi", "excel", "aws", "docker",
              "git", "linux", "rest api", "dsa", "html/css", "etl", "communication"]
PROJECTS = [
    ("Placement chatbot", "Built a FastAPI + React chatbot answering placement FAQs for {n} students"),
    ("Sales dashboard", "Designed a Power BI dashboard tracking {n} KPIs, cutting reporting time by 40%"),
    ("Image classifier", "Trained a CNN reaching {n}% accuracy on a 10-class dataset"),
    ("E-commerce API", "Developed REST APIs in Node.js serving {n}+ requests/min with MongoDB"),
    ("Data warehouse", "Implemented an ETL pipeline in SQL loading {n}k rows into a star schema"),
    ("Expense tracker", "Shipped a React app used by {n} classmates with Git-based CI"),
]
SECTIONS = ["Aptitude", "Coding", "Technical MCQ"]

# fictional colleges; coordinates are their cities (used later for the India map)
COLLEGES = [
    ("Westbridge Institute of Technology", "WIT", "Mumbai", "Maharashtra", 2, 19.08, 72.88),
    ("Northfield College of Engineering", "NCE", "Pune", "Maharashtra", 2, 18.52, 73.86),
    ("Indus Valley Institute of Technology", "IVIT", "New Delhi", "Delhi", 1, 28.61, 77.21),
    ("Deccan School of Engineering", "DSE", "Hyderabad", "Telangana", 2, 17.39, 78.49),
    ("Kaveri Institute of Science & Technology", "KIST", "Bengaluru", "Karnataka", 1, 12.97, 77.59),
    ("Coromandel Technical University", "CTU", "Chennai", "Tamil Nadu", 1, 13.08, 80.27),
    ("Hooghly College of Engineering", "HCE", "Kolkata", "West Bengal", 2, 22.57, 88.36),
    ("Sabarmati Institute of Technology", "SIT", "Ahmedabad", "Gujarat", 2, 23.02, 72.57),
    ("Aravalli Engineering College", "AEC", "Jaipur", "Rajasthan", 3, 26.91, 75.79),
    ("Gomti Institute of Technology", "GIT", "Lucknow", "Uttar Pradesh", 3, 26.85, 80.95),
    ("Malabar College of Engineering", "MCE", "Kochi", "Kerala", 3, 9.93, 76.27),
    ("Narmada Technical Institute", "NTI", "Indore", "Madhya Pradesh", 3, 22.72, 75.86),
]

COMPANIES = [
    ("Nimbus Analytics", "recruiter@campusconnect.dev", "Priya Menon"),
    ("Quantix Systems", "hr@quantix.dev", "Rahul Verma"),
    ("Orbit Fintech", "talent@orbitfin.dev", "Sana Qureshi"),
    ("Vertex Cloud Labs", "campus@vertexcloud.dev", "Amit Dutta"),
]

EXTRA_COMPANIES = [
    ("Lumen Health Tech", "campus@lumenhealth.dev", "Kiran Bose"),
    ("Saffron Robotics", "hr@saffronrobotics.dev", "Neha Kapoor"),
    ("Tidewater Logistics", "careers@tidewater.dev", "Vikram Sethi"),
]
PENDING_COMPANIES = {"Saffron Robotics", "Tidewater Logistics"}
COMPANY_META = {
    "Nimbus Analytics": {"industry": "Data & analytics", "size": "201-1000", "city": "Pune",
                         "about": "Nimbus builds analytics platforms for retail and fintech clients across India."},
    "Quantix Systems": {"industry": "Enterprise software", "size": "1001-5000", "city": "Bengaluru",
                        "about": "Quantix makes ERP and payroll software used by 3,000+ Indian businesses."},
    "Orbit Fintech": {"industry": "Fintech", "size": "201-1000", "city": "Mumbai",
                      "about": "Orbit runs UPI-first lending and payments infrastructure for NBFCs."},
    "Vertex Cloud Labs": {"industry": "Cloud infrastructure", "size": "51-200", "city": "Hyderabad",
                          "about": "Vertex is a managed-cloud partner helping startups migrate and scale on AWS."},
    "Lumen Health Tech": {"industry": "Healthtech", "size": "51-200", "city": "Pune",
                          "about": "Lumen digitises hospital records and builds clinical data pipelines."},
    "Saffron Robotics": {"industry": "Robotics", "size": "1-50", "city": "Chennai",
                         "about": "Saffron designs warehouse automation robots and their control software."},
    "Tidewater Logistics": {"industry": "Logistics", "size": "1001-5000", "city": "Kolkata",
                            "about": "Tidewater runs freight and last-mile delivery across eastern India."},
}

QUESTION_BANK = {
    "Online assessment": [
        "Coding: longest substring without repeating characters", "Coding: minimum platforms needed at a railway station",
        "Coding: count islands in a grid (BFS/DFS)", "SQL: find the second-highest salary per department",
        "20 aptitude MCQs — time & work, probability, ratios", "Output-prediction questions on Python list slicing",
        "MCQs on OS scheduling and deadlocks", "Coding: merge overlapping intervals",
        "Data interpretation set with a bar chart and 5 questions", "MCQs on DBMS normalisation and joins",
    ],
    "Technical interview": [
        "Walk me through the architecture of your best project", "Difference between a process and a thread",
        "Explain normalisation up to 3NF with an example", "Reverse a linked list — then do it recursively",
        "How does indexing work in a database? When does it hurt?", "REST vs GraphQL — when would you pick each?",
        "Design a URL shortener at a high level", "What happens when you type a URL into the browser?",
        "Explain overfitting and how you'd detect it", "Write a SQL query using a window function",
        "How would you containerise your project with Docker?", "Explain the CAP theorem simply",
    ],
    "HR interview": [
        "Tell me about yourself", "Why do you want to join us?", "Are you open to relocating?",
        "Describe a time you handled a disagreement in a team", "Where do you see yourself in three years?",
        "What's a weakness you're working on?",
    ],
}
TIPS = {
    "Online assessment": [
        "Time management mattered more than difficulty. Attempt the easier coding question first.",
        "Brush up SQL joins and GROUP BY — there were two query questions.",
        "Negative marking on MCQs, so skip what you're unsure about.",
        "Practise on the same platform beforehand so the editor doesn't slow you down.",
    ],
    "Technical interview": [
        "Revise your own projects deeply — they asked follow-ups on every line of my resume.",
        "They care about clear thinking. Talk through your approach before writing code.",
        "Be honest when you don't know something; they moved on quickly and it didn't hurt.",
        "Expect DBMS and OS basics even for a development role.",
    ],
    "HR interview": [
        "The HR round was short and friendly. Know why you want this company specifically.",
        "Have a clear answer on relocation and joining dates.",
        "Read about their products before the call — they asked which one I'd improve.",
    ],
}


def make_rounds(created, status):
    """Selection rounds with dates. Completed drives: all confirmed in the past."""
    def rnd(i, name, kind, day, time, venue, confirmed=True):
        return {"id": f"r{i}{rng.randint(100, 999)}", "name": name, "kind": kind,
                "date": day.date().isoformat() if day else None, "time": time, "venue": venue,
                "instructions": None, "status": "confirmed" if confirmed and day else "planned",
                "confirmed": bool(confirmed and day), "proposed": None, "history": [], "updated_at": created}
    if status == "completed":
        return [rnd(1, "Online assessment", "Online assessment", created + timedelta(days=16), "10:00", "HackerRank (link by email)"),
                rnd(2, "Technical interview", "Technical interview", created + timedelta(days=22), "09:30", "On campus, Seminar Hall 2"),
                rnd(3, "HR interview", "HR interview", created + timedelta(days=24), "14:00", "On campus")]
    return [rnd(1, "Online assessment", "Online assessment", NOW + timedelta(days=3), "10:00", "HackerRank (link by email)"),
            rnd(2, "Technical interview", "Technical interview", NOW + timedelta(days=11), "09:30", "On campus, Seminar Hall 2", confirmed=False),
            rnd(3, "HR interview", "HR interview", None, None, "On campus")]


async def _upd(at, by_name, portal, **kw):
    await db.updates.insert_one({"entity": "drive", "by_id": None, "by_name": by_name, "portal": portal, "at": at,
                                 "approval": "not_required", "visibility": "internal", "field": None, "old": None,
                                 "new": None, "notified": None, **kw})


async def seed_drive_history(d, college_id, company_id, recruiter_name):
    did, c = str(d["_id"]), d["created_at"]
    base = dict(entity_id=did, drive_id=did, college_id=college_id, company_id=company_id)
    await _upd(c, recruiter_name, "company", action="created", summary="Drive created (Draft)", **base)
    await _upd(c + timedelta(hours=2), recruiter_name, "company", action="status", summary="Sent for review",
               field="status", old="draft", new="review", approval="pending", **base)
    await _upd(c + timedelta(hours=20), "Anita Kulkarni", "college", action="status", summary="Drive approved",
               field="status", old="review", new="approved", approval="approved", **base)
    await _upd(c + timedelta(days=1), "Anita Kulkarni", "college", action="status", summary="Published to students",
               field="status", old="approved", new="published", visibility="students", notified="eligible students", **base)
    if d["status"] == "completed":
        await _upd(c + timedelta(days=26), recruiter_name, "company", action="status", summary="Drive completed",
                   field="status", old="in_progress", new="completed", visibility="students", **base)


async def seed_workflow(college_id, company_ids, recruiter_ids, students):
    """Demo the shared workflow: a drive in review, a draft, an approved one waiting to be
    published, a pending interview-date change, an announcement, issues and notifications."""
    nimbus, quantix = company_ids[0], company_ids[1]
    tpo = await db.users.find_one({"email": "tpo@campusconnect.dev"})
    tpo_id = str(tpo["_id"])
    demo = next(s for s in students if s["email"] == "student@campusconnect.dev")

    def jd(company, role, skills):
        return (f"{company} is hiring a {role} for its 2026 graduate program. You will work with "
                f"{', '.join(skills[:-1])} and {skills[-1]}, partner with product teams, and present findings "
                f"to stakeholders. Strong problem solving and communication expected.")

    extra = [
        (0, "Business Intelligence Analyst", 7.0, ["sql", "power bi", "excel", "data analysis"], ["python"], "review", None),
        (0, "Data Engineer", 9.5, ["python", "sql", "etl", "aws"], ["docker"], "draft", None),
        (1, "QA Automation Engineer", 6.0, ["java", "git", "rest api"], ["linux"], "approved", None),
        (1, "Product Analyst", 8.0, ["sql", "excel", "communication"], ["python"], "changes_requested",
         "Please add the bond/service-agreement terms and the work location to the JD."),
    ]
    for ci, role, ctc, req, pref, status, note in extra:
        company = COMPANIES[ci][0]
        created = NOW - timedelta(days=2, hours=ci * 3)
        d = {"company": company, "role": role, "description": jd(company, role, req), "ctc_lpa": ctc,
             "location": "Pune", "tier": "regular", "required_skills": req, "preferred_skills": pref,
             "criteria": {"min_cgpa": 6.5, "branches": [], "max_backlogs": 1, "grad_years": [2026]},
             "deadline": (NOW + timedelta(days=12)).date().isoformat(), "assessment_sections": SECTIONS,
             "college_id": college_id, "company_id": company_ids[ci], "recruiter_id": recruiter_ids[ci],
             "owner_name": COMPANIES[ci][2], "criteria_confirmed": status != "draft",
             "rounds": [{"id": f"x{rng.randint(1000, 9999)}", "name": "Online assessment", "kind": "Online assessment",
                         "date": (NOW + timedelta(days=15)).date().isoformat(), "time": "11:00", "venue": "Online",
                         "instructions": None, "status": "confirmed" if status == "approved" else "planned",
                         "confirmed": status == "approved", "proposed": None, "history": [], "updated_at": created}],
             "status": status, "review_note": note, "created_at": created, "updated_at": created}
        d["_id"] = (await db.drives.insert_one(d)).inserted_id
        did = str(d["_id"])
        base = dict(entity_id=did, drive_id=did, college_id=college_id, company_id=company_ids[ci])
        await _upd(created, COMPANIES[ci][2], "company", action="created", summary="Drive created (Draft)", **base)
        if status != "draft":
            await _upd(created + timedelta(hours=1), COMPANIES[ci][2], "company", action="status", summary="Sent for review",
                       field="status", old="draft", new="review", approval="pending", **base)
        if status in ("approved", "changes_requested"):
            await _upd(created + timedelta(hours=9), "Anita Kulkarni", "college", action="status",
                       summary="Drive approved" if status == "approved" else f"Changes requested: {note}",
                       field="status", old="review", new=status, approval="approved" if status == "approved" else "rejected", **base)

    # the spec's example: the company moves an interview from 18 Nov to 20 Nov; the placement cell hasn't confirmed yet
    ml = await db.drives.find_one({"college_id": college_id, "role": "ML Engineer Intern + PPO"})
    rounds = ml["rounds"]
    tech = rounds[1]
    tech.update(date=(NOW + timedelta(days=6)).date().isoformat(), status="confirmed", confirmed=True)
    new_date = (NOW + timedelta(days=8)).date().isoformat()
    tech.update(status="pending", proposed={"date": new_date, "cancel": False, "reason": "Interview panel unavailable that day",
                                            "by": COMPANIES[0][2], "at": NOW - timedelta(hours=5), "prev_status": "confirmed"})
    await db.drives.update_one({"_id": ml["_id"]}, {"$set": {"rounds": rounds}})
    mlid = str(ml["_id"])
    await db.change_requests.insert_one({
        "drive_id": mlid, "college_id": college_id, "company_id": nimbus, "target": "round", "round_id": tech["id"],
        "field": f"round:{tech['name']}", "label": f"{tech['name']} schedule",
        "old": {"date": tech["date"], "time": tech["time"], "venue": tech["venue"]},
        "new": {"date": new_date, "time": tech["time"], "venue": tech["venue"]},
        "reason": "Interview panel unavailable that day", "status": "pending", "proposed_by": recruiter_ids[0],
        "proposed_by_name": COMPANIES[0][2], "portal": "company", "created_at": NOW - timedelta(hours=5)})
    await _upd(NOW - timedelta(hours=5), COMPANIES[0][2], "company", entity_id=mlid, drive_id=mlid, college_id=college_id,
               company_id=nimbus, action="schedule_proposed", field=f"round:{tech['name']}",
               summary=f"{tech['name']}: change proposed — pending confirmation (Interview panel unavailable that day)",
               old={"date": tech["date"]}, new={"date": new_date}, approval="pending", visibility="students")
    # and a JD change waiting on the placement cell
    gt = await db.drives.find_one({"college_id": college_id, "role": "Graduate Engineer Trainee"})
    await db.change_requests.insert_one({
        "drive_id": str(gt["_id"]), "college_id": college_id, "company_id": gt["company_id"], "target": "drive",
        "field": "ctc_lpa", "label": "CTC", "old": gt["ctc_lpa"], "new": 5.0,
        "reason": "Revised compensation band approved by HR", "status": "pending",
        "proposed_by": gt["recruiter_id"], "proposed_by_name": "Orbit HR", "portal": "company",
        "created_at": NOW - timedelta(hours=20)})

    # announcement to all students
    ids = [s["id"] for s in students]
    ann = {"title": "Pre-placement talk: Nimbus Analytics", "audience": "all", "branches": [], "drive_id": None,
           "body": "Nimbus Analytics will hold a pre-placement talk on campus this Friday at 3 PM in Seminar Hall 1. "
                   "Attendance is recommended for everyone applying to the ML Engineer drive.",
           "college_id": college_id, "audience_label": "All students", "recipient_ids": ids, "by_id": tpo_id,
           "by_name": "Anita Kulkarni", "created_at": NOW - timedelta(days=1)}
    await db.announcements.insert_one(ann)

    # issues raised by students
    t = NOW - timedelta(days=2)
    await db.issues.insert_one({
        "category": "Schedule", "subject": "Two interviews on the same day", "drive_id": mlid,
        "drive_label": "Nimbus Analytics · ML Engineer Intern + PPO",
        "description": "My ML Engineer technical interview clashes with an internal exam. Can it be moved?",
        "student_id": demo["id"], "student_name": demo["name"], "college_id": college_id, "status": "in_progress",
        "owner_id": tpo_id, "owner_name": "Anita Kulkarni", "unread_by_student": True,
        "replies": [{"text": "We've asked Nimbus about an alternative slot and will update you here.", "by": "Anita Kulkarni", "at": t + timedelta(hours=6)}],
        "internal_notes": [{"text": "Emailed Priya at Nimbus.", "by": "Anita Kulkarni", "at": t + timedelta(hours=5)}],
        "created_at": t, "updated_at": t + timedelta(hours=6),
        "history": [{"status": "open", "at": t, "by": "You"}, {"status": "in_progress", "at": t + timedelta(hours=6), "by": "Anita Kulkarni"}]})
    other = students[3]
    await db.issues.insert_one({
        "category": "Eligibility", "subject": "Branch missing from eligibility list", "drive_id": None, "drive_label": None,
        "description": "The Cloud Associate drive didn't list EXTC but my seniors say EXTC was eligible last year.",
        "student_id": other["id"], "student_name": other["name"], "college_id": college_id, "status": "open",
        "owner_id": None, "owner_name": None, "replies": [], "internal_notes": [], "created_at": NOW - timedelta(hours=8),
        "updated_at": NOW - timedelta(hours=8), "history": [{"status": "open", "at": NOW - timedelta(hours=8), "by": "You"}]})

    # notifications
    rec = recruiter_ids[0]
    notes = [
        (tpo_id, "New drive to review", "Nimbus Analytics · Business Intelligence Analyst was sent for review.", "drive"),
        (tpo_id, "Schedule change to confirm", f"Nimbus Analytics · ML Engineer Intern + PPO: Technical interview → {new_date}", "schedule"),
        (tpo_id, "Change needs your confirmation", "Orbit Fintech · Graduate Engineer Trainee: CTC", "change"),
        (rec, "Drive published to students", "Nimbus Analytics · ML Engineer Intern + PPO is live.", "drive"),
        (demo["id"], "Notice: Pre-placement talk: Nimbus Analytics", "Friday 3 PM, Seminar Hall 1.", "announcement"),
        (demo["id"], "Issue update: Two interviews on the same day", "We've asked Nimbus about an alternative slot…", "issue"),
    ]
    links = {"drive": f"/drives/{mlid}", "schedule": f"/drives/{mlid}", "change": f"/drives/{gt['_id']}",
             "announcement": "/notices", "issue": "/help"}
    for i, (uid, title, body, kind) in enumerate(notes):
        await db.notifications.insert_one({"user_id": uid, "title": title, "body": body, "link": links[kind], "kind": kind,
                                           "read": False, "created_at": NOW - timedelta(hours=i + 1)})


async def seed_experiences(students) -> int:
    """Students who reached a round share what was asked."""
    by_id = {s["id"]: s for s in students}
    drives = {str(d["_id"]): d async for d in db.drives.find()}
    n = 0
    async for a in db.applications.find({"status": {"$ne": "applied"}}):
        s, d = by_id.get(a["student_id"]), drives.get(a["drive_id"])
        if not s or not d or s["email"] == "student@campusconnect.dev":
            continue
        stages = {h["status"] for h in a["history"]}
        posts = []
        if "shortlisted" in stages and rng.random() < 0.22:
            posts.append(("Online assessment", "assessment_cleared" in stages))
        if "assessment_cleared" in stages and rng.random() < 0.35:
            posts.append(("Technical interview", "offered" in stages))
        if "offered" in stages and rng.random() < 0.4:
            posts.append(("HR interview", "accepted" in stages or "offered" in stages))
        for round_type, cleared in posts:
            qs = rng.sample(QUESTION_BANK[round_type], k=min(len(QUESTION_BANK[round_type]), rng.randint(2, 4)))
            when = min(a["history"][-1]["at"].replace(tzinfo=timezone.utc) + timedelta(days=rng.randint(0, 3)), NOW - timedelta(hours=rng.randint(1, 48)))
            await db.experiences.insert_one({
                "drive_id": a["drive_id"], "company": d["company"], "role": d["role"], "round_type": round_type,
                "platform": rng.choice(["HackerRank", "HackerEarth", "Company portal", "Mettl"]) if round_type == "Online assessment" else rng.choice(["Google Meet", "On campus", "Zoom"]),
                "duration_minutes": rng.choice([45, 60, 90]) if round_type == "Online assessment" else rng.choice([30, 40, 60]),
                "difficulty": rng.choice([2, 3, 3, 4, 4, 5]) if round_type != "HR interview" else rng.choice([1, 2, 2]),
                "outcome": "cleared" if cleared else "not_cleared",
                "topics": sorted(set(rng.sample(d["required_skills"], k=min(3, len(d["required_skills"]))))),
                "questions": qs, "tips": rng.choice(TIPS[round_type]), "anonymous": rng.random() < 0.6, "verified": True,
                "college_id": s["college_id"], "author_id": s["id"], "author_first_name": s["name"].split()[0],
                "helpful_by": [rng.choice(students)["id"] for _ in range(rng.randint(0, 9))], "created_at": when,
                # most are already moderated; a few wait for the placement cell
                "moderation": "pending" if n % 8 == 0 else "approved", "reports": []})
            n += 1
    return n


# company idx, role, ctc, tier, skills, min_cgpa, branches, max_backlogs, status
DRIVES = [
    (0, "Data Analyst", 6.5, "regular", ["sql", "excel", "power bi", "python", "data analysis"], 6.5, [], 1, "completed"),
    (1, "Software Engineer", 12.0, "dream", ["java", "dsa", "sql", "git", "rest api"], 7.5, ["Computer", "IT", "AI & DS"], 0, "completed"),
    (2, "Backend Developer", 9.0, "regular", ["python", "fastapi", "mongodb", "docker", "rest api"], 7.0, ["Computer", "IT", "AI & DS", "EXTC"], 0, "completed"),
    (3, "Cloud Associate", 5.0, "regular", ["linux", "aws", "docker", "git", "communication"], 6.0, [], 2, "completed"),
    (0, "ML Engineer Intern + PPO", 8.0, "regular", ["python", "machine learning", "deep learning", "sql", "nlp"], 7.0, ["Computer", "AI & DS", "IT"], 0, "published"),
    (1, "Full Stack Developer", 10.0, "regular", ["react", "node.js", "javascript", "mongodb", "html/css"], 7.0, [], 0, "published"),
    (2, "Graduate Engineer Trainee", 4.5, "regular", ["communication", "excel", "python", "sql"], 6.0, [], 2, "published"),
    (3, "SDE - Platform", 18.0, "dream", ["c++", "dsa", "linux", "aws", "kubernetes"], 8.0, ["Computer", "IT"], 0, "published"),
]

DEMO_STUDENT = dict(cgpa=7.42, backlogs=0, internships=0, projects=2, certifications=1, polish=False,
                    skills=["python", "sql", "react", "git", "html/css", "mongodb"])
# how the demo student's applications play out: drive role -> (final status, rejected round)
DEMO_OUTCOMES = {"Data Analyst": ("rejected", "resume_screening"),
                 "Backend Developer": ("rejected", "assessment")}


def make_resume(name, branch, cgpa, skills, internships, projects, certs, polish):
    lines = [name.upper(), f"B.Tech {branch} Engineering | CGPA {cgpa}", ""]
    lines += ["EDUCATION", f"B.Tech in {branch} Engineering, CGPA {cgpa}/10", ""]
    lines += ["TECHNICAL SKILLS", ", ".join(skills), ""]
    if internships:
        lines.append("EXPERIENCE")
        for i in range(internships):
            n = rng.randint(15, 60)
            lines.append(f"- Software Intern {i + 1}: automated reports with {skills[i % len(skills)]}, "
                         f"saving {n} hours per month" if polish else
                         f"- Intern {i + 1}: worked on {skills[i % len(skills)]} tasks")
        lines.append("")
    lines.append("PROJECTS")
    for title, desc in rng.sample(PROJECTS, min(projects, len(PROJECTS))):
        lines.append(f"- {title}: " + (desc.format(n=rng.randint(20, 95)) if polish else f"made a {title.lower()}"))
    lines.append("")
    if certs:
        lines += ["CERTIFICATIONS", ", ".join(f"{s.title()} certificate" for s in skills[:certs]), ""]
    if polish and rng.random() < 0.6:
        lines += ["ACHIEVEMENTS", f"- Top {rng.randint(3, 15)} in college hackathon among {rng.randint(40, 200)} teams"]
    body = "\n".join(lines)
    filler = (" Collaborated with cross-functional teams, documented designs, wrote unit tests, "
              "and presented results to faculty mentors.")
    while len(body.split()) < (300 if polish else 120):
        body += filler
    return body


def sample_student():
    cgpa = round(min(9.9, max(5.2, rng.gauss(7.4, 0.9))), 2)
    backlogs = rng.choices([0, 0, 0, 0, 1, 2, 3], k=1)[0] if cgpa < 7 else rng.choice([0, 0, 0, 0, 0, 1])
    internships = rng.choices([0, 1, 2, 3], weights=[3, 4, 2, 1])[0]
    projects = rng.randint(1, 5)
    certs = rng.randint(0, 4)
    skills = rng.sample(SKILL_POOL, rng.randint(3, 9))
    polish = rng.random() < (0.35 + 0.08 * (cgpa - 6))
    return dict(cgpa=cgpa, backlogs=backlogs, internships=internships, projects=projects,
                certifications=certs, skills=skills, polish=polish)


def placed_prob(f, ats):
    z = (-12.0 + 0.95 * f["cgpa"] - 0.9 * f["backlogs"] + 0.55 * f["internships"] + 0.2 * f["projects"]
         + 0.12 * f["certifications"] + 0.035 * ats + 0.12 * len(f["skills"]))
    return 1 / (1 + math.exp(-z))


def assessment_scores(f):
    base = 40 + 6 * (f["cgpa"] - 6) + 3 * ("dsa" in f["skills"]) + rng.gauss(0, 8)
    return {
        "Aptitude": round(max(5, min(100, base + 8 + rng.gauss(0, 10)))),
        "Coding": round(max(0, min(100, base + 6 * ("dsa" in f["skills"]) + 4 * f["internships"] + rng.gauss(0, 14)))),
        "Technical MCQ": round(max(5, min(100, base + 5 + rng.gauss(0, 10)))),
    }


async def create_students(college_id, count, pw_hash, demo=False):
    students = []
    for i in range(count):
        f = sample_student()
        branch = rng.choice(BRANCHES)
        if demo and i == 0:
            name, email, branch = "Demo Student", "student@campusconnect.dev", "Computer"
            f = dict(DEMO_STUDENT)
        else:
            name = f"{rng.choice(FIRST)} {rng.choice(LAST)}"
            email = f"{name.lower().replace(' ', '.')}.{college_id[-4:]}{i}@student.campusconnect.dev"
        text = make_resume(name, branch, f["cgpa"], f["skills"], f["internships"], f["projects"],
                           f["certifications"], f["polish"])
        doc = {
            "name": name, "first_name": name.split()[0], "last_name": name.split()[-1],
            "email": email, "password_hash": pw_hash, "role": "student", "status": "active", "email_verified": True,
            "roll_number": f"22{college_id[-3:].upper()}{100 + i}", "phone": f"9{rng.randint(100000000, 999999999)}",
            "college_id": college_id, "created_at": NOW,
            "profile": {"branch": branch, "cgpa": f["cgpa"], "backlogs": f["backlogs"], "grad_year": 2026,
                        "internships": f["internships"], "projects": f["projects"],
                        "certifications": f["certifications"],
                        "skills": sorted(set(f["skills"]) | set(extract_skills(text)))},
            "resume": {"text": text, "filename": "resume.pdf", "ats": score_resume(text), "review": None,
                       "updated_at": NOW - timedelta(days=rng.randint(1, 40))},
            "placement": {"status": "unplaced"},
        }
        res = await db.users.insert_one(doc)
        doc.update(_id=res.inserted_id, id=str(res.inserted_id), _f=f)
        students.append(doc)
    return students


async def run_drive(d, students):
    """Simulate a drive's rounds: resume screening -> assessment -> interviews -> offer."""
    did = str(d["_id"])
    applicants = []
    for s in students:
        demo = s["email"] == "student@campusconnect.dev"
        if demo and d["role"] not in DEMO_OUTCOMES:
            continue  # keep other drives free for the demo student to try
        if not check_eligibility(s, d)[0] or (not demo and rng.random() > 0.6):
            continue
        ats = score_resume(s["resume"]["text"], d["description"], d["required_skills"])
        applicants.append((s, ats))
    if not applicants:
        return 0

    # resume screening: rank by match score with a CGPA nudge; top ~45% shortlisted
    ranked = sorted(applicants, key=lambda x: x[1]["score"] + 4 * x[0]["profile"]["cgpa"] + rng.gauss(0, 3), reverse=True)
    n_short = max(3, round(0.45 * len(ranked)))
    shortlisted_ids = {s["id"] for s, _ in ranked[:n_short]}
    open_drive = d["status"] == "published"
    screened = not open_drive or rng.random() < 0.9  # most open drives have finished screening

    # assessment scores for shortlisted; clear the top ~55%
    scores = {s["id"]: assessment_scores(s["_f"]) for s, _ in applicants if s["id"] in shortlisted_ids}
    totals = sorted((statistics.mean(v.values()) for v in scores.values()), reverse=True)
    cutoff = totals[max(0, round(0.55 * len(totals)) - 1)] if totals else 0
    assessed = not open_drive or rng.random() < 0.6

    for s, ats in applicants:
        demo = s["email"] == "student@campusconnect.dev"
        t = min(d["created_at"] + timedelta(days=rng.randint(0, 6), hours=rng.randint(0, 23)), NOW - timedelta(days=3))
        hist = [{"status": "applied", "at": t}]
        status, rejected_round, assessment = "applied", None, None

        def step(new):
            nonlocal t
            t = min(t + timedelta(days=rng.randint(2, 5)), NOW - timedelta(hours=rng.randint(2, 30)))
            hist.append({"status": new, "at": t})
            return new

        forced = DEMO_OUTCOMES.get(d["role"]) if demo else None
        if screened:
            in_short = s["id"] in shortlisted_ids
            if forced:
                in_short = forced[1] != "resume_screening"
            if not in_short:
                status, rejected_round = step("rejected"), "resume_screening"
            else:
                status = step("shortlisted")
                sec = scores.get(s["id"]) or assessment_scores(s["_f"])
                if forced and forced[1] == "assessment":
                    # just under the cut-off, with coding as the clear weak spot
                    sec = {"Aptitude": round(cutoff + 9), "Coding": round(cutoff - 24), "Technical MCQ": round(cutoff - 3)}
                if assessed:
                    assessment = {"sections": sec, "recorded_at": t + timedelta(days=1)}
                    passed = statistics.mean(sec.values()) >= cutoff and not forced
                    if not passed:
                        status, rejected_round = step("rejected"), "assessment"
                    else:
                        status = step("assessment_cleared")
                        if not open_drive:
                            p = placed_prob(s["_f"], ats["score"])
                            if rng.random() < 0.45 + 0.45 * p:
                                status = step("offered")
                                if rng.random() < 0.9:
                                    status = step("accepted")
                                    s["placement"] = {"status": "placed", "company": d["company"],
                                                      "ctc_lpa": d["ctc_lpa"], "drive_id": did, "at": t}
                                    await db.users.update_one({"_id": s["_id"]}, {"$set": {"placement": s["placement"]}})
                            else:
                                status, rejected_round = step("rejected"), "interview"
        doc = {"student_id": s["id"], "drive_id": did, "status": status, "ats_score": ats["score"], "ats": ats,
               "resume_snapshot": s["resume"]["text"], "profile_snapshot": s["profile"],
               "applied_at": hist[0]["at"], "history": hist}
        if rejected_round:
            doc["rejected_round"] = rejected_round
        if assessment:
            doc["assessment"] = assessment
        await db.applications.insert_one(doc)
    return len(applicants)


async def main():
    await client.drop_database(db.name)
    await ensure_indexes()

    # historical outcomes (training data for the placement model)
    history = []
    for _ in range(600):
        f = sample_student()
        ats = score_resume(make_resume("x", rng.choice(BRANCHES), f["cgpa"], f["skills"], f["internships"],
                                       f["projects"], f["certifications"], f["polish"]))["score"]
        history.append({"batch": rng.choice([2023, 2024, 2025]), "cgpa": f["cgpa"], "backlogs": f["backlogs"],
                        "internships": f["internships"], "projects": f["projects"],
                        "certifications": f["certifications"], "ats_score": ats, "num_skills": len(f["skills"]),
                        "placed": rng.random() < placed_prob(f, ats)})
    await db.history.insert_many(history)

    # ---- colleges: 10 verified, 2 waiting for the platform admin -----------------
    college_ids = []
    for i, (name, short, city, state, tier, lat, lng) in enumerate(COLLEGES):
        domain = f"{short.lower()}.edu.in"
        pending = i >= len(COLLEGES) - 2
        res = await db.colleges.insert_one({
            "name": name, "short": short, "city": city, "state": state, "tier": None if pending else tier,
            "lat": lat, "lng": lng, "status": "pending" if pending else "approved",
            "aishe_code": f"C-{41000 + i * 137}", "institution_type": rng.choice(["Private", "Autonomous", "Government-aided"]),
            "affiliated_university": f"University of {city}", "established_year": rng.randint(1960, 2008),
            "naac_grade": rng.choice(["A++", "A+", "A", "B++"]), "website": f"https://www.{domain}",
            "address": f"{rng.randint(1, 99)}, College Road, {city}", "pincode": str(rng.randint(400001, 799999)),
            "phone": f"022{rng.randint(10000000, 99999999)}", "email_domain": domain,
            "student_email_domain": f"student.{domain}" if i == 0 else None,
            "created_at": NOW - timedelta(days=200 - i * 3 if not pending else 2)})
        college_ids.append(str(res.inserted_id))
        if pending:
            await db.users.insert_one({"name": rng.choice(["Dr. Meena Rao", "Prof. Arvind Joshi"]),
                                       "designation": "Training & Placement Officer", "email": f"tpo@{domain}",
                                       "phone": "98200" + str(rng.randint(10000, 99999)),
                                       "password_hash": hash_password("tpo12345"), "role": "coordinator",
                                       "status": "pending", "college_id": str(res.inserted_id), "created_at": NOW})
    main_college, second_college = college_ids[0], college_ids[1]

    await db.users.insert_one({"name": "Platform Admin", "email": "admin@campusconnect.dev",
                               "password_hash": hash_password("admin123"), "role": "admin", "status": "active",
                               "created_at": NOW})
    await db.users.insert_one({"name": "Anita Kulkarni", "designation": "Training & Placement Officer",
                               "email": "tpo@campusconnect.dev", "phone": "9820012345",
                               "password_hash": hash_password("tpo123"), "role": "coordinator", "status": "active",
                               "college_id": main_college, "created_at": NOW})
    await db.users.insert_one({"name": "Rahul Deshmukh", "designation": "Placement Officer", "email": "tpo@nce.edu.in",
                               "password_hash": hash_password("tpo12345"), "role": "coordinator", "status": "active",
                               "college_id": second_college, "created_at": NOW})

    # ---- companies: 4 hiring now, 1 approved and reaching out, 2 awaiting approval
    company_ids, recruiter_ids = [], []
    for i, (company, email, rname) in enumerate(COMPANIES + EXTRA_COMPANIES):
        meta = COMPANY_META.get(company, {})
        status = "pending" if company in PENDING_COMPANIES else "approved"
        cid = str((await db.companies.insert_one({
            "name": company, "website": f"https://www.{email.split('@')[1]}", "email_domain": email.split("@")[1],
            "industry": meta.get("industry", "Technology"), "size": meta.get("size", "201-1000"),
            "hq_city": meta.get("city", "Bengaluru"), "cin": f"U72200MH20{10 + i}PTC{200000 + i * 17}",
            "about": meta.get("about", f"{company} builds software products for Indian and global customers."),
            "status": status, "created_at": NOW - timedelta(days=150 - i * 10 if status == "approved" else 1)})).inserted_id)
        company_ids.append(cid)
        res = await db.users.insert_one({"name": rname, "designation": "Campus Hiring Lead", "email": email,
                                         "phone": f"98{20030000 + i * 1111}",
                                         "password_hash": hash_password("recruiter123"), "role": "recruiter",
                                         "status": "active" if status == "approved" else "pending",
                                         "company": company, "company_id": cid, "created_at": NOW})
        recruiter_ids.append(str(res.inserted_id))

    # ---- connections between colleges and companies --------------------------------
    for ci in range(len(COMPANIES)):
        for col in (main_college, second_college):
            await db.connections.insert_one({"college_id": col, "company_id": company_ids[ci], "status": "accepted",
                                             "requested_by": rng.choice(["college", "company"]),
                                             "created_at": NOW - timedelta(days=90), "responded_at": NOW - timedelta(days=88)})
    await db.connections.insert_one({"college_id": main_college, "company_id": company_ids[len(COMPANIES)],
                                     "status": "pending", "requested_by": "company",
                                     "message": "We're hiring 12 data engineers for our Pune office and would love to run a drive at Westbridge.",
                                     "created_at": NOW - timedelta(days=1)})
    for col in college_ids[2:6]:
        await db.connections.insert_one({"college_id": col, "company_id": company_ids[0], "status": "accepted",
                                         "requested_by": "company", "created_at": NOW - timedelta(days=60)})

    pw = hash_password("student123")
    by_college = {main_college: await create_students(main_college, 90, pw, demo=True),
                  second_college: await create_students(second_college, 35, pw)}
    # a few sign-ups waiting for the placement cell to approve them
    for k in range(6):
        first, last = rng.choice(FIRST), rng.choice(LAST)
        await db.users.insert_one({"name": f"{first} {last}", "first_name": first, "last_name": last,
                                   "email": f"{first.lower()}.{last.lower()}{k}@student.wit.edu.in",
                                   "password_hash": pw, "role": "student", "status": "pending",
                                   "college_id": main_college, "roll_number": f"22CE{300 + k}",
                                   "phone": f"98{rng.randint(10000000, 99999999)}", "email_verified": True,
                                   "profile": {"branch": rng.choice(BRANCHES), "grad_year": 2026},
                                   "placement": {"status": "unplaced"}, "created_at": NOW - timedelta(hours=k * 5)})

    n_drives = n_apps = 0
    for college_id, students in by_college.items():
        specs = DRIVES if college_id == main_college else DRIVES[:2] + DRIVES[5:6]
        for k, (ci, role, ctc, tier, skills, mcg, branches, mb, status) in enumerate(specs):
            company = COMPANIES[ci][0]
            desc = (f"{company} is hiring a {role} for its 2026 graduate program. You will work with "
                    f"{', '.join(skills[:-1])} and {skills[-1]} on production systems, collaborate with senior "
                    f"engineers, and own features end to end. Strong problem solving and communication expected.")
            created = NOW - timedelta(days=70 - k * 7) if status == "completed" else NOW - timedelta(days=12 - k)
            d = {"company": company, "role": role, "description": desc, "ctc_lpa": ctc,
                 "location": rng.choice(["Mumbai", "Pune", "Bengaluru", "Remote"]), "tier": tier,
                 "required_skills": skills,
                 "criteria": {"min_cgpa": mcg, "branches": branches, "max_backlogs": mb, "grad_years": [2026]},
                 "deadline": ((created + timedelta(days=14)) if status == "completed"
                              else NOW + timedelta(days=6 + 3 * k)).date().isoformat(),
                 "assessment_sections": SECTIONS, "college_id": college_id, "company_id": company_ids[ci],
                 "preferred_skills": [], "criteria_confirmed": True, "owner_name": COMPANIES[ci][2],
                 "rounds": make_rounds(created, status),
                 "recruiter_id": recruiter_ids[ci], "status": status, "created_at": created,
                 "published_at": created + timedelta(days=1), "updated_at": created + timedelta(days=1)}
            d["_id"] = (await db.drives.insert_one(d)).inserted_id
            n_drives += 1
            await seed_drive_history(d, college_id, company_ids[ci], COMPANIES[ci][2])
            # open drives: only some students have applied so far
            n_apps += await run_drive(d, students)

    await seed_workflow(main_college, company_ids, recruiter_ids, by_college[main_college])
    students = [s for v in by_college.values() for s in v]
    n_exp = await seed_experiences(students)
    placed = sum(s["placement"]["status"] == "placed" for s in students)
    print(f"Seeded {len(COLLEGES)} colleges, {len(COMPANIES + EXTRA_COMPANIES)} companies, {len(history)} historical "
          f"records, {len(students)} students ({placed} placed), {n_drives} drives, {n_apps} applications, "
          f"{n_exp} shared experiences.")


if __name__ == "__main__":
    asyncio.run(main())
