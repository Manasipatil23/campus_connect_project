"""Rule-based eligibility filtering of students against a placement drive."""
from typing import List, Tuple


def check_eligibility(student: dict, drive: dict) -> Tuple[bool, List[str]]:
    profile = student.get("profile", {})
    crit = drive.get("criteria", {})
    reasons: List[str] = []

    if drive.get("college_id") and drive["college_id"] != student.get("college_id"):
        reasons.append("This drive is for another college")

    if not profile.get("branch"):
        reasons.append("Complete your profile to check eligibility")
        return False, reasons

    min_cgpa = crit.get("min_cgpa")
    if min_cgpa is not None and profile.get("cgpa", 0) < min_cgpa:
        reasons.append(f"CGPA {profile.get('cgpa', 0)} is below the minimum {min_cgpa}")

    branches = crit.get("branches") or []
    if branches and profile.get("branch") not in branches:
        reasons.append(f"Branch {profile.get('branch', '—')} is not in {', '.join(branches)}")

    max_backlogs = crit.get("max_backlogs")
    if max_backlogs is not None and profile.get("backlogs", 0) > max_backlogs:
        reasons.append(f"{profile.get('backlogs')} active backlogs (max {max_backlogs})")

    years = crit.get("grad_years") or []
    if years and profile.get("grad_year") not in years:
        reasons.append(f"Graduation year {profile.get('grad_year')} not in {years}")

    if student.get("placement", {}).get("status") == "placed" and drive.get("tier") != "dream":
        reasons.append("Already placed — only dream-tier drives are open")

    return (len(reasons) == 0, reasons)


def eligibility_rules(student: dict, drive: dict) -> List[dict]:
    """Each published rule with the student's value and a pass / fail / needs confirmation result.

    "needs_confirmation" means the profile doesn't hold that detail yet, so the system
    can't decide - the student should update their profile or ask the placement cell.
    Academic eligibility is kept separate from resume match on purpose."""
    p = student.get("profile", {})
    c = drive.get("criteria", {})
    rules = []

    def add(rule, required, yours, result):
        rules.append({"rule": rule, "required": required, "yours": yours, "result": result})

    if c.get("min_cgpa") is not None:
        v = p.get("cgpa")
        add("CGPA", f"≥ {c['min_cgpa']}", v, "needs_confirmation" if v is None else ("pass" if v >= c["min_cgpa"] else "fail"))
    if c.get("branches"):
        v = p.get("branch")
        add("Branch", ", ".join(c["branches"]), v, "needs_confirmation" if not v else ("pass" if v in c["branches"] else "fail"))
    if c.get("max_backlogs") is not None:
        v = p.get("backlogs")
        add("Active backlogs", f"≤ {c['max_backlogs']}", v,
            "needs_confirmation" if v is None else ("pass" if v <= c["max_backlogs"] else "fail"))
    if c.get("grad_years"):
        v = p.get("grad_year")
        add("Graduation year", ", ".join(map(str, c["grad_years"])), v,
            "needs_confirmation" if not v else ("pass" if v in c["grad_years"] else "fail"))
    placed = student.get("placement", {}).get("status") == "placed"
    add("Placement policy", "Dream drive: open to placed students" if drive.get("tier") == "dream" else "Unplaced students only",
        "Placed" if placed else "Not placed", "fail" if placed and drive.get("tier") != "dream" else "pass")
    return rules
