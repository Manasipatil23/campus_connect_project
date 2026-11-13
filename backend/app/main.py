import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pymongo.errors import ConnectionFailure as PyMongoConnectionError

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
    from .config import ALLOW_PERSONAL_EMAIL
    if ALLOW_PERSONAL_EMAIL:
        log.warning("ALLOW_PERSONAL_EMAIL is on: Gmail and other personal addresses can register colleges and companies. Testing only.")
    try:
        await ensure_indexes()
        await train_model()
    except PyMongoConnectionError as exc:
        # start anyway: requests get a clear "can't reach the database" until it's reachable
        log.error("Database unreachable at startup (is this IP allowed in Atlas Network Access?): %s", str(exc)[:160])
    yield


app = FastAPI(title="Campus Connect API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(PyMongoConnectionError)
async def database_unreachable(_, exc):
    """The database can't be reached (e.g. Atlas hasn't allowed this IP): say so instead of a bare 500."""
    log.error("Database unreachable: %s", str(exc)[:200])
    return JSONResponse(status_code=503, content={"detail": "Can't reach the database right now. Please try again in a minute."})


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
