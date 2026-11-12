"""ATS-style resume scoring.

Two modes, because a match score only means something when there's a job to match:

  job match (a drive's JD is given):
    40% skill coverage  - share of the job's required skills found in the resume
    30% JD similarity   - TF-IDF cosine similarity between resume and job description
    20% structure       - presence of the sections recruiters and ATS parsers expect
    10% impact          - quantified achievements (numbers, %, metrics)

  resume quality (no job selected, e.g. the Resume page):
    there is no JD, so similarity is not measured at all and its weight is spread
    over what can be measured:
    45% skill breadth   - recognised skills, full marks at 8
    35% structure
    20% impact

Both subtract 5 points when the resume is under 250 or over 900 words.
"""
import re
from typing import Iterable, List, Optional

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# canonical skill -> aliases that count as a match
SKILL_ALIASES = {
    "python": ["python"],
    "java": ["java"],
    "c++": ["c++", "cpp"],
    "javascript": ["javascript", "js", "es6"],
    "typescript": ["typescript"],
    "react": ["react", "react.js", "reactjs"],
    "node.js": ["node", "node.js", "nodejs", "express"],
    "sql": ["sql", "mysql", "postgresql", "postgres", "t-sql"],
    "mongodb": ["mongodb", "mongo"],
    "fastapi": ["fastapi"],
    "django": ["django"],
    "flask": ["flask"],
    "machine learning": ["machine learning", "ml", "scikit-learn", "sklearn"],
    "deep learning": ["deep learning", "pytorch", "tensorflow", "keras", "cnn"],
    "nlp": ["nlp", "natural language processing", "llm", "transformers"],
    "data analysis": ["data analysis", "pandas", "numpy", "analytics"],
    "power bi": ["power bi", "powerbi", "tableau"],
    "excel": ["excel", "advanced excel"],
    "aws": ["aws", "amazon web services", "ec2", "s3"],
    "azure": ["azure"],
    "docker": ["docker", "containers"],
    "kubernetes": ["kubernetes", "k8s"],
    "git": ["git", "github"],
    "linux": ["linux", "bash", "shell"],
    "rest api": ["rest", "rest api", "restful", "api"],
    "dsa": ["data structures", "algorithms", "dsa", "leetcode"],
    "html/css": ["html", "css", "tailwind"],
    "cloud": ["cloud", "gcp"],
    "etl": ["etl", "data warehouse", "data pipeline"],
    "communication": ["communication", "presentation", "public speaking"],
}

SECTIONS = {
    "education": ["education", "academic"],
    "experience": ["experience", "internship", "work history", "employment"],
    "projects": ["projects", "project"],
    "skills": ["skills", "technical skills", "technologies"],
    "certifications": ["certification", "certifications", "certificate", "courses"],
    "achievements": ["achievements", "awards", "accomplishments", "hackathon"],
}


def _contains(text: str, alias: str) -> bool:
    return re.search(r"(?<![a-z0-9])" + re.escape(alias) + r"(?![a-z0-9])", text) is not None


def extract_skills(text: str) -> List[str]:
    low = text.lower()
    return sorted(s for s, aliases in SKILL_ALIASES.items() if any(_contains(low, a) for a in aliases))


def normalize_skill(skill: str) -> str:
    low = skill.lower().strip()
    for canon, aliases in SKILL_ALIASES.items():
        if low == canon or low in aliases:
            return canon
    return low


def _similarity(a: str, b: str) -> float:
    if not a.strip() or not b.strip():
        return 0.0
    vec = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), sublinear_tf=True)
    m = vec.fit_transform([a, b])
    return float(cosine_similarity(m[0], m[1])[0][0])


def score_resume(
    resume_text: str,
    jd_text: str = "",
    required_skills: Optional[Iterable[str]] = None,
) -> dict:
    low = resume_text.lower()
    found = set(extract_skills(resume_text))
    required = [normalize_skill(s) for s in (required_skills or [])]
    if not required and jd_text:
        required = extract_skills(jd_text)

    if required:
        matched = [s for s in required if s in found or _contains(low, s)]
        missing = [s for s in required if s not in matched]
        coverage = len(matched) / len(required)
    else:
        # no target job: reward breadth of recognised skills
        matched, missing = sorted(found), []
        coverage = min(1.0, len(found) / 8)

    has_job = bool(jd_text and jd_text.strip())
    sim = _similarity(resume_text, jd_text) if has_job else None
    # raw TF-IDF cosine between a resume and a JD rarely exceeds ~0.35
    sim_scaled = min(1.0, sim / 0.35) if sim is not None else None

    sections_found = [name for name, keys in SECTIONS.items() if any(_contains(low, k) for k in keys)]
    structure = len(sections_found) / len(SECTIONS)

    metrics = re.findall(r"\b\d+(?:\.\d+)?\s*(?:%|x|\+|k|users|ms|hrs?|hours)?", low)
    impact = min(1.0, len(metrics) / 10)

    words = len(resume_text.split())
    length_penalty = 0.0 if 250 <= words <= 900 else 0.05

    if has_job:
        weights = {"skills": 0.40, "similarity": 0.30, "structure": 0.20, "impact": 0.10}
        raw = 0.40 * coverage + 0.30 * sim_scaled + 0.20 * structure + 0.10 * impact
    else:
        # nothing to compare against: don't invent a similarity, re-weight the rest
        weights = {"skills": 0.45, "similarity": 0.0, "structure": 0.35, "impact": 0.20}
        raw = 0.45 * coverage + 0.35 * structure + 0.20 * impact
    score = int(max(0, min(100, round(100 * (raw - length_penalty)))))  # whole number, shown the same everywhere

    return {
        "score": score,
        "mode": "job" if has_job else "general",
        "weights": weights,
        "length_penalty": length_penalty > 0,
        "skill_coverage": round(coverage * 100, 1),
        "similarity": round(sim, 3) if sim is not None else None,
        "structure": round(structure * 100, 1),
        "impact": round(impact * 100, 1),
        "matched_skills": matched,
        "missing_skills": missing,
        "skills_found": sorted(found),
        "sections_found": sections_found,
        "sections_missing": [s for s in SECTIONS if s not in sections_found],
        "word_count": words,
    }


def _skill_lines(text: str) -> List[str]:
    return [ln.strip(" •-*\t") for ln in text.splitlines() if ln.strip()]


def _is_list_line(line: str) -> bool:
    """A bare skills list ("Skills: Python, SQL, Git") rather than a sentence describing work."""
    low = line.lower()
    if re.match(r"^(technical\s+)?skills|^technologies|^tools|^languages", low):
        return True
    words = re.findall(r"[a-z]+", low)
    return line.count(",") >= 2 and len(words) <= 3 * (line.count(",") + 1)


def evidence_report(resume_text: str, required: Iterable[str], preferred: Iterable[str] = ()) -> List[dict]:
    """For each JD skill: where the resume shows it.

    strong       - used in a project / experience / achievement sentence
    partial      - only listed (e.g. in a skills section) with no example of use
    not_shown    - not demonstrated in the resume. This is NOT a claim the student lacks
                   the skill, only that the resume doesn't show it.
    """
    lines = _skill_lines(resume_text)
    out = []
    for kind, skills in (("required", required or []), ("preferred", preferred or [])):
        for skill in skills:
            canon = normalize_skill(skill)
            aliases = SKILL_ALIASES.get(canon, [canon])
            hits = [ln for ln in lines if any(_contains(ln.lower(), a) for a in aliases)]
            used = [ln for ln in hits if not _is_list_line(ln)]
            if used:
                level, evidence = "strong", used[:2]
            elif hits:
                level, evidence = "partial", hits[:1]
            else:
                level, evidence = "not_shown", []
            out.append({"skill": canon, "kind": kind, "level": level,
                        "evidence": [e[:220] for e in evidence]})
    return out
