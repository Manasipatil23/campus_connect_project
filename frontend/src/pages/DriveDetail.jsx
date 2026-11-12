import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  AlertTriangle, ArrowLeft, Ban, CalendarClock, Check, CheckCircle2, ChevronRight, CircleHelp, Clock, Pencil, Plus, Search, Send, Users, X, XCircle,
} from "lucide-react";
import { api } from "../api";
import { AtsBreakdown, Review } from "../components/AtsBreakdown";
import { Badge, ErrorNote, Modal, Spinner, fmtDate, useApi } from "../components/ui";
import { DriveFlow, HistoryPanel, StudentRound } from "../components/workflow";

const FIELD_LABEL = { description: "Job description", ctc_lpa: "CTC (LPA)", location: "Location", deadline: "Deadline", criteria: "Eligibility", required_skills: "Required skills", preferred_skills: "Preferred skills", role: "Role", tier: "Tier" };
const ROUND_KINDS = ["Online assessment", "Group discussion", "Technical interview", "HR interview", "Other"];

function val(v) {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ") || "—";
  if (typeof v === "object") {
    if ("date" in v || "cancel" in v) return v.cancel ? "Cancel round" : [v.date && fmtDate(v.date), v.time, v.venue].filter(Boolean).join(" · ");
    return [v.min_cgpa != null && `CGPA ≥ ${v.min_cgpa}`, v.max_backlogs != null && `≤ ${v.max_backlogs} backlogs`, v.branches?.length && v.branches.join("/"), v.grad_years?.length && `Batch ${v.grad_years.join("/")}`].filter(Boolean).join(" · ") || "—";
  }
  return String(v);
}

function Section({ title, icon: Icon, action, children }) {
  return (
    <div className="card p-6">
      <div className="mb-5 flex items-center gap-2">
        {Icon && <Icon className="h-4 w-4 text-brand-600" />}<h2 className="font-medium">{title}</h2>
        <div className="ml-auto">{action}</div>
      </div>
      {children}
    </div>
  );
}

function Facts({ d }) {
  return (
    <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
      <div><dt className="text-xs text-ink-muted">CTC</dt><dd className="mt-1 font-medium">{d.ctc_lpa} LPA {d.tier === "dream" && <Badge value="dream" />}</dd></div>
      <div><dt className="text-xs text-ink-muted">Location</dt><dd className="mt-1 font-medium">{d.location || "—"}</dd></div>
      <div><dt className="text-xs text-ink-muted">Apply by</dt><dd className="mt-1 font-medium">{fmtDate(d.deadline)}</dd></div>
      <div><dt className="text-xs text-ink-muted">Eligibility</dt><dd className="mt-1 font-medium">{val(d.criteria)}</dd></div>
    </dl>
  );
}

function Skills({ d }) {
  return (
    <div className="mt-5 space-y-2">
      <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-xs text-ink-muted">Required</span>
        {(d.required_skills || []).map((s) => <span key={s} className="chip bg-ink text-white">{s}</span>)}</div>
      {d.preferred_skills?.length > 0 && <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-xs text-ink-muted">Preferred</span>
        {d.preferred_skills.map((s) => <span key={s} className="chip bg-black/[.05] text-ink-soft">{s}</span>)}</div>}
    </div>
  );
}

// ---------------------------------------------------------------- student view
const RESULT = {
  pass: [CheckCircle2, "text-emerald-600", "Meets"],
  fail: [XCircle, "text-rose-500", "Doesn't meet"],
  needs_confirmation: [CircleHelp, "text-amber-500", "Needs confirmation"],
};

function StudentView({ d, reload }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [match, setMatch] = useState(null);
  const apply = async () => {
    setBusy(true); setMsg(null);
    try { const r = await api(`/drives/${d.id}/apply`, { method: "POST" }); setMsg({ ok: true, text: `Applied. Resume match ${r.ats_score}.` }); reload(); }
    catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const checkMatch = async () => {
    setMatch({ loading: true });
    try { setMatch({ result: await api(`/students/me/resume/match/${d.id}`) }); } catch (e) { setMatch({ error: e.message }); }
  };
  const hasUnknown = d.eligibility_rules.some((r) => r.result === "needs_confirmation");

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {d.pending_fields?.length > 0 && (
          <div className="flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            <Clock className="h-4 w-4 shrink-0" />
            <span><b className="font-medium">Update pending confirmation:</b> the company has proposed a change to {d.pending_fields.map((f) => FIELD_LABEL[f] || f).join(", ")}. What you see below is the confirmed version until the placement cell verifies it.</span>
          </div>
        )}
        <Section title="About the role">
          <Facts d={d} />
          <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{d.description}</p>
          <Skills d={d} />
        </Section>
        <Section title="Selection schedule" icon={CalendarClock}>
          {d.rounds.length === 0 ? <p className="text-sm text-ink-muted">No rounds announced yet. You'll be notified when dates are confirmed.</p> : (
            <div className="space-y-4">{d.rounds.map((r) => <StudentRound key={r.id} r={r} />)}</div>
          )}
          <p className="mt-5 border-t border-black/[.06] pt-4 text-xs text-ink-muted">Only dates confirmed by your placement cell are shown as dates. Last updated {fmtDate(d.updated_at)}.</p>
        </Section>
        <HistoryPanel driveId={d.id} students />
      </div>

      <div className="space-y-6">
        <div className="card p-6">
          {d.application ? (
            <>
              <div className="text-sm text-ink-muted">Your application</div>
              <div className="mt-2"><Badge value={d.application.status} /></div>
              <Link to={`/applications/${d.application.id}`} className="btn-primary mt-4 w-full">Open tracker <ChevronRight className="h-4 w-4" /></Link>
            </>
          ) : (
            <>
              <div className="text-sm text-ink-muted">{d.accepting ? "Applications open" : "Applications closed"}</div>
              <button className="btn-primary mt-4 w-full" disabled={!d.accepting || !d.eligible || busy} onClick={apply}>{busy ? "Applying…" : "Apply"}</button>
            </>
          )}
          <button className="btn-ghost mt-2 w-full" onClick={checkMatch}><Search className="h-4 w-4" /> Compare my resume with this JD</button>
          {msg && <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{msg.text}</div>}
        </div>

        <Section title="Eligibility check">
          <ul className="space-y-3">
            {d.eligibility_rules.map((r) => {
              const [Icon, color, label] = RESULT[r.result];
              return (
                <li key={r.rule} className="flex gap-3 text-sm">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${color}`} />
                  <div className="min-w-0">
                    <div className="font-medium">{r.rule}</div>
                    <div className="text-xs text-ink-muted">Required {r.required} · yours {r.yours ?? "not in profile"} · <span className={color}>{label}</span></div>
                  </div>
                </li>
              );
            })}
          </ul>
          {hasUnknown && <p className="mt-4 text-xs text-ink-muted">Some details are missing from your <Link to="/profile" className="text-brand-700 hover:underline">profile</Link>, so they can't be checked yet.</p>}
          <p className="mt-4 border-t border-black/[.06] pt-3 text-xs text-ink-muted">Academic eligibility is separate from resume match: you can be eligible and still have skill gaps against the JD.</p>
        </Section>

        <Link to={`/help?drive=${d.id}`} className="flex items-center gap-2 text-sm text-ink-muted hover:text-ink"><AlertTriangle className="h-4 w-4" /> Something unclear about this drive? Ask the placement cell</Link>
      </div>

      <Modal open={Boolean(match)} onClose={() => setMatch(null)} wide title={`Resume vs JD · ${d.company} ${d.role}`}>
        {match?.loading && <Spinner label="Comparing your resume with this JD…" />}
        <ErrorNote>{match?.error}</ErrorNote>
        {match?.result && <div className="space-y-6"><AtsBreakdown ats={match.result.ats} /><div className="border-t border-black/[.06] pt-4"><Review review={match.result.review} /></div></div>}
      </Modal>
    </div>
  );
}

// ---------------------------------------------------------------- staff view
function EditDrive({ d, onDone }) {
  const [f, setF] = useState({
    role: d.role, description: d.description, ctc_lpa: d.ctc_lpa, location: d.location || "", deadline: d.deadline || "",
    required: (d.required_skills || []).join(", "), preferred: (d.preferred_skills || []).join(", "),
    min_cgpa: d.criteria?.min_cgpa ?? "", max_backlogs: d.criteria?.max_backlogs ?? "", reason: "",
  });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const list = (s) => s.split(",").map((x) => x.trim()).filter(Boolean);
  const save = async (e) => {
    e.preventDefault(); setErr(null);
    try {
      const res = await api(`/drives/${d.id}`, { method: "PATCH", body: {
        role: f.role, description: f.description, ctc_lpa: Number(f.ctc_lpa), location: f.location, deadline: f.deadline || null,
        required_skills: list(f.required), preferred_skills: list(f.preferred), reason: f.reason || null,
        criteria: { ...d.criteria, min_cgpa: f.min_cgpa === "" ? null : Number(f.min_cgpa), max_backlogs: f.max_backlogs === "" ? null : Number(f.max_backlogs) },
      } });
      onDone(res);
    } catch (e2) { setErr(e2.message); }
  };
  const proposing = d.can.propose;
  return (
    <form onSubmit={save} className="space-y-4">
      {proposing && <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">This drive has been reviewed. Your edits are sent to the placement cell as change requests; students keep seeing the current version until they're confirmed.</div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Role</label><input className="input" value={f.role} onChange={set("role")} /></div>
        <div><label className="label">CTC (LPA)</label><input type="number" step="0.1" className="input" value={f.ctc_lpa} onChange={set("ctc_lpa")} /></div>
        <div><label className="label">Location</label><input className="input" value={f.location} onChange={set("location")} /></div>
        <div><label className="label">Deadline</label><input type="date" className="input" value={f.deadline} onChange={set("deadline")} /></div>
        <div><label className="label">Min CGPA</label><input type="number" step="0.1" className="input" value={f.min_cgpa} onChange={set("min_cgpa")} /></div>
        <div><label className="label">Max backlogs</label><input type="number" className="input" value={f.max_backlogs} onChange={set("max_backlogs")} /></div>
      </div>
      <div><label className="label">Job description</label><textarea className="input h-28" value={f.description} onChange={set("description")} /></div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label">Required skills</label><input className="input" value={f.required} onChange={set("required")} /></div>
        <div><label className="label">Preferred skills</label><input className="input" value={f.preferred} onChange={set("preferred")} /></div>
      </div>
      <div><label className="label">Reason for the change (shown in history)</label><input className="input" value={f.reason} onChange={set("reason")} placeholder="e.g. Revised compensation band" /></div>
      <ErrorNote>{err}</ErrorNote>
      <div className="flex justify-end"><button className="btn-primary">{proposing ? "Send for confirmation" : "Save changes"}</button></div>
    </form>
  );
}

function RoundForm({ d, round, onDone }) {
  const [f, setF] = useState({ name: round?.name || "", kind: round?.kind || "Online assessment", date: round?.proposed?.date || round?.date || "", time: round?.time || "", venue: round?.venue || "", instructions: round?.instructions || "", reason: "" });
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const isCompanyLate = d.role_in_drive === "company" && !["draft", "changes_requested", "review"].includes(d.status);
  const save = async (e) => {
    e.preventDefault(); setErr(null);
    try {
      const res = round
        ? await api(`/drives/${d.id}/rounds/${round.id}`, { method: "PATCH", body: { date: f.date || null, time: f.time || null, venue: f.venue || null, instructions: f.instructions || null, reason: f.reason || null } })
        : await api(`/drives/${d.id}/rounds`, { method: "POST", body: { name: f.name, kind: f.kind, date: f.date || null, time: f.time || null, venue: f.venue || null, instructions: f.instructions || null } });
      onDone(res);
    } catch (e2) { setErr(e2.message); }
  };
  const cancel = async () => {
    if (!f.reason) return setErr("Give a reason for cancelling");
    try { onDone(await api(`/drives/${d.id}/rounds/${round.id}`, { method: "PATCH", body: { cancel: true, reason: f.reason } })); }
    catch (e2) { setErr(e2.message); }
  };
  return (
    <form onSubmit={save} className="space-y-4">
      {isCompanyLate && <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Schedule changes go to the placement cell first. Students see “New date pending confirmation” until they confirm.</div>}
      {!round && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Round name</label><input className="input" value={f.name} onChange={set("name")} required /></div>
          <div><label className="label">Type</label><select className="input" value={f.kind} onChange={set("kind")}>{ROUND_KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <div><label className="label">Date</label><input type="date" className="input" value={f.date} onChange={set("date")} /></div>
        <div><label className="label">Time</label><input type="time" className="input" value={f.time} onChange={set("time")} /></div>
        <div><label className="label">Venue / link</label><input className="input" value={f.venue} onChange={set("venue")} /></div>
      </div>
      <div><label className="label">Instructions for candidates</label><textarea className="input h-20" value={f.instructions} onChange={set("instructions")} /></div>
      {round && <div><label className="label">Reason (kept in update history)</label><input className="input" value={f.reason} onChange={set("reason")} placeholder="e.g. Panel unavailable" /></div>}
      <ErrorNote>{err}</ErrorNote>
      <div className="flex flex-wrap justify-between gap-2">
        {round ? <button type="button" className="btn-ghost text-rose-600" onClick={cancel}><Ban className="h-4 w-4" /> Cancel round</button> : <span />}
        <button className="btn-primary">{round ? (isCompanyLate ? "Propose change" : "Save") : "Add round"}</button>
      </div>
    </form>
  );
}

function StaffView({ d, reload }) {
  const [modal, setModal] = useState(null); // edit | review | status | round | newround
  const [note, setNote] = useState("");
  const [flash, setFlash] = useState(null);
  const [err, setErr] = useState(null);
  const run = async (fn, okText) => {
    setErr(null);
    try { const r = await fn(); setFlash(typeof okText === "function" ? okText(r) : okText); setModal(null); setNote(""); reload(); }
    catch (e) { setErr(e.message); }
  };
  const isCollege = d.role_in_drive === "college";
  const decide = (c, decision) => run(() => api(`/changes/${c.id}/decision`, { method: "POST", body: { decision } }),
    decision === "approve" ? "Change confirmed — students and the company were notified." : "Change not accepted — the company was told.");

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {flash && <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800"><Check className="h-4 w-4" /> {flash}</div>}
        <ErrorNote>{!modal && err}</ErrorNote>
        {d.review_note && ["changes_requested", "cancelled"].includes(d.status) && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"><b className="font-medium">Placement cell:</b> {d.review_note}</div>
        )}

        {d.pending_changes.length > 0 && (
          <Section title={isCollege ? "Changes waiting for your confirmation" : "Waiting for the placement cell"} icon={Clock}>
            <ul className="divide-y divide-black/[.05]">
              {d.pending_changes.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-4 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{c.label}</div>
                    <div className="mt-0.5 text-sm"><span className="text-ink-muted line-through">{val(c.old)}</span> <span className="mx-1 text-ink-muted">→</span> <span className="font-medium">{val(c.new)}</span></div>
                    <div className="mt-0.5 text-xs text-ink-muted">Proposed by {c.proposed_by_name}{c.reason && ` — “${c.reason}”`}</div>
                  </div>
                  {d.can.decide_changes ? (
                    <div className="flex gap-2">
                      <button className="btn-ghost px-3 py-1.5 text-rose-600" onClick={() => decide(c, "reject")}><X className="h-4 w-4" /> Reject</button>
                      <button className="btn-primary px-3 py-1.5" onClick={() => decide(c, "approve")}><Check className="h-4 w-4" /> Confirm</button>
                    </div>
                  ) : <Badge value="pending" />}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="Drive details" action={(d.can.edit_directly || d.can.propose) && <button className="btn-ghost px-3 py-1.5" onClick={() => setModal("edit")}><Pencil className="h-3.5 w-3.5" /> {d.can.propose ? "Propose a change" : "Edit"}</button>}>
          <Facts d={d} />
          <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{d.description}</p>
          <Skills d={d} />
          <div className="mt-4 text-xs text-ink-muted">
            Screening criteria {d.criteria_confirmed ? <span className="text-emerald-700">confirmed by the recruiter</span> : <span className="text-amber-700">not confirmed yet</span>} · Owner {d.owner_name || "—"}
          </div>
        </Section>

        <Section title="Selection schedule" icon={CalendarClock} action={d.can.set_status && <button className="btn-ghost px-3 py-1.5" onClick={() => setModal("newround")}><Plus className="h-3.5 w-3.5" /> Add round</button>}>
          {d.rounds.length === 0 ? <p className="text-sm text-ink-muted">No rounds yet.</p> : (
            <ul className="divide-y divide-black/[.05]">
              {d.rounds.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm"><span className="font-medium">{r.name}</span><Badge value={r.status} /></div>
                    <div className="mt-0.5 text-sm text-ink-muted">
                      {r.date ? `${fmtDate(r.date)}${r.time ? ` · ${r.time}` : ""}` : "No date yet"}{r.venue && ` · ${r.venue}`}
                      {!r.confirmed && r.date && r.status !== "cancelled" && <span className="ml-2 text-amber-700">tentative — students don't see this date yet</span>}
                    </div>
                    {r.proposed && <div className="mt-1 text-sm text-amber-800">Proposed: {r.proposed.cancel ? "cancel this round" : [r.proposed.date && fmtDate(r.proposed.date), r.proposed.time, r.proposed.venue].filter(Boolean).join(" · ")} {r.proposed.reason && `(${r.proposed.reason})`}</div>}
                  </div>
                  <div className="flex gap-2">
                    {isCollege && r.status === "planned" && r.date && <button className="btn-primary px-3 py-1.5" onClick={() => run(() => api(`/drives/${d.id}/rounds/${r.id}/confirm`, { method: "POST" }), "Date confirmed and students notified.")}><Check className="h-3.5 w-3.5" /> Confirm</button>}
                    {d.can.set_status && r.status !== "cancelled" && <button className="btn-ghost px-3 py-1.5" onClick={() => setModal({ round: r })}><Pencil className="h-3.5 w-3.5" /> Change</button>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <HistoryPanel driveId={d.id} key={flash} />
      </div>

      <div className="space-y-6">
        <div className="card space-y-3 p-6">
          <div className="text-sm text-ink-muted">Next step</div>
          {d.can.submit && <button className="btn-primary w-full" onClick={() => run(() => api(`/drives/${d.id}/submit`, { method: "POST" }), "Sent to the placement cell for review.")}><Send className="h-4 w-4" /> Send for review</button>}
          {d.can.submit && !d.criteria_confirmed && <p className="text-xs text-amber-700">Confirm the screening criteria in Edit before sending.</p>}
          {d.can.review && <button className="btn-primary w-full" onClick={() => setModal("review")}>Review this drive</button>}
          {d.can.publish && <button className="btn-primary w-full" onClick={() => run(() => api(`/drives/${d.id}/publish`, { method: "POST" }), (r) => `Published. ${r.notified} eligible students notified.`)}><Send className="h-4 w-4" /> Publish to students</button>}
          {d.status === "review" && !d.can.review && <p className="text-sm text-ink-muted">Waiting for the placement cell to review.</p>}
          {d.status === "approved" && !d.can.publish && <p className="text-sm text-ink-muted">Approved. The placement cell will publish it to students.</p>}
          {["published", "in_progress", "completed"].includes(d.status) && <Link to={`/drives/${d.id}/candidates`} className="btn-soft w-full"><Users className="h-4 w-4" /> {d.can.hire ? "Candidate pipeline" : "View applicants"}</Link>}
          {d.can.set_status && d.status === "published" && <button className="btn-ghost w-full" onClick={() => setModal({ status: "in_progress" })}>Close applications</button>}
          {d.can.set_status && ["published", "in_progress"].includes(d.status) && <button className="btn-ghost w-full" onClick={() => setModal({ status: "completed" })}>Mark completed</button>}
          {d.can.set_status && <button className="w-full text-xs text-rose-600 hover:underline" onClick={() => setModal({ status: "cancelled" })}>Cancel drive</button>}
        </div>
        <div className="card p-6 text-sm">
          <div className="mb-3 font-medium">Who owns what</div>
          <ul className="space-y-2 text-ink-muted">
            <li><b className="font-medium text-ink">Company</b> — JD, criteria, rounds, candidate stages, offers</li>
            <li><b className="font-medium text-ink">Placement cell</b> — review, publication, confirming dates and changes, student notices</li>
            <li><b className="font-medium text-ink">Students</b> — their profile and application</li>
          </ul>
        </div>
      </div>

      <Modal open={modal === "edit"} onClose={() => setModal(null)} wide title={d.can.propose ? "Propose a change" : "Edit drive"}>
        <EditDrive d={d} onDone={(r) => { setModal(null); setFlash(r.proposed?.length ? `Sent to the placement cell: ${r.proposed.map((f) => FIELD_LABEL[f] || f).join(", ")}.` : "Saved."); reload(); }} />
      </Modal>
      <Modal open={modal === "newround" || Boolean(modal?.round)} onClose={() => setModal(null)} title={modal?.round ? `Change · ${modal.round.name}` : "Add a round"}>
        <RoundForm d={d} round={modal?.round} onDone={(r) => { setModal(null); setFlash(r.mode === "proposed" ? "Sent to the placement cell for confirmation." : "Schedule updated."); reload(); }} />
      </Modal>
      <Modal open={modal === "review"} onClose={() => setModal(null)} title="Review drive">
        <p className="mb-4 text-sm text-ink-muted">Approving verifies the drive details and its tentative round dates. It won't be visible to students until you publish it.</p>
        <label className="label">Note to the company {"(required when asking for changes)"}</label>
        <textarea className="input h-24" value={note} onChange={(e) => setNote(e.target.value)} />
        <ErrorNote>{err}</ErrorNote>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button className="btn-ghost text-rose-600" onClick={() => run(() => api(`/drives/${d.id}/review`, { method: "POST", body: { decision: "decline", note: note || null } }), "Drive declined.")}>Decline</button>
          <button className="btn-ghost" onClick={() => run(() => api(`/drives/${d.id}/review`, { method: "POST", body: { decision: "changes", note: note || null } }), "Changes requested from the company.")}>Request changes</button>
          <button className="btn-primary" onClick={() => run(() => api(`/drives/${d.id}/review`, { method: "POST", body: { decision: "approve", note: note || null } }), "Approved. Publish it when you're ready.")}><Check className="h-4 w-4" /> Approve</button>
        </div>
      </Modal>
      <Modal open={Boolean(modal?.status)} onClose={() => setModal(null)} title={{ in_progress: "Close applications", completed: "Mark drive completed", cancelled: "Cancel drive" }[modal?.status] || ""}>
        <label className="label">Reason {modal?.status === "cancelled" ? "(required)" : "(optional)"}</label>
        <textarea className="input h-24" value={note} onChange={(e) => setNote(e.target.value)} />
        <ErrorNote>{err}</ErrorNote>
        <div className="mt-4 flex justify-end"><button className={modal?.status === "cancelled" ? "btn bg-rose-600 text-white hover:bg-rose-700" : "btn-primary"}
          onClick={() => run(() => api(`/drives/${d.id}/status`, { method: "POST", body: { status: modal.status, reason: note || null } }), "Drive status updated.")}>Confirm</button></div>
      </Modal>
    </div>
  );
}

export default function DriveDetail() {
  const { id } = useParams();
  const { data: d, error, reload } = useApi(`/drives/${id}`);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!d) return <Spinner />;
  const student = !d.can;
  return (
    <>
      <Link to="/drives" className="mb-6 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Drives</Link>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="eyebrow mb-4">{d.company}{d.college && !student && ` · ${d.college}`}</div>
          <h1 className="text-3xl font-medium tracking-[-0.03em] sm:text-4xl">{d.role}</h1>
        </div>
        <Badge value={d.status} label={d.status_label} />
      </div>
      {!student && <div className="card mb-6 overflow-x-auto p-5"><DriveFlow status={d.status} /></div>}
      {student ? <StudentView d={d} reload={reload} /> : <StaffView d={d} reload={reload} />}
    </>
  );
}
