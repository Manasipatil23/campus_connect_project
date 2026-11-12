"""Interview & assessment experiences shared by students for everyone's benefit.

A post linked to one of the author's own applications is marked *verified*
(they really reached that round). Posts are anonymous by default; otherwise only
the author's first name and college are shown.
"""
from collections import Counter
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException

from ..auth import require_role
from ..db import db, serialize
from ..ml.insights import reached
from ..schemas import ExperienceIn, ModerateIn
from ..workflow import college_staff, notify, now
from .drives import oid

router = APIRouter(prefix="/api/experiences", tags=["experiences"])
student = require_role("student")

# which stage proves the student actually sat this round
ROUND_PROOF = {
    "Online assessment": "shortlisted", "Coding round": "shortlisted", "Group discussion": "shortlisted",
    "Technical interview": "assessment_cleared", "HR interview": "assessment_cleared", "Other": "shortlisted",
}


def _public(e: dict, colleges: dict, me: str) -> dict:
    item = serialize(e)
    item["college"] = colleges.get(e.get("college_id"))
    item["author"] = None if e.get("anonymous") else e.get("author_first_name")
    item["helpful"] = len(e.get("helpful_by", []))
    item["marked_helpful"] = me in e.get("helpful_by", [])
    item["mine"] = e.get("author_id") == me
    item["moderation"] = e.get("moderation") or "approved"
    for k in ("author_id", "helpful_by", "author_first_name", "reports", "moderation_note", "moderated_by"):
        item.pop(k, None)
    return item


async def _college_names() -> dict:
    return {str(c["_id"]): c.get("short") or c["name"] async for c in db.colleges.find({}, {"short": 1, "name": 1})}


@router.post("")
async def share(body: ExperienceIn, user: dict = Depends(student)):
    verified, drive_id = False, None
    if body.drive_id:
        drive = await db.drives.find_one({"_id": oid(body.drive_id)})
        app = await db.applications.find_one({"drive_id": body.drive_id, "student_id": user["id"]})
        if not drive or not app:
            raise HTTPException(400, "You can only link experiences to drives you applied to")
        if not reached(app, ROUND_PROOF[body.round_type]) and app.get("rejected_round") not in ("assessment", "interview"):
            raise HTTPException(400, "Your application didn't reach this round")
        company, role, verified, drive_id = drive["company"], drive["role"], True, body.drive_id
    else:
        if not body.company or not body.role:
            raise HTTPException(400, "Enter the company and role")
        company, role = body.company.strip(), body.role.strip()
    questions = [q.strip() for q in body.questions if q.strip()]
    if not questions and not (body.tips or "").strip():
        raise HTTPException(400, "Add at least one question or a tip so it helps others")
    doc = {
        **body.model_dump(exclude={"drive_id", "company", "role"}),
        "questions": questions, "topics": sorted({t.strip().lower() for t in body.topics if t.strip()}),
        "company": company, "role": role, "drive_id": drive_id, "verified": verified,
        "college_id": user.get("college_id"), "author_id": user["id"],
        "author_first_name": user.get("first_name") or user["name"].split()[0],
        "helpful_by": [], "created_at": datetime.now(timezone.utc),
        # moderated by the placement cell before anyone else can see it
        "moderation": "pending", "reports": [],
    }
    doc["_id"] = (await db.experiences.insert_one(doc)).inserted_id
    await notify(await college_staff(user.get("college_id")), "Experience to moderate",
                 f"{company} · {role} · {body.round_type}", "/inbox?tab=moderation", "moderation")
    return _public(doc, await _college_names(), user["id"])


@router.get("")
async def browse(company: Optional[str] = None, round_type: Optional[str] = None, q: Optional[str] = None,
                 user: dict = Depends(student)):
    # approved posts only, plus your own (so you can see its moderation status)
    query = {"$and": [{"$or": [{"moderation": {"$in": ["approved", None]}}, {"author_id": user["id"]}]}]}
    if company:
        query["company"] = company
    if round_type:
        query["round_type"] = round_type
    if q:
        query["$and"].append({"$or": [{"questions": {"$regex": q, "$options": "i"}}, {"topics": q.lower()},
                        {"role": {"$regex": q, "$options": "i"}}, {"company": {"$regex": q, "$options": "i"}}]})
    names = await _college_names()
    rows = await db.experiences.find(query).sort("created_at", -1).to_list(200)
    return [_public(e, names, user["id"]) for e in rows]


@router.get("/companies")
async def by_company(user: dict = Depends(student)):
    """One card per company: how many experiences, typical difficulty and the most-asked topics."""
    groups = {}
    async for e in db.experiences.find({"moderation": {"$in": ["approved", None]}}, {"company": 1, "difficulty": 1, "topics": 1, "round_type": 1}):
        g = groups.setdefault(e["company"], {"count": 0, "difficulty": [], "topics": Counter(), "rounds": Counter()})
        g["count"] += 1
        g["difficulty"].append(e["difficulty"])
        g["topics"].update(e.get("topics", []))
        g["rounds"][e["round_type"]] += 1
    return sorted(
        ({"company": c, "count": g["count"], "avg_difficulty": round(sum(g["difficulty"]) / len(g["difficulty"]), 1),
          "top_topics": [t for t, _ in g["topics"].most_common(5)], "rounds": dict(g["rounds"])}
         for c, g in groups.items()),
        key=lambda x: -x["count"])


@router.get("/shareable")
async def shareable(user: dict = Depends(student)):
    """The student's applications that reached a round they can write about."""
    apps = await db.applications.find({"student_id": user["id"]}, {"drive_id": 1, "status": 1, "history": 1,
                                                                    "rejected_round": 1}).to_list(None)
    drives = {str(d["_id"]): d async for d in db.drives.find({"_id": {"$in": [ObjectId(a["drive_id"]) for a in apps]}})}
    out = []
    for a in apps:
        rounds = [r for r, stage in ROUND_PROOF.items()
                  if reached(a, stage) or (stage == "shortlisted" and a.get("rejected_round") in ("assessment", "interview"))
                  or (stage == "assessment_cleared" and a.get("rejected_round") == "interview")]
        d = drives.get(a["drive_id"])
        kinds = {r.get("kind") for r in (d or {}).get("rounds", [])}
        if kinds:
            # only rounds this drive actually had (a coding round counts as an online assessment)
            allowed = kinds | ({"Coding round"} if "Online assessment" in kinds else set()) | {"Other"}
            rounds = [r for r in rounds if r in allowed]
        if rounds and d:
            out.append({"drive_id": a["drive_id"], "company": d["company"], "role": d["role"], "rounds": rounds})
    return out


@router.post("/{exp_id}/helpful")
async def toggle_helpful(exp_id: str, user: dict = Depends(student)):
    e = await db.experiences.find_one({"_id": oid(exp_id)})
    if not e:
        raise HTTPException(404, "Not found")
    op = "$pull" if user["id"] in e.get("helpful_by", []) else "$addToSet"
    await db.experiences.update_one({"_id": e["_id"]}, {op: {"helpful_by": user["id"]}})
    return {"helpful": len(e.get("helpful_by", [])) + (1 if op == "$addToSet" else -1), "marked_helpful": op == "$addToSet"}


@router.delete("/{exp_id}")
async def delete(exp_id: str, user: dict = Depends(student)):
    res = await db.experiences.delete_one({"_id": oid(exp_id), "author_id": user["id"]})
    if not res.deleted_count:
        raise HTTPException(404, "Not found")
    return {"deleted": True}


@router.post("/{exp_id}/report")
async def report(exp_id: str, reason: str = "outdated or inaccurate", user: dict = Depends(student)):
    e = await db.experiences.find_one({"_id": oid(exp_id)})
    if not e:
        raise HTTPException(404, "Not found")
    await db.experiences.update_one({"_id": e["_id"]}, {"$addToSet": {"reports": {"by": user["id"], "reason": reason[:200]}}})
    await notify(await college_staff(e.get("college_id")), "Experience reported", f"{e['company']} · {e['round_type']}: {reason[:100]}",
                 "/inbox?tab=moderation", "moderation")
    return {"reported": True}


# ---- moderation (placement cell) ----------------------------------------------------
@router.get("/moderation/queue")
async def moderation_queue(user: dict = Depends(require_role("coordinator"))):
    rows = await db.experiences.find({"college_id": user["college_id"],
                                      "$or": [{"moderation": "pending"}, {"reports.0": {"$exists": True}}]}
                                     ).sort("created_at", 1).to_list(200)
    out = []
    for e in rows:
        item = serialize(e)
        item["author"] = e.get("author_first_name")
        item["reports"] = len(e.get("reports", []))
        item["moderation"] = e.get("moderation") or "approved"
        for k in ("author_id", "helpful_by"):
            item.pop(k, None)
        out.append(item)
    return out


@router.post("/{exp_id}/moderate")
async def moderate(exp_id: str, body: ModerateIn, user: dict = Depends(require_role("coordinator"))):
    e = await db.experiences.find_one({"_id": oid(exp_id), "college_id": user["college_id"]})
    if not e:
        raise HTTPException(404, "Not found")
    status = {"approve": "approved", "reject": "rejected", "remove": "removed"}[body.decision]
    update = {"moderation": status, "moderation_note": body.note, "moderated_by": user["id"], "moderated_at": now(),
              "reports": []}
    if status == "approved":
        # the author decided whether to show their first name; approval doesn't change that
        if body.tags:
            update["topics"] = sorted(set(e.get("topics", [])) | {t.strip().lower() for t in body.tags if t.strip()})
    await db.experiences.update_one({"_id": e["_id"]}, {"$set": update})
    await notify([e["author_id"]], f"Your experience was {status}", f"{e['company']} · {e['round_type']}" +
                 (f" — {body.note}" if body.note else ""), "/experiences", "moderation")
    return {"id": exp_id, "moderation": status}
