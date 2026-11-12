from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
from bson import ObjectId
from fastapi import Depends, HTTPException, status
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


async def active_user(user: dict = Depends(current_user)) -> dict:
    """Signed-in users whose account has been approved.

    Students are approved by their college's placement cell; coordinators and
    recruiters are approved when the platform admin approves their college or
    company. Pending users can still call /auth/me to see their status.
    """
    if user.get("status", "active") == "suspended":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your placement cell has put your account on hold")
    if user.get("status", "active") != "active":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Your account is awaiting approval")
    return user


def require_role(*roles: str):
    async def checker(user: dict = Depends(active_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Insufficient role")
        return user

    return checker
