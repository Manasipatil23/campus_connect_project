"""Placement Health Score.

A logistic-regression model is trained on past batches' outcomes (the
`history` collection) to estimate each current student's placement
probability. The Health Score blends that probability with resume quality and
how actively the student is moving through the placement funnel.
"""
from typing import List, Optional

import numpy as np
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

FEATURES = ["cgpa", "backlogs", "internships", "projects", "certifications", "ats_score", "num_skills"]
FEATURE_LABELS = {
    "cgpa": "CGPA",
    "backlogs": "Active backlogs",
    "internships": "Internships",
    "projects": "Projects",
    "certifications": "Certifications",
    "ats_score": "Resume ATS score",
    "num_skills": "Skill breadth",
}


def features_of(profile: dict, ats_score: float) -> List[float]:
    return [
        float(profile.get("cgpa", 0)),
        float(profile.get("backlogs", 0)),
        float(profile.get("internships", 0)),
        float(profile.get("projects", 0)),
        float(profile.get("certifications", 0)),
        float(ats_score or 0),
        float(len(profile.get("skills", []))),
    ]


class PlacementModel:
    def __init__(self) -> None:
        self.pipe = None
        self.trained_on = 0
        self.accuracy: Optional[float] = None
        self.means: Optional[np.ndarray] = None

    def fit(self, rows: List[dict]) -> None:
        X = np.array([[r[f] for f in FEATURES] for r in rows], dtype=float)
        y = np.array([int(r["placed"]) for r in rows])
        self.pipe = make_pipeline(StandardScaler(), LogisticRegression(max_iter=1000))
        self.pipe.fit(X, y)
        self.trained_on = len(rows)
        self.accuracy = round(float(self.pipe.score(X, y)), 3)
        self.means = X.mean(axis=0)

    @property
    def ready(self) -> bool:
        return self.pipe is not None

    def probability(self, x: List[float]) -> float:
        if not self.ready:
            return 0.5
        return float(self.pipe.predict_proba(np.array([x]))[0][1])

    def drivers(self, x: List[float], top: int = 3) -> List[dict]:
        """Per-feature contribution (in standardized log-odds) vs. the average student."""
        if not self.ready:
            return []
        scaler = self.pipe.named_steps["standardscaler"]
        coef = self.pipe.named_steps["logisticregression"].coef_[0]
        z = (np.array(x) - scaler.mean_) / scaler.scale_
        contrib = coef * z
        order = np.argsort(-np.abs(contrib))[:top]
        return [
            {
                "feature": FEATURE_LABELS[FEATURES[i]],
                "impact": round(float(contrib[i]), 2),
                "direction": "positive" if contrib[i] >= 0 else "negative",
            }
            for i in order
        ]


model = PlacementModel()


def health_score(profile: dict, ats_score: float, applications: List[dict]) -> dict:
    """Placement odds need a model trained on real past outcomes. Until there is enough
    history, say so instead of inventing a number."""
    if not model.ready:
        return {"ready": False, "score": None, "band": "Not enough data yet", "placement_probability": None,
                "activity": round(min(1.0, len(applications) / 5) * 100), "drivers": []}
    x = features_of(profile, ats_score)
    prob = model.probability(x)

    stages = {a.get("status") for a in applications}
    activity = min(1.0, len(applications) / 5)
    if stages & {"shortlisted", "interview"}:
        activity = min(1.0, activity + 0.3)
    if stages & {"offered", "accepted"}:
        activity = 1.0

    score = round(100 * (0.6 * prob + 0.2 * (ats_score or 0) / 100 + 0.2 * activity))
    band = "Strong" if score >= 70 else "Moderate" if score >= 45 else "At risk"
    return {
        "ready": True,
        "score": score,
        "band": band,
        "placement_probability": round(prob, 3),
        "activity": round(activity * 100),
        "drivers": model.drivers(x),
    }
