import { useState } from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, CalendarClock, Check, CheckCircle2, Circle, Clock, History, Inbox, Mail, Phone, X } from "lucide-react";
import { api } from "../api";
import { Badge, Empty, ErrorNote, Modal, ago, fmtDate, useApi, plural } from "./ui";

/** The steps of the shared drive workflow, so every portal shows where a drive is. */
const FLOW = [
  ["draft", "Draft", "Company"],
  ["review", "Review", "Placement cell"],
  ["approved", "Confirmed", "Placement cell"],
  ["published", "Published", "Students see it"],
  ["in_progress", "Selection", "Company"],
  ["completed", "Completed", ""],
];
const ORDER = { draft: 0, changes_requested: 0, review: 1, approved: 2, published: 3, in_progress: 4, completed: 5 };

export function DriveFlow({ status }) {
  if (status === "cancelled") return <div className="flex items-center gap-2 text-sm text-rose-600"><AlertCircle className="h-4 w-4" /> This drive was cancelled.</div>;
  const at = ORDER[status] ?? 0;
  return (
    <ol className="flex flex-wrap items-center gap-y-3 text-xs">
      {FLOW.map(([key, label, who], i) => {
        const done = i < at || (status === "completed" && i === at);
        const current = i === at && status !== "completed";
        return (
          <li key={key} className="flex items-center">
            <div className="flex items-center gap-2">
              {done ? <CheckCircle2 className="h-4 w-4 text-brand-600" /> : current ? <Clock className="h-4 w-4 text-amber-500" /> : <Circle className="h-4 w-4 text-black/20" />}
              <div className="leading-tight">
                <div className={current ? "font-medium text-ink" : done ? "text-ink-soft" : "text-ink-muted"}>
                  {current && status === "changes_requested" ? "Needs changes" : label}
                </div>
                {who && <div className="text-[10px] text-ink-muted">{who}</div>}
              </div>
            </div>
            {i < FLOW.length - 1 && <span className={`mx-3 h-px w-6 sm:w-10 ${i < at ? "bg-brand-400" : "bg-black/10"}`} />}
          </li>
        );
      })}
    </ol>
  );
}

/** Pending actions for whoever is signed in — the "what needs me?" list. */
export function ActionsPanel({ title = "Needs your attention", compact }) {
  const { data } = useApi("/actions");
  if (!data) return null;
  return (
    <div className="card p-6">
      <div className="mb-4 flex items-center gap-2">
        <Inbox className="h-4 w-4 text-brand-600" />
        <h2 className="font-medium">{title}</h2>
        <span className="ml-auto text-xs text-ink-muted">{data.length ? plural(data.reduce((a, x) => a + x.count, 0), "item") : ""}</span>
      </div>
      {data.length === 0 ? <p className="text-sm text-ink-muted">Nothing waiting on you. Everything is up to date.</p> : (
        <ul className={`grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
          {data.map((a, i) => (
            <li key={i}>
              <Link to={a.link} className="group flex items-center gap-3 rounded-xl border border-black/[.06] bg-white px-4 py-3 transition hover:border-brand-200 hover:bg-brand-50/40">
                {a.count > 1 && <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-1.5 text-xs text-white">{a.count}</span>}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{a.title}</div>
                  <div className="truncate text-xs text-ink-muted">{a.detail}</div>
                </div>
                <ArrowRight className="h-4 w-4 text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Student-safe round row: only confirmed dates are shown as dates. */
export function StudentRound({ r, company }) {
  return (
    <div className="flex items-start gap-3">
      <CalendarClock className={`mt-0.5 h-4 w-4 shrink-0 ${r.date ? "text-brand-600" : "text-ink-muted"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{r.name}</span>
          {company && <span className="text-ink-muted">· {company}</span>}
          <Badge value={r.pending_change ? "pending" : r.status} label={r.status_label} />
        </div>
        <div className="mt-0.5 text-sm text-ink-muted">
          {r.date ? <span className="text-ink">{fmtDate(r.date)}{r.time && ` · ${r.time}`}</span> : null}
          {r.date && r.venue && <span> · {r.venue}</span>}
          {r.previous_date && <span className="ml-1 text-xs line-through">{fmtDate(r.previous_date)}</span>}
          {r.note && <span className={`${r.date ? "ml-2" : ""} ${r.pending_change ? "font-medium text-amber-700" : ""}`}>{r.note}</span>}
        </div>
        {r.instructions && <p className="mt-1 text-xs text-ink-muted">{r.instructions}</p>}
      </div>
    </div>
  );
}

const PORTAL_STYLE = { company: "bg-sky-50 text-sky-700", college: "bg-brand-50 text-brand-700", student: "bg-emerald-50 text-emerald-700", system: "bg-black/[.05] text-ink-muted" };
const APPROVAL = { pending: ["Awaiting approval", "bg-amber-50 text-amber-700"], approved: ["Approved", "bg-emerald-50 text-emerald-700"], rejected: ["Not accepted", "bg-rose-50 text-rose-600"] };

function show(v) {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.join(", ") || "—";
  if (typeof v === "object") {
    if ("date" in v || "time" in v) return [v.date && fmtDate(v.date), v.time, v.cancel && "cancelled"].filter(Boolean).join(" · ") || "—";
    return Object.entries(v).filter(([, x]) => x != null && !(Array.isArray(x) && !x.length)).map(([k, x]) => `${k.replace(/_/g, " ")}: ${Array.isArray(x) ? x.join("/") : x}`).join(", ") || "—";
  }
  return String(v);
}

/** Update history: what changed, who, which portal, when, approval, who was told. */
export function HistoryList({ rows, students }) {
  if (!rows) return null;
  if (!rows.length) return <Empty>No updates recorded yet.</Empty>;
  return (
    <ol className="relative space-y-5 border-l border-black/[.08] pl-6">
      {rows.map((h) => (
        <li key={h.id} className="relative">
          <span className="absolute -left-[29px] top-1 flex h-3 w-3 items-center justify-center rounded-full border-2 border-white bg-brand-400" />
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-medium">{h.summary}</span>
            {h.approval && APPROVAL[h.approval] && <span className={`chip ${APPROVAL[h.approval][1]}`}>{APPROVAL[h.approval][0]}</span>}
          </div>
          {(h.old != null || h.new != null) && h.field !== "status" && <ChangeLine oldV={h.old} newV={h.new} field={h.field} className="mt-1 text-xs" />}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
            {!students && <span className={`chip ${PORTAL_STYLE[h.portal] || PORTAL_STYLE.system}`}>{h.portal}</span>}
            <span>{h.by_name}</span><span>·</span><span title={new Date(h.at).toLocaleString()}>{ago(h.at)}</span>
            {h.notified && !students && <><span>·</span><span>notified {h.notified}</span></>}
          </div>
        </li>
      ))}
    </ol>
  );
}

export function HistoryPanel({ driveId, students }) {
  const { data } = useApi(`/drives/${driveId}/history`);
  return (
    <div className="card p-6">
      <div className="mb-5 flex items-center gap-2"><History className="h-4 w-4 text-brand-600" /><h2 className="font-medium">Update history</h2></div>
      <HistoryList rows={data} students={students} />
    </div>
  );
}

/** Contact people at the other organisation (only ever shown to connected companies/colleges). */
export function ContactList({ contacts, dark }) {
  if (!contacts?.length) return null;
  const muted = dark ? "text-white/60" : "text-ink-muted";
  const link = dark ? "text-white hover:text-brand-200" : "text-brand-700 hover:underline";
  return (
    <ul className="space-y-3">
      {contacts.map((c) => (
        <li key={c.email} className="text-sm">
          <div className="font-medium">{c.name}<span className={`font-normal ${muted}`}>{c.designation ? ` · ${c.designation}` : ""}</span></div>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            <a href={`mailto:${c.email}`} className={`inline-flex min-w-0 max-w-full items-center gap-1.5 ${link}`}><Mail className="h-3.5 w-3.5 shrink-0" /><span className="[overflow-wrap:anywhere]">{c.email.split("@")[0]}@<wbr />{c.email.split("@")[1]}</span></a>
            {c.phone && <a href={`tel:${c.phone}`} className={`inline-flex items-center gap-1.5 ${link}`}><Phone className="h-3.5 w-3.5 shrink-0" />{c.phone}</a>}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ---- describing a change: only the parts that actually differ -------------------
const PART_LABEL = {
  min_cgpa: "Min CGPA", max_backlogs: "Max backlogs", branches: "Branches", grad_years: "Batch",
  date: "Date", time: "Time", venue: "Venue", cancel: "Cancelled",
};
const isDate = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
export function plain(v) {
  if (v == null || v === "" || (Array.isArray(v) && !v.length)) return "—";
  if (Array.isArray(v)) return v.join(", ");
  if (typeof v === "boolean") return v ? "yes" : "no";
  if (isDate(v)) return fmtDate(v);
  if (typeof v === "object") return Object.entries(v).filter(([, x]) => x != null && !(Array.isArray(x) && !x.length)).map(([k, x]) => `${PART_LABEL[k] || k}: ${plain(x)}`).join(" · ") || "—";
  return String(v);
}
/** [{label, from, to}] — for objects (eligibility, round schedule) only the keys that changed. */
export function changedParts(oldV, newV) {
  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  if (isObj(oldV) || isObj(newV)) {
    const o = oldV || {}, n = newV || {};
    const keys = [...new Set([...Object.keys(o), ...Object.keys(n)])];
    const parts = keys.filter((k) => JSON.stringify(o[k] ?? null) !== JSON.stringify(n[k] ?? null))
      .map((k) => ({ label: PART_LABEL[k] || k, from: plain(o[k]), to: plain(n[k]) }));
    return parts.length ? parts : [{ label: null, from: plain(oldV), to: plain(newV) }];
  }
  return [{ label: null, from: plain(oldV), to: plain(newV) }];
}
const UNIT = { ctc_lpa: (v) => (v === "—" ? v : `${v} LPA`) };
export function ChangeLine({ oldV, newV, field, className = "" }) {
  const unit = UNIT[field] || ((v) => v);
  return (
    <div className={`space-y-0.5 ${className}`}>
      {changedParts(oldV, newV).map((p) => ({ ...p, from: unit(p.from), to: unit(p.to) })).map((p, i) => (
        <div key={i}>
          {p.label && <span className="text-ink-muted">{p.label}: </span>}
          <span className="text-ink-muted line-through">{p.from}</span>
          <span className="mx-1 text-ink-muted">→</span>
          <span className="font-medium text-ink">{p.to}</span>
        </div>
      ))}
    </div>
  );
}

/** Accept or decline a connection request, with an optional note saying why.
 *  `pending` is {conn, decision: "approve" | "reject"} or null. */
export function ConnectionDecision({ pending, onClose, onDone }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  if (!pending) return null;
  const { conn, decision } = pending;
  const accept = decision === "approve";
  const name = conn.other?.name || "them";
  const close = () => { setNote(""); setErr(null); onClose(); };
  const submit = async (e) => {
    e.preventDefault(); setBusy(true); setErr(null);
    try {
      await api(`/connections/${conn.id}/decision`, { method: "POST", body: { decision, note: note.trim() || null } });
      setNote(""); onDone(`${name}: ${accept ? "connected" : "declined"}`);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={close} title={accept ? `Accept ${name}?` : `Decline ${name}?`}>
      <form onSubmit={submit} className="space-y-4 text-sm">
        <p className="text-ink-muted">
          {accept ? "You'll be connected and can coordinate drives and share contacts." : "They won't be able to post drives with you. They can send a new request later."}
        </p>
        <div>
          <label className="label" htmlFor="decision-note">Note to {name} (optional)</label>
          <textarea id="decision-note" className="input h-24" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} autoFocus
            placeholder={accept ? "e.g. Happy to have you. Our placement season starts in August." : "e.g. We are only hosting product-company drives this season."} />
          <p className="mt-1 text-xs text-ink-muted">Shown to them in Campus Connect and included in the email they get.</p>
        </div>
        <ErrorNote>{err}</ErrorNote>
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={close}>Cancel</button>
          <button className={accept ? "btn-primary" : "btn rounded-full bg-rose-600 px-5 text-white hover:bg-rose-700"} disabled={busy}>
            {accept ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}{busy ? "Saving…" : accept ? "Accept" : "Decline"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
