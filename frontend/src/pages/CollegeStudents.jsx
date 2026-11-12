import { useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ArrowRight, AlertTriangle, Award, ListChecks, Loader2, Upload, BookOpen, CheckCircle2, X, FileText, GraduationCap, Layers, Mail, MessageSquare, Pause, Phone, Play, Search, Undo2, UserCheck, XCircle } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Empty, ErrorNote, Modal, PageHeader, Spinner, Stat, Tabs, ago, useApi, fmtDate, plural } from "../components/ui";

const BRANCH_OPTIONS = ["Computer", "IT", "EXTC", "Electronics", "Mechanical", "AI & DS", "Civil", "Chemical"];

/** Official student numbers per branch (from the college's own records), to compare with who has joined. */
function Enrolment({ data, onSaved }) {
  const years = data.batches.map((b) => b.grad_year);
  const [year, setYear] = useState(String(years[0] || new Date().getFullYear()));
  const saved = (data.enrolment || {})[year]?.branches || {};
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [msg, setMsg] = useState(null);
  const editing = rows !== null;
  const start = () => {
    const names = [...new Set([...Object.keys(saved), ...data.branches.map((b) => b.branch).filter((b) => b !== "Not set")])];
    setRows((names.length ? names : BRANCH_OPTIONS.slice(0, 4)).map((b) => ({ branch: b, count: saved[b] ?? "" })));
    setMsg(null);
  };
  const save = async () => {
    setErr(null);
    try {
      const branches = Object.fromEntries(rows.filter((r) => r.branch.trim() && r.count !== "").map((r) => [r.branch.trim(), Number(r.count)]));
      const r = await api("/college/enrolment", { method: "PUT", body: { grad_year: Number(year), branches } });
      setRows(null); setMsg(`Saved: ${plural(r.total, "student")} in batch ${year}.`); onSaved();
    } catch (e) { setErr(e.message); }
  };
  const total = Object.values(saved).reduce((a, b) => a + b, 0);
  return (
    <section className="card p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-medium">Official student numbers</h2>
          <p className="text-xs text-ink-muted">From your college records, so you can see how many have joined Campus Connect.</p>
        </div>
        {!editing && <button className="btn-ghost px-4 py-2" onClick={start}>{total ? "Edit numbers" : "Add numbers"}</button>}
      </div>
      {msg && <p className="mt-3 text-sm text-emerald-700">{msg}</p>}
      {!editing ? (
        total ? (
          <p className="mt-4 text-sm">Batch {year}: <b className="font-medium">{total}</b> enrolled · <b className="font-medium">{data.totals.students}</b> joined
            {total ? ` (${Math.round((100 * data.totals.students) / total)}%)` : ""}</p>
        ) : <p className="mt-4 text-sm text-ink-muted">Not added yet.</p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm"><label className="label mb-0" htmlFor="enrol-year">Batch</label>
            <input id="enrol-year" className="input w-28" type="number" value={year} onChange={(e) => setYear(e.target.value)} /></div>
          {rows.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_8rem_auto] gap-2">
              <input className="input" list="branch-options" aria-label="Branch" value={r.branch} onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, branch: e.target.value } : x)))} />
              <input className="input" type="number" min="0" aria-label={`Students in ${r.branch || "branch"}`} placeholder="Students" value={r.count}
                onChange={(e) => setRows(rows.map((x, j) => (j === i ? { ...x, count: e.target.value } : x)))} />
              <button type="button" className="rounded-full p-2 text-ink-muted hover:bg-rose-50 hover:text-rose-600" aria-label="Remove branch" onClick={() => setRows(rows.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
            </div>
          ))}
          <datalist id="branch-options">{BRANCH_OPTIONS.map((b) => <option key={b} value={b} />)}</datalist>
          <ErrorNote>{err}</ErrorNote>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setRows([...rows, { branch: "", count: "" }])}>Add branch</button>
            <span className="flex-1" />
            <button type="button" className="btn-ghost px-4 py-2" onClick={() => setRows(null)}>Cancel</button>
            <button type="button" className="btn-primary px-4 py-2" onClick={save}>Save numbers</button>
          </div>
        </div>
      )}
    </section>
  );
}

const ACTIVITY_LABEL = { active: "Active", quiet: "Quiet", inactive: "Inactive" };

/** Who has been using Campus Connect, and reminders for those who haven't. */
function Activity({ totals }) {
  const [state, setState] = useState("needs_nudge");
  const { data, reload } = useApi(`/college/students/activity?state=${state}`);
  const [picked, setPicked] = useState([]);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const send = async (ids) => {
    setErr(null); setBusy(true); setResult(null);
    try {
      const r = await api("/college/students/remind", { method: "POST", body: ids.length ? { student_ids: ids, message: message || null } : { audience: "needs_nudge", message: message || null } });
      setResult(r); setPicked([]); reload();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const rows = data || [];
  const toggle = (id) => setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id]);
  return (
    <section className="card p-6">
      <h2 className="font-medium">Who's using Campus Connect</h2>
      <p className="text-xs text-ink-muted">Active: used it in the last 7 days · Quiet: 8–30 days ago · Inactive: longer, or not since being approved.</p>
      <div className="mt-4 grid grid-cols-3 gap-3 text-center">
        {[["active", "text-emerald-700 bg-emerald-50"], ["quiet", "text-amber-700 bg-amber-50"], ["inactive", "text-rose-600 bg-rose-50"]].map(([k, c]) => (
          <div key={k} className={`rounded-2xl px-3 py-3 ${c}`}><div className="text-2xl font-medium tabular-nums">{totals[k] ?? 0}</div><div className="text-xs">{ACTIVITY_LABEL[k]}</div></div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Tabs value={state} onChange={(v) => { setState(v); setPicked([]); }} options={[["needs_nudge", "Quiet & inactive"], ["active", "Active"], ["all", "Everyone"]]} />
      </div>
      {!data ? <Spinner /> : rows.length === 0 ? <p className="mt-4 text-sm text-ink-muted">{state === "needs_nudge" ? "Everyone has used Campus Connect recently." : "No students here."}</p> : (
        <ul className="mt-4 max-h-80 divide-y divide-black/[.05] overflow-y-auto rounded-xl border border-black/[.06]">
          {rows.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
              {state !== "active" && <input type="checkbox" className="accent-brand-600" checked={picked.includes(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.name}`} />}
              <div className="min-w-0 flex-1"><div className="truncate font-medium">{s.name}</div><div className="truncate text-xs text-ink-muted">{s.branch} · {s.email}</div></div>
              <span className="chip bg-black/[.04] text-ink-soft">{ACTIVITY_LABEL[s.activity]}</span>
              <span className="w-28 text-right text-xs text-ink-muted">{s.last_seen_at ? `seen ${ago(s.last_seen_at)}` : "not since approval"}</span>
              {s.last_reminded_at && <span className="text-xs text-ink-muted">reminded {ago(s.last_reminded_at)}</span>}
            </li>
          ))}
        </ul>
      )}
      {state !== "active" && rows.length > 0 && (
        <div className="mt-4 space-y-3">
          <label className="label" htmlFor="remind-msg">Message (optional; a standard reminder is used otherwise)</label>
          <textarea id="remind-msg" className="input h-20" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Drives are open this week. Please sign in and update your resume." />
          <ErrorNote>{err}</ErrorNote>
          {result && <p className="text-sm text-emerald-700">Sent {result.sent} reminder{result.sent === 1 ? "" : "s"}{result.skipped_recently_reminded ? ` · ${result.skipped_recently_reminded} skipped (reminded in the last day)` : ""}{result.failed ? ` · ${result.failed} failed` : ""}{result.email_dev_mode ? " · email isn't set up, so in-app notices only" : ""}.</p>}
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary px-4 py-2" disabled={busy || picked.length === 0} onClick={() => send(picked)}>Email {picked.length || ""} selected</button>
            <button className="btn-ghost px-4 py-2" disabled={busy} onClick={() => send([])}>Email all quiet & inactive</button>
          </div>
          <p className="text-xs text-ink-muted">Each student gets at most one reminder a day, by email and as a notice in the app. Replies come to you.</p>
        </div>
      )}
    </section>
  );
}

function Overview({ onApprovals }) {
  const [year, setYear] = useState(null);
  const { data, error, reload } = useApi(`/college/student-stats${year ? `?grad_year=${year}` : ""}`);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;
  const t = data.totals;
  const maxBranch = Math.max(1, ...data.branches.map((b) => b.students));
  const maxBand = Math.max(1, ...data.cgpa_bands.map((b) => b.students));
  const pct = (n) => (t.students ? Math.round((100 * n) / t.students) : 0);
  return (
    <div className="space-y-6">
      {data.batches.length > 1 && (
        <Tabs value={year ?? "all"} onChange={(v) => setYear(v === "all" ? null : v)}
          options={[["all", "All batches"], ...data.batches.map((b) => [b.grad_year, `Batch ${b.grad_year} (${b.students})`])]} />
      )}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Stat label="Approved students" value={t.students} hint={data.batches.length === 1 ? `Batch ${data.batches[0].grad_year}` : `${data.batches.length} batches`} icon={GraduationCap} />
        <Stat label="Branches" value={t.branches} icon={Layers} />
        <Stat label="Placed" value={t.placed} hint={`${t.placement_rate}% of students`} icon={Award} />
        <Stat label="Average CGPA" value={t.avg_cgpa ?? "—"} icon={BookOpen} />
        <Stat label="Resumes uploaded" value={`${pct(t.resumes)}%`} hint={`${t.resumes} of ${t.students}`} icon={FileText} />
        <button onClick={onApprovals} className="text-left"><Stat label="Waiting for approval" value={data.counts.pending} hint="Review sign-ups →" icon={UserCheck} /></button>
      </div>

      <section className="card overflow-x-auto p-6">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-medium">Branch by branch</h2>
          <span className="text-xs text-ink-muted">"Ready pool": CGPA 7+ and no active backlogs, a common company bar</span>
        </div>
        <table className="mt-4 w-full min-w-[720px] text-sm [&_td]:px-3 [&_th]:px-3">
          <thead className="border-b border-black/[.06] text-left text-xs text-ink-muted">
            <tr><th className="py-2 pl-0">Branch</th><th className="w-[32%]">Students{t.enrolled ? " (joined / enrolled)" : ""}</th><th className="text-right">Placed</th><th className="text-right">Avg CGPA</th><th className="text-right">Ready pool</th><th className="text-right">With backlogs</th><th className="pr-0 text-right">Resumes</th></tr>
          </thead>
          <tbody className="divide-y divide-black/[.05]">
            {data.branches.map((b) => (
              <tr key={b.branch}>
                <td className="py-3 pl-0 font-medium">{b.branch}</td>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="h-2 flex-1 rounded-full bg-brand-50">
                      <div className="relative h-2 rounded-full bg-brand-200" style={{ width: `${(100 * b.students) / maxBranch}%` }}>
                        <div className="absolute inset-y-0 left-0 rounded-full bg-brand-700" style={{ width: `${b.students ? (100 * b.placed) / b.students : 0}%` }} />
                      </div>
                    </div>
                    <span className="w-16 text-right tabular-nums">{b.students}{b.enrolled ? <span className="text-ink-muted"> / {b.enrolled}</span> : ""}</span>
                  </div>
                </td>
                <td className="text-right tabular-nums">{b.placed} <span className="text-xs text-ink-muted">({b.placement_rate}%)</span></td>
                <td className="text-right tabular-nums">{b.avg_cgpa ?? "—"}</td>
                <td className="text-right tabular-nums">{b.ready_pool}</td>
                <td className={`text-right tabular-nums ${b.with_backlogs ? "text-amber-700" : ""}`}>{b.with_backlogs}</td>
                <td className="pr-0 text-right tabular-nums">{b.resumes}/{b.students}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t border-black/[.08] text-sm font-medium">
            <tr><td className="py-3 pl-0">All branches</td><td className="text-right tabular-nums">{t.students}</td><td className="text-right tabular-nums">{t.placed} <span className="text-xs font-normal text-ink-muted">({t.placement_rate}%)</span></td>
              <td className="text-right tabular-nums">{t.avg_cgpa ?? "—"}</td><td className="text-right tabular-nums">{t.ready_pool}</td><td className="text-right tabular-nums">{t.with_backlogs}</td><td className="pr-0 text-right tabular-nums">{t.resumes}/{t.students}</td></tr>
          </tfoot>
        </table>
        <div className="mt-3 flex gap-4 text-xs text-ink-muted">
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-brand-700" />Placed</span>
          <span className="flex items-center gap-1.5"><span className="h-2 w-3 rounded-full bg-brand-200" />Not placed yet</span>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Enrolment data={data} onSaved={reload} />
        <Activity totals={t} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="font-medium">CGPA spread</h2>
          <ul className="mt-4 space-y-3">
            {data.cgpa_bands.map((b) => (
              <li key={b.band} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-3 text-sm">
                <span className="text-ink-muted">{b.band}</span>
                <div className="h-2.5 rounded-full bg-brand-50"><div className="h-2.5 rounded-full bg-gradient-to-r from-brand-400 to-brand-700" style={{ width: `${(100 * b.students) / maxBand}%` }} /></div>
                <span className="text-right tabular-nums">{b.students}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card p-6">
          <h2 className="font-medium">Worth following up</h2>
          <ul className="mt-4 space-y-3 text-sm">
            <li className="flex justify-between gap-3"><span className="text-ink-muted">Students without a resume</span><b className="font-medium tabular-nums">{t.students - t.resumes}</b></li>
            <li className="flex justify-between gap-3"><span className="text-ink-muted">Profiles missing CGPA</span><b className="font-medium tabular-nums">{t.profiles_incomplete}</b></li>
            <li className="flex justify-between gap-3"><span className="text-ink-muted">Students with active backlogs</span><b className="font-medium tabular-nums">{t.with_backlogs}</b></li>
            <li className="flex justify-between gap-3"><span className="text-ink-muted">Not placed yet</span><b className="font-medium tabular-nums">{t.students - t.placed}</b></li>
            <li className="flex justify-between gap-3"><span className="text-ink-muted">Sign-ups waiting for you</span><button onClick={onApprovals} className="font-medium tabular-nums text-brand-700 hover:underline">{data.counts.pending}</button></li>
          </ul>
        </section>
      </div>
    </div>
  );
}

/** Upload the college's official list (CSV, Excel, PDF, Word) and approve every sign-up on it in one go. */
function RosterMatch({ waiting, onApproved }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);
  const [pick, setPick] = useState(() => new Set());
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(null);
  const upload = async (file) => {
    if (!file) return;
    setErr(null); setDone(null); setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api("/college/students/roster-match", { method: "POST", form });
      setRes(r);
      setPick(new Set(r.matched.filter((m) => m.sure).map((m) => m.student.id)));
    } catch (e) { setErr(e.message); } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const approve = async () => {
    setSaving(true); setErr(null);
    try {
      const r = await api("/college/students/bulk-decision", { method: "POST", body: { approve: [...pick] } });
      setDone(r); setRes(null); onApproved();
    } catch (e) { setErr(e.message); } finally { setSaving(false); }
  };
  const flip = (id) => setPick((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const sure = res?.matched.filter((m) => m.sure).length || 0;
  const check = (res?.matched.length || 0) - sure;
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-black/[.06] bg-white px-4 py-3 text-sm shadow-soft">
        <ListChecks className="h-5 w-5 shrink-0 text-brand-600" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">Have an official list of students?</div>
          <div className="text-xs text-ink-muted">Upload it (CSV, Excel, PDF or Word). We match it with the {plural(waiting, "sign-up")} waiting, you check the matches, then approve them all at once.</div>
        </div>
        <input ref={input} type="file" className="hidden" onChange={(e) => upload(e.target.files?.[0])}
          accept=".csv,.tsv,.xlsx,.pdf,.docx,.txt,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.wordprocessingml.document" />
        <button className="btn-soft px-4 py-2 text-sm" disabled={busy || !waiting} onClick={() => input.current?.click()}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}{busy ? "Matching…" : "Match with your list"}
        </button>
      </div>
      {err && !res && <ErrorNote>{err}</ErrorNote>}
      {done && <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">Approved {plural(done.approved, "student")} from your list. Everyone gets an email.</div>}
      <Modal open={Boolean(res)} onClose={() => setRes(null)} wide title={res ? `Matches from ${res.file}` : ""}>
        {res && (
          <div className="space-y-5 text-sm">
            <p className="text-ink-muted">
              Read {plural(res.rows_read, "row")}. {plural(sure, "sure match", "sure matches")}{check ? `, ${check} to check` : ""}.
              {res.already_approved > 0 && ` ${plural(res.already_approved, "student")} on the list ${res.already_approved === 1 ? "is" : "are"} already approved.`}
            </p>
            {res.matched.length === 0 ? <div className="rounded-xl bg-black/[.03] p-4 text-ink-muted">Nobody waiting matches this list. Check that it has names, roll numbers or emails.</div> : (
              <div className="divide-y divide-black/[.06] rounded-xl border border-black/[.06]">
                {res.matched.map((m) => (
                  <label key={m.student.id} className={`flex cursor-pointer items-start gap-3 p-3 hover:bg-brand-50/30 ${pick.has(m.student.id) ? "" : "text-ink-muted"}`}>
                    <input type="checkbox" className="mt-1 h-4 w-4 accent-brand-700" checked={pick.has(m.student.id)} onChange={() => flip(m.student.id)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-ink">{m.student.name}</span>
                        <span className="font-mono text-xs">{m.student.roll_number}</span>
                        <span className={`chip ${m.sure ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{m.sure ? `matched by ${m.matched_by}` : `check · ${m.matched_by}`}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-ink-muted">Your list: {m.row}</div>
                      {m.note && <div className="mt-0.5 flex items-center gap-1 text-xs text-amber-700"><AlertTriangle className="h-3 w-3" />{m.note}</div>}
                    </div>
                  </label>
                ))}
              </div>
            )}
            {res.not_in_list.length > 0 && (
              <details className="rounded-xl bg-black/[.03] px-4 py-3">
                <summary className="cursor-pointer font-medium">{plural(res.not_in_list.length, "sign-up")} not on your list (left waiting)</summary>
                <p className="mt-2 text-xs text-ink-muted">{res.not_in_list.map((s) => `${s.name}${s.roll_number ? ` (${s.roll_number})` : ""}`).join(", ")}</p>
              </details>
            )}
            {res.list_only_count > 0 && (
              <details className="rounded-xl bg-black/[.03] px-4 py-3">
                <summary className="cursor-pointer font-medium">{plural(res.list_only_count, "row")} on your list with no sign-up yet</summary>
                <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-ink-muted">{res.list_only.map((l, i) => <li key={i}>{l}</li>)}</ul>
              </details>
            )}
            <ErrorNote>{err}</ErrorNote>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-black/[.06] pt-4">
              <span className="mr-auto text-xs text-ink-muted">Only ticked students are approved. Nothing changes until you confirm.</span>
              <button className="btn-ghost" onClick={() => setRes(null)}>Cancel</button>
              <button className="btn-primary" disabled={saving || !pick.size} onClick={approve}>
                <CheckCircle2 className="h-4 w-4" />{saving ? "Approving…" : `Approve ${plural(pick.size, "student")}`}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

const NAME_ACTIONS = {
  message: { label: "Message", icon: MessageSquare, prompt: "Message to the student (sent as a notification and email)", button: "Send message", needsText: true },
  revert: { label: "Undo change", icon: Undo2, prompt: "Why are you undoing it? (shown to the student, optional)", button: "Undo name change" },
  suspend: { label: "Suspend", icon: Pause, prompt: "Reason for suspending (emailed to the student, optional)", button: "Suspend account", danger: true },
};

/** Students who renamed themselves: accept, ask, undo, or suspend. */
function NameChanges({ onChanged }) {
  const { data, error, reload } = useApi("/college/students/name-changes");
  const [open, setOpen] = useState(null);   // {id, action}
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [done, setDone] = useState(null);
  const act = async (s, action, message) => {
    setErr(null); setBusy(true);
    try {
      await api(`/college/students/${s.id}/name-review`, { method: "POST", body: { action, message: message || null } });
      setDone({ ok: `Accepted ${s.name}'s new name.`, message: `Message sent to ${s.name}.`, revert: `Changed back to ${s.name_change.old_name}.`,
        suspend: `${s.name}'s account is suspended. Find it under Sign-ups & approvals → Suspended.` }[action]);
      setOpen(null); setText(""); reload(); onChanged?.();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  if (!data) return error ? <ErrorNote>{error}</ErrorNote> : <Spinner />;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">Students can change their name but not their email. Check each new name against your records.</p>
      {done && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">{done}</div>}
      <ErrorNote>{err}</ErrorNote>
      {data.length === 0 ? <div className="card"><Empty>No name changes to review.</Empty></div> : data.map((s) => {
        const a = open?.id === s.id ? NAME_ACTIONS[open.action] : null;
        return (
          <div key={s.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-base">
                  <span className="text-ink-muted line-through">{s.name_change.old_name}</span>
                  <ArrowRight className="h-4 w-4 text-ink-muted" />
                  <span className="font-medium">{s.name_change.new_name}</span>
                  {s.name_change.status === "asked" && <span className="chip bg-amber-50 text-amber-700">You messaged them</span>}
                </div>
                <div className="mt-1 text-xs text-ink-muted">
                  {[s.roll_number && `Roll ${s.roll_number}`, s.profile?.branch, s.profile?.grad_year && `Batch ${s.profile.grad_year}`, s.email].filter(Boolean).join(" · ")} · changed {ago(s.name_change.at)}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <button className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-black disabled:opacity-40" disabled={busy} onClick={() => act(s, "ok")}>
                  <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Looks fine
                </button>
                {Object.entries(NAME_ACTIONS).map(([k, x]) => (
                  <button key={k} disabled={busy} onClick={() => { setOpen(open?.id === s.id && open.action === k ? null : { id: s.id, action: k }); setText(""); setErr(null); }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${open?.id === s.id && open.action === k ? "bg-black/[.06]" : ""} ${x.danger ? "text-rose-600 hover:bg-rose-50" : "text-ink-soft hover:bg-black/[.04]"}`}>
                    <x.icon className="mr-1 inline h-3.5 w-3.5" />{x.label}
                  </button>
                ))}
              </div>
            </div>
            {a && (
              <div className="mt-4 space-y-2 border-t border-black/[.06] pt-4">
                <label className="label">{a.prompt}</label>
                <textarea className="input h-20 text-sm" value={text} onChange={(e) => setText(e.target.value)} maxLength={500} autoFocus
                  placeholder={open.action === "message" ? "e.g. Your new name doesn't match your marksheet. Please share a document that shows it." : ""} />
                <div className="flex gap-2">
                  <button className={`${a.danger ? "rounded-full bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700" : "btn-primary px-4 py-2 text-sm"} disabled:opacity-40`}
                    disabled={busy || (a.needsText && text.trim().length < 3)} onClick={() => act(s, open.action, text.trim())}>{busy ? "Saving…" : a.button}</button>
                  <button className="btn-ghost px-4 py-2 text-sm" onClick={() => setOpen(null)}>Cancel</button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function CollegeStudents() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [view, setViewState] = useState(() => (["overview", "approvals", "names"].includes(params.get("view")) ? params.get("view") : "overview"));
  const setView = (v) => { setViewState(v); setParams(v === "overview" ? {} : { view: v }, { replace: true }); };
  const { data: renamed, reload: reloadRenamed } = useApi("/college/students/name-changes");
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const { data, error, setData } = useApi(`/college/students?status=${status}`);
  const { data: pending, reload: reloadPending } = useApi("/college/students?status=pending");
  const [err, setErr] = useState(null);
  const [left, setLeft] = useState(() => new Set());   // pending students unticked = left out of the bulk action
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkDone, setBulkDone] = useState(null);
  const list = useMemo(() => (data || []).filter((s) => `${s.name} ${s.email} ${s.roll_number} ${s.profile?.branch}`.toLowerCase().includes(q.toLowerCase())), [data, q]);

  const decide = async (s, decision) => {
    setErr(null);
    let note = null;
    if (decision === "reject") {
      note = window.prompt(`Reason for not approving ${s.name} (shown to them):`, "Roll number doesn't match our records");
      if (note === null) return;
    }
    try {
      await api(`/college/students/${s.id}/decision`, { method: "POST", body: { decision, note } });
      setData(data.filter((x) => x.id !== s.id));
      reloadPending();
    } catch (e) { setErr(e.message); }
  };

  const reactivate = async (s) => {
    setErr(null);
    try {
      await api(`/college/students/${s.id}/name-review`, { method: "POST", body: { action: "reactivate" } });
      setData(data.filter((x) => x.id !== s.id));
    } catch (e) { setErr(e.message); }
  };
  const bulk = status === "pending" && list.length > 1;
  const included = bulk ? list.filter((s) => !left.has(s.id)) : [];
  const excluded = bulk ? list.filter((s) => left.has(s.id)) : [];
  const toggle = (id) => setLeft((cur) => { const n = new Set(cur); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAll = () => setLeft(excluded.length ? new Set() : new Set(list.map((s) => s.id)));
  const runBulk = async (decision) => {
    const targets = decision === "approve" ? included : excluded;
    if (!targets.length) return;
    let note = null;
    if (decision === "reject") {
      note = window.prompt(`Reason for not approving these ${plural(targets.length, "student")} (emailed to them):`, "Details don't match our records");
      if (note === null) return;
    }
    setErr(null); setBulkBusy(true); setBulkDone(null);
    try {
      const ids = targets.map((s) => s.id);
      const r = await api("/college/students/bulk-decision", { method: "POST", body: decision === "approve" ? { approve: ids } : { reject: ids, note } });
      const gone = new Set(ids);
      setData(data.filter((x) => !gone.has(x.id)));
      setLeft(new Set());
      setBulkDone(r);
      reloadPending();
    } catch (e) { setErr(e.message); } finally { setBulkBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow={user.college?.name} title="Your" accent="students."
        subtitle={view === "overview" ? "Your student body by branch, batch and CGPA, straight from student records." : "Students sign up with a verified email and your college. Check their roll number and details, then approve them."} />
      <div className="mb-6"><Tabs value={view} onChange={setView} options={[["overview", "Overview"], ["approvals", `Sign-ups & approvals${pending?.length ? ` (${pending.length})` : ""}`],
        ["names", `Name changes${renamed?.length ? ` (${renamed.length})` : ""}`]]} /></div>
      {view === "names" ? <NameChanges onChanged={reloadRenamed} /> : view === "overview" ? <Overview onApprovals={() => { setView("approvals"); setStatus("pending"); }} /> : <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Tabs value={status} onChange={setStatus} options={[["pending", `Waiting${pending ? ` (${pending.length})` : ""}`], ["active", "Approved"], ["rejected", "Not approved"], ["suspended", "Suspended"]]} />
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input className="input pl-10" placeholder="Search name, roll number, branch" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <ErrorNote>{err || error}</ErrorNote>
      {status === "pending" && <RosterMatch waiting={pending?.length || 0}
        onApproved={() => { reloadPending(); api("/college/students?status=pending").then(setData).catch(() => {}); }} />}
      {bulkDone && (
        <div className="mb-3 rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          {bulkDone.approved > 0 && `Approved ${plural(bulkDone.approved, "student")}. `}
          {bulkDone.rejected > 0 && `${plural(bulkDone.rejected, "student")} not approved. `}
          {bulkDone.skipped > 0 && `${plural(bulkDone.skipped, "student")} skipped (already decided). `}
          Everyone gets an email.
        </div>
      )}
      {bulk && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-100 bg-brand-50/40 px-4 py-3 text-sm">
          <div className="min-w-0 flex-1">
            <div className="font-medium">Approve everyone except the ones you untick</div>
            <div className="text-xs text-ink-muted">
              {excluded.length ? `${plural(included.length, "student")} ticked · ${excluded.length} left out` : `All ${plural(list.length, "student")}${q ? " matching your search" : ""} are ticked. Untick anyone whose details don't check out.`}
            </div>
          </div>
          {excluded.length > 0 && (
            <button className="rounded-full px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-40" disabled={bulkBusy} onClick={() => runBulk("reject")}>
              <XCircle className="mr-1 inline h-3.5 w-3.5" />Reject the {excluded.length} left out
            </button>
          )}
          <button className="btn-primary px-4 py-2 text-sm" disabled={bulkBusy || !included.length} onClick={() => runBulk("approve")}>
            <CheckCircle2 className="h-4 w-4" />{bulkBusy ? "Saving…" : `Approve ${included.length}`}
          </button>
        </div>
      )}
      <div className="card mt-2 overflow-x-auto">
        {!data ? <Spinner /> : list.length === 0 ? <Empty>{status === "pending" ? "No sign-ups waiting. New students appear here after they verify their email." : "No students here."}</Empty> : (
          <table className="w-full min-w-[540px] text-sm [&_td]:px-3 [&_th]:px-3">
            <thead className="border-b border-black/[.06] text-left text-xs text-ink-muted">
              <tr>{bulk && <th className="w-10 py-3 pl-6"><input type="checkbox" aria-label="Tick or untick everyone" className="h-4 w-4 accent-brand-700"
                checked={!excluded.length} ref={(el) => { if (el) el.indeterminate = excluded.length > 0 && included.length > 0; }} onChange={toggleAll} /></th>}
                <th className={bulk ? "py-3" : "py-3 pl-6"}>Student</th><th>Roll no.</th><th>Branch · batch</th><th>Contact</th><th className="pr-6 text-right">{status === "pending" ? "Decision" : status === "suspended" ? "Action" : ""}</th></tr>
            </thead>
            <tbody className="divide-y divide-black/[.05]">
              {list.map((s) => (
                <tr key={s.id} className={`hover:bg-brand-50/30 ${bulk && left.has(s.id) ? "bg-black/[.02] text-ink-muted" : ""}`}>
                  {bulk && <td className="py-4 pl-6"><input type="checkbox" aria-label={`Include ${s.name}`} className="h-4 w-4 accent-brand-700" checked={!left.has(s.id)} onChange={() => toggle(s.id)} /></td>}
                  <td className={bulk ? "py-4" : "py-4 pl-6"}><div className="min-w-[9rem] font-medium">{s.name}</div><div className="text-xs text-ink-muted">Signed up {s.created_at ? fmtDate(s.created_at) : "—"}</div>{s.review_note && ["rejected", "suspended"].includes(status) && <div className="text-xs text-rose-600">{s.review_note}</div>}</td>
                  <td className="font-mono text-xs">{s.roll_number}</td>
                  <td className="whitespace-nowrap">{[s.profile?.branch, s.profile?.grad_year].filter(Boolean).join(" · ")}</td>
                  <td className="text-xs text-ink-muted"><div className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</div>{s.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</div>}</td>
                  <td className="whitespace-nowrap py-4 pr-6 text-right">
                    {status === "suspended" && (
                      <button className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-black" onClick={() => reactivate(s)}><Play className="mr-1 inline h-3.5 w-3.5" />Reactivate</button>
                    )}
                    {status === "pending" && <>
                      <button className="rounded-full px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50" onClick={() => decide(s, "reject")}><XCircle className="mr-1 inline h-3.5 w-3.5" />Reject</button>
                      <button className="rounded-full bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-black" onClick={() => decide(s, "approve")}><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" />Approve</button>
                    </>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      </>}
    </>
  );
}
