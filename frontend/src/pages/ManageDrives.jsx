import { useState } from "react";
import { Link } from "react-router-dom";
import { PlusCircle } from "lucide-react";
import { useAuth } from "../auth";
import { Badge, Empty, ErrorNote, PageHeader, Spinner, Tabs, fmtDate, useApi } from "../components/ui";

const GROUPS = {
  all: null,
  action: ["draft", "changes_requested", "review", "approved"],
  live: ["published", "in_progress"],
  done: ["completed", "cancelled"],
};

export default function ManageDrives() {
  const { user } = useAuth();
  const isCollege = user.role === "coordinator";
  const { data, error } = useApi("/drives");
  const [tab, setTab] = useState("all");
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;
  const rows = data.filter((d) => !GROUPS[tab] || GROUPS[tab].includes(d.status));
  const n = (k) => data.filter((d) => GROUPS[k].includes(d.status)).length;

  return (
    <>
      <PageHeader eyebrow={isCollege ? user.college?.name : user.company} title={isCollege ? "Campus" : "My"} accent="drives."
        subtitle={isCollege ? "Every company drive at your college, from review to completion. Company drafts appear once they're sent for review." : "Drafts stay private until you send them. The placement cell reviews and publishes them to students."}
        action={<Link to="/drives/new" className="btn-primary"><PlusCircle className="h-4 w-4" /> New drive</Link>} />
      <div className="mb-6 overflow-x-auto">
        <Tabs value={tab} onChange={setTab} options={[["all", `All (${data.length})`], ["action", `Before publishing (${n("action")})`], ["live", `Live (${n("live")})`], ["done", `Closed (${n("done")})`]]} />
      </div>
      <div className="card overflow-x-auto">
        {rows.length === 0 ? <Empty>No drives here.</Empty> : (
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-black/[.06] text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="px-5 py-3">Company / role</th><th>CTC</th><th>Deadline</th><th>Status</th><th className="text-right">Applicants</th><th className="pr-5 text-right">Pending changes</th></tr>
            </thead>
            <tbody className="divide-y divide-black/[.05]">
              {rows.map((d) => (
                <tr key={d.id} className="hover:bg-brand-50/40">
                  <td className="px-5 py-3">
                    <Link to={`/drives/${d.id}`} className="font-medium text-brand-700 hover:underline">{d.role}</Link>
                    <div className="text-xs text-ink-muted">{d.company} · {isCollege ? d.location : d.college}</div>
                  </td>
                  <td className="tabular-nums">{d.ctc_lpa} LPA {d.tier === "dream" && <Badge value="dream" />}</td>
                  <td className="text-xs text-ink-muted">{fmtDate(d.deadline)}</td>
                  <td><Badge value={d.status} label={d.status_label} /></td>
                  <td className="text-right tabular-nums">{d.applicants}</td>
                  <td className="pr-5 text-right">{d.pending_changes ? <span className="chip bg-amber-50 text-amber-700">{d.pending_changes} to confirm</span> : <span className="text-ink-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
