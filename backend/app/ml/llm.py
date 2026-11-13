"""LLM resume review with Claude, falling back to rule-based feedback.

The Anthropic client picks up credentials from ANTHROPIC_API_KEY (or an
`ant auth login` profile). If none are available, or the call fails, the
review is generated from the ATS breakdown so the feature never hard-fails.
"""
import json
import logging
from typing import Optional

from ..config import LLM_ENABLED, LLM_MODEL

log = logging.getLogger(__name__)

REVIEW_SCHEMA = {
    "type": "object",
    "properties": {
        "summary": {"type": "string"},
        "strengths": {"type": "array", "items": {"type": "string"}},
        "improvements": {"type": "array", "items": {"type": "string"}},
        "rewritten_bullets": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"before": {"type": "string"}, "after": {"type": "string"}},
                "required": ["before", "after"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["summary", "strengths", "improvements", "rewritten_bullets"],
    "additionalProperties": False,
}

SYSTEM = (
    "You are a campus placement mentor reviewing a student's resume. Be specific and "
    "practical: reference real lines from the resume, keep each point to one sentence, "
    "and never invent experience the student does not have. Give 3-5 strengths, 3-5 "
    "improvements, and rewrite up to 3 weak bullet points to be more quantified and "
    "action-oriented."
)

_client = None


def _get_client():
    global _client
    if _client is None:
        import anthropic

        _client = anthropic.Anthropic()
    return _client


def _fallback(ats: dict) -> dict:
    strengths, improvements = [], []
    if ats["matched_skills"]:
        strengths.append("Covers key skills: " + ", ".join(ats["matched_skills"][:6]) + ".")
    if ats["impact"] >= 50:
        strengths.append("Uses numbers to show impact, which recruiters scan for.")
    if len(ats["sections_found"]) >= 5:
        strengths.append("Well structured with the standard resume sections.")
    if ats["missing_skills"]:
        improvements.append(
            "Add evidence for missing skills if you have them: " + ", ".join(ats["missing_skills"][:6]) + "."
        )
    if ats["sections_missing"]:
        improvements.append("Add sections for: " + ", ".join(ats["sections_missing"]) + ".")
    if ats["impact"] < 50:
        improvements.append("Quantify outcomes (%, users, time saved) in project and internship bullets.")
    if ats["word_count"] < 250:
        improvements.append("The resume is short; expand projects with tech stack and results.")
    elif ats["word_count"] > 900:
        improvements.append("The resume is long; trim to one page for freshers.")
    return {
        "summary": f"ATS score {ats['score']}/100 with {ats['skill_coverage']}% skill coverage.",
        "strengths": strengths or ["Resume parsed successfully."],
        "improvements": improvements or ["Tailor the resume to each job description."],
        "rewritten_bullets": [],
        "source": "rules",
    }


SUGGEST_SCHEMA = {
    "type": "object",
    "properties": {
        "suggestions": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {"title": {"type": "string"}, "detail": {"type": "string"}},
                "required": ["title", "detail"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["suggestions"],
    "additionalProperties": False,
}

SUGGEST_SYSTEM = (
    "You coach a student who was not shortlisted in a campus placement drive. You get their "
    "resume, the job, and anonymous aggregate stats about the resumes that WERE shortlisted. "
    "Give 4-6 concrete, honest suggestions tied to the gaps, each with a short title and a "
    "1-2 sentence detail that references the student's own resume. Never tell them to claim "
    "skills they don't have; suggest how to build or evidence them. Be encouraging, not generic."
)


def personalised_suggestions(resume_text: str, drive: dict, insights: dict, fallback: list) -> dict:
    if LLM_ENABLED == "off":
        return {"items": fallback, "source": "rules"}
    summary = {
        "reasons": insights["reasons"],
        "metrics": insights["metrics"],
        "skill_gaps": insights["gaps"]["skills"],
        "section_gaps": insights["gaps"]["sections"],
    }
    prompt = (
        f"Job: {drive['role']} at {drive['company']}\n{drive['description']}\n"
        f"Required skills: {drive.get('required_skills')}\n\n"
        f"Comparison with {insights['cohort_size']} shortlisted resumes (aggregates only):\n"
        f"{json.dumps(summary)}\n\nStudent resume:\n{resume_text}"
    )
    try:
        response = _get_client().beta.messages.create(
            model=LLM_MODEL,
            max_tokens=3000,
            system=SUGGEST_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": SUGGEST_SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if response.stop_reason in ("refusal", "max_tokens"):
            raise RuntimeError(f"LLM stopped with {response.stop_reason}")
        text = next(b.text for b in response.content if b.type == "text")
        return {"items": json.loads(text)["suggestions"], "source": "llm"}
    except Exception as exc:
        log.warning("LLM suggestions unavailable, using rule-based: %s", exc)
        return {"items": fallback, "source": "rules"}


def review_resume(resume_text: str, ats: dict, jd_text: Optional[str] = None) -> dict:
    if LLM_ENABLED == "off":
        return _fallback(ats)
    target = f"\n\nTarget job description:\n{jd_text}" if jd_text else ""
    prompt = (
        f"Resume:\n{resume_text}{target}\n\n"
        f"ATS analysis: score {ats['score']}/100, matched skills {ats['matched_skills']}, "
        f"missing skills {ats['missing_skills']}, missing sections {ats['sections_missing']}."
    )
    try:
        client = _get_client()
        # Server-side fallback reroutes the request if Opus declines on a policy classifier.
        response = client.beta.messages.create(
            model=LLM_MODEL,
            max_tokens=4000,
            system=SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": REVIEW_SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if response.stop_reason in ("refusal", "max_tokens"):
            raise RuntimeError(f"LLM stopped with {response.stop_reason}")
        text = next(b.text for b in response.content if b.type == "text")
        data = json.loads(text)
        data["source"] = "llm"
        return data
    except Exception as exc:  # no credentials, network, refusal, bad JSON
        log.warning("LLM review unavailable, using rule-based feedback: %s", exc)
        return _fallback(ats)


# ---- "why wasn't I selected?" written as a short personal explanation -------------------------
STORY_SCHEMA = {
    "type": "object",
    "properties": {
        "explanation": {"type": "string"},
        "next_step": {"type": "string"},
    },
    "required": ["explanation", "next_step"],
    "additionalProperties": False,
}

STORY_SYSTEM = (
    "You write to a college student who was not selected in one round of a campus placement drive. "
    "You get the job, the round, the company's stated reason (if any), the student's own results, and "
    "facts the platform has already worked out (cut-offs, gaps, missing skills). Write 3-5 short "
    "sentences in plain, warm, honest English, addressed to the student as 'you':\n"
    "- Say what decided it first, using the numbers given.\n"
    "- Mention what went well, if anything, so it doesn't read as a list of failures.\n"
    "- Connect the gap to what this particular job needs.\n"
    "Use only the facts provided. Never invent scores, skills, experience or reasons, and never "
    "describe other students individually. No markdown, no bullet points, no headings. Then give "
    "one concrete next step the student can start this week, in one sentence."
)


def _story_fallback(facts: dict) -> dict:
    """The same facts as plain sentences, for when Claude isn't available."""
    lines = []
    if facts.get("company_reason"):
        lines.append(f"The company's reason was: {facts['company_reason']}.")
    for r in facts.get("reasons", [])[:3]:
        lines.append(r["detail"])
    vs = (facts.get("resume_vs_the_selected_candidate") or {}).get("differences") or []
    if vs:
        lines.append(f"Your resume also differed from the selected candidate's: {vs[0]['title'].lower()} ({vs[0]['detail'].rstrip('.')}).")
    tips = facts.get("tips") or []
    return {"explanation": " ".join(lines) or "The company moved forward with other candidates in this round.",
            "next_step": tips[0]["title"] + "." if tips else "Review the gaps above before the next drive.",
            "source": "rules"}


def explain_decision(drive: dict, round_name: str, facts: dict, resume_text: str = "") -> dict:
    """A short, personal explanation of why the student didn't clear `round_name`, written by Claude
    from facts the platform computed (already privacy-safe). Falls back to the rule-based sentences."""
    if LLM_ENABLED == "off":
        return _story_fallback(facts)
    prompt = (
        f"Job: {drive.get('role')} at {drive.get('company')}\n"
        f"Required skills: {', '.join(drive.get('required_skills') or []) or 'none listed'}\n"
        f"Round the student did not clear: {round_name}\n\n"
        f"Facts (use only these):\n{json.dumps(facts, ensure_ascii=False, default=str)}"
        + (f"\n\nThe student's resume (for context only):\n{resume_text[:6000]}" if resume_text else "")
    )
    try:
        response = _get_client().with_options(timeout=45).beta.messages.create(
            model=LLM_MODEL,
            max_tokens=2000,
            system=STORY_SYSTEM,
            messages=[{"role": "user", "content": prompt}],
            output_config={"effort": "low", "format": {"type": "json_schema", "schema": STORY_SCHEMA}},
            betas=["server-side-fallback-2026-07-01"],
            fallbacks="default",
        )
        if response.stop_reason in ("refusal", "max_tokens"):
            raise RuntimeError(f"LLM stopped with {response.stop_reason}")
        text = next(b.text for b in response.content if b.type == "text")
        out = json.loads(text)
        return {"explanation": out["explanation"].strip(), "next_step": out["next_step"].strip(), "source": "llm"}
    except Exception as exc:
        log.warning("LLM explanation unavailable, using rule-based: %s", exc)
        return _story_fallback(facts)
