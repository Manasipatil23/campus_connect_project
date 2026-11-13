import os

from dotenv import load_dotenv

load_dotenv()

MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.getenv("DB_NAME", "campus_connect")
JWT_SECRET = os.getenv("JWT_SECRET", "dev-only-change-me")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "720"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

# The LLM resume review is optional: without credentials the app falls back
# to rule-based feedback so everything still works offline.
LLM_MODEL = os.getenv("LLM_MODEL", "claude-opus-5-5")
LLM_ENABLED = os.getenv("LLM_ENABLED", "auto")  # auto | on | off

# Email verification codes. Without SMTP settings the app runs in dev mode:
# codes are printed to the server log and returned to the UI so you can test.
SMTP_HOST = os.getenv("SMTP_HOST", "")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
# most providers (Gmail included) only send "From" the account you log in with
SMTP_FROM = os.getenv("SMTP_FROM") or (f"Campus Connect <{SMTP_USER}>" if SMTP_USER else "Campus Connect <no-reply@campusconnect.dev>")
EMAIL_DEV_MODE = not SMTP_HOST
# Reject email domains that have no mail server (DNS MX/A lookup)
CHECK_EMAIL_DELIVERABILITY = os.getenv("CHECK_EMAIL_DELIVERABILITY", "true").lower() == "true"

# TESTING ONLY: accept personal addresses (Gmail, Outlook, ...) for college, company and student
# sign-ups instead of requiring an official/work domain. Turn it off before real users sign up.
ALLOW_PERSONAL_EMAIL = os.getenv("ALLOW_PERSONAL_EMAIL", "false").lower() == "true"

# Where the website lives; used for links in emails (sign-in, copy-code)
APP_URL = os.getenv("APP_URL", "http://localhost:5173").rstrip("/")

# Who may be platform admin (comma-separated). Kept in .env so the address isn't in the code.
# Any admin account whose email isn't listed here is refused everywhere.
ADMIN_EMAILS = {e.strip().lower() for e in os.getenv("ADMIN_EMAILS", "").split(",") if e.strip()}
