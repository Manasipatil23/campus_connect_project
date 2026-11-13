"""'Why wasn't I selected?' explanations when only a few students cleared a round (no database needed).
Run: python -m tests.test_insights"""
from app.ml.insights import assessment_insights, compare_with_selected, resume_insights


def check(cond, label):
    assert cond, label
    print(f"  ok  {label}")


def ats(score, skills, missing=(), impact=60, sections_missing=()):
    return {"score": score, "skills_found": list(skills), "matched_skills": list(skills), "missing_skills": list(missing),
            "skill_coverage": 50, "impact": impact, "sections_found": ["education", "skills"], "sections_missing": list(sections_missing)}


def run():
    drive = {"required_skills": ["sql", "python", "power bi"], "preferred_skills": ["aws"]}

    # resume screening: one shortlisted resume, ours misses a required skill and a preferred one
    me = {"_id": 1, "status": "rejected", "history": [{"status": "applied"}],
          "ats": ats(52, ["sql", "excel"], missing=["python", "power bi"], impact=20, sections_missing=["projects"])}
    them = [{"app": {"ats": ats(71, ["sql", "python", "power bi", "aws"])}, "profile": {}}]
    r = resume_insights(me, {"profile": {}}, them, drive)
    titles = [x["title"] for x in r["reasons"]]
    check(r["available"] and r["brief"], "a small group still gets an explanation")
    check("No evidence of python, a required skill" in titles and "No evidence of power bi, a required skill" in titles, "missing required skills explained")
    check(any("70/100 or more" in x["detail"] for x in r["reasons"]), "resume match compared with a rounded cut-off (71 -> 70)")
    check(any("aws" in t for t in titles), "skills the shortlisted resumes showed are named")
    check(not any("Fewer than" in str(r) for _ in [0]), "no 'fewer than 3' message")

    # assessment: one person cleared; the student sees the rounded cut-off and section gaps
    mine = {"_id": 1, "status": "rejected", "history": [{"status": "shortlisted"}, {"status": "rejected"}],
            "assessment": {"sections": {"Aptitude": 58, "Coding": 41}}}
    winner = {"_id": 2, "status": "assessment_cleared", "history": [{"status": "assessment_cleared"}],
              "assessment": {"sections": {"Aptitude": 84, "Coding": 78}}}
    a = assessment_insights(mine, [mine, winner])
    check(a["brief"] and a["cutoff_estimate"] == 80, "overall cut-off shown, rounded down to protect the one who cleared (81 -> 80)")
    check(a["reasons"][0]["detail"] == "Students who cleared scored 80% or more overall; you scored 49.5%.", "overall gap in plain words")
    check(any(x["title"] == "Coding: 41%" and "75% or more" in x["detail"] for x in a["reasons"]), "weakest section explained with its cut-off")
    check(a["suggestions"][0]["title"] == "Raise your Coding score", "biggest gap first in the tips")

    # the one who cleared isn't told "nobody cleared"
    w = assessment_insights(winner, [mine, winner])
    check(w["cutoff_estimate"] == 80 and w["reasons"] == [], "the student who cleared sees the cut-off and no rejection reasons")

    # nobody cleared at all
    n = assessment_insights(mine, [mine])
    check(n["cutoff_estimate"] is None and n["reasons"][0]["title"] == "Nobody cleared this assessment", "nobody cleared: said plainly")

    # turned down at the assessment: compare the resume with the one candidate who went further
    job = {"required_skills": ["sql", "python", "power bi", "excel", "docker"]}
    you = {"ats": {**ats(61, ["sql", "python", "docker"]), "skill_coverage": 61}}
    winner_app = {"ats": {**ats(67, ["sql", "python", "power bi", "excel"]), "skill_coverage": 83.3}}
    v = compare_with_selected(you, {"cgpa": 8.9, "internships": 0}, [{"app": winner_app, "profile": {"cgpa": 9.33, "internships": 2}}], job)
    titles = [x["title"] for x in v["reasons"]]
    check(v["available"] and v["who"] == "The selected candidate", "compared with the one selected candidate")
    check("The selected candidate showed 2 required skills your resume didn't" in titles, "required skills only the selected resume showed")
    check(any("80% or more" in x["detail"] for x in v["reasons"]), "coverage shown as a rounded band (83.3 -> 80)")
    check("The selected candidate had more internships" in titles and "The selected candidate had a higher CGPA" in titles, "profile differences described, not numbered")
    check(v["you_only"] == ["docker"], "skills only the rejected student showed are kept as strengths")
    blob = str(v)
    check(not any(x in blob for x in ("67", "83.3", "9.33", "'internships': 2")), "none of the selected candidate's exact figures leak")
    check(compare_with_selected(you, {}, [], job) == {"available": False}, "nothing to compare when nobody went further")
    print("all insight checks passed")


if __name__ == "__main__":
    run()
