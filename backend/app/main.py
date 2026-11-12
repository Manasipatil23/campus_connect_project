import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import CORS_ORIGINS
from .db import db, ensure_indexes
from .ml.health import model
from .routers import admin, analytics, auth, college, drives, experiences, hub, org, students

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("campus_connect")


async def train_model() -> None:
    rows = await db.history.find({}, {"_id": 0}).to_list(None)
    if len({r["placed"] for r in rows}) < 2:
        log.warning("No past placement outcomes yet - placement health shows 'not enough data' until there are some")
        return
    model.fit(rows)
    log.info("Placement model trained on %d past students (train acc %.3f)", model.trained_on, model.accuracy)


@asynccontextmanager
async def lifespan(_: FastAPI):
    await ensure_indexes()
    await train_model()
    yield


app = FastAPI(title="Campus Connect API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (auth, students, drives, analytics, admin, college, experiences, hub, org):
    app.include_router(r.router)


@app.get("/api/health")
async def health():
    """Backend is up; also reports the MongoDB connection and what's stored."""
    from .config import DB_NAME
    try:
        info = await db.client.server_info()
        mongo = {"connected": True, "version": info.get("version"), "database": DB_NAME,
                 "collections": {n: await db[n].estimated_document_count() for n in sorted(await db.list_collection_names())}}
    except Exception as exc:  # pragma: no cover
        mongo = {"connected": False, "error": str(exc)}
    return {"ok": mongo["connected"], "mongodb": mongo, "model_trained_on": model.trained_on}
