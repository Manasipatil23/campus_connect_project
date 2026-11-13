from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from bson import ObjectId
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import JWT_EXPIRE_MINUTES, JWT_SECRET
from .db import db, serialize

ROLES = ("student", "recruiter", "coordinator", "admin")  # admin = platform admin (approvals, not built yet)
_bearer = HTTPBearer(auto_error=False)


def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()


def verify_password(pw: str, hashed: str) -> bool:
    return bcrypt.checkpw(pw.encode(), hashed.encode())


def create_token(user_id: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def current_user(creds: HTTPAuthorizationCredentials = Depends(_bearer)) -> dict:
    if creds is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found")
    return serialize(user)


def is_allowed_admin(email) -> bool:
    from .config import ADMIN_EMAILS
    return bool(email) and email.lower() in ADMIN_EMAILS


# What a junior-batch student (graduating after this season's batch) may use: reading interview
# experiences, their own profile and name, notifications and sign-in. Nothing about drives, rounds,
# results or notices until their own placement season starts.
JUNIOR_ALLOWED = [("GET", "/api/experiences"), ("PUT", "/api/students/me/profile"), ("PUT", "/api/students/me/name"),
                  ("ANY", "/api/notifications"), ("GET", "/api/grad-years")]


def is_junior(user: dict) -> bool:
    from .schemas import season_batch
    year = (user.get("profile") or {}).get("grad_year")
    return user.get("role") == "student" and bool(year) and year > season_batch()


def junior_may(method: str, path: str) -> bool:
    if method == "POST" and path.startswith("/api/experiences/") and path.rsplit("/", 1)[-1] in ("helpful", "report"):
        return True   # reacting to what they read is fine; posting their own experience isn't
    for m, prefix in JUNIOR_ALLOWED:
        if (m == "ANY" or m == method) and (path == prefix or path.startswith(prefix + "/") or path.startswith(prefix + "?")):
            return True
    return False


async def active_user(request: Request, user: dict = Depends(current_user)) -> dict:
    """Signed-in users whose account has been approved.

    Students are approved by their college's placement cell; coordinators and
    recruiters are approved when the platform admin approves their college or
    company. Pending users can still call /auth/me to see their status.
    """
    if user.get("role") == "admin" and not is_allowed_admin(user.get("email")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Platform admin access is limited to approved addresses")
    if user.get("status", "active") == "suspended":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your placement cell has put your account on hold")
    if user.get("status", "active") != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your account is awaiting approval")
    if is_junior(user) and not junior_may(request.method, request.url.path):
        from .schemas import season_batch
        raise HTTPException(status.HTTP_403_FORBIDDEN,
                            f"This season's placements are for the {season_batch()} batch. Until yours starts, you can read interview experiences.")
    return user


def require_role(*roles: str):
    async def checker(user: dict = Depends(active_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return user

    return checker
