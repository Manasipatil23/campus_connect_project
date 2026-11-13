import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, CircleHelp, ClipboardList, FileSearch, Filter, MessageSquare, Pause, Play, Star, XCircle } from "lucide-react";
import { api } from "../api";
import { Badge, Empty, ErrorNote, Modal, PageHeader, STATUS_LABELS, Spinner, Tabs, scoreColor, useApi, plural } from "../components/ui";

const NEXT = {
  applied: [["shortlisted", "Shortlist"], ["rejected", "Reject"]],
  shortlisted: [["assessment_cleared", "Clear assessment"], ["rejected", "Reject"]],
  assessment_cleared: [["offered", "Release offer"], ["rejected", "Reject"]],
  offered: [["rejected", "Withdraw offer"]], // the student accepts or declines from their tracker
  accepted: [], rejected: [], withdrawn: [], declined: [],
};
const STAGES = ["all", "applied", "shortlisted", "assessment_cleared", "offered", "accepted", "rejected", "withdrawn"];
const LEVEL = {
  strong: ["Strong evidence", "bg-emerald-50 text-emerald-700"],
  partial: ["Partial evidence", "bg-amber-50 text-amber-700"],
  not_shown: ["Not demonstrated in resume", "bg-black/[.05] text-ink-muted"],
};
const RULE_ICON = { pass: [CheckCircle2, "text-emerald-600"], fail: [XCircle, "text-rose-500"], needs_confirmation: [CircleHelp, "text-amber-500"] };

function Screening({ app, canHire, onSaved }) {
  const { data, error } = useApi(`/applications/${app.id}/screening`);
  const [over, setOver] = useState(null);
  const [note, setNote] = useState("");
  const [share, setShare] = useState(false);
  const [err, setErr] = useState(null);
  const [saved, setSaved] = useState(false);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner label="Comparing resume with this JD…" />;
  const overrides = over ?? data.review?.overrides ?? {};
  const levelOf = (c) => overrides[c.skill] ?? c.ai_level;
  const save = async () => {
    setErr(null);
    try {
      await api(`/applications/${app.id}/screening`, { method: "PUT", body: { overrides, note_to_student: note || data.review?.note_to_student || null, share_with_student: share || Boolean(data.review?.share_with_student) } });
      setSaved(true); onSaved();
    } catch (e) { setErr(e.message); }
  };
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-4 text-sm">
        <div className="rounded-xl bg-brand-50/60 px-4 py-2">Match score <b className={`font-medium ${scoreColor(data.match_score)}`}>{data.match_score}</b></div>
        {Object.entries(data.summary).map(([k, n]) => <div key={k} className={`rounded-xl px-4 py-2 ${LEVEL[k][1]}`}>{n} {LEVEL[k][0].toLowerCase()}</div>)}
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">JD criteria vs resume evidence</h3>
        <p className="mb-3 text-xs text-ink-muted">AI suggestions. Correct any level that's wrong. “Not demonstrated” means the resume doesn't show it — not that the candidate lacks the skill.</p>
        <ul className="divide-y divide-black/[.05] rounded-xl border border-black/[.06]">
          {data.criteria.map((c) => (
            <li key={c.kind + c.skill} className="grid gap-2 p-3 sm:grid-cols-[9rem_minmax(0,1fr)_auto] sm:items-start sm:gap-4">
              <div className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">{c.skill} <span className="block text-xs font-normal text-ink-muted">{c.kind}</span></div>
              <div className="min-w-0 space-y-1 text-xs leading-relaxed text-ink-muted">{c.evidence.length ? c.evidence.map((e, i) => (
                <div key={i} title={e.trim()} className="line-clamp-2 [overflow-wrap:anywhere]">“{e.trim()}”</div>
              )) : "No mention in the resume"}</div>
              <select disabled={!canHire} className={`w-fit shrink-0 justify-self-start rounded-full border-0 px-3 py-1 text-xs font-medium sm:justify-self-end ${LEVEL[levelOf(c)][1]}`} value={levelOf(c)}
                onChange={(e) => setOver({ ...overrides, [c.skill]: e.target.value })}>
                {Object.entries(LEVEL).map(([k, [l]]) => <option key={k} value={k}>{l}{k === c.ai_level ? " (AI)" : ""}</option>)}
              </select>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium">Academic eligibility <span className="text-xs font-normal text-ink-muted">— checked separately from the resume match</span></h3>
        <div className="flex flex-wrap gap-3">
          {data.eligibility.map((r) => { const [I, c] = RULE_ICON[r.result]; return <span key={r.rule} className="flex items-center gap-1.5 text-xs"><I className={`h-3.5 w-3.5 ${c}`} />{r.rule}: {r.yours ?? "—"}</span>; })}
        </div>
      </div>
      {canHire ? (
        <div className="space-y-3 border-t border-black/[.06] pt-4">
          <label className="label">Explanation for the candidate (linked to the published criteria)</label>
          <textarea className="input h-20" defaultValue={data.review?.note_to_student || ""} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Strong SQL evidence; the role needed demonstrated Power BI dashboard work." />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-600" defaultChecked={data.review?.share_with_student} onChange={(e) => setShare(e.target.checked)} /> Share this verified explanation with the candidate</label>
          <ErrorNote>{err}</ErrorNote>
          <div className="flex items-center justify-end gap-3">{saved && <span className="text-sm text-emerald-700">Saved</span>}<button className="btn-primary" onClick={save}>Save review</button></div>
        </div>
      ) : <p className="border-t border-black/[.06] pt-4 text-xs text-ink-muted">Hiring decisions on this drive are made by the company.</p>}
    </div>
  );
}

function Feedback({ app, canHire }) {
  const { data, reload } = useApi(`/applications/${app.id}/feedback`);
  const [f, setF] = useState({ round: "Technical interview", ps: "3", role: "3", comm: "3", private_notes: "", strengths: "", improvements: "", share: false });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const add = async (e) => {
    e.preventDefault(); setErr(null);
    try {
      await api(`/applications/${app.id}/feedback`, { method: "POST", body: { round: f.round, scores: { "Role skills": Number(f.role), "Problem solving": Number(f.ps), Communication: Number(f.comm) },
        private_notes: f.private_notes || null, strengths: f.strengths || null, improvements: f.improvements || null, share_with_student: f.share } });
      setF({ ...f, private_notes: "", strengths: "", improvements: "", share: false }); reload();
    } catch (e2) { setErr(e2.message); }
  };
  const share = async (fb) => { await api(`/applications/${app.id}/feedback/${fb.id}/share`, { method: "POST" }); reload(); };
  return (
    <div className="space-y-6">
      {(data || []).length > 0 && (
        <ul className="space-y-3">
          {data.map((fb) => (
            <li key={fb.id} className="rounded-xl border border-black/[.06] p-4 text-sm">
              <div className="flex items-center justify-between"><span className="font-medium">{fb.round}</span>
                {fb.share_with_student ? <span className="chip bg-emerald-50 text-emerald-700">Shared with candidate</span>
                  : canHire ? <button className="text-xs text-brand-700 hover:underline" onClick={() => share(fb)}>Share with candidate</button> : <span className="chip bg-black/[.05] text-ink-muted">Private</span>}</div>
              {fb.scores && <div className="mt-1 text-xs text-ink-muted">{Object.entries(fb.scores).map(([k, v]) => `${k} ${v}/5`).join(" · ")}</div>}
              {fb.strengths && <p className="mt-2"><b className="font-medium">Strengths:</b> {fb.strengths}</p>}
              {fb.improvements && <p className="mt-1"><b className="font-medium">To improve:</b> {fb.improvements}</p>}
              {fb.private_notes && <p className="mt-1 text-ink-muted"><b className="font-medium">Private:</b> {fb.private_notes}</p>}
            </li>
          ))}
        </ul>
      )}
      {canHire && (
        <form onSubmit={add} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-1"><label className="label">Round</label><input className="input" value={f.round} onChange={set("round")} /></div>
            {[["role", "Role skills"], ["ps", "Problem solving"], ["comm", "Communication"]].map(([k, l]) => (
              <div key={k}><label className="label">{l} (1–5)</label><input type="number" min="1" max="5" className="input" value={f[k]} onChange={set(k)} /></div>
            ))}
          </div>
          <div><label className="label">Private interviewer notes (never shown to the candidate)</label><textarea className="input h-16" value={f.private_notes} onChange={set("private_notes")} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className="label">Strengths (candidate-facing)</label><textarea className="input h-16" value={f.strengths} onChange={set("strengths")} /></div>
            <div><label className="label">Areas to improve (candidate-facing)</label><textarea className="input h-16" value={f.improvements} onChange={set("improvements")} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="accent-brand-600" checked={f.share} onChange={set("share")} /> Approve and share the candidate-facing part now</label>
          <ErrorNote>{err}</ErrorNote>
          <div className="flex justify-end"><button className="btn-primary">Save feedback</button></div>
        </form>
      )}
    </div>
  );
}

function ScoreForm({ app, sections, onSaved, onClose }) {
  const [vals, setVals] = useState(Object.fromEntries(sections.map((s) => [s, app.assessment?.sections?.[s] ?? ""])));
  const [err, setErr] = useState(null);
  const save = async (e) => {
    e.preventDefault();
    try {
      const body = { sections: Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, Number(v)])) };
      const res = await api(`/applications/${app.id}/assessment`, { method: "PUT", body });
      onSaved(res.assessment);
    } catch (e2) {
      setErr(e2.message);
    }
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <p className="text-sm text-ink-muted">Section scores in percent. Students who don't clear will see how their sections compared with those who did — anonymously.</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {sections.map((s) => (
          <div key={s}><label className="label">{s}</label>
            <input type="number" min="0" max="100" className="input" required value={vals[s]} onChange={(e) => setVals({ ...vals, [s]: e.target.value })} /></div>
        ))}
      </div>
      <ErrorNote>{err}</ErrorNote>
      <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onClose}>Cancel</button><button className="btn-primary">Save scores</button></div>
    </form>
  );
}

const CUT_STAGES = {
  resume: { label: "Resume screening", from: "applied", score: "resume match", verb: "Shortlist", next: "Resume shortlisted" },
  assessment: { label: "Assessment", from: "shortlisted", score: "overall assessment score", verb: "Clear", next: "Cleared assessment" },
  interview: { label: "Interview → offer", from: "assessment_cleared", score: "interview score", verb: "Offer", next: "Offered" },
};
const overall = (a) => (a.assessment?.sections ? Math.round(10 * Object.values(a.assessment.sections).reduce((x, y) => x + y, 0) / Object.values(a.assessment.sections).length) / 10 : null);

/** Move everyone at or above a score to the next stage in one go, after a preview. */
function CutoffPanel({ drive, applicants, onDone }) {
  const firstStage = Object.keys(CUT_STAGES).find((k) => applicants.some((a) => a.status === CUT_STAGES[k].from)) || "resume";
  const [stage, setStage] = useState(firstStage);
  const [min, setMin] = useState(drive.cutoffs?.[firstStage] ?? 80);
  const [rejectRest, setRejectRest] = useState(false);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  const cfg = CUT_STAGES[stage];
  const waiting = applicants.filter((a) => a.status === cfg.from).length;
  const run = async (dry) => {
    setErr(null); setBusy(true); if (dry) setDone(null);
    try {
      const r = await api(`/drives/${drive.id}/cutoff`, { method: "POST", body: { stage, min_score: Number(min), reject_rest: rejectRest, dry_run: dry } });
      if (dry) setPreview(r); else { setPreview(null); setDone(r); onDone(); }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const pick = (k) => { setStage(k); setMin(drive.cutoffs?.[k] ?? 80); setPreview(null); setDone(null); };
  return (
    <div className="card mb-4 p-5">
      <div className="flex flex-wrap items-center gap-2">
        <Filter className="h-4 w-4 text-brand-600" /><h2 className="font-medium">Move candidates on by score</h2>
        <div className="ml-auto"><Tabs value={stage} onChange={pick} options={Object.entries(CUT_STAGES).map(([k, v]) => [k, v.label])} /></div>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-3 text-sm">
        <div>
          <label className="label">{cfg.verb} everyone with {cfg.score} of at least</label>
          <div className="flex items-center gap-2">
            {[70, 80, 90].map((v) => (
              <button key={v} type="button" onClick={() => { setMin(v); setPreview(null); }}
                className={`chip px-3 py-1.5 ${Number(min) === v ? "bg-brand-800 text-white" : "border border-black/10 bg-white text-ink-muted"}`}>{v}%</button>
            ))}
            <input type="number" min="0" max="100" step="1" className="input w-24 px-3 py-1.5" value={min} onChange={(e) => { setMin(e.target.value); setPreview(null); }} aria-label="Minimum score" />
          </div>
        </div>
        <label className="flex items-center gap-2 pb-2 text-ink-soft"><input type="checkbox" className="accent-brand-700" checked={rejectRest} onChange={(e) => { setRejectRest(e.target.checked); setPreview(null); }} />Mark the rest as not selected</label>
        <button className="btn-soft ml-auto" disabled={busy || !waiting || min === ""} onClick={() => run(true)}>{busy && !preview ? "Checking…" : "Preview"}</button>
      </div>
      <p className="mt-2 text-xs text-ink-muted">
        {waiting ? `${plural(waiting, "candidate")} at this stage.` : "Nobody is at this stage right now."}
        {stage === "interview" && " Record each candidate's interview score in the Scores column first."}
        {drive.cutoffs?.[stage] != null && ` Last cut-off used: ${drive.cutoffs[stage]}%.`}
      </p>
      <ErrorNote>{err}</ErrorNote>
      {done && <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{plural(done.pass, "candidate")} moved to {cfg.next}{rejectRest && done.below ? `, ${done.below} not selected` : ""}. Everyone affected was notified, and students see the {done.min_score}% cut-off as the reason.</div>}
      {preview && (
        <div className="mt-4 rounded-xl border border-black/[.06]">
          <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-black/[.06] px-4 py-3 text-sm">
            <span className="font-medium text-emerald-700">{preview.pass} pass</span>
            <span className={rejectRest ? "font-medium text-rose-600" : "text-ink-muted"}>{preview.below} below{rejectRest ? " (not selected)" : " (stay where they are)"}</span>
            {preview.no_score > 0 && <span className="text-amber-700">{preview.no_score} without a score (left as they are)</span>}
            {preview.on_hold > 0 && <span className="text-ink-muted">{preview.on_hold} on hold (left as they are)</span>}
          </div>
          <ul className="max-h-56 divide-y divide-black/[.04] overflow-y-auto text-sm">
            {preview.rows.map((r) => (
              <li key={r.id} className="flex items-center justify-between px-4 py-2">
                <span className={r.group === "pass" ? "" : "text-ink-muted"}>{r.name}</span>
                <span className="tabular-nums">{r.score == null ? "—" : `${r.score}%`}
                  <span className={`ml-3 chip ${r.group === "pass" ? "bg-emerald-50 text-emerald-700" : r.group === "below" ? (rejectRest ? "bg-rose-50 text-rose-600" : "bg-black/[.04] text-ink-muted") : "bg-amber-50 text-amber-700"}`}>
                    {r.group === "pass" ? cfg.next : r.group === "below" ? (rejectRest ? "Not selected" : "Stays") : r.group === "no_score" ? "No score" : "On hold"}</span></span>
              </li>
            ))}
          </ul>
          <div className="flex justify-end gap-2 border-t border-black/[.06] px-4 py-3">
            <button className="btn-ghost" onClick={() => setPreview(null)}>Cancel</button>
            <button className="btn-primary" disabled={busy || (!preview.pass && !(rejectRest && preview.below))} onClick={() => run(false)}>
              {busy ? "Applying…" : `Confirm: ${cfg.verb.toLowerCase()} ${preview.pass}${rejectRest && preview.below ? `, not select ${preview.below}` : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function InterviewScoreForm({ app, onSaved }) {
  const [score, setScore] = useState(app.interview_score?.score ?? "");
  const [note, setNote] = useState(app.interview_score?.note || "");
  const [err, setErr] = useState(null);
  const save = async (e) => {
    e.preventDefault(); setErr(null);
    try {
      const r = await api(`/applications/${app.id}/interview-score`, { method: "PUT", body: { score: Number(score), note: note || null } });
      onSaved(r.interview_score);
    } catch (e2) { setErr(e2.message); }
  };
  return (
    <form onSubmit={save} className="space-y-4">
      <div><label className="label" htmlFor="iv-score">Overall interview score (%)</label>
        <input id="iv-score" type="number" min="0" max="100" step="0.5" className="input" value={score} onChange={(e) => setScore(e.target.value)} required autoFocus /></div>
      <div><label className="label" htmlFor="iv-note">Private note (optional, never shown to the student)</label>
        <textarea id="iv-note" className="input h-20" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Strong SQL; average on system design" /></div>
      <ErrorNote>{err}</ErrorNote>
      <div className="flex justify-end"><button className="btn-primary">Save score</button></div>
    </form>
  );
}

export default function Applicants() {
  const { id } = useParams();
  const { data, error, setData, reload } = useApi(`/drives/${id}/applicants`);
  const [interviewing, setInterviewing] = useState(null);
  const [filter, setFilter] = useState("all");
  const [scoring, setScoring] = useState(null);
  const [panel, setPanel] = useState(null); // {app, kind: "screening" | "feedback"}
  const [err, setErr] = useState(null);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;
  const { drive } = data;
  const canHire = drive.can_hire;
  const toggleHold = async (app) => {
    setErr(null);
    try {
      let reason = null;
      if (!app.on_hold) {
        reason = window.prompt("Reason for putting this candidate on hold (shown to them)");
        if (reason === null) return; // Cancel: leave the candidate as they are
        reason = reason.trim() || null;
      }
      const res = await api(`/applications/${app.id}/hold`, { method: "POST", body: { on_hold: !app.on_hold, reason } });
      patch(app.id, res);
    } catch (e) { setErr(e.message); }
  };
  const sections = drive.assessment_sections?.length ? drive.assessment_sections : ["Aptitude", "Coding", "Technical MCQ"];
  const patch = (appId, fields) => setData({ ...data, applicants: data.applicants.map((a) => (a.id === appId ? { ...a, ...fields } : a)) });

  const move = async (app, status) => {
    setErr(null);
    try {
      const res = await api(`/applications/${app.id}`, { method: "PATCH", body: { status } });
      patch(app.id, res);
    } catch (e) {
      setErr(e.message);
    }
  };

  const count = (s) => data.applicants.filter((a) => a.status === s).length;
  const list = data.applicants.filter((a) => filter === "all" || a.status === filter);

  return (
    <>
      <Link to={`/drives/${id}`} className="mb-6 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Drive record</Link>
      <PageHeader eyebrow={drive.company} title={drive.role} accent="candidates."
        subtitle={`${drive.ctc_lpa} LPA · ${plural(data.applicants.length, "applicant")}, ranked by resume match. ${canHire ? "Each stage change notifies the candidate and updates the college dashboard." : "Read-only: hiring decisions on this drive belong to the company."}`}
        action={<Badge value={drive.status} label={drive.status_label} />} />
      <div className="mb-6 overflow-x-auto">
        <Tabs value={filter} onChange={setFilter}
          options={STAGES.map((s) => [s, s === "all" ? `All (${data.applicants.length})` : `${STATUS_LABELS[s]} (${count(s)})`])} />
      </div>
      {canHire && data.applicants.length > 0 && <CutoffPanel drive={{ ...drive, id }} applicants={data.applicants} onDone={reload} />}
      <ErrorNote>{err}</ErrorNote>
      <div className="card mt-2 overflow-x-auto">
        {list.length === 0 ? <Empty>No applicants in this stage.</Empty> : (
          <table className="w-full min-w-[600px] text-sm [&_td]:px-3 [&_th]:px-3">
            <thead className="border-b border-black/[.06] text-left text-xs text-ink-muted">
              <tr><th className="py-3 pl-6">#</th><th>Candidate</th><th className="text-right">Match</th><th>Scores</th><th className="pr-6">Status &amp; next step</th></tr>
            </thead>
            <tbody className="divide-y divide-black/[.05]">
              {list.map((a) => (
                <tr key={a.id} className="align-top hover:bg-brand-50/30">
                  <td className="py-4 pl-6 tabular-nums text-ink-muted">{a.rank}</td>
                  <td className="py-4">
                    <div className="font-medium">{a.name}</div>
                    <div className="text-xs text-ink-muted">{[a.branch, a.cgpa != null && `CGPA ${a.cgpa}`].filter(Boolean).join(" · ")}</div>
                    <div className="text-xs text-ink-muted">{a.email}</div>
                    {a.placed_elsewhere && <span className="chip mt-1.5 bg-amber-50 text-amber-700" title="Accepted an offer from another drive">Already placed</span>}
                    <div className="mt-1.5 flex max-w-[260px] flex-wrap gap-1">
                      {a.ats.matched_skills.map((s) => <span key={s} className="chip bg-emerald-50 text-emerald-700">{s}</span>)}
                      {a.ats.missing_skills.map((s) => <span key={s} className="chip bg-black/[.04] text-ink-muted line-through">{s}</span>)}
                    </div>
                  </td>
                  <td className={`py-4 text-right font-medium tabular-nums ${scoreColor(a.ats_score)}`}>{a.ats_score}</td>
                  <td className="py-4 text-xs text-ink-muted">
                    {a.assessment && <div className="mb-0.5 font-medium text-ink">Overall {overall(a)}%</div>}
                    {a.assessment ? Object.entries(a.assessment.sections).map(([k, v]) => <div key={k}>{k}: <span className="text-ink">{v}%</span></div>) : !(canHire && a.status === "shortlisted") && !a.interview_score && "—"}
                    {a.interview_score && <div className="mt-1.5 font-medium text-ink" title={a.interview_score.note || ""}>Interview {a.interview_score.score}%</div>}
                    {canHire && ["assessment_cleared", "offered"].includes(a.status) && (
                      <button className="mt-1 inline-flex items-center gap-1 text-brand-700 hover:underline" onClick={() => setInterviewing(a)}>
                        <Star className="h-3.5 w-3.5" /> {a.interview_score ? "Edit" : "Record"} interview score
                      </button>
                    )}
                    {canHire && a.status === "shortlisted" && (
                      <button className="mt-1 inline-flex items-center gap-1 text-brand-700 hover:underline" onClick={() => setScoring(a)}>
                        <ClipboardList className="h-3.5 w-3.5" /> {a.assessment ? "Edit" : "Record"} scores
                      </button>
                    )}
                  </td>
                  <td className="py-4">
                    <Badge value={a.status} />{a.on_hold && <div className="mt-1"><Badge value="on_hold" /></div>}
                    <div className="mt-2 flex gap-2 text-xs">
                      <button className="inline-flex items-center gap-1 text-brand-700 hover:underline" onClick={() => setPanel({ app: a, kind: "screening" })}><FileSearch className="h-3.5 w-3.5" /> Screening</button>
                      <button className="inline-flex items-center gap-1 text-brand-700 hover:underline" onClick={() => setPanel({ app: a, kind: "feedback" })}><MessageSquare className="h-3.5 w-3.5" /> Feedback{a.feedback_count ? ` (${a.feedback_count})` : ""}</button>
                    </div>
                    {canHire && <div className="mt-2.5 flex flex-wrap items-center gap-1">
                    {canHire && !["accepted", "rejected", "withdrawn", "declined"].includes(a.status) && (
                      <button onClick={() => toggleHold(a)} className="rounded-full px-2 py-1 text-xs text-ink-muted hover:bg-amber-50 hover:text-amber-700" title={a.on_hold ? "Resume" : "Put on hold"}>
                        {a.on_hold ? <Play className="inline h-3.5 w-3.5" /> : <Pause className="inline h-3.5 w-3.5" />}
                      </button>
                    )}
                    {canHire && NEXT[a.status].map(([s, label]) => (
                      <button key={s} onClick={() => move(a, s)}
                        disabled={s === "assessment_cleared" && !a.assessment}
                        title={s === "assessment_cleared" && !a.assessment ? "Record scores first" : undefined}
                        className={`rounded-full px-3 py-1 text-xs font-medium disabled:opacity-40 ${s === "rejected" ? "text-rose-600 hover:bg-rose-50" : "bg-ink text-white hover:bg-black"}`}>{label}</button>
                    ))}
                  </div>}
                  </td>
                  
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <Modal open={Boolean(panel)} onClose={() => setPanel(null)} wide
        title={panel ? `${panel.kind === "screening" ? "Resume screening" : "Interview evaluation"} · ${panel.app.name}` : ""}>
        {panel?.kind === "screening" && <Screening app={panel.app} canHire={canHire} onSaved={() => patch(panel.app.id, { screening_shared: true })} />}
        {panel?.kind === "feedback" && <Feedback app={panel.app} canHire={canHire} />}
      </Modal>
      <Modal open={Boolean(interviewing)} onClose={() => setInterviewing(null)} title={interviewing ? `Interview score · ${interviewing.name}` : ""}>
        {interviewing && <InterviewScoreForm app={interviewing} onSaved={(interview_score) => { patch(interviewing.id, { interview_score }); setInterviewing(null); }} />}
      </Modal>
      <Modal open={Boolean(scoring)} onClose={() => setScoring(null)} title={scoring ? `Assessment scores · ${scoring.name}` : ""}>
        {scoring && <ScoreForm app={scoring} sections={sections} onClose={() => setScoring(null)}
          onSaved={(assessment) => { patch(scoring.id, { assessment }); setScoring(null); }} />}
      </Modal>
    </>
  );
}
