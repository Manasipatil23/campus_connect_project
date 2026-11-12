import statistics
from collections import Counter, defaultdict

from fastapi import APIRouter, Depends

from ..auth import require_role
from ..db import db, serialize
from ..ml.health import health_score, model
from ..schemas import FUNNEL, ROUND_LABELS, STAGE_LABELS
from ..workflow import DRIVE_STATUS

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _funnel(apps: list) -> list:
    """Cumulative funnel: an application at 'interview' also counts as shortlisted."""
    reached = Counter()
    for a in apps:
        stages = {h["status"] for h in a.get("history", [])} | {a["status"]}
        for s in FUNNEL:
            if s in stages:
                reached[s] += 1
    total = reached["applied"] or 1
    return [{"stage": s, "label": STAGE_LABELS[s], "count": reached[s], "pct": round(100 * reached[s] / total, 1)}
            for s in FUNNEL]


@router.get("/overview")
async def overview(user: dict = Depends(require_role("coordinator"))):
    college = user.get("college_id")
    students = await db.users.find({"role": "student", "college_id": college, "status": "active"}).to_list(None)  # approved only
    drives = await db.drives.find({"college_id": college}).to_list(None)
    apps = await db.applications.find({"drive_id": {"$in": [str(d["_id"]) for d in drives]}},
                                      {"resume_snapshot": 0}).to_list(None)
    drive_by_id = {str(d["_id"]): d for d in drives}

    apps_by_student = defaultdict(list)
    for a in apps:
        apps_by_student[a["student_id"]].append(a)

    placed = [s for s in students if s.get("placement", {}).get("status") == "placed"]
    ctcs = [s["placement"]["ctc_lpa"] for s in placed if s["placement"].get("ctc_lpa")]

    # branch-wise placement
    branch = defaultdict(lambda: {"total": 0, "placed": 0})
    for s in students:
        b = s.get("profile", {}).get("branch") or "Unknown"
        branch[b]["total"] += 1
        branch[b]["placed"] += s.get("placement", {}).get("status") == "placed"
    branch_rows = sorted(
        ({"branch": b, **v, "rate": round(100 * v["placed"] / v["total"], 1)} for b, v in branch.items()),
        key=lambda r: -r["rate"],
    )

    # CTC distribution
    buckets = [(0, 4), (4, 6), (6, 10), (10, 15), (15, 100)]
    ctc_dist = [
        {"range": f"{lo}–{hi} LPA" if hi < 100 else f"{lo}+ LPA", "count": sum(lo <= c < hi for c in ctcs)}
        for lo, hi in buckets
    ]

    # companies by offers
    offers = Counter()
    for a in apps:
        if a["status"] in ("offered", "accepted"):
            offers[drive_by_id.get(a["drive_id"], {}).get("company", "?")] += 1

    # health scores for unplaced students
    health_rows = []
    for s in students:
        if s.get("placement", {}).get("status") == "placed":
            continue
        ats = (s.get("resume") or {}).get("ats", {}).get("score", 0)
        h = health_score(s.get("profile", {}), ats, apps_by_student[str(s["_id"])])
        health_rows.append({"id": str(s["_id"]), "name": s["name"], "email": s["email"],
                            "branch": s.get("profile", {}).get("branch"), "cgpa": s.get("profile", {}).get("cgpa"),
                            "ats_score": ats, "applications": len(apps_by_student[str(s["_id"])]), **h})
    scored = [r for r in health_rows if r.get("ready")]
    bands = Counter(r["band"] for r in scored)
    at_risk = sorted((r for r in scored if r["band"] == "At risk"), key=lambda r: r["score"])

    # applications per week
    weekly = Counter(a["applied_at"].strftime("%Y-W%W") for a in apps if a.get("applied_at"))

    return {
        "kpis": {
            "students": len(students),
            "placed": len(placed),
            "placement_rate": round(100 * len(placed) / len(students), 1) if students else 0,
            "avg_ctc": round(statistics.mean(ctcs), 2) if ctcs else 0,
            "median_ctc": round(statistics.median(ctcs), 2) if ctcs else 0,
            "highest_ctc": max(ctcs) if ctcs else 0,
            "open_drives": sum(d.get("status") in ("published", "in_progress") for d in drives),
            "applications": len(apps),
            "avg_health": round(statistics.mean(r["score"] for r in scored)) if scored else None,
        },
        "funnel": _funnel(apps),
        "dropoff": [{"round": ROUND_LABELS[k], "count": n} for k, n in
                    Counter(a.get("rejected_round") for a in apps if a["status"] == "rejected").most_common() if k],
        "branches": branch_rows,
        "ctc_distribution": ctc_dist,
        "top_companies": [{"company": c, "offers": n} for c, n in offers.most_common(8)],
        "health_bands": [{"band": b, "count": bands.get(b, 0)} for b in ("Strong", "Moderate", "At risk")],
        "at_risk": at_risk[:15],
        "weekly_applications": [{"week": w, "count": n} for w, n in sorted(weekly.items())][-12:],
        "model": {"ready": model.ready, "trained_on": model.trained_on, "train_accuracy": model.accuracy},
        "drive_status": [{"status": k, "count": n} for k, n in Counter(d.get("status") for d in drives).most_common()],
        "companies": _company_rows(drives, apps),
        "branch_applications": _branch_apps(apps),
        "skill_gaps": _skill_gaps(students, drives),
    }


def _company_rows(drives: list, apps: list) -> list:
    """Company / role-wise progress, computed from the application records themselves."""
    by_drive = defaultdict(list)
    for a in apps:
        by_drive[a["drive_id"]].append(a)
    rows = []
    for d in drives:
        mine = by_drive.get(str(d["_id"]), [])
        f = {r["stage"]: r["count"] for r in _funnel(mine)}
        rows.append({"id": str(d["_id"]), "company": d["company"], "role": d["role"], "status": d.get("status"),
                     "applications": len(mine), "shortlisted": f.get("shortlisted", 0),
                     "cleared_assessment": f.get("assessment_cleared", 0), "offers": f.get("offered", 0),
                     "accepted": f.get("accepted", 0)})
    return sorted(rows, key=lambda r: -r["applications"])


def _branch_apps(apps: list) -> list:
    rows = defaultdict(lambda: {"applications": 0, "shortlisted": 0, "offers": 0})
    for a in apps:
        b = (a.get("profile_snapshot") or {}).get("branch") or "Unknown"
        stages = {h["status"] for h in a.get("history", [])} | {a["status"]}
        rows[b]["applications"] += 1
        rows[b]["shortlisted"] += bool(stages & {"shortlisted", "assessment_cleared", "offered", "accepted"})
        rows[b]["offers"] += bool(stages & {"offered", "accepted"})
    return sorted(({"branch": b, **v, "conversion": round(100 * v["shortlisted"] / v["applications"], 1)}
                   for b, v in rows.items()), key=lambda r: -r["applications"])


def _skill_gaps(students: list, drives: list) -> list:
    """Skills recruiters ask for vs. how many active students show them - for planning workshops."""
    demand = Counter(s for d in drives if d.get("status") in ("published", "in_progress", "completed")
                     for s in d.get("required_skills", []))
    active = [s for s in students if s.get("status", "active") == "active"]
    have = Counter(sk for s in active for sk in set((s.get("profile") or {}).get("skills", [])))
    n = len(active) or 1
    return [{"skill": sk, "drives": c, "students_with": have.get(sk, 0), "coverage": round(100 * have.get(sk, 0) / n, 1)}
            for sk, c in demand.most_common(12)]


@router.get("/recruiter")
async def recruiter_view(user: dict = Depends(require_role("recruiter"))):
    drives = await db.drives.find({"$or": [{"recruiter_id": user["id"]}, {"company_id": user.get("company_id") or "-"}]}).to_list(None)
    ids = [str(d["_id"]) for d in drives]
    apps = await db.applications.find({"drive_id": {"$in": ids}}).to_list(None)
    per_drive = []
    for d in drives:
        mine = [a for a in apps if a["drive_id"] == str(d["_id"])]
        scores = [a["ats_score"] for a in mine]
        per_drive.append({**serialize(d), "status_label": DRIVE_STATUS.get(d.get("status")), "applicants": len(mine),
                          "avg_ats": round(statistics.mean(scores), 1) if scores else None,
                          "funnel": _funnel(mine)})
    return {"funnel": _funnel(apps), "drives": per_drive, "applications": len(apps),
            "offers": sum(a["status"] in ("offered", "accepted", "declined") for a in apps),
            "accepted": sum(a["status"] == "accepted" for a in apps),
            "eligible_reached": sum(1 for d in drives if d.get("status") in ("published", "in_progress", "completed"))}
