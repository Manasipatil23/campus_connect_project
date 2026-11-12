"""Season-level analytics for one student.

Rolls every application up into:
  * round_stats   - how often you clear each round vs. your college's average
  * going_well    - things that are working
  * going_wrong   - patterns behind rejections
  * focus         - a ranked to-do list
  * skills        - demand at your college vs. what your resume shows
  * sections      - your assessment sections vs. those who cleared
"""
import statistics
from collections import Counter, defaultdict
from typing import Dict, List

from datetime import datetime, timezone

from .ats import score_resume
from .eligibility import check_eligibility
from .insights import SECTION_TOPICS, SKILL_TIPS, assessment_insights, reached, resume_insights


def _rate(n: int, d: int):
    return round(100 * n / d) if d else None


def _round_counts(apps: List[dict]) -> dict:
    """attempted/cleared per round, counting only rounds that have a result."""
    out = {"resume": [0, 0], "assessment": [0, 0], "interview": [0, 0]}
    for a in apps:
        rr = a.get("rejected_round")
        if a["status"] != "applied":
            out["resume"][0] += 1
            out["resume"][1] += reached(a, "shortlisted")
        if reached(a, "assessment_cleared") or rr == "assessment":
            out["assessment"][0] += 1
            out["assessment"][1] += reached(a, "assessment_cleared")
        if reached(a, "offered") or rr == "interview":
            out["interview"][0] += 1
            out["interview"][1] += reached(a, "offered")
    return out


def build(user: dict, apps: List[dict], drives: Dict[str, dict], peers: Dict[str, List[dict]],
          peer_profiles: Dict[str, dict], college_apps: List[dict], college_drives: List[dict]) -> dict:
    profile = user.get("profile", {})
    resume_text = (user.get("resume") or {}).get("text", "")
    you_skills = set((user.get("resume") or {}).get("ats", {}).get("skills_found", [])) | set(profile.get("skills", []))

    # ---- rounds vs college ---------------------------------------------------
    mine, college = _round_counts(apps), _round_counts(college_apps)
    labels = {"resume": "Resume screening", "assessment": "Online assessment", "interview": "Interviews"}
    round_stats = [{"round": labels[k], "attempted": mine[k][0], "cleared": mine[k][1],
                    "rate": _rate(mine[k][1], mine[k][0]), "college_rate": _rate(college[k][1], college[k][0])}
                   for k in labels]

    # ---- per-application insights -------------------------------------------
    resume_ins, assess_ins, timeline = [], [], []
    for a in apps:
        d = drives.get(a["drive_id"])
        if not d:
            continue
        timeline.append({"id": str(a["_id"]), "company": d["company"], "role": d["role"], "match": a["ats_score"],
                         "status": a["status"], "rejected_round": a.get("rejected_round"),
                         "applied_at": a.get("applied_at")})
        if a["status"] != "applied":
            cohort = [{"app": p, "profile": p.get("profile_snapshot") or peer_profiles.get(p["student_id"], {})}
                      for p in peers.get(a["drive_id"], []) if p["_id"] != a["_id"] and reached(p, "shortlisted")]
            ins = resume_insights(a, {**user, "profile": a.get("profile_snapshot") or profile}, cohort, d)
            if ins["available"]:
                resume_ins.append((a, d, ins))
        if a.get("assessment"):
            ins = assessment_insights(a, [p for p in peers.get(a["drive_id"], []) if p.get("assessment")])
            if ins["available"]:
                assess_ins.append((a, d, ins))

    # ---- skills: demand at your college vs your resume -----------------------
    demand, open_demand = Counter(), Counter()
    for d in college_drives:
        for s in d.get("required_skills", []):
            demand[s] += 1
            if d.get("status") == "published":
                open_demand[s] += 1
    missed_in_rejections = Counter()
    for a, d, ins in resume_ins:
        if not reached(a, "shortlisted"):
            missed_in_rejections.update(ins["gaps"]["required_skills"])
    skills = sorted(({"skill": s, "drives": n, "open_drives": open_demand.get(s, 0), "you": s in you_skills,
                      "cost_you": missed_in_rejections.get(s, 0)} for s, n in demand.items()),
                    key=lambda r: (-r["drives"], r["skill"]))

    # ---- assessment sections across drives -----------------------------------
    sec = defaultdict(lambda: {"you": [], "cleared": []})
    for _, _, ins in assess_ins:
        for s in ins["sections"]:
            sec[s["section"]]["you"].append(s["you"])
            sec[s["section"]]["cleared"].append(s["cleared_median"])
    sections = [{"section": k, "you": round(statistics.mean(v["you"]), 1),
                 "cleared": round(statistics.mean(v["cleared"]), 1), "tests": len(v["you"]),
                 "gap": round(statistics.mean(v["cleared"]) - statistics.mean(v["you"]), 1)}
                for k, v in sec.items()]
    sections.sort(key=lambda s: -s["gap"])

    # ---- resume metrics vs shortlisted (averaged over drives) ---------------
    metric_gap = defaultdict(list)
    for _, _, ins in resume_ins:
        for m in ins["metrics"]:
            metric_gap[m["label"]].append((m["you"], m["median"]))

    def avg_gap(label):
        rows = metric_gap.get(label)
        if not rows:
            return None
        return round(statistics.mean(y for y, _ in rows), 1), round(statistics.mean(m for _, m in rows), 1)

    # ---- open drives: how well do you match what's open now ------------------
    open_matches = []
    applied_to = {a["drive_id"] for a in apps}
    today = datetime.now(timezone.utc).date().isoformat()
    if resume_text:
        for d in college_drives:
            # only drives this student can still apply to: open, before the deadline, eligible, not applied
            if (d.get("status") == "published" and str(d["_id"]) not in applied_to
                    and not (d.get("deadline") and d["deadline"] < today) and check_eligibility(user, d)[0]):
                open_matches.append({"drive_id": str(d["_id"]), "company": d["company"], "role": d["role"],
                                     "match": score_resume(resume_text, d["description"], d.get("required_skills"))["score"]})
        open_matches.sort(key=lambda x: -x["match"])

    # ---- narrative: going well / going wrong / focus ------------------------
    well, wrong, focus = [], [], []
    rs = {r["round"]: r for r in round_stats}

    def compare_round(name, good_msg, bad_msg):
        r = rs[name]
        if r["attempted"] and r["college_rate"] is not None:
            if r["rate"] >= r["college_rate"]:
                well.append({"title": good_msg, "detail": f"You cleared {r['cleared']} of {r['attempted']} ({r['rate']}%) vs {r['college_rate']}% across your college."})
            else:
                wrong.append({"title": bad_msg, "detail": f"You cleared {r['cleared']} of {r['attempted']} ({r['rate']}%) vs {r['college_rate']}% across your college."})

    compare_round("Resume screening", "Your resume gets shortlisted more than most", "Your resume isn't clearing screening often enough")
    compare_round("Online assessment", "You clear assessments more than most", "Assessments are where you're losing out")
    compare_round("Interviews", "You convert interviews well", "Interviews aren't converting yet")

    have_hot = [s for s in skills if s["you"] and s["drives"] >= 2][:4]
    if have_hot:
        well.append({"title": "You have skills that are in demand",
                     "detail": ", ".join(s["skill"] for s in have_hot) + f" — asked for by {sum(s['drives'] for s in have_hot)} drive requirements at your college."})
    strong_secs = [s for s in sections if s["gap"] <= 0]
    for s in strong_secs[:2]:
        well.append({"title": f"{s['section']} is a strength",
                     "detail": f"You average {s['you']}% vs {s['cleared']}% for students who cleared."})
    cg = avg_gap("CGPA")
    if cg and cg[0] >= cg[1]:
        well.append({"title": "Your CGPA is competitive", "detail": f"{cg[0]} vs a shortlisted median of {cg[1]}."})

    missing_hot = [s for s in skills if not s["you"]]
    missing_hot.sort(key=lambda s: (-s["cost_you"], -s["open_drives"], -s["drives"]))
    for s in missing_hot[:3]:
        if s["cost_you"]:
            wrong.append({"title": f"Missing {s['skill']} cost you shortlists",
                          "detail": f"It was required in {s['cost_you']} drive(s) where you weren't shortlisted, and {s['open_drives']} open drive(s) need it now."})
    for s in sections[:2]:
        if s["gap"] > 3:
            wrong.append({"title": f"{s['section']} is below the cut",
                          "detail": f"You average {s['you']}% vs {s['cleared']}% for those who cleared ({s["tests"]} test{"s" if s["tests"] != 1 else ""})."})
    imp = avg_gap("Quantified impact")
    if imp and imp[0] < imp[1]:
        wrong.append({"title": "Your bullets lack measurable results",
                      "detail": f"Impact score {imp[0]}% vs {imp[1]}% on shortlisted resumes."})
    intern = avg_gap("Internships")
    if intern and intern[0] < intern[1]:
        wrong.append({"title": "Less practical experience than shortlisted peers",
                      "detail": f"{intern[0]} internships vs a median of {intern[1]}."})

    # focus: ordered by expected payoff
    for s in missing_hot[:3]:
        if s["open_drives"] or s["cost_you"]:
            focus.append({"area": "Skill", "title": f"Learn and show {s['skill']}",
                          "detail": SKILL_TIPS.get(s["skill"], f"Build one small project that uses {s['skill']} and add it to your resume."),
                          "impact": f"{s['open_drives']} open drive(s) need it"})
    for s in sections[:2]:
        if s["gap"] > 3:
            topics = SECTION_TOPICS.get(s["section"].lower(), [])
            focus.append({"area": "Assessment", "title": f"Practise {s['section']}",
                          "detail": ("Focus on " + ", ".join(topics) + ".") if topics else "Do timed practice sets.",
                          "impact": f"{s['gap']} points below the cleared average"})
    if imp and imp[0] < imp[1]:
        focus.append({"area": "Resume", "title": "Rewrite bullets with numbers",
                      "detail": "Action + tool + result: “Reduced query time 40% by indexing MongoDB collections”.",
                      "impact": "Raises your match score on every drive"})
    if not apps:
        focus.append({"area": "Get started", "title": "Apply to your best-matched open drive",
                      "detail": f"Your top match right now is {open_matches[0]['company']} — {open_matches[0]['role']} ({open_matches[0]['match']})." if open_matches else "Upload your resume to see your matches.",
                      "impact": "Analytics get sharper with every round you sit"})

    return {
        "summary": {"applications": len(apps), "offers": sum(reached(a, "offered") for a in apps),
                    "in_progress": sum(a["status"] not in ("rejected", "accepted", "withdrawn", "declined") and not a.get("drive_cancelled") for a in apps),
                    "avg_match": round(statistics.mean(a["ats_score"] for a in apps), 1) if apps else None},
        "round_stats": round_stats,
        "going_well": well[:5],
        "going_wrong": wrong[:5],
        "focus": focus[:5],
        "skills": skills[:16],
        "sections": sections,
        # assessments taken whose comparison is hidden because fewer than 3 students cleared
        "assessments_hidden": sum(1 for a in apps if a.get("assessment")) - len(assess_ins),
        "open_matches": open_matches[:6],
        "timeline": sorted(timeline, key=lambda t: t["applied_at"] or 0, reverse=True),
    }
