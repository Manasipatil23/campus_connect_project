import { Link } from "react-router-dom";
import { AlertCircle, ArrowRight, CalendarClock, CheckCircle2, Circle, Clock, History, Inbox } from "lucide-react";
import { Badge, Empty, ago, fmtDate, useApi } from "./ui";

/** The steps of the shared drive workflow, so every portal shows where a drive is. */
const FLOW = [
  ["draft", "Draft", "Company"],
  ["review", "Review", "Placement cell"],
  ["approved", "Approved", "Placement cell"],
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
        <span className="ml-auto text-xs text-ink-muted">{data.length ? `${data.reduce((a, x) => a + x.count, 0)} items` : ""}</span>
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
          {(h.old != null || h.new != null) && h.field !== "status" && (
            <div className="mt-1 text-xs text-ink-muted">
              <span className="line-through">{show(h.old)}</span> <ArrowRight className="mx-1 inline h-3 w-3" /> <span className="text-ink">{show(h.new)}</span>
            </div>
          )}
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
