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
SMTP_FROM = os.getenv("SMTP_FROM", "Campus Connect <no-reply@campusconnect.dev>")
EMAIL_DEV_MODE = not SMTP_HOST
# Reject email domains that have no mail server (DNS MX/A lookup)
CHECK_EMAIL_DELIVERABILITY = os.getenv("CHECK_EMAIL_DELIVERABILITY", "true").lower() == "true"
