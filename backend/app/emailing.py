"""Email validation and one-time verification codes.

Every account is created only after the person proves they own the address:
  1. the address must be well-formed and its domain must accept mail (DNS check),
  2. disposable inboxes are rejected,
  3. a 6-digit code is emailed and must be entered within 10 minutes.

Without SMTP settings (local development) the code is logged and returned to
the UI so the flow can be tested; set SMTP_HOST to send real email.
"""
import hashlib
import logging
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from email_validator import EmailNotValidError, validate_email
from fastapi import HTTPException

from .config import (CHECK_EMAIL_DELIVERABILITY, EMAIL_DEV_MODE, SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT,
                     SMTP_USER)
from .db import db

log = logging.getLogger(__name__)
CODE_TTL = timedelta(minutes=10)
MAX_ATTEMPTS = 5

FREE_PROVIDERS = {"gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.in", "outlook.com", "hotmail.com",
                  "live.com", "rediffmail.com", "icloud.com", "proton.me", "protonmail.com", "aol.com", "zoho.com"}
DISPOSABLE = {"mailinator.com", "10minutemail.com", "guerrillamail.com", "tempmail.com", "temp-mail.org",
              "yopmail.com", "trashmail.com", "getnada.com", "sharklasers.com", "dispostable.com", "maildrop.cc"}


def domain_of(email: str) -> str:
    return email.rsplit("@", 1)[-1].lower()


def check_email(email: str, *, official: bool = False, domain: str = None) -> str:
    """Validate and normalise an address. `official` rejects free webmail;
    `domain` requires the address to be on that domain (or a subdomain)."""
    try:
        info = validate_email(email, check_deliverability=CHECK_EMAIL_DELIVERABILITY)
    except EmailNotValidError as exc:
        raise HTTPException(400, f"Email address is not valid: {exc}")
    addr = info.normalized.lower()
    dom = domain_of(addr)
    if dom in DISPOSABLE:
        raise HTTPException(400, "Disposable email addresses are not allowed")
    if official and dom in FREE_PROVIDERS:
        raise HTTPException(400, "Use your official email address, not a personal webmail account")
    if domain:
        domain = domain.lower().lstrip("@")
        if not (dom == domain or dom.endswith("." + domain)):
            raise HTTPException(400, f"Use your @{domain} email address")
    return addr


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _send(to: str, code: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = f"{code} is your Campus Connect verification code"
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg.set_content(f"Your Campus Connect verification code is {code}.\n\nIt expires in 10 minutes. "
                    "If you didn't request it, you can ignore this email.")
    with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as s:
        s.starttls()
        if SMTP_USER:
            s.login(SMTP_USER, SMTP_PASSWORD)
        s.send_message(msg)


async def issue_code(email: str) -> dict:
    recent = await db.email_codes.find_one({"email": email})
    now = datetime.now(timezone.utc)
    if recent and recent["created_at"].replace(tzinfo=timezone.utc) > now - timedelta(seconds=45):
        raise HTTPException(429, "Please wait a few seconds before requesting another code")
    code = f"{secrets.randbelow(10**6):06d}"
    await db.email_codes.replace_one(
        {"email": email},
        {"email": email, "hash": _hash(code), "created_at": now, "expires_at": now + CODE_TTL, "attempts": 0},
        upsert=True,
    )
    if EMAIL_DEV_MODE:
        log.warning("DEV MODE — verification code for %s: %s", email, code)
        return {"sent": True, "dev_code": code}
    try:
        _send(email, code)
    except Exception as exc:
        log.error("Could not send verification email: %s", exc)
        raise HTTPException(502, "Could not send the verification email. Try again shortly.")
    return {"sent": True}


async def consume_code(email: str, code: str) -> None:
    rec = await db.email_codes.find_one({"email": email})
    if not rec:
        raise HTTPException(400, "Request a verification code first")
    if rec["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(400, "The verification code has expired — request a new one")
    if rec["attempts"] >= MAX_ATTEMPTS:
        raise HTTPException(400, "Too many attempts — request a new code")
    if not secrets.compare_digest(rec["hash"], _hash((code or "").strip())):
        await db.email_codes.update_one({"_id": rec["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "Incorrect verification code")
    await db.email_codes.delete_one({"_id": rec["_id"]})
