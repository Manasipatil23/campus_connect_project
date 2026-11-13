import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Check, Clock, Lightbulb, Lock, Sparkles, X } from "lucide-react";
import { api } from "../api";
import { Badge, Bar, ErrorNote, Spinner, useApi, fmtDate, plural } from "../components/ui";
import { StudentRound } from "../components/workflow";

const STATE_STYLE = {
  cleared: { dot: "bg-emerald-500 text-white", icon: Check, text: "Cleared" },
  rejected: { dot: "bg-rose-500 text-white", icon: X, text: "Not cleared" },
  in_progress: { dot: "bg-brand-600 text-white animate-pulse", icon: Clock, text: "In progress" },
  not_reached: { dot: "bg-black/[.06] text-ink-muted", icon: null, text: "—" },
};

function Timeline({ rounds, status }) {
  return (
    <ol className="grid gap-4 sm:grid-cols-4">
      {rounds.map((r, i) => {
        const s = STATE_STYLE[r.state];
        const Icon = s.icon;
        return (
          <li key={r.round} className="relative flex items-center gap-3 sm:flex-col sm:items-start">
            {i < rounds.length - 1 && <span className="absolute left-[15px] top-8 hidden h-px w-[calc(100%-8px)] bg-black/[.08] sm:left-9 sm:top-4 sm:block" />}
            <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${s.dot}`}>
              {Icon ? <Icon className="h-4 w-4" /> : <span className="text-xs">{i + 1}</span>}
            </span>
            <div>
              <div className="text-sm font-medium">{r.label}</div>
              <div className="text-xs text-ink-muted">{r.round === "offer" && r.state === "cleared" && status === "accepted" ? "Accepted" : s.text}{r.at && r.state === "cleared" ? ` · ${fmtDate(r.at)}` : ""}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

const WEIGHT = {
  high: "bg-rose-50 text-rose-600",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-black/[.05] text-ink-soft",
};

function PrivacyNote({ n, what }) {
  return (
    <p className="flex items-center gap-2 text-xs text-ink-muted">
      <Lock className="h-3.5 w-3.5" /> Compared with {plural(n, "student")} who {what}. Only group statistics are shown — never anyone's resume or name.
    </p>
  );
}

function Suggestions({ items, source }) {
  if (!items?.length) return null;
  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand-50 to-white p-6 border border-brand-100">
      <div className="mb-4 flex items-center gap-2">
        <Lightbulb className="h-4 w-4 text-brand-600" />
        <h3 className="font-medium">What to work on</h3>
        {source && <span className="chip ml-auto bg-white text-ink-muted">{source === "llm" ? <><Sparkles className="mr-1 h-3 w-3 text-brand-500" /> AI-personalised</> : "Based on the gaps"}</span>}
      </div>
      <ol className="space-y-4">
        {items.map((s, i) => (
          <li key={i} className="flex gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-xs font-medium text-brand-700 shadow-soft">{i + 1}</span>
            <div><div className="text-sm font-medium">{s.title}</div><div className="mt-0.5 text-sm text-ink-muted">{s.detail}</div></div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Compare({ label, you, median, min, unit, max }) {
  const scale = (v) => (100 * v) / max;
  const below = you < min;
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="tabular-nums text-ink-muted">
          <b className={`font-medium ${below ? "text-rose-600" : you < median ? "text-amber-600" : "text-emerald-600"}`}>{you}{unit}</b>
          {" "}vs median {median}{unit}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-brand-50">
        <div className="absolute h-2 rounded-full bg-brand-200" style={{ left: `${scale(min)}%`, width: `${Math.max(1, scale(median) - scale(min))}%` }} title="Lowest to median of those who cleared" />
        <div className="absolute -top-1 h-4 w-1 rounded-full bg-ink" style={{ left: `calc(${Math.min(100, scale(you))}% - 2px)` }} title="You" />
      </div>
    </div>
  );
}

/** "Why" list shared by both rounds, plus the company's own reason when they gave one. */
function WhyList({ ins, title = "Why you weren't selected" }) {
  return (
    <div className="card p-6">
      <h3 className="mb-4 font-medium">{title}</h3>
      {ins.company_reason && (
        <div className="mb-4 rounded-xl bg-rose-50/70 px-4 py-3 text-sm text-rose-900"><span className="font-medium">The company's reason: </span>{ins.company_reason}</div>
      )}
      <ul className="divide-y divide-black/[.05]">
        {ins.reasons.map((r, i) => (
          <li key={i} className="flex gap-4 py-3.5 first:pt-0 last:pb-0">
            <span className={`chip h-fit w-16 shrink-0 justify-center capitalize ${WEIGHT[r.weight]}`}>{r.weight}</span>
            <div><div className="text-sm font-medium">{r.title}</div><div className="mt-0.5 text-sm text-ink-muted">{r.detail}</div></div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ResumeInsights({ ins }) {
  if (!ins.available) return <div className="card p-6 text-sm text-ink-muted">{ins.reason}</div>;
  if (ins.brief) return (
    <section className="space-y-6">
      <div><div className="eyebrow">Resume screening</div><h2 className="mt-3 text-2xl font-medium tracking-tight">{ins.headline}</h2></div>
      {!ins.cleared && <WhyList ins={ins} />}
      {ins.strengths?.length > 0 && <p className="text-sm text-ink-muted"><span className="font-medium text-ink">Working for you: </span>your resume showed {ins.strengths.join(", ")}, which the job requires.</p>}
      {!ins.cleared && <Suggestions items={ins.suggestions?.items} source={ins.suggestions?.source} />}
    </section>
  );
  const maxOf = { "/100": 100, "%": 100 };
  return (
    <section className="space-y-6">
      <div>
        <div className="eyebrow">Resume screening</div>
        <h2 className="mt-3 text-2xl font-medium tracking-tight">{ins.headline}</h2>
        <div className="mt-2"><PrivacyNote n={ins.cohort_size} what="were shortlisted" /></div>
      </div>

      {!ins.cleared && ins.company_reason && <div className="rounded-xl bg-rose-50/70 px-4 py-3 text-sm text-rose-900"><span className="font-medium">The company's reason: </span>{ins.company_reason}</div>}
      {!ins.cleared && ins.reasons.length > 0 && (
        <div className="card p-6">
          <h3 className="mb-4 font-medium">Likely reasons</h3>
          <ul className="divide-y divide-black/[.05]">
            {ins.reasons.map((r, i) => (
              <li key={i} className="flex gap-4 py-3.5 first:pt-0 last:pb-0">
                <span className={`chip h-fit w-16 shrink-0 justify-center capitalize ${WEIGHT[r.weight]}`}>{r.weight}</span>
                <div><div className="text-sm font-medium">{r.title}</div><div className="mt-0.5 text-sm text-ink-muted">{r.detail}</div></div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h3 className="font-medium">You vs. shortlisted resumes</h3>
          <p className="mb-5 mt-1 text-xs text-ink-muted">Shaded band: lowest to median of shortlisted. Black marker: you.</p>
          <div className="space-y-5">
            {ins.metrics.map((m) => {
              const max = maxOf[m.unit] || Math.max(m.you, m.median, m.min, 1) * 1.25 || 1;
              return <Compare key={m.label} {...m} max={m.label === "CGPA" ? 10 : max} />;
            })}
          </div>
        </div>
        <div className="card p-6">
          <h3 className="font-medium">Skills on shortlisted resumes</h3>
          <p className="mb-5 mt-1 text-xs text-ink-muted">Share of shortlisted resumes showing each skill.</p>
          <ul className="space-y-3">
            {ins.skills.map((s) => (
              <li key={s.skill} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1">
                <div className="flex items-center gap-2 text-sm">
                  {s.you ? <Check className="h-4 w-4 text-emerald-600" /> : <X className="h-4 w-4 text-rose-500" />}
                  <span className={s.you ? "" : "font-medium"}>{s.skill}</span>
                  {s.required && <span className="chip bg-brand-50 text-brand-700">required</span>}
                </div>
                <span className="text-xs tabular-nums text-ink-muted">{s.share}%</span>
                <div className="col-span-2"><Bar value={s.share} className={s.you ? "bg-emerald-300" : "bg-gradient-to-r from-brand-400 to-brand-600"} /></div>
              </li>
            ))}
          </ul>
          {ins.strengths.length > 0 && (
            <div className="mt-6 border-t border-black/[.06] pt-4 text-sm text-ink-muted">
              <span className="font-medium text-ink">Working for you: </span>you showed {ins.strengths.join(", ")}, which most shortlisted resumes also had.
            </div>
          )}
        </div>
      </div>

      {!ins.cleared && <Suggestions items={ins.suggestions?.items} source={ins.suggestions?.source} />}
    </section>
  );
}

function AssessmentInsights({ ins }) {
  if (!ins.available) return <div className="card p-6 text-sm text-ink-muted">{ins.reason}</div>;
  if (ins.brief) return (
    <section className="space-y-6">
      <div><div className="eyebrow">Online assessment</div><h2 className="mt-3 text-2xl font-medium tracking-tight">{ins.headline}</h2></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card p-5"><div className="text-xs text-ink-muted">Your overall</div><div className="mt-2 text-3xl font-medium tabular-nums">{ins.total}%</div></div>
        <div className="card p-5"><div className="text-xs text-ink-muted">{ins.cleared ? "To clear this round" : "Cut-off"}</div>
          <div className="mt-2 text-3xl font-medium tabular-nums">{ins.cutoff_estimate != null ? `${ins.cutoff_estimate}%+` : "—"}</div>
          <div className="text-xs text-ink-muted">{ins.cutoff_estimate != null ? "Overall score of those who cleared, rounded down" : "Nobody cleared this round"}</div></div>
      </div>
      {!ins.cleared && ins.reasons?.length > 0 && <WhyList ins={ins} />}
      <div className="card p-6">
        <h3 className="font-medium">Section by section</h3>
        <ul className="mt-4 space-y-4">
          {ins.sections.map((x) => (
            <li key={x.section}>
              <div className="flex justify-between text-sm"><span>{x.section}</span>
                <span className="tabular-nums"><b className="font-medium">{x.you}%</b>{x.cleared_band != null && <span className="text-ink-muted"> · cleared at {x.cleared_band}%+</span>}</span></div>
              <div className="relative mt-1.5 h-2 rounded-full bg-black/[.05]">
                <div className={`h-2 rounded-full ${x.cleared_band != null && x.you < x.cleared_band ? "bg-rose-400" : "bg-emerald-400"}`} style={{ width: `${Math.min(100, x.you)}%` }} />
                {x.cleared_band != null && <span className="absolute -top-1 h-4 w-0.5 bg-ink" style={{ left: `${Math.min(100, x.cleared_band)}%` }} title={`Cleared at ${x.cleared_band}%+`} />}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-ink-muted">Bar: your score. Black line: what those who cleared scored at least, rounded down to protect their privacy.</p>
      </div>
      {!ins.cleared && <Suggestions items={ins.suggestions} />}
    </section>
  );
  return (
    <section className="space-y-6">
      <div>
        <div className="eyebrow">Online assessment</div>
        <h2 className="mt-3 text-2xl font-medium tracking-tight">{ins.headline}</h2>
        <div className="mt-2"><PrivacyNote n={ins.cohort_size} what="cleared the assessment" /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-5"><div className="text-xs text-ink-muted">Your overall</div><div className="mt-2 text-3xl font-medium tabular-nums">{ins.total}%</div></div>
        <div className="card p-5"><div className="text-xs text-ink-muted">Estimated cut-off</div><div className="mt-2 text-3xl font-medium tabular-nums">{ins.cutoff_estimate}%</div><div className="text-xs text-ink-muted">Lowest overall among those who cleared</div></div>
        <div className="card p-5"><div className="text-xs text-ink-muted">Your percentile</div><div className="mt-2 text-3xl font-medium tabular-nums">{ins.percentile}<span className="text-base">th</span></div><div className="text-xs text-ink-muted">Among everyone who took it</div></div>
      </div>
      <div className="card p-6">
        <h3 className="font-medium">Section by section</h3>
        <p className="mb-5 mt-1 text-xs text-ink-muted">Shaded band: lowest to median of those who cleared. Black marker: you.</p>
        <div className="space-y-5">
          {ins.sections.map((s) => (
            <Compare key={s.section} label={`${s.section} · ${s.percentile}th percentile`} you={s.you} median={s.cleared_median} min={s.cleared_min} unit="%" max={100} />
          ))}
        </div>
      </div>
      {!ins.cleared && <Suggestions items={ins.suggestions} />}
    </section>
  );
}

const LEVEL = {
  strong: ["Shown clearly", "bg-emerald-50 text-emerald-700"],
  partial: ["Listed, not shown in use", "bg-amber-50 text-amber-700"],
  not_shown: ["Not demonstrated in your resume", "bg-black/[.05] text-ink-muted"],
};

function OfferBox({ app, drive, onDone }) {
  const [err, setErr] = useState(null);
  const respond = async (decision) => {
    if (decision === "decline" && !window.confirm("Decline this offer? This can't be undone.")) return;
    try { await api(`/students/me/applications/${app.id}/offer`, { method: "POST", body: { decision } }); onDone(); }
    catch (e) { setErr(e.message); }
  };
  return (
    <div className="rounded-3xl bg-ink p-6 text-white">
      <div className="text-sm text-white/60">Offer from {drive.company}</div>
      <div className="mt-1 text-2xl font-medium">{drive.role} · {drive.ctc_lpa} LPA</div>
      <p className="mt-2 text-sm text-white/70">Your response goes to the recruiter and your placement cell.</p>
      <ErrorNote>{err}</ErrorNote>
      <div className="mt-5 flex gap-2">
        <button className="btn bg-white text-ink hover:bg-brand-50" onClick={() => respond("accept")}>Accept offer</button>
        <button className="btn border border-white/20 text-white hover:bg-white/10" onClick={() => respond("decline")}>Decline</button>
      </div>
    </div>
  );
}

function ScreeningExplanation({ s }) {
  return (
    <section className="card p-6">
      <div className="eyebrow">Recruiter-verified screening</div>
      <h2 className="mt-3 text-xl font-medium tracking-tight">How your resume matched the published criteria</h2>
      {s.note && <p className="mt-3 rounded-xl bg-brand-50/60 p-4 text-sm">{s.note}</p>}
      <ul className="mt-5 divide-y divide-black/[.05]">
        {s.criteria.map((c) => (
          <li key={c.kind + c.skill} className="flex flex-wrap items-start gap-3 py-3 first:pt-0">
            <span className="w-32 text-sm font-medium">{c.skill} <span className="text-xs font-normal text-ink-muted">{c.kind}</span></span>
            <span className={`chip ${LEVEL[c.level][1]}`}>{LEVEL[c.level][0]}</span>
            {c.evidence[0] && <span className="min-w-0 flex-1 truncate text-xs text-ink-muted">“{c.evidence[0]}”</span>}
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink-muted">“Not demonstrated” means your resume didn't show it, not that you lack the skill — add a project or experience line that shows it in use.</p>
    </section>
  );
}

export default function ApplicationDetail() {
  const { id } = useParams();
  const { data, error, reload } = useApi(`/students/me/applications/${id}`);
  const [err, setErr] = useState(null);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner label="Comparing with the shortlisted cohort…" />;
  const { application: app, drive, timeline, insights, screening, feedback } = data;
  const nothingYet = !insights.resume && !insights.assessment && !screening;
  const closed = ["accepted", "rejected", "withdrawn", "declined", "offered"].includes(app.status);
  const withdraw = async () => {
    if (!window.confirm("Withdraw your application? The recruiter will be told and you can't re-apply.")) return;
    try { await api(`/students/me/applications/${app.id}/withdraw`, { method: "POST" }); reload(); } catch (e) { setErr(e.message); }
  };

  return (
    <div className="space-y-10">
      <div>
        <Link to="/" className="mb-6 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Overview</Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="eyebrow">{drive.company}</div>
            <h1 className="mt-4 text-3xl font-medium tracking-[-0.03em] sm:text-4xl">{drive.role}</h1>
            <p className="mt-1 text-ink-muted">{[`${drive.ctc_lpa} LPA`, drive.location, `applied ${fmtDate(app.applied_at)}`].filter(Boolean).join(" · ")}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge value={app.status} />
            {app.on_hold && <span className="chip bg-amber-50 text-amber-700">On hold{app.hold_reason && `: ${app.hold_reason}`}</span>}
            {!closed && <button className="text-xs text-ink-muted hover:text-rose-600" onClick={withdraw}>Withdraw application</button>}
          </div>
        </div>
        <ErrorNote>{err}</ErrorNote>
      </div>

      {app.drive_cancelled && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          <b className="font-medium">This drive was cancelled</b>{drive.status_reason ? `: ${drive.status_reason}` : "."} It no longer counts as an application in progress or a placement.
        </div>
      )}
      {app.status === "offered" && !app.drive_cancelled && <OfferBox app={app} drive={drive} onDone={reload} />}

      <div className="card p-6"><Timeline rounds={timeline} status={app.status} /></div>

      {drive.rounds?.length > 0 && (
        <div className="card p-6">
          <div className="mb-4 flex items-center justify-between"><h2 className="font-medium">Schedule</h2><Link to={`/drives/${drive.id}`} className="text-xs text-brand-700 hover:underline">Drive details & updates →</Link></div>
          <div className="space-y-4">{drive.rounds.map((r) => <StudentRound key={r.id} r={r} />)}</div>
        </div>
      )}

      {feedback?.length > 0 && (
        <section className="card p-6">
          <div className="eyebrow">Interview feedback</div>
          <div className="mt-4 space-y-4">
            {feedback.map((f) => (
              <div key={f.id} className="rounded-2xl border border-black/[.06] p-4 text-sm">
                <div className="font-medium">{f.round}</div>
                {f.strengths && <p className="mt-2"><span className="text-emerald-700">What went well:</span> {f.strengths}</p>}
                {f.improvements && <p className="mt-1"><span className="text-brand-700">To work on:</span> {f.improvements}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {screening && <ScreeningExplanation s={screening} />}

      {nothingYet && (
        <div className="card p-8 text-center">
          <Clock className="mx-auto h-6 w-6 text-brand-500" />
          <div className="mt-3 font-medium">Resume screening is still in progress</div>
          <p className="mt-1 text-sm text-ink-muted">Once results are out, you'll see how your resume compared with the shortlisted ones — whatever the outcome.</p>
        </div>
      )}
      {insights.assessment && app.rejected_round === "assessment" && <AssessmentInsights ins={insights.assessment} />}
      {insights.resume && <ResumeInsights ins={insights.resume} />}
      {insights.assessment && app.rejected_round !== "assessment" && <AssessmentInsights ins={insights.assessment} />}
    </div>
  );
}
