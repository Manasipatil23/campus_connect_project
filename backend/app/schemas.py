import re
from datetime import date
from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator

AppStatus = Literal["applied", "shortlisted", "assessment_cleared", "offered", "accepted", "rejected"]

# Each stage means "cleared the round before it".
FUNNEL = ["applied", "shortlisted", "assessment_cleared", "offered", "accepted"]
STAGE_LABELS = {
    "applied": "Applied",
    "shortlisted": "Resume shortlisted",
    "assessment_cleared": "Cleared assessment",
    "offered": "Offered",
    "accepted": "Accepted",
    "rejected": "Not selected",
    "withdrawn": "Withdrawn",
    "declined": "Offer declined",
}
TERMINAL = ("accepted", "rejected", "withdrawn", "declined")
# The round a student was in when rejected from a given status.
ROUND_AT_STATUS = {
    "applied": "resume_screening",
    "shortlisted": "assessment",
    "assessment_cleared": "interview",
    "offered": "offer",
}
ROUND_LABELS = {
    "resume_screening": "Resume screening",
    "assessment": "Online assessment",
    "interview": "Interviews",
    "offer": "Offer",
}
DEFAULT_SECTIONS = ["Aptitude", "Coding", "Technical MCQ"]


class RegisterIn(BaseModel):
    name: str = Field(min_length=2)
    email: EmailStr
    password: str = Field(min_length=6)
    role: Literal["student", "recruiter"] = "student"
    company: Optional[str] = None
    college_id: Optional[str] = None


class AdminCodeIn(BaseModel):
    email: EmailStr


class AdminSetupIn(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=8, max_length=128)
    name: Optional[str] = Field(default=None, max_length=80)


class LoginIn(BaseModel):
    email: EmailStr
    password: str
    role: Optional[Literal["admin"]] = None  # the platform-admin sign-in only accepts admin accounts


class OtherLink(BaseModel):
    label: str = Field(min_length=1, max_length=40)
    url: str = Field(max_length=300)


# profile links: a username or a full URL is accepted; stored as a full URL
LINK_SITES = {
    "linkedin": ("linkedin.com", "https://www.linkedin.com/in/{}"),
    "github": ("github.com", "https://github.com/{}"),
    "leetcode": ("leetcode.com", "https://leetcode.com/u/{}"),
}
_URL = re.compile(r"^https?://[\w.-]+\.[a-z]{2,}(/\S*)?$", re.I)


def _normalise_url(value: Optional[str], site: Optional[str] = None) -> Optional[str]:
    v = (value or "").strip()
    if not v:
        return None
    if site:
        domain, template = LINK_SITES[site]
        if not v.lower().startswith("http"):
            if "/" in v or "." in v:
                v = "https://" + v.lstrip("/")
            else:
                return template.format(v.lstrip("@"))
        if domain not in v.lower():
            raise ValueError(f"must be a {domain} link or username")
    elif not v.lower().startswith("http"):
        v = "https://" + v
    if not _URL.match(v):
        raise ValueError("must be a valid link")
    return v


def season_batch(today: Optional[date] = None) -> int:
    """The batch being placed right now. A placement season runs June to May: from June 2026 to
    May 2027 it is the 2027 batch (the 2026 batch graduated in May 2026)."""
    t = today or date.today()
    return t.year + 1 if t.month >= 6 else t.year


def open_batches(today: Optional[date] = None) -> List[int]:
    """Graduation years that may sign up: this season's batch and the one just junior to it."""
    s = season_batch(today)
    return [s, s + 1]


def batch_error(year: int) -> Optional[str]:
    allowed = open_batches()
    if year in allowed:
        return None
    return f"Sign-ups are open to the {allowed[0]} and {allowed[1]} graduating batches only"


class ProfileIn(BaseModel):
    branch: str
    cgpa: float = Field(ge=0, le=10)
    backlogs: int = Field(ge=0, default=0)
    grad_year: int
    internships: int = Field(ge=0, default=0)
    projects: int = Field(ge=0, default=0)
    certifications: int = Field(ge=0, default=0)
    skills: List[str] = []
    phone: Optional[str] = None
    linkedin: Optional[str] = None
    github: Optional[str] = None
    leetcode: Optional[str] = None
    portfolio: Optional[str] = None
    other_links: List[OtherLink] = Field(default=[], max_length=5)

    @field_validator("linkedin", "github", "leetcode")
    @classmethod
    def _site_link(cls, v, info):
        return _normalise_url(v, info.field_name)

    @field_validator("portfolio")
    @classmethod
    def _portfolio(cls, v):
        return _normalise_url(v)

    @field_validator("other_links")
    @classmethod
    def _others(cls, links):
        return [OtherLink(label=l.label.strip(), url=_normalise_url(l.url)) for l in links if l.url.strip()]


class Criteria(BaseModel):
    min_cgpa: Optional[float] = None
    branches: List[str] = []
    max_backlogs: Optional[int] = None
    grad_years: List[int] = []


RoundKind = Literal["Online assessment", "Group discussion", "Technical interview", "HR interview", "Other"]


class RoundIn(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    kind: RoundKind = "Other"
    date: Optional[str] = None      # YYYY-MM-DD, tentative until the placement cell confirms
    time: Optional[str] = None
    venue: Optional[str] = Field(default=None, max_length=200)
    instructions: Optional[str] = Field(default=None, max_length=1500)


class RoundPatch(BaseModel):
    date: Optional[str] = None
    time: Optional[str] = None
    venue: Optional[str] = Field(default=None, max_length=200)
    instructions: Optional[str] = Field(default=None, max_length=1500)
    cancel: bool = False
    reason: Optional[str] = Field(default=None, max_length=300)


class DriveIn(BaseModel):
    company: str
    role: str
    description: str
    ctc_lpa: float = Field(gt=0)
    location: str = ""
    tier: Literal["regular", "dream"] = "regular"
    required_skills: List[str] = []
    preferred_skills: List[str] = []
    criteria: Criteria = Criteria()
    deadline: Optional[str] = None
    college_id: Optional[str] = None  # recruiters pick a college; coordinators use their own
    assessment_sections: List[str] = DEFAULT_SECTIONS
    rounds: List[RoundIn] = []
    criteria_confirmed: bool = False  # recruiter reviewed the skills extracted from the JD
    submit: bool = False              # send straight to the placement cell for review
    jd_file_id: Optional[str] = None  # an uploaded JD (PDF/Word) to attach for students to download


class DrivePatch(BaseModel):
    role: Optional[str] = None
    description: Optional[str] = None
    ctc_lpa: Optional[float] = Field(default=None, gt=0)
    location: Optional[str] = None
    tier: Optional[Literal["regular", "dream"]] = None
    deadline: Optional[str] = None
    criteria: Optional[Criteria] = None
    required_skills: Optional[List[str]] = None
    preferred_skills: Optional[List[str]] = None
    criteria_confirmed: Optional[bool] = None
    reason: Optional[str] = Field(default=None, max_length=300)


class DriveReviewIn(BaseModel):
    decision: Literal["approve", "changes", "decline"]
    note: Optional[str] = Field(default=None, max_length=1000)


class DriveStatusIn(BaseModel):
    status: Literal["in_progress", "completed", "cancelled"]
    reason: Optional[str] = Field(default=None, max_length=300)


class ChangeDecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    note: Optional[str] = Field(default=None, max_length=500)


class JDIn(BaseModel):
    description: str = Field(min_length=20)


class StatusIn(BaseModel):
    status: AppStatus
    reason: Optional[str] = Field(default=None, max_length=300)


class HoldIn(BaseModel):
    on_hold: bool
    reason: Optional[str] = Field(default=None, max_length=300)


class OfferResponseIn(BaseModel):
    decision: Literal["accept", "decline"]


class FeedbackIn(BaseModel):
    round: str = Field(min_length=2, max_length=60)
    # private scorecard (1-5), never shown to the student
    scores: Dict[str, int] = {}
    private_notes: Optional[str] = Field(default=None, max_length=2000)
    # what the candidate may see, only once share_with_student is true
    strengths: Optional[str] = Field(default=None, max_length=1500)
    improvements: Optional[str] = Field(default=None, max_length=1500)
    share_with_student: bool = False


class ScreeningReviewIn(BaseModel):
    # recruiter corrections to the AI evidence levels: skill -> strong | partial | not_shown
    overrides: Dict[str, Literal["strong", "partial", "not_shown"]] = {}
    note_to_student: Optional[str] = Field(default=None, max_length=1500)
    share_with_student: bool = False


class InterviewScoreIn(BaseModel):
    score: float = Field(ge=0, le=100)          # overall interview score, percent
    note: Optional[str] = Field(default=None, max_length=300)   # private to the company


class CutoffIn(BaseModel):
    stage: Literal["resume", "assessment", "interview"]
    min_score: float = Field(ge=0, le=100)
    reject_rest: bool = False   # also mark everyone below the cut-off as not selected
    dry_run: bool = False       # just show who would pass


class AssessmentIn(BaseModel):
    # section name -> score in percent (0-100)
    sections: Dict[str, float]


class ResumeTextIn(BaseModel):
    text: str = Field(min_length=50)


# ---- onboarding -------------------------------------------------------------
PHONE = r"^(\+91[\s-]?)?[6-9]\d{9}$"
NAAC_GRADES = Literal["A++", "A+", "A", "B++", "B+", "B", "C", "Not accredited"]


class SendCodeIn(BaseModel):
    email: str
    kind: Literal["student", "college", "company"]
    college_id: Optional[str] = None  # students: checked against the college's student email domain
    domain: Optional[str] = None      # colleges/companies: their official domain


class StudentSignupIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)
    email: str
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=8, max_length=128)
    college_id: str
    roll_number: str = Field(min_length=2, max_length=30)
    branch: str
    grad_year: int = Field(ge=2020, le=2035)
    phone: str = Field(pattern=PHONE)


class CollegeSignupIn(BaseModel):
    # institution
    name: str = Field(min_length=5, max_length=150)
    aishe_code: str = Field(pattern=r"^[CUS]-\d{3,6}$", description="AISHE code, e.g. C-41234")
    institution_type: Literal["Government", "Government-aided", "Private", "Autonomous", "Deemed university"]
    affiliated_university: str = Field(min_length=3, max_length=150)
    established_year: int = Field(ge=1850, le=2026)
    naac_grade: NAAC_GRADES
    nirf_rank: Optional[int] = Field(default=None, ge=1, le=1000)
    website: str = Field(pattern=r"^https?://[\w.-]+\.[a-z]{2,}(/.*)?$")
    address: str = Field(min_length=10, max_length=300)
    city: str = Field(min_length=2, max_length=60)
    state: str = Field(min_length=2, max_length=60)
    pincode: str = Field(pattern=r"^[1-9]\d{5}$")
    phone: str = Field(pattern=r"^(\+91[\s-]?)?[0-9]{10,11}$")
    email_domain: str = Field(pattern=r"^[\w-]+(\.[\w-]+)+$", description="Official domain, e.g. westbridge.edu.in")
    student_email_domain: Optional[str] = Field(default=None, pattern=r"^[\w-]+(\.[\w-]+)+$")
    # placement officer (becomes the coordinator account)
    tpo_name: str = Field(min_length=3, max_length=100)
    tpo_designation: str = Field(min_length=2, max_length=80)
    tpo_email: str
    tpo_phone: str = Field(pattern=PHONE)
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=8, max_length=128)


class CompanySignupIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    website: str = Field(pattern=r"^https?://[\w.-]+\.[a-z]{2,}(/.*)?$")
    email_domain: str = Field(pattern=r"^[\w-]+(\.[\w-]+)+$")
    industry: str = Field(min_length=2, max_length=60)
    size: Literal["1-50", "51-200", "201-1000", "1001-5000", "5000+"]
    hq_city: str = Field(min_length=2, max_length=60)
    cin: Optional[str] = Field(default=None, pattern=r"^[LUlu]\d{5}[A-Za-z]{2}\d{4}[A-Za-z]{3}\d{6}$")
    gstin: Optional[str] = Field(default=None, pattern=r"^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
    about: str = Field(min_length=20, max_length=1000)
    hr_name: str = Field(min_length=3, max_length=100)
    hr_designation: str = Field(min_length=2, max_length=80)
    hr_email: str
    hr_phone: str = Field(pattern=PHONE)
    code: str = Field(min_length=6, max_length=6)
    password: str = Field(min_length=8, max_length=128)


class BulkDecisionIn(BaseModel):
    approve: List[str] = Field(default=[], max_length=2000)
    reject: List[str] = Field(default=[], max_length=2000)
    note: Optional[str] = Field(default=None, max_length=300)  # reason sent to the students not approved


class NameIn(BaseModel):
    first_name: str = Field(min_length=1, max_length=60)
    last_name: str = Field(min_length=1, max_length=60)


class NameReviewIn(BaseModel):
    action: Literal["ok", "message", "revert", "suspend", "reactivate"]
    message: Optional[str] = Field(default=None, max_length=500)


class DecisionIn(BaseModel):
    decision: Literal["approve", "reject"]
    note: Optional[str] = Field(default=None, max_length=300)
    tier: Optional[int] = Field(default=None, ge=1, le=3)  # admin assigns a college tier on approval


class MessageIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)
    kind: Literal["message", "info_request", "date_confirmation", "document_request"] = "message"
    drive_id: Optional[str] = None


class AnnouncementIn(BaseModel):
    title: str = Field(min_length=3, max_length=140)
    body: str = Field(min_length=5, max_length=5000)
    audience: Literal["all", "branches", "drive_eligible", "drive_applicants"] = "all"
    branches: List[str] = []
    drive_id: Optional[str] = None


class IssueIn(BaseModel):
    category: Literal["Unclear update", "Schedule", "Eligibility", "Application status", "Technical problem", "Other"]
    subject: str = Field(min_length=4, max_length=140)
    description: str = Field(min_length=10, max_length=3000)
    drive_id: Optional[str] = None


class IssuePatch(BaseModel):
    status: Optional[Literal["open", "in_progress", "waiting", "resolved", "closed"]] = None
    assign_to_me: bool = False
    reply: Optional[str] = Field(default=None, max_length=2000)          # visible to the student
    internal_note: Optional[str] = Field(default=None, max_length=2000)  # placement staff only


class ModerateIn(BaseModel):
    decision: Literal["approve", "reject", "remove"]
    note: Optional[str] = Field(default=None, max_length=300)
    tags: List[str] = []


class ConnectIn(BaseModel):
    college_id: Optional[str] = None
    company_id: Optional[str] = None
    message: Optional[str] = Field(default=None, max_length=500)


class ExperienceIn(BaseModel):
    drive_id: Optional[str] = None       # set when shared from one of your applications (verified)
    company: Optional[str] = None        # otherwise: free-text company + role
    role: Optional[str] = None
    round_type: Literal["Online assessment", "Technical interview", "HR interview", "Group discussion", "Coding round", "Other"]
    platform: Optional[str] = Field(default=None, max_length=60)   # e.g. HackerRank, company portal
    duration_minutes: Optional[int] = Field(default=None, ge=5, le=600)
    difficulty: int = Field(ge=1, le=5)
    outcome: Literal["cleared", "not_cleared", "awaiting"]
    topics: List[str] = Field(default=[], max_length=15)
    questions: List[str] = Field(default=[], max_length=20)
    tips: Optional[str] = Field(default=None, max_length=1500)
    anonymous: bool = True
