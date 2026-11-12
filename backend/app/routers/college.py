"""Placement cell: decides which students may join, and connects with companies."""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from ..auth import require_role
from ..db import db, serialize
from ..schemas import ConnectIn, DecisionIn, MessageIn
from ..workflow import CONNECTION_STATUS, college_staff, company_staff, log_update, notify, now
from .drives import oid

router = APIRouter(prefix="/api", tags=["college", "connections"])
coordinator = require_role("coordinator")
org_member = require_role("coordinator", "recruiter")

STUDENT_FIELDS = {"password_hash": 0, "resume": 0}


@router.get("/college/students")
async def college_students(status: str = "pending", user: dict = Depends(coordinator)):
    cur = db.users.find({"role": "student", "college_id": user["college_id"], "status": status}, STUDENT_FIELDS)
    return [serialize(s) async for s in cur.sort("created_at", -1)]


@router.post("/college/students/{student_id}/decision")
async def decide_student(student_id: str, body: DecisionIn, user: dict = Depends(coordinator)):
    student = await db.users.find_one({"_id": oid(student_id), "role": "student", "college_id": user["college_id"]})
    if not student:
        raise HTTPException(404, "Student not found at your college")
    status = "active" if body.decision == "approve" else "rejected"
    await db.users.update_one({"_id": student["_id"]}, {"$set": {
        "status": status, "reviewed_at": datetime.now(timezone.utc), "review_note": body.note}})
    return {"id": student_id, "status": status}


# ---- connections between colleges and companies ---------------------------

def _side(user: dict):
    return ("college_id", user["college_id"]) if user["role"] == "coordinator" else ("company_id", user["company_id"])


async def _connections_for(user: dict) -> dict:
    field, mine = _side(user)
    return {c["company_id" if field == "college_id" else "college_id"]: c
            async for c in db.connections.find({field: mine})}


@router.get("/directory/companies")
async def company_directory(user: dict = Depends(coordinator)):
    conns = await _connections_for(user)
    drives = {}
    async for row in db.drives.aggregate([{"$group": {"_id": "$company", "n": {"$sum": 1}}}]):
        drives[row["_id"]] = row["n"]
    out = []
    async for c in db.companies.find({"status": "approved"}).sort("name", 1):
        item = serialize(c)
        conn = conns.get(item["id"])
        item["connection"] = {"id": str(conn["_id"]), "status": conn["status"], "requested_by": conn["requested_by"]} if conn else None
        item["drives_posted"] = drives.get(c["name"], 0)
        out.append(item)
    return out


@router.get("/directory/colleges")
async def college_directory(user: dict = Depends(require_role("recruiter"))):
    conns = await _connections_for(user)
    students = {}
    async for row in db.users.aggregate([{"$match": {"role": "student", "status": "active"}},
                                         {"$group": {"_id": "$college_id", "n": {"$sum": 1}}}]):
        students[row["_id"]] = row["n"]
    out = []
    async for c in db.colleges.find({"status": "approved"}).sort([("tier", 1), ("name", 1)]):
        item = serialize(c)
        conn = conns.get(item["id"])
        item["connection"] = {"id": str(conn["_id"]), "status": conn["status"], "requested_by": conn["requested_by"]} if conn else None
        item["students"] = students.get(item["id"], 0)
        out.append(item)
    return out


@router.post("/connections")
async def request_connection(body: ConnectIn, user: dict = Depends(org_member)):
    if user["role"] == "coordinator":
        if not body.company_id or not await db.companies.find_one({"_id": oid(body.company_id), "status": "approved"}):
            raise HTTPException(400, "Choose an approved company")
        key = {"college_id": user["college_id"], "company_id": body.company_id}
        by = "college"
    else:
        if not body.college_id or not await db.colleges.find_one({"_id": oid(body.college_id), "status": "approved"}):
            raise HTTPException(400, "Choose an approved college")
        key = {"college_id": body.college_id, "company_id": user["company_id"]}
        by = "company"
    existing = await db.connections.find_one(key)
    if existing and existing["status"] in ("pending", "accepted"):
        raise HTTPException(409, "Already connected" if existing["status"] == "accepted" else "Request already pending")
    doc = {**key, "status": "pending", "requested_by": by, "requested_by_user": user["id"],
           "message": body.message, "created_at": datetime.now(timezone.utc)}
    if existing:
        await db.connections.replace_one({"_id": existing["_id"]}, doc)
        doc["_id"] = existing["_id"]
    else:
        doc["_id"] = (await db.connections.insert_one(doc)).inserted_id
    me = await _org_name(user)
    receivers = await (company_staff(key["company_id"]) if by == "college" else college_staff(key["college_id"]))
    await notify(receivers, "New connection request", f"{me} wants to connect" + (f": “{body.message}”" if body.message else ""),
                 "/connect", "connection")
    await log_update(entity="connection", entity_id=str(doc["_id"]), college_id=key["college_id"], company_id=key["company_id"],
                     action="requested", summary=f"Connection requested by {me}", by=user)
    return serialize(doc)


async def _org_name(user: dict) -> str:
    if user["role"] == "coordinator":
        c = await db.colleges.find_one({"_id": ObjectId(user["college_id"])}, {"name": 1})
    else:
        c = await db.companies.find_one({"_id": ObjectId(user["company_id"])}, {"name": 1})
    return c["name"] if c else "Someone"


async def _other_side(conn: dict, user: dict):
    return await (company_staff(conn["company_id"]) if user["role"] == "coordinator" else college_staff(conn["college_id"]))


@router.post("/connections/{conn_id}/decision")
async def respond_connection(conn_id: str, body: DecisionIn, user: dict = Depends(org_member)):
    conn = await db.connections.find_one({"_id": oid(conn_id)})
    field, mine = _side(user)
    if not conn or conn[field] != mine:
        raise HTTPException(404, "Request not found")
    if conn["status"] != "pending":
        raise HTTPException(400, f"Request is already {conn['status']}")
    if conn["requested_by"] == ("college" if user["role"] == "coordinator" else "company"):
        raise HTTPException(400, "Waiting for the other side to respond")
    status = "accepted" if body.decision == "approve" else "declined"
    await db.connections.update_one({"_id": conn["_id"]}, {"$set": {"status": status, "responded_at": datetime.now(timezone.utc),
                                                                    "response_note": body.note}})
    me = await _org_name(user)
    await notify(await _other_side(conn, user), f"Connection {status}", f"{me} {status} your request." +
                 (" You can now coordinate drives." if status == "accepted" else ""), "/connect", "connection")
    await log_update(entity="connection", entity_id=conn_id, college_id=conn["college_id"], company_id=conn["company_id"],
                     action=status, summary=f"Connection {status} by {me}", by=user)
    return {"id": conn_id, "status": status}


@router.post("/connections/{conn_id}/cancel")
async def cancel_connection(conn_id: str, user: dict = Depends(org_member)):
    """The requester withdraws a pending request (or either side ends an active connection)."""
    conn = await db.connections.find_one({"_id": oid(conn_id)})
    field, mine = _side(user)
    if not conn or conn[field] != mine:
        raise HTTPException(404, "Connection not found")
    mine_side = "college" if user["role"] == "coordinator" else "company"
    if conn["status"] == "pending" and conn["requested_by"] != mine_side:
        raise HTTPException(400, "Decline the request instead")
    if conn["status"] not in ("pending", "accepted"):
        raise HTTPException(400, f"Connection is already {conn['status']}")
    await db.connections.update_one({"_id": conn["_id"]}, {"$set": {"status": "cancelled", "cancelled_at": now(),
                                                                    "cancelled_by": mine_side}})
    me = await _org_name(user)
    await notify(await _other_side(conn, user), "Connection cancelled", f"{me} cancelled the connection.", "/connect", "connection")
    await log_update(entity="connection", entity_id=conn_id, college_id=conn["college_id"], company_id=conn["company_id"],
                     action="cancelled", summary=f"Connection cancelled by {me}", by=user)
    return {"id": conn_id, "status": "cancelled"}


# ---- shared communication (also the college's company communication log) -------------
@router.get("/connections/{conn_id}/messages")
async def messages(conn_id: str, user: dict = Depends(org_member)):
    conn = await db.connections.find_one({"_id": oid(conn_id)})
    field, mine = _side(user)
    if not conn or conn[field] != mine:
        raise HTTPException(404, "Connection not found")
    rows = await db.messages.find({"connection_id": conn_id}).sort("at", 1).to_list(500)
    me_side = "college" if user["role"] == "coordinator" else "company"
    await db.messages.update_many({"connection_id": conn_id, "from_side": {"$ne": me_side}}, {"$set": {"read_" + me_side: True}})
    return [{**serialize(m), "mine": m["from_side"] == me_side} for m in rows]


@router.post("/connections/{conn_id}/messages")
async def send_message(conn_id: str, body: MessageIn, user: dict = Depends(org_member)):
    conn = await db.connections.find_one({"_id": oid(conn_id)})
    field, mine = _side(user)
    if not conn or conn[field] != mine:
        raise HTTPException(404, "Connection not found")
    if conn["status"] not in ("pending", "accepted"):
        raise HTTPException(400, "This connection isn't active")
    if conn["status"] == "pending" and body.kind not in ("info_request", "message"):
        raise HTTPException(400, "Only questions can be sent before the request is accepted")
    side = "college" if user["role"] == "coordinator" else "company"
    drive_label = None
    if body.drive_id:
        d = await db.drives.find_one({"_id": oid(body.drive_id), "college_id": conn["college_id"]})
        drive_label = f"{d['company']} · {d['role']}" if d else None
    doc = {"connection_id": conn_id, "college_id": conn["college_id"], "company_id": conn["company_id"],
           "from_side": side, "by_id": user["id"], "by_name": user["name"], "text": body.text, "kind": body.kind,
           "drive_id": body.drive_id, "drive_label": drive_label, "at": now()}
    doc["_id"] = (await db.messages.insert_one(doc)).inserted_id
    if body.kind == "info_request":
        await db.connections.update_one({"_id": conn["_id"]}, {"$set": {"info_requested": True}})
    me = await _org_name(user)
    kind = {"info_request": "asked for more information", "date_confirmation": "sent a date confirmation",
            "document_request": "requested a document"}.get(body.kind, "sent a message")
    await notify(await _other_side(conn, user), f"{me} {kind}", body.text[:140], f"/connect?thread={conn_id}", "message")
    return {**serialize(doc), "mine": True}


@router.get("/connections")
async def my_connections(user: dict = Depends(org_member)):
    field, mine = _side(user)
    other_coll, other_field = ("companies", "company_id") if field == "college_id" else ("colleges", "college_id")
    conns = await db.connections.find({field: mine}).sort("created_at", -1).to_list(None)
    others = {str(o["_id"]): o async for o in db[other_coll].find({"_id": {"$in": [ObjectId(c[other_field]) for c in conns]}})}
    me_side = "college" if field == "college_id" else "company"
    unread = {}
    async for row in db.messages.aggregate([{"$match": {field: mine, "from_side": {"$ne": me_side}, "read_" + me_side: {"$ne": True}}},
                                            {"$group": {"_id": "$connection_id", "n": {"$sum": 1}}}]):
        unread[row["_id"]] = row["n"]
    from .org import contacts_of
    other_kind = "company" if me_side == "college" else "college"
    out = []
    for c in conns:
        incoming = c["requested_by"] != me_side
        # a request carries the requester's contact; both sides see each other once accepted
        share = c["status"] == "accepted" or (c["status"] == "pending" and incoming)
        out.append({**serialize(c), "other": serialize(others[c[other_field]]) if c[other_field] in others else None,
                    "incoming": incoming, "status_label": CONNECTION_STATUS.get(c["status"], c["status"]),
                    "unread": unread.get(str(c["_id"]), 0),
                    "contacts": await contacts_of(other_kind, c[other_field]) if share else None})
    return out
