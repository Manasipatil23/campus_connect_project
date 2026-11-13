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
from pathlib import Path
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage

from email_validator import EmailNotValidError, validate_email
from fastapi import HTTPException

from .config import (ALLOW_PERSONAL_EMAIL, CHECK_EMAIL_DELIVERABILITY, EMAIL_DEV_MODE, SMTP_FROM, SMTP_HOST, SMTP_PASSWORD, SMTP_PORT,
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
    if ALLOW_PERSONAL_EMAIL and dom in FREE_PROVIDERS:
        return addr  # testing switch: personal addresses skip the official/work-domain rules
    if official and dom in FREE_PROVIDERS:
        raise HTTPException(400, "Use your official email address, not a personal webmail account")
    if domain:
        domain = domain.lower().lstrip("@")
        if not (dom == domain or dom.endswith("." + domain)):
            raise HTTPException(400, f"Use your @{domain} email address")
    return addr


def _hash(code: str) -> str:
    return hashlib.sha256(code.encode()).hexdigest()


def _smtp():
    """Port 465 uses SSL from the start; other ports (usually 587) upgrade with STARTTLS."""
    if SMTP_PORT == 465:
        s = smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=15)
    else:
        s = smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15)
        s.starttls()
    if SMTP_USER:
        s.login(SMTP_USER, SMTP_PASSWORD)
    return s


def _deliver(to: str, subject: str, text: str, html: str = None, reply_to: str = None) -> None:
    msg = EmailMessage()
    msg["Subject"], msg["From"], msg["To"] = subject, SMTP_FROM, to
    if reply_to:
        msg["Reply-To"] = reply_to
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
        from .email_templates import LOGO_CID
        if f"cid:{LOGO_CID}" in html:
            # the logo travels inside the email, so it shows without loading remote images
            logo = (Path(__file__).parent / "assets" / "logo-email.png").read_bytes()
            msg.get_payload()[1].add_related(logo, maintype="image", subtype="png", cid=f"<{LOGO_CID}>",
                                             filename="campus-connect.png")
    with _smtp() as s:
        refused = s.send_message(msg)
    if refused:  # the mail server turned the address down straight away
        raise smtplib.SMTPRecipientsRefused(refused)
    log.info("Email accepted by the mail server for %s: %s", to, subject)


def _send(to: str, code: str) -> None:
    from .email_templates import verification_code
    subject, text, html = verification_code(code, int(CODE_TTL.total_seconds() // 60), to)
    _deliver(to, subject, text, html)


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
    from fastapi.concurrency import run_in_threadpool
    try:
        # sending takes a few seconds: do it off the event loop so the rest of the site stays responsive
        await run_in_threadpool(_send, email, code)
    except smtplib.SMTPRecipientsRefused:
        await db.email_codes.delete_one({"email": email})
        log.error("Verification email refused for %s", email)
        raise HTTPException(400, "The mail server refused this address. Check it's spelled correctly.")
    except Exception as exc:
        await db.email_codes.delete_one({"email": email})  # so "Resend" isn't blocked by the 45-second wait
        log.error("Could not send verification email: %s", exc)
        raise HTTPException(502, "Could not send the verification email. Try again shortly.")
    return {"sent": True}


async def consume_code(email: str, code: str) -> None:
    rec = await db.email_codes.find_one({"email": email})
    if not rec:
        raise HTTPException(400, "Your verification code has expired or was replaced. Send a new code and enter it.")
    if rec["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(400, "Your verification code has expired. Send a new code and enter it.")
    if rec["attempts"] >= MAX_ATTEMPTS:
        raise HTTPException(400, "Too many wrong attempts. Send a new code and enter it.")
    if not secrets.compare_digest(rec["hash"], _hash((code or "").strip())):
        await db.email_codes.update_one({"_id": rec["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(400, "That verification code is wrong. Check the latest email, or send a new code.")
    await db.email_codes.delete_one({"_id": rec["_id"]})


def _send_message(to: str, subject: str, body: str, reply_to: str = None, html: str = None) -> None:
    _deliver(to, subject, body, html, reply_to)


def send_bulk(recipients: list, subject: str, text: str, html: str = None, reply_to: str = None, batch: int = 50) -> dict:
    """One message to many people over a single connection. Recipients go in Bcc (batches of 50),
    so nobody sees anyone else's address. Returns {"sent": n, "failed": n} (or "logged" in dev mode)."""
    recipients = sorted({r for r in recipients if r})
    if not recipients:
        return {"sent": 0, "failed": 0}
    if EMAIL_DEV_MODE:
        log.warning("DEV MODE — email to %d people: %s", len(recipients), subject)
        return {"logged": len(recipients)}
    sent = failed = 0
    try:
        with _smtp() as s:
            for i in range(0, len(recipients), batch):
                group = recipients[i:i + batch]
                msg = EmailMessage()
                msg["Subject"], msg["From"], msg["To"], msg["Bcc"] = subject, SMTP_FROM, SMTP_FROM, ", ".join(group)
                if reply_to:
                    msg["Reply-To"] = reply_to
                msg.set_content(text)
                if html:
                    msg.add_alternative(html, subtype="html")
                    from .email_templates import LOGO_CID
                    if f"cid:{LOGO_CID}" in html:
                        logo = (Path(__file__).parent / "assets" / "logo-email.png").read_bytes()
                        msg.get_payload()[1].add_related(logo, maintype="image", subtype="png", cid=f"<{LOGO_CID}>",
                                                         filename="campus-connect.png")
                try:
                    s.send_message(msg)
                    sent += len(group)
                except Exception as exc:  # pragma: no cover - depends on the mail server
                    log.error("Could not send a batch of %d emails: %s", len(group), exc)
                    failed += len(group)
    except Exception as exc:  # pragma: no cover
        log.error("Could not connect to the mail server: %s", exc)
        failed = len(recipients) - sent
    return {"sent": sent, "failed": failed}


def send_email(to: str, subject: str, body: str, reply_to: str = None, html: str = None) -> str:
    """Returns "sent", "logged" (dev mode: no SMTP configured) or "failed"."""
    if EMAIL_DEV_MODE:
        log.warning("DEV MODE — email to %s: %s", to, subject)
        return "logged"
    try:
        _send_message(to, subject, body, reply_to, html)
        return "sent"
    except Exception as exc:  # pragma: no cover - depends on the mail server
        log.error("Could not send email to %s: %s", to, exc)
        return "failed"
