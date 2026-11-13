# Campus Connect — AI-Powered Placement Analytics Platform

A verified placement network for students, college placement cells and companies.

**Who does what**
- **Platform admin** verifies every college (AISHE code, NAAC grade, official domain; assigns a tier 1–3) and every company (CIN/GSTIN, work domain) before they can use the platform.
- **Placement cell (TPO)** is activated when its college is approved. It decides which students may join, runs drives round by round, records assessment scores, and connects with companies.
- **Students** sign up with a verified email (format check, real mail domain via DNS, no disposable inboxes, a 6-digit code, and the college's student domain if it has one), pick their college, and wait for their placement cell to approve them. Their home page is **analytics**: what's going well, what's going wrong, what to focus on next, round-by-round clearance vs. their college, skills in demand, and assessment sections vs. those who cleared.
- **Students share interview and assessment experiences** (what was asked, difficulty, platform, tips). A post linked to the author's own application is marked *Verified*; posts are anonymous by default.
- **Companies** are activated when approved, browse colleges by tier and city, send connection requests, and can only post drives to colleges whose placement cell has accepted.

**Stack:** React 18 + Vite + Tailwind + Recharts · FastAPI · MongoDB (Motor) · scikit-learn · Claude (optional) · JWT auth

## Shared workflow: one record, three portals

The company, placement-cell and student portals read the **same** drive and application records (`backend/app/workflow.py`, `routers/drives.py`, `routers/hub.py`). Whoever owns a piece of information updates it once; it's routed to the next responsible person for approval and then shown to everyone who needs it.

| Update | Who does it | Where it shows |
|---|---|---|
| Connection request / accept / cancel, messages | College or company | Both portals + notifications (`/connect`) |
| Drive created (Draft) | Company | Company only, until sent for review |
| Sent for review → Approved / Needs changes / Declined | Company → placement cell | Both portals |
| Published | Placement cell | Students (only eligible ones are notified) |
| JD / eligibility / CTC / deadline change after review | Company proposes, college confirms | Students keep seeing the confirmed value, marked *update pending confirmation* |
| Round date change | Company proposes, college confirms | Students see the old confirmed date + *New date pending confirmation*, then *Rescheduled* |
| Stage change, hold, offer | Recruiter | Student tracker, college dashboard, analytics |
| Offer accept / decline, withdraw | Student | Recruiter and placement cell |
| Screening explanation, interview feedback | Recruiter approves and shares | That student only (private notes and scorecards never leave the company) |
| Notices | Placement cell | All / selected branches / drive-eligible / drive applicants |
| Issues | Student raises, placement cell assigns and resolves | Student sees status + replies, never internal notes |
| Interview experiences | Student submits, placement cell moderates | Repository after approval (anonymised) |

**Statuses** — drive: Draft → Sent for review → Needs changes / Approved → Published → In progress → Completed / Cancelled · round: Planned → Pending confirmation → Confirmed → Rescheduled / Cancelled · connection: Requested → Accepted / Declined / Cancelled · application: Applied → Shortlisted → Cleared assessment → Offered → Accepted / Offer declined / Not selected / Withdrawn (+ On hold) · issue: Open → In progress → Waiting for information → Resolved / Closed.

**Update history** (`updates` collection) records what changed, old and new value, who, which portal, when, whether it needed approval and who was notified; every drive page shows it. **Notifications** (bell in the header) are sent on events that matter to that person, not every edit. **Inbox** (`/inbox`) lists what's waiting on you. Analytics are computed from application and offer records, never hand-maintained numbers.


**Workflow test:** `.venv/bin/python -m tests.test_workflow` walks connection → draft → review → publish → apply → screening → schedule change → offer → acceptance → analytics, and checks the privacy rules.

## "Why wasn't I shortlisted?"

`backend/app/ml/insights.py` builds the round-level feedback:

- **Resume screening:** your resume is compared with everyone who *was* shortlisted for that drive. It shows match score, required-skill coverage, quantified impact, CGPA, internships, projects and certifications (you vs. median vs. lowest shortlisted), plus how common each skill was among shortlisted resumes. It then ranks the likely reasons and gives suggestions, which Claude personalises when an API key is set.
- **Assessment:** section-by-section scores against those who cleared, an estimated cut-off (the lowest cleared total), your percentile, and practice topics for your weakest sections.
- **Privacy:** only aggregates are returned, and only when at least 3 students cleared the round. No peer's resume, name or individual score is ever exposed. The resume and profile are snapshotted at apply time, so the comparison reflects what the screener actually saw.

## How the ML works

| Piece | File | What it does |
|---|---|---|
| ATS scoring | `backend/app/ml/ats.py` | Gives a 0–100 score: 40% skill coverage vs. the job's required skills, 30% TF-IDF cosine similarity with the job description, 20% resume structure (expected sections), 10% quantified impact. |
| Eligibility | `backend/app/ml/eligibility.py` | Checks min CGPA, branches, max backlogs and graduation year. Placed students can only apply to *dream*-tier drives. |
| Placement Health Score | `backend/app/ml/health.py` | A logistic-regression model trained on past batches (`history` collection) predicts placement odds. The score is 60% model probability, 20% ATS, 20% funnel activity, plus the top factors helping or hurting each student. |
| Resume review | `backend/app/ml/llm.py` | Claude (`claude-opus-5-5`) returns strengths, improvements and rewritten bullets as structured JSON. Without API credentials it falls back to rule-based feedback, so nothing breaks. |

## Run it locally

Prerequisites: Python 3.10+, Node 18+, and MongoDB running on `localhost:27017`.

```bash
# 1. Backend
cd backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env            # optional: add ANTHROPIC_API_KEY for AI reviews
.venv/bin/python -m app.seed    # creates the 4 demo logins if missing (never deletes anything)
.venv/bin/uvicorn app.main:app --reload --port 8000
```

```bash
# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                      # http://localhost:5173 (proxies /api to :8000)
```

The database holds real data only. `python -m app.seed --wipe` deletes everything except the 4 demo logins and their college (Westbridge) and company (Nimbus Analytics), and resets those to a fresh state.

API docs: http://localhost:8000/docs

### Demo accounts (created by the seed)

| Role | Email | Password |
|---|---|---|
| Student (Westbridge Institute of Technology) | student@campusconnect.dev | student123 |
| Placement cell (Westbridge) | tpo@campusconnect.dev | tpo123 |
| Company (Nimbus Analytics) | recruiter@campusconnect.dev | recruiter123 |

**Platform admin:** there is no demo admin. Only the addresses listed in `ADMIN_EMAILS` in `backend/.env` can be platform admin. The first time (or after a forgotten password), open **Sign in → Platform admin sign in → First time, or forgot your password?**: a code is emailed to that address and you choose the password. Any other admin account is refused.

**Email verification:** without SMTP settings the backend runs in dev mode and shows the 6-digit code on screen (and in the server log). Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` and `SMTP_FROM` in `backend/.env` to send real emails.

**Tests** (each creates its own data and removes it afterwards): `.venv/bin/python -m tests.test_onboarding` walks the whole chain: college signup → admin approval → student signup → placement-cell approval → company connection → drive → shared experience. It cleans up after itself.

There is no dummy data: dashboards start at zero and fill up as real colleges, companies and students use the site. The demo logins belong to an empty demo college (Westbridge Institute of Technology) and company (Nimbus Analytics). Placement health shows "not enough data yet" until there are real past placement outcomes to learn from.

## Project layout

```
backend/app/
  main.py          FastAPI app; trains the placement model on startup
  auth.py          bcrypt passwords, JWT issue/verify, role guards
  workflow.py      shared status vocabularies, update history, notifications, audiences
  routers/         auth · students · drives (+ applications, rounds, change requests, screening) · analytics · admin
                   college (+ connections, messages) · experiences (+ moderation) · hub (notifications, actions, notices, issues)
  ml/              ats · eligibility · health · insights · student_analytics · llm
  emailing.py      email validation + verification codes
  seed.py          demo logins only (--wipe removes everything else)
  migrate_db.py    copy a database (e.g. local -> MongoDB Atlas)
frontend/src/
  pages/           Landing, sign-up flows, Student, Placement cell, Company and Admin views
  components/fx/   particle field, 3D dot globe, scroll/tilt/count-up motion
  components/      Layout, charts, ATS breakdown, UI kit
```
