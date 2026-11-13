"""Sign-up, sign-in and the public college list.

Onboarding chain:
  college signs up  -> platform admin approves -> its placement officer (coordinator) is activated
  company signs up  -> platform admin approves -> its HR (recruiter) is activated
  student signs up  -> picks an approved college -> that college's placement cell approves
"""
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from ..auth import create_token, current_user, hash_password, is_allowed_admin, verify_password
from ..db import db, serialize
from ..emailing import check_email, consume_code, domain_of, issue_code
from ..workflow import admins, college_staff, notify
from ..schemas import AdminCodeIn, AdminSetupIn, CollegeSignupIn, CompanySignupIn, LoginIn, SendCodeIn, StudentSignupIn

router = APIRouter(prefix="/api", tags=["auth"])
PUBLIC_COLLEGE_FIELDS = {"name": 1, "short": 1, "city": 1, "state": 1, "tier": 1, "student_email_domain": 1}


def _oid(v):
    try:
        return ObjectId(v)
    except (InvalidId, TypeError):
        raise HTTPException(400, "Invalid id")


async def with_org(user: dict) -> dict:
    """Attach the user's college / company (and its approval status)."""
    if user.get("college_id"):
        c = await db.colleges.find_one({"_id": ObjectId(user["college_id"])})
        if c:
            user["college"] = serialize(c)
    if user.get("company_id"):
        c = await db.companies.find_one({"_id": ObjectId(user["company_id"])})
        if c:
            user["company_org"] = serialize(c)
    return user


async def _session(doc: dict) -> dict:
    return {"token": create_token(str(doc["_id"]), doc["role"]), "user": await with_org(serialize(doc))}


async def _insert_user(doc: dict) -> dict:
    if await db.users.find_one({"email": doc["email"]}):
        raise HTTPException(409, "An account with this email already exists — sign in instead")
    doc.update(email_verified=True, created_at=datetime.now(timezone.utc))
    try:
        doc["_id"] = (await db.users.insert_one(doc)).inserted_id
    except DuplicateKeyError:
        raise HTTPException(409, "An account with this email already exists — sign in instead")
    return doc


@router.get("/colleges")
async def colleges():
    """Approved colleges only — students can't join a college that isn't verified."""
    return [serialize(c) async for c in db.colleges.find({"status": "approved"}, PUBLIC_COLLEGE_FIELDS).sort("name", 1)]


async def _approved_college(college_id: str) -> dict:
    college = await db.colleges.find_one({"_id": _oid(college_id), "status": "approved"})
    if not college:
        raise HTTPException(400, "Choose a college that is registered on Campus Connect")
    return college


@router.post("/auth/send-code")
async def send_code(body: SendCodeIn):
    # people who already have an account are sent to sign in before any other check
    if await db.users.find_one({"email": body.email.strip().lower()}):
        raise HTTPException(409, "An account with this email already exists — sign in instead")
    if body.kind == "student":
        college = await _approved_college(body.college_id)
        email = check_email(body.email, domain=college.get("student_email_domain"))
    else:
        if not body.domain:
            raise HTTPException(400, "Enter your official domain first")
        email = check_email(body.email, official=True, domain=body.domain)
    if await db.users.find_one({"email": email}):
        raise HTTPException(409, "An account with this email already exists — sign in instead")
    return {"email": email, **await issue_code(email)}


# ---- platform admin: only addresses listed in ADMIN_EMAILS ----------------------------
def _admin_email(email: str) -> str:
    email = email.strip().lower()
    if not is_allowed_admin(email):
        raise HTTPException(403, "This email isn't a platform admin address")
    return email


@router.post("/auth/admin/send-code")
async def admin_send_code(body: AdminCodeIn):
    """First sign-in or a forgotten password: email a code to the approved admin address."""
    email = _admin_email(body.email)
    other = await db.users.find_one({"email": email, "role": {"$ne": "admin"}}, {"role": 1})
    if other:
        raise HTTPException(409, f"This email is already used by a {other['role']} account")
    return {"email": email, **await issue_code(email)}


@router.post("/auth/admin/setup")
async def admin_setup(body: AdminSetupIn):
    """Set (or reset) the platform admin password after proving the inbox with the emailed code."""
    email = _admin_email(body.email)
    if await db.users.find_one({"email": email, "role": {"$ne": "admin"}}):
        raise HTTPException(409, "This email is already used by another account")
    await consume_code(email, body.code)
    now = datetime.now(timezone.utc)
    existing = await db.users.find_one({"email": email})
    name = (body.name or "").strip() or (existing or {}).get("name") or "Platform Admin"
    await db.users.update_one({"email": email}, {
        "$set": {"name": name, "role": "admin", "status": "active", "email_verified": True,
                 "password_hash": hash_password(body.password), "last_login_at": now, "last_seen_at": now},
        "$setOnInsert": {"email": email, "created_at": now}}, upsert=True)
    return await _session(await db.users.find_one({"email": email}))


@router.post("/auth/register/student")
async def register_student(body: StudentSignupIn):
    college = await _approved_college(body.college_id)
    email = check_email(body.email, domain=college.get("student_email_domain"))
    if await db.users.find_one({"college_id": body.college_id, "roll_number": body.roll_number.strip().upper()}):
        raise HTTPException(409, "This roll number is already registered at your college")
    await consume_code(email, body.code)
    doc = await _insert_user({
        "name": f"{body.first_name.strip()} {body.last_name.strip()}",
        "first_name": body.first_name.strip(), "last_name": body.last_name.strip(),
        "email": email, "password_hash": hash_password(body.password), "role": "student",
        "status": "pending", "college_id": body.college_id,
        "roll_number": body.roll_number.strip().upper(), "phone": body.phone,
        "profile": {"branch": body.branch, "grad_year": body.grad_year},
        "placement": {"status": "unplaced"},
    })
    await notify(await college_staff(body.college_id), "New student sign-up",
                 f"{doc['name']} ({body.branch}, {body.roll_number.strip().upper()}) is waiting for approval.", "/students", "students")
    return await _session(doc)


@router.post("/auth/register/college")
async def register_college(body: CollegeSignupIn):
    domain = body.email_domain.lower()
    if domain not in body.website.lower():
        raise HTTPException(400, "The email domain should match your college website")
    email = check_email(body.tpo_email, official=True, domain=domain)
    if await db.colleges.find_one({"$or": [{"aishe_code": body.aishe_code.upper()}, {"email_domain": domain}]}):
        raise HTTPException(409, "This college is already registered")
    await consume_code(email, body.code)
    now = datetime.now(timezone.utc)
    college = body.model_dump(exclude={"tpo_name", "tpo_designation", "tpo_email", "tpo_phone", "code", "password"})
    college.update(aishe_code=body.aishe_code.upper(), email_domain=domain, status="pending", tier=None,
                   short="".join(w[0] for w in body.name.split() if w[0].isupper())[:5], created_at=now)
    college_id = str((await db.colleges.insert_one(college)).inserted_id)
    doc = await _insert_user({
        "name": body.tpo_name, "designation": body.tpo_designation, "email": email, "phone": body.tpo_phone,
        "password_hash": hash_password(body.password), "role": "coordinator", "status": "pending",
        "college_id": college_id,
    })
    await notify(await admins(), "New college to verify", f"{body.name}, {body.city}", "/approvals/colleges", "approval")
    return await _session(doc)


@router.post("/auth/register/company")
async def register_company(body: CompanySignupIn):
    if not body.cin and not body.gstin:
        raise HTTPException(400, "Provide your CIN or GSTIN so we can verify the company")
    domain = body.email_domain.lower()
    if domain not in body.website.lower():
        raise HTTPException(400, "The email domain should match your company website")
    email = check_email(body.hr_email, official=True, domain=domain)
    if await db.companies.find_one({"email_domain": domain}):
        raise HTTPException(409, "This company is already registered — ask your colleague to add you")
    await consume_code(email, body.code)
    company = body.model_dump(exclude={"hr_name", "hr_designation", "hr_email", "hr_phone", "code", "password"})
    company.update(email_domain=domain, status="pending", created_at=datetime.now(timezone.utc),
                   cin=(body.cin or "").upper() or None)
    company_id = str((await db.companies.insert_one(company)).inserted_id)
    doc = await _insert_user({
        "name": body.hr_name, "designation": body.hr_designation, "email": email, "phone": body.hr_phone,
        "password_hash": hash_password(body.password), "role": "recruiter", "status": "pending",
        "company_id": company_id, "company": body.name,
    })
    await notify(await admins(), "New company to verify", f"{body.name}, {body.hq_city}", "/approvals/companies", "approval")
    return await _session(doc)


@router.post("/auth/login")
async def login(body: LoginIn):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Incorrect email or password")
    if body.role == "admin" and user.get("role") != "admin":
        raise HTTPException(403, "This isn't a platform admin account. Use the regular sign-in.")
    if user.get("role") == "admin" and not is_allowed_admin(user["email"]):
        raise HTTPException(403, "Platform admin access is limited to approved addresses")
    now = datetime.now(timezone.utc)
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"last_login_at": now, "last_seen_at": now},
                                                      "$inc": {"login_count": 1}})
    return await _session(user)


@router.get("/auth/me")
async def me(user: dict = Depends(current_user)):
    # the app calls this on every visit, so it doubles as "last active"
    await db.users.update_one({"_id": ObjectId(user["id"])}, {"$set": {"last_seen_at": datetime.now(timezone.utc)}})
    return await with_org(user)


@router.get("/stats")
async def public_stats():
    """Live numbers for the homepage."""
    return {
        "colleges": await db.colleges.count_documents({"status": "approved"}),
        "companies": await db.companies.count_documents({"status": "approved"}),
        "students": await db.users.count_documents({"role": "student", "status": "active"}),
        "experiences": await db.experiences.count_documents({}),
        "college_names": [c["name"] async for c in db.colleges.find({"status": "approved"}, {"name": 1}).limit(12)],
        "company_names": [c["name"] async for c in db.companies.find({"status": "approved"}, {"name": 1}).limit(12)],
    }
