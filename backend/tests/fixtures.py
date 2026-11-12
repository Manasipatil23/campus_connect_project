"""Test data the suites create for themselves (the database only holds the demo logins),
and the clean-up that puts everything back afterwards."""
from datetime import datetime, timezone

from bson import ObjectId

from app.auth import hash_password

DEMO = ["student@campusconnect.dev", "tpo@campusconnect.dev", "recruiter@campusconnect.dev", "admin@campusconnect.dev"]

RESUME = """Demo Student
Education: B.E. Computer Engineering, CGPA 8.1
Skills: Python, SQL, Power BI, Excel, Git, React
Experience: Data analyst intern - built Power BI dashboards on SQL data used by 3 teams, cut weekly reporting time by 40%.
Projects: Sales analytics in Python and pandas over 1M rows; React and FastAPI placement tracker used by 200 students.
Achievements: Smart India Hackathon finalist. Certifications: Google Data Analytics."""


def started() -> datetime:
    return datetime.now(timezone.utc)


def ensure_connection(db, college_id: str, company_id: str):
    """An accepted college-company connection. Returns its id if this created it."""
    if db.connections.find_one({"college_id": college_id, "company_id": company_id}):
        db.connections.update_one({"college_id": college_id, "company_id": company_id}, {"$set": {"status": "accepted"}})
        return None
    return db.connections.insert_one({"college_id": college_id, "company_id": company_id, "status": "accepted",
                                      "requested_by": "company", "created_at": started()}).inserted_id


def prepare_student(c, token: str):
    """Give the demo student a complete profile and a resume so they can apply."""
    h = {"Authorization": f"Bearer {token}"}
    r = c.put("/api/students/me/profile", headers=h, json={"branch": "Computer", "cgpa": 8.1, "backlogs": 0, "grad_year": 2026,
                                                            "internships": 1, "projects": 2, "certifications": 1,
                                                            "skills": ["python", "sql", "power bi"]})
    assert r.status_code == 200, r.text
    r = c.post("/api/students/me/resume/text", headers=h, json={"text": RESUME})
    assert r.status_code == 200, r.text


def make_company(db, name: str, email: str):
    """An approved company with an active HR login (password: recruiter123)."""
    cid = str(db.companies.insert_one({"name": name, "website": "https://example.dev", "email_domain": email.split("@")[1],
                                       "industry": "Technology", "size": "51-200", "hq_city": "Pune", "status": "approved",
                                       "about": "Temporary company created by the test suite.", "created_at": started()}).inserted_id)
    db.users.insert_one({"name": "Test HR", "designation": "Campus Hiring Lead", "email": email, "phone": "9820099990",
                         "password_hash": hash_password("recruiter123"), "role": "recruiter", "status": "active",
                         "company": name, "company_id": cid, "created_at": started()})
    return cid


def reset(db, since: datetime, connections=(), companies=()):
    """Remove what a test run created and return the demo accounts to a fresh state."""
    for cid in connections:
        if cid:
            db.messages.delete_many({"connection_id": str(cid)})
            db.connections.delete_one({"_id": ObjectId(str(cid))})
    for cid in companies:
        db.connections.delete_many({"company_id": cid})
        db.users.delete_many({"company_id": cid})
        db.companies.delete_one({"_id": ObjectId(cid)})
    demo_ids = [str(u["_id"]) for u in db.users.find({"email": {"$in": DEMO}}, {"_id": 1})]
    db.notifications.delete_many({"user_id": {"$in": demo_ids}, "created_at": {"$gte": since}})
    db.updates.delete_many({"at": {"$gte": since}})
    db.users.update_one({"email": "student@campusconnect.dev"}, {
        "$set": {"profile": {"branch": "Computer", "grad_year": 2026}, "placement": {"status": "unplaced"}},
        "$unset": {"resume": ""}})
