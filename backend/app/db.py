import certifi
from motor.motor_asyncio import AsyncIOMotorClient

from .config import DB_NAME, MONGO_URL


def client_options(url: str) -> dict:
    """Atlas (mongodb+srv://) needs TLS; use certifi's certificates so it works on any Python install."""
    return {"tlsCAFile": certifi.where()} if url.startswith("mongodb+srv://") or "tls=true" in url else {}


client = AsyncIOMotorClient(MONGO_URL, serverSelectionTimeoutMS=10000, **client_options(MONGO_URL))
db = client[DB_NAME]


async def ensure_indexes() -> None:
    await db.users.create_index("email", unique=True)
    await db.applications.create_index([("student_id", 1), ("drive_id", 1)], unique=True)
    await db.applications.create_index("drive_id")
    await db.drives.create_index("recruiter_id")
    await db.connections.create_index([("college_id", 1), ("company_id", 1)], unique=True)
    await db.experiences.create_index([("company", 1), ("created_at", -1)])
    await db.email_codes.create_index("email", unique=True)
    await db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await db.updates.create_index([("drive_id", 1), ("at", -1)])
    await db.change_requests.create_index([("college_id", 1), ("status", 1)])
    await db.change_requests.create_index("drive_id")
    await db.messages.create_index([("connection_id", 1), ("at", 1)])
    await db.issues.create_index([("college_id", 1), ("updated_at", -1)])
    await db.approvals.create_index([("decided_at", -1)])
    await db.approvals.create_index([("kind", 1), ("target_id", 1)])
    await db.announcements.create_index([("recipient_ids", 1), ("created_at", -1)])


def serialize(doc: dict) -> dict:
    """Mongo document -> JSON-friendly dict (ObjectId -> str id)."""
    if doc is None:
        return doc
    out = {k: v for k, v in doc.items() if k not in ("_id", "password_hash", "hash")}
    out["id"] = str(doc["_id"])
    return out
