import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, CircleHelp, ClipboardList, FileSearch, MessageSquare, Pause, Play, XCircle } from "lucide-react";
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

export default function Applicants() {
  const { id } = useParams();
  const { data, error, setData } = useApi(`/drives/${id}/applicants`);
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
      <ErrorNote>{err}</ErrorNote>
      <div className="card mt-2 overflow-x-auto">
        {list.length === 0 ? <Empty>No applicants in this stage.</Empty> : (
          <table className="w-full min-w-[600px] text-sm [&_td]:px-3 [&_th]:px-3">
            <thead className="border-b border-black/[.06] text-left text-xs text-ink-muted">
              <tr><th className="py-3 pl-6">#</th><th>Candidate</th><th className="text-right">Match</th><th>Assessment</th><th className="pr-6">Status &amp; next step</th></tr>
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
                    {a.assessment ? Object.entries(a.assessment.sections).map(([k, v]) => <div key={k}>{k}: <span className="text-ink">{v}%</span></div>) : !(canHire && a.status === "shortlisted") && "—"}
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
      <Modal open={Boolean(scoring)} onClose={() => setScoring(null)} title={scoring ? `Assessment scores · ${scoring.name}` : ""}>
        {scoring && <ScoreForm app={scoring} sections={sections} onClose={() => setScoring(null)}
          onSaved={(assessment) => { patch(scoring.id, { assessment }); setScoring(null); }} />}
      </Modal>
    </>
  );
}
