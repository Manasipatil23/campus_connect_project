import { useState } from "react";
import { Megaphone, Send } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Empty, ErrorNote, PageHeader, Spinner, ago, fmtTime, useApi } from "../components/ui";

const BRANCHES = ["Computer", "IT", "EXTC", "Electronics", "Mechanical", "AI & DS", "Civil", "Chemical"];

function Compose({ onSent }) {
  const { data: drives } = useApi("/drives");
  const [f, setF] = useState({ title: "", body: "", audience: "all", branches: [], drive_id: "" });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const live = (drives || []).filter((d) => ["published", "in_progress"].includes(d.status));
  const send = async (e) => {
    e.preventDefault(); setErr(null); setBusy(true);
    try {
      const r = await api("/announcements", { method: "POST", body: { ...f, drive_id: f.drive_id || null } });
      setF({ title: "", body: "", audience: "all", branches: [], drive_id: "" });
      onSent(r);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <form onSubmit={send} className="card space-y-4 p-6">
      <h2 className="flex items-center gap-2 font-medium"><Megaphone className="h-4 w-4 text-brand-600" /> New notice</h2>
      <div><label className="label">Title</label><input className="input" value={f.title} onChange={set("title")} required minLength={3} /></div>
      <div><label className="label">Message</label><textarea className="input h-28" value={f.body} onChange={set("body")} required minLength={5} /></div>
      <div>
        <label className="label">Who should receive it?</label>
        <select className="input" value={f.audience} onChange={set("audience")}>
          <option value="all">All approved students</option>
          <option value="branches">Selected branches</option>
          <option value="drive_eligible">Students eligible for a drive</option>
          <option value="drive_applicants">Applicants of a drive</option>
        </select>
      </div>
      {f.audience === "branches" && (
        <div className="flex flex-wrap gap-2">{BRANCHES.map((b) => (
          <button type="button" key={b} onClick={() => setF({ ...f, branches: f.branches.includes(b) ? f.branches.filter((x) => x !== b) : [...f.branches, b] })}
            className={`chip px-3 py-1 text-sm ${f.branches.includes(b) ? "bg-brand-600 text-white" : "border border-black/10 bg-white text-ink-muted"}`}>{b}</button>
        ))}</div>
      )}
      {f.audience.startsWith("drive") && (
        <select className="input" value={f.drive_id} onChange={set("drive_id")} required>
          <option value="" disabled>Choose a published drive</option>
          {live.map((d) => <option key={d.id} value={d.id}>{d.company} · {d.role}</option>)}
        </select>
      )}
      <ErrorNote>{err}</ErrorNote>
      <button className="btn-primary" disabled={busy}><Send className="h-4 w-4" /> {busy ? "Sending…" : "Send notice"}</button>
    </form>
  );
}

export default function Notices() {
  const { user } = useAuth();
  const isCollege = user.role === "coordinator";
  const { data, error, reload } = useApi("/announcements");
  const [sent, setSent] = useState(null);
  return (
    <>
      <PageHeader eyebrow={user.college?.name} title={isCollege ? "Student" : "Placement cell"} accent="notices."
        subtitle={isCollege ? "Verified information to the right students at the same time. Each notice also arrives as a notification." : "Official notices from your placement cell, all in one place instead of scattered across email and WhatsApp."} />
      <div className={isCollege ? "grid gap-6 lg:grid-cols-[1fr_1.3fr]" : ""}>
        {isCollege && <div className="space-y-3"><Compose onSent={(r) => { setSent(r); reload(); }} />
          {sent && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">Sent to {sent.recipients} students ({sent.audience_label}).</div>}</div>}
        <div className="space-y-4">
          <ErrorNote>{error}</ErrorNote>
          {!data ? <Spinner /> : data.length === 0 ? <div className="card"><Empty>No notices yet.</Empty></div> : data.map((n) => (
            <article key={n.id} className="card p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-medium">{n.title}</h2>
                <span className="text-xs text-ink-muted" title={fmtTime(n.created_at)}>{ago(n.created_at)}</span>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink-soft">{n.body}</p>
              <div className="mt-3 text-xs text-ink-muted">{n.by_name}{isCollege && ` · ${n.audience_label} · ${n.recipients} students`}</div>
            </article>
          ))}
        </div>
      </div>
    </>
  );
}
