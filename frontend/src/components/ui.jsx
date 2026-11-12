import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, X } from "lucide-react";
import { api } from "../api";

export function useApi(path, deps = []) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setError(null);
    api(path).then((d) => live && setData(d)).catch((e) => live && setError(e.message));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick, ...deps]);
  return { data, error, reload: () => setTick((t) => t + 1), setData };
}

export function Spinner({ label = "Loading…" }) {
  return (
    <div className="flex items-center justify-center gap-2 p-10 text-sm text-ink-muted">
      <Loader2 className="h-4 w-4 animate-spin text-brand-500" /> {label}
    </div>
  );
}

export function ErrorNote({ children }) {
  if (!children) return null;
  // an existing account should never be created twice: point straight to sign in
  const existing = typeof children === "string" && /already exists/i.test(children);
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm text-rose-700">
      {children}
      {existing && <> <Link to="/login" className="font-medium underline">Sign in</Link></>}
    </div>
  );
}

export function PageHeader({ eyebrow, title, accent, subtitle, action }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <div className="eyebrow mb-4">{eyebrow}</div>}
        <h1 className="text-3xl font-medium tracking-[-0.03em] text-ink sm:text-4xl">
          {title} {accent && <span className="accent">{accent}</span>}
        </h1>
        {subtitle && <p className="mt-2 max-w-2xl text-ink-muted">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function Stat({ label, value, hint, icon: Icon }) {
  return (
    <div className="card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-muted">{label}</span>
        {Icon && <Icon className="h-4 w-4 text-brand-500" />}
      </div>
      <div className="mt-3 text-3xl font-medium tracking-tight tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

export const STATUS_LABELS = {
  applied: "Applied",
  shortlisted: "Resume shortlisted",
  assessment_cleared: "Cleared assessment",
  offered: "Offered",
  accepted: "Accepted",
  rejected: "Not selected",
  withdrawn: "Withdrawn",
  declined: "Offer declined",
  on_hold: "On hold",
  dream: "Dream",
  // drive lifecycle
  draft: "Draft",
  review: "Sent for review",
  changes_requested: "Needs changes",
  approved: "Approved",
  published: "Published",
  in_progress: "In progress",
  completed: "Completed",
  cancelled: "Cancelled",
  // schedule
  planned: "Planned",
  pending: "Pending confirmation",
  confirmed: "Confirmed",
  rescheduled: "Rescheduled",
  // issues
  open: "Open",
  waiting: "Waiting for information",
  resolved: "Resolved",
  closed: "Closed",
};

const STATUS_STYLES = {
  applied: "bg-black/[.05] text-ink-soft",
  shortlisted: "bg-sky-50 text-sky-700",
  assessment_cleared: "bg-brand-50 text-brand-700",
  offered: "bg-amber-50 text-amber-700",
  accepted: "bg-emerald-50 text-emerald-700",
  rejected: "bg-rose-50 text-rose-600",
  withdrawn: "bg-black/[.05] text-ink-muted",
  declined: "bg-black/[.05] text-ink-muted",
  on_hold: "bg-amber-50 text-amber-700",
  dream: "bg-brand-50 text-brand-700",
  draft: "bg-black/[.05] text-ink-soft",
  review: "bg-sky-50 text-sky-700",
  changes_requested: "bg-amber-50 text-amber-700",
  approved: "bg-brand-50 text-brand-700",
  published: "bg-emerald-50 text-emerald-700",
  in_progress: "bg-sky-50 text-sky-700",
  completed: "bg-black/[.05] text-ink-muted",
  cancelled: "bg-rose-50 text-rose-600",
  planned: "bg-black/[.05] text-ink-soft",
  pending: "bg-amber-50 text-amber-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  rescheduled: "bg-brand-50 text-brand-700",
  open: "bg-sky-50 text-sky-700",
  waiting: "bg-amber-50 text-amber-700",
  resolved: "bg-emerald-50 text-emerald-700",
  closed: "bg-black/[.05] text-ink-muted",
  accepted_conn: "bg-emerald-50 text-emerald-700",
};

export function Badge({ value, label }) {
  return <span className={`chip ${STATUS_STYLES[value] || "bg-black/[.05] text-ink-soft"}`}>{label || STATUS_LABELS[value] || value}</span>;
}

export function scoreColor(score) {
  if (score >= 70) return "text-emerald-600";
  if (score >= 45) return "text-amber-600";
  return "text-rose-600";
}

export function ScoreRing({ score = 0, size = 128, label }) {
  const r = (size - 14) / 2;
  const c = 2 * Math.PI * r;
  const id = `ring-${size}`;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#a585fa" /><stop offset="1" stopColor="#6d28d9" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="#efeaff" strokeWidth="9" fill="none" />
        <circle cx={size / 2} cy={size / 2} r={r} stroke={`url(#${id})`} strokeWidth="9" fill="none"
          strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, score) / 100)} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .6s ease" }} />
      </svg>
      <div className="absolute text-center">
        <div className="text-3xl font-medium tracking-tight tabular-nums text-ink">{Math.round(score)}</div>
        {label && <div className="text-[10px] font-semibold uppercase tracking-eyebrow text-brand-600">{label}</div>}
      </div>
    </div>
  );
}

export function Bar({ value, className = "bg-gradient-to-r from-brand-400 to-brand-600" }) {
  return (
    <div className="h-1.5 w-full rounded-full bg-brand-50">
      <div className={`h-1.5 rounded-full ${className}`} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

export function Modal({ open, onClose, title, children, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/30 p-4 backdrop-blur-sm sm:p-10" onClick={onClose}>
      <div className={`card w-full bg-white ${wide ? "max-w-3xl" : "max-w-lg"} p-6 sm:p-8`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 className="text-xl font-medium tracking-tight">{title}</h2>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-black/[.04]" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Empty({ children }) {
  return <div className="p-10 text-center text-sm text-ink-muted">{children}</div>;
}

export function Tabs({ value, onChange, options }) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-full border border-black/[.06] bg-white/70 p-1">
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)}
          className={`rounded-full px-4 py-1.5 text-sm transition ${value === k ? "bg-ink text-white" : "text-ink-soft hover:text-ink"}`}>{l}</button>
      ))}
    </div>
  );
}

export const fmtDate = (d) => (d ? new Date(d.length === 10 ? d + "T00:00:00" : d).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fmtTime = (d) => (d ? new Date(d).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—");
export function ago(d) {
  const s = (Date.now() - new Date(d).getTime()) / 1000;
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}
