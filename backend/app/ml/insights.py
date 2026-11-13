"""Round-level feedback for students: "why wasn't I shortlisted?"

For a given drive, a student's resume / assessment is compared against the
cohort of students who *cleared* that round. Only aggregates are ever
returned (shares, medians, minimums) and only when the cleared cohort has at
least MIN_COHORT students, so no individual peer can be identified.
"""
import statistics
from typing import Dict, List, Optional

from ..schemas import FUNNEL

MIN_COHORT = 3

SECTION_LABELS = {
    "education": "Education",
    "experience": "Experience / internships",
    "projects": "Projects",
    "skills": "Skills",
    "certifications": "Certifications",
    "achievements": "Achievements",
}

SECTION_TOPICS = {
    "aptitude": ["percentages & ratios", "time-speed-distance", "probability", "data interpretation"],
    "coding": ["arrays & strings", "hashing", "two pointers / sliding window", "recursion & DP basics"],
    "technical mcq": ["DBMS & SQL joins", "operating systems", "computer networks", "OOP concepts"],
    "logical reasoning": ["seating arrangement", "syllogisms", "blood relations", "series completion"],
    "verbal": ["reading comprehension", "sentence correction", "para jumbles"],
}

SKILL_TIPS = {
    "sql": "Add a project that queries a real dataset (joins, GROUP BY, window functions) and name SQL in the bullet.",
    "dsa": "List your problem-solving record (e.g. LeetCode count or contest rating) under achievements.",
    "machine learning": "Show one end-to-end ML project with the metric you reached (accuracy, F1, RMSE).",
    "docker": "Containerise one of your existing projects and mention it in that project's bullet.",
    "aws": "Deploy a project on AWS (EC2/S3/Lambda) or add the AWS Cloud Practitioner certificate.",
    "rest api": "Describe the APIs you built: endpoints, auth, and traffic or users served.",
    "communication": "Mention presentations, hackathon pitches, or club roles that show communication.",
    "git": "Link your GitHub and mention collaborative work (PRs, code reviews).",
}


def reached(app: dict, stage: str) -> bool:
    """Did this application clear the round leading to `stage`?"""
    stages = {h["status"] for h in app.get("history", [])} | {app["status"]}
    idx = FUNNEL.index(stage)
    return any(s in stages for s in FUNNEL[idx:])


def _median(xs: List[float]) -> float:
    return round(statistics.median(xs), 2) if xs else 0.0


def _metric(label: str, you: float, cohort: List[float], unit: str = "", higher_is_better: bool = True) -> dict:
    med, low = _median(cohort), round(min(cohort), 2) if cohort else 0
    if higher_is_better:
        verdict = "below_all" if you < low else "below_median" if you < med else "at_or_above"
    else:
        verdict = "at_or_above"
    return {"label": label, "you": round(you, 2), "median": med, "min": low, "unit": unit, "verdict": verdict}


def resume_insights(you_app: dict, you_user: dict, cleared: List[dict], drive: dict) -> dict:
    """`cleared` is a list of {"app":…, "profile":…} for students who were shortlisted."""
    if len(cleared) < MIN_COHORT:
        return _resume_brief(you_app, cleared, drive)

    ats = you_app["ats"]
    profile = you_user.get("profile", {})
    n = len(cleared)
    you_skills = set(ats["skills_found"]) | set(ats["matched_skills"])
    required = set(drive.get("required_skills", []))

    # skills most shortlisted resumes had
    counts: Dict[str, int] = {}
    for c in cleared:
        for s in set(c["app"]["ats"]["skills_found"]) | set(c["app"]["ats"]["matched_skills"]):
            counts[s] = counts.get(s, 0) + 1
    skill_rows = []
    for s, k in counts.items():
        share = k / n
        if share >= 0.4 or s in required:
            skill_rows.append({"skill": s, "share": round(100 * share), "you": s in you_skills, "required": s in required})
    skill_rows.sort(key=lambda r: (not r["required"], -r["share"]))
    skill_gaps = [r for r in skill_rows if not r["you"] and r["share"] >= 50]

    # sections
    section_rows = []
    for key, label in SECTION_LABELS.items():
        share = sum(key in c["app"]["ats"]["sections_found"] for c in cleared) / n
        section_rows.append({"section": label, "share": round(100 * share), "you": key in ats["sections_found"]})
    section_gaps = [r for r in section_rows if not r["you"] and r["share"] >= 50]

    def col(fn):
        return [fn(c) for c in cleared]

    metrics = [
        _metric("Resume match for this job", ats["score"], col(lambda c: c["app"]["ats"]["score"]), "/100"),
        _metric("Required-skill coverage", ats["skill_coverage"], col(lambda c: c["app"]["ats"]["skill_coverage"]), "%"),
        _metric("Quantified impact", ats["impact"], col(lambda c: c["app"]["ats"]["impact"]), "%"),
        _metric("CGPA", profile.get("cgpa", 0), col(lambda c: c["profile"].get("cgpa", 0))),
        _metric("Internships", profile.get("internships", 0), col(lambda c: c["profile"].get("internships", 0))),
        _metric("Projects", profile.get("projects", 0), col(lambda c: c["profile"].get("projects", 0))),
        _metric("Certifications", profile.get("certifications", 0), col(lambda c: c["profile"].get("certifications", 0))),
    ]
    by_label = {m["label"]: m for m in metrics}

    # likely reasons, strongest first
    reasons = []
    match = by_label["Resume match for this job"]
    if match["verdict"] == "below_all":
        reasons.append({"weight": "high", "title": "Resume match was below every shortlisted resume",
                        "detail": f"Yours scored {match['you']}/100; the lowest shortlisted resume scored {match['min']}. Screening likely used a match cut-off."})
    req_gaps = [g for g in skill_gaps if g["required"]]
    other_gaps = [g for g in skill_gaps if not g["required"] and g["share"] >= 60]
    for g in req_gaps[:4]:
        reasons.append({"weight": "high" if g["share"] >= 70 else "medium",
                        "title": f"No evidence of {g['skill']} (required)",
                        "detail": f"{g['share']}% of shortlisted resumes showed {g['skill']}, which the job lists as required."})
    for g in other_gaps[:2]:
        reasons.append({"weight": "low", "title": f"Most shortlisted resumes also showed {g['skill']}",
                        "detail": f"Not listed as required, but {g['share']}% of shortlisted resumes had it."})
    cg = by_label["CGPA"]
    if cg["verdict"] == "below_all":
        reasons.append({"weight": "high", "title": "CGPA below every shortlisted student",
                        "detail": f"All shortlisted students had CGPA ≥ {cg['min']}; yours is {cg['you']}. The company may have screened above the posted minimum."})
    for key, w, title in (("Internships", "medium", "Less internship experience than most shortlisted"),
                          ("Quantified impact", "medium", "Fewer measurable results in your bullets"),
                          ("Projects", "low", "Fewer projects than most shortlisted")):
        m = by_label[key]
        if m["verdict"] != "at_or_above" and m["median"] > m["you"]:
            reasons.append({"weight": w, "title": title,
                            "detail": f"Shortlisted median: {m['median']}{m['unit']}; yours: {m['you']}{m['unit']}."})
    for s in section_gaps:
        reasons.append({"weight": "low", "title": f"Missing a “{s['section']}” section",
                        "detail": f"{s['share']}% of shortlisted resumes had one."})

    order = {"high": 0, "medium": 1, "low": 2}
    reasons.sort(key=lambda r: order[r["weight"]])
    return {
        "available": True,
        "cohort_size": n,
        "metrics": metrics,
        "skills": skill_rows[:14],
        "sections": section_rows,
        "reasons": reasons[:7],
        "strengths": [r["skill"] for r in skill_rows if r["you"] and r["share"] >= 50][:6],
        "gaps": {"skills": [g["skill"] for g in skill_gaps], "required_skills": [g["skill"] for g in req_gaps],
                 "sections": [s["section"] for s in section_gaps]},
    }


def _band(x: float) -> int:
    """Round a cut-off down to the nearest 5 so a small group's exact scores aren't revealed."""
    return int(x // 5 * 5)


def _resume_brief(you_app: dict, cleared: List[dict], drive: dict) -> dict:
    """Too few shortlisted resumes for statistics: explain the decision from the job's requirements and
    what the shortlisted resumes showed, without revealing anyone's exact numbers."""
    ats = you_app["ats"]
    you_skills = set(ats["skills_found"]) | set(ats["matched_skills"])
    required = [s for s in drive.get("required_skills", [])]
    preferred = [s for s in drive.get("preferred_skills", [])]
    missing_req = [s for s in required if s not in you_skills]
    shown_by_them = set()
    for c in cleared:
        shown_by_them |= set(c["app"]["ats"]["skills_found"]) | set(c["app"]["ats"]["matched_skills"])
    they_had = sorted(s for s in shown_by_them - you_skills if s not in missing_req)
    reasons = []
    for sk in missing_req[:4]:
        reasons.append({"weight": "high", "title": f"No evidence of {sk}, a required skill",
                        "detail": f"The job lists {sk} as required and your resume didn't show it being used."
                                  + (" The shortlisted resumes did." if sk in shown_by_them else "")})
    if cleared:
        low = _band(min(c["app"]["ats"]["score"] for c in cleared))
        if ats["score"] < low:
            reasons.append({"weight": "high", "title": "Resume match was below the shortlisted resumes",
                            "detail": f"Shortlisted resumes matched this job at {low}/100 or more; yours matched at {round(ats['score'])}/100."})
    pref_gap = [s for s in they_had if s in preferred]
    if pref_gap:
        reasons.append({"weight": "medium", "title": f"Shortlisted resumes also showed {', '.join(pref_gap[:3])}",
                        "detail": "These are listed as preferred for the job, and your resume didn't show them."})
    other = [s for s in they_had if s not in preferred][:3]
    if other:
        reasons.append({"weight": "low", "title": f"Shortlisted resumes showed {', '.join(other)}",
                        "detail": "Not required by the job, but they helped those resumes stand out."})
    if ats.get("impact", 100) < 40:
        reasons.append({"weight": "medium", "title": "Few measurable results in your bullets",
                        "detail": "Lines like “cut report time by 40%” make a resume rank higher for the same skills."})
    for sec in ats.get("sections_missing", [])[:2]:
        reasons.append({"weight": "low", "title": f"Missing a “{SECTION_LABELS.get(sec, sec)}” section",
                        "detail": "Screening tools look for standard headings like this."})
    order = {"high": 0, "medium": 1, "low": 2}
    reasons.sort(key=lambda r: order[r["weight"]])
    if not reasons:
        reasons.append({"weight": "medium", "title": "Other resumes were a closer fit this time",
                        "detail": "Your resume covered the required skills; the company shortlisted a small number of closer matches."})
    return {
        "available": True, "brief": True, "cohort_size": len(cleared), "metrics": [], "skills": [], "sections": [],
        "reasons": reasons[:7], "strengths": [s for s in required if s in you_skills][:6],
        "gaps": {"skills": they_had, "required_skills": missing_req,
                 "sections": [SECTION_LABELS.get(x, x) for x in ats.get("sections_missing", [])]},
    }


def _pct(x: float) -> str:
    return f"{x:g}"   # 41.0 -> "41", 51.3 -> "51.3"


def _assessment_brief(you: Dict[str, float], cleared: List[dict], you_cleared: bool = False) -> dict:
    """Too few people cleared for statistics: give the (rounded) cut-off and the sections where the
    student fell short, with what to practise."""
    total = round(statistics.mean(you.values()), 1)
    sections, reasons, suggestions = [], [], []
    if you_cleared:
        cut_total = _band(min(statistics.mean(a["assessment"]["sections"].values()) for a in cleared))
        for name, score in you.items():
            sections.append({"section": name, "you": score, "cleared_band": _band(min(a["assessment"]["sections"].get(name, 0) for a in cleared)), "gap": 0})
        return {"available": True, "brief": True, "cohort_size": len(cleared), "total": total, "cutoff_estimate": cut_total,
                "percentile": None, "sections": sections, "reasons": [], "suggestions": []}
    if cleared:
        cut_total = _band(min(statistics.mean(a["assessment"]["sections"].values()) for a in cleared))
        if total < cut_total:
            reasons.append({"weight": "high", "title": f"Overall score below the cut-off",
                            "detail": f"Students who cleared scored {cut_total}% or more overall; you scored {_pct(total)}%."})
        for name, score in you.items():
            band = _band(min(a["assessment"]["sections"].get(name, 0) for a in cleared))
            sections.append({"section": name, "you": score, "cleared_band": band, "gap": round(band - score, 1)})
    else:
        cut_total = None
        best = max(you.values())
        for name, score in you.items():
            sections.append({"section": name, "you": score, "cleared_band": None, "gap": round(best - score, 1)})
        reasons.append({"weight": "high", "title": "Nobody cleared this assessment",
                        "detail": "The company didn't move anyone forward from this round, so the cut-off was above every score."})
    for sec in sorted(sections, key=lambda x: -x["gap"]):
        if sec["gap"] <= 0:
            continue
        topics = SECTION_TOPICS.get(sec["section"].lower(), [])
        if sec["cleared_band"] is not None:
            reasons.append({"weight": "high" if sec["gap"] >= 15 else "medium", "title": f"{sec['section']}: {_pct(sec['you'])}%",
                            "detail": f"Students who cleared scored {sec['cleared_band']}% or more in {sec['section']}."})
        suggestions.append({"title": f"Raise your {sec['section']} score",
                            "detail": (f"You scored {_pct(sec['you'])}%" + (f"; those who cleared had {sec['cleared_band']}%+." if sec["cleared_band"] is not None else " (your weakest section).")
                                       + (f" Practise: {', '.join(topics)}." if topics else ""))})
    return {"available": True, "brief": True, "cohort_size": len(cleared), "total": total, "cutoff_estimate": cut_total,
            "percentile": None, "sections": sections, "reasons": reasons[:6], "suggestions": suggestions[:4]}


def compare_with_selected(you_app: dict, you_profile: dict, ahead: List[dict], drive: dict) -> dict:
    """For a student turned down at a later round: how their resume and profile compared with the
    candidate(s) who went further. Nobody is named and no exact figure of theirs is shown: scores are
    rounded down to the nearest 5, and profile details are described as "more" or "higher"."""
    if not ahead:
        return {"available": False}
    one = len(ahead) == 1
    who = "The selected candidate" if one else "The selected candidates"
    their = "the selected candidate" if one else "every selected candidate"
    ats = you_app["ats"]
    mine = set(ats["skills_found"]) | set(ats["matched_skills"])
    required = list(drive.get("required_skills") or [])
    sets = [set(c["app"]["ats"]["skills_found"]) | set(c["app"]["ats"]["matched_skills"]) for c in ahead]
    shown_by_all = set.intersection(*sets)
    shown_by_any = set.union(*sets)
    reasons = []

    lacked = [s for s in required if s in shown_by_all and s not in mine]
    if lacked:
        reasons.append({"weight": "high", "title": f"{who} showed {len(lacked)} required skill{'s' if len(lacked) > 1 else ''} your resume didn't",
                        "detail": f"{', '.join(lacked[:8])}. The job lists {'these' if len(lacked) > 1 else 'this'} as required."})
    cov = _band(min(c["app"]["ats"]["skill_coverage"] for c in ahead))
    if ats["skill_coverage"] < cov:
        reasons.append({"weight": "high", "title": "Covered fewer of the job's required skills",
                        "detail": f"{who} covered {cov}% or more of the required skills; your resume covered {round(ats['skill_coverage'])}%."})
    match = _band(min(c["app"]["ats"]["score"] for c in ahead))
    if ats["score"] < match:
        reasons.append({"weight": "medium", "title": "Lower resume match for this job",
                        "detail": f"{who} matched this job at {match}/100 or more; yours matched at {round(ats['score'])}/100."})
    for key, noun in (("internships", "internships"), ("projects", "projects"), ("certifications", "certifications")):
        mine_n = you_profile.get(key) or 0
        if min((c["profile"].get(key) or 0) for c in ahead) > mine_n:
            hint = " Your profile lists none: if you have some, add them." if mine_n == 0 else ""
            reasons.append({"weight": "medium" if key == "internships" else "low", "title": f"{who} had more {noun}",
                            "detail": f"{their.capitalize()} listed more {noun} than you.{hint}"})
    if you_profile.get("cgpa") and min((c["profile"].get("cgpa") or 0) for c in ahead) > you_profile["cgpa"]:
        reasons.append({"weight": "low", "title": f"{who} had a higher CGPA",
                        "detail": f"You met the drive's minimum, but {their} had a higher CGPA."})
    impact = _band(min(c["app"]["ats"]["impact"] for c in ahead))
    if ats["impact"] + 10 < impact:
        reasons.append({"weight": "medium", "title": "Fewer measurable results in your bullets",
                        "detail": f"{who} put numbers on their work more often (results like “cut report time by 40%”)."})
    theirs_sections = set.intersection(*[set(c["app"]["ats"]["sections_found"]) for c in ahead])
    for sec in sorted(theirs_sections - set(ats["sections_found"]))[:2]:
        reasons.append({"weight": "low", "title": f"No “{SECTION_LABELS.get(sec, sec)}” section",
                        "detail": f"{who} had one."})
    order = {"high": 0, "medium": 1, "low": 2}
    reasons.sort(key=lambda r: order[r["weight"]])
    you_only = [s for s in required if s in mine and s not in shown_by_any]
    return {"available": True, "group": len(ahead), "who": who, "reasons": reasons[:7],
            "you_only": you_only, "both": [s for s in required if s in mine and s in shown_by_all]}


def rule_suggestions_resume(ins: dict) -> List[dict]:
    out = []
    for s in ins["gaps"]["required_skills"][:4]:
        out.append({"title": f"Show {s} on your resume",
                    "detail": SKILL_TIPS.get(s, f"If you know {s}, add a project or internship bullet that uses it. If not, a short course plus a mini-project is the quickest way to close this gap.")})
    by = {m["label"]: m for m in ins["metrics"]}
    if ins.get("brief"):
        for sk in ins["gaps"]["skills"][:2]:
            out.append({"title": f"Show {sk} if you have it", "detail": SKILL_TIPS.get(sk, f"The shortlisted resumes showed {sk}. If you've used it, add a bullet that shows how.")})
        out.append({"title": "Quantify your bullets",
                    "detail": "Rewrite each project/internship bullet as action + tool + measurable result, e.g. “Cut report time 40% by automating SQL queries”."})
        return out[:6]
    if by["Quantified impact"]["verdict"] != "at_or_above":
        out.append({"title": "Quantify your bullets",
                    "detail": "Rewrite each project/internship bullet as action + tool + measurable result, e.g. “Cut report time 40% by automating SQL queries”."})
    if by["Internships"]["verdict"] != "at_or_above":
        out.append({"title": "Add practical experience",
                    "detail": "No internship yet? Freelance work, open-source PRs, or a research project with a professor count as experience when described with outcomes."})
    for sec in ins["gaps"]["sections"]:
        out.append({"title": f"Add a section: {sec}", "detail": f"Most shortlisted resumes had one, and ATS parsers look for standard headings like this."})
    if by["Resume match for this job"]["verdict"] != "at_or_above":
        out.append({"title": "Tailor the resume to each JD",
                    "detail": "Mirror the job description's key terms in your skills and project bullets — only where they are true for you."})
    return out[:6]


def assessment_insights(you_app: dict, assessed: List[dict]) -> dict:
    you = (you_app.get("assessment") or {}).get("sections")
    if not you:
        return {"available": False, "reason": "No assessment score has been recorded for you on this drive yet."}
    cleared = [a for a in assessed if reached(a, "assessment_cleared") and a["_id"] != you_app["_id"]]
    if len(cleared) < MIN_COHORT:
        you_cleared = reached(you_app, "assessment_cleared")
        # the cut-off includes the student's own score when they cleared (it's their own data)
        return _assessment_brief(you, cleared + ([you_app] if you_cleared else []), you_cleared)

    sections = []
    for name, score in you.items():
        c_scores = [a["assessment"]["sections"].get(name, 0) for a in cleared]
        all_scores = [a["assessment"]["sections"].get(name, 0) for a in assessed]
        pct = round(100 * sum(s <= score for s in all_scores) / len(all_scores))
        sections.append({"section": name, "you": score, "cleared_median": _median(c_scores),
                         "cleared_min": min(c_scores), "percentile": pct,
                         "gap": round(_median(c_scores) - score, 1)})

    total = round(statistics.mean(you.values()), 1)
    c_totals = [statistics.mean(a["assessment"]["sections"].values()) for a in cleared]
    all_totals = [statistics.mean(a["assessment"]["sections"].values()) for a in assessed]
    weakest = sorted(sections, key=lambda s: -s["gap"])
    suggestions = []
    for s in weakest:
        if s["gap"] <= 0:
            continue
        topics = SECTION_TOPICS.get(s["section"].lower(), [])
        suggestions.append({
            "title": f"Raise your {s['section']} score",
            "detail": f"You scored {s['you']}% vs a cleared median of {s['cleared_median']}%."
                      + (f" Practise: {', '.join(topics)}." if topics else ""),
        })
    return {
        "available": True,
        "cohort_size": len(cleared),
        "total": total,
        "cutoff_estimate": round(min(c_totals), 1),
        "cleared_median_total": _median(c_totals),
        "percentile": round(100 * sum(t <= total for t in all_totals) / len(all_totals)),
        "sections": sections,
        "suggestions": suggestions[:4],
    }


def headline(round_key: Optional[str], cleared: bool) -> str:
    if cleared:
        return "You cleared this round. Here's how you compared with others who cleared it."
    return {
        "resume_screening": "Your resume wasn't shortlisted. Here's how it compared with the resumes that were.",
        "assessment": "You didn't clear the assessment. Here's where the gap was.",
    }.get(round_key, "Here's how you compared.")
