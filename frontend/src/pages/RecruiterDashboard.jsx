import { Link } from "react-router-dom";
import { Award, Briefcase, PlusCircle, Users } from "lucide-react";
import Funnel from "../components/Funnel";
import { useAuth } from "../auth";
import { Badge, Empty, ErrorNote, PageHeader, Spinner, Stat, useApi } from "../components/ui";
import { ActionsPanel } from "../components/workflow";

export default function RecruiterDashboard() {
  const { user } = useAuth();
  const { data, error } = useApi("/analytics/recruiter");
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;

  return (
    <>
      <PageHeader eyebrow={user.company} title="Hiring" accent="overview." subtitle="Your drives and how candidates are moving through each round. Placement cells review and publish drives; you own hiring decisions."
        action={<Link to="/drives/new" className="btn-primary"><PlusCircle className="h-4 w-4" /> New drive</Link>} />
      <div className="grid gap-4 sm:grid-cols-4 mb-6">
        <Stat label="Drives" value={data.drives.length} hint={`${data.eligible_reached} published to students`} icon={Briefcase} />
        <Stat label="Applications" value={data.applications} icon={Users} />
        <Stat label="Offers released" value={data.offers} icon={Award} />
        <Stat label="Offers accepted" value={data.accepted} hint={data.offers ? `${Math.round(100 * data.accepted / data.offers)}% acceptance` : ""} icon={Award} />
      </div>
      <div className="mb-6"><ActionsPanel /></div>
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-4 font-medium">Overall funnel</h2>
          <Funnel data={data.funnel} />
        </div>
        <div className="card lg:col-span-3 overflow-x-auto">
          <h2 className="border-b border-black/[.06] px-5 py-3 font-medium">Drives</h2>
          {data.drives.length === 0 ? <Empty>No drives yet.</Empty> : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr><th className="px-5 py-2">Role</th><th>Status</th><th className="text-right">Applicants</th><th className="text-right">Avg ATS</th><th className="text-right pr-5">Offers</th></tr>
              </thead>
              <tbody className="divide-y divide-black/[.05]">
                {data.drives.map((d) => (
                  <tr key={d.id} className="hover:bg-brand-50/40">
                    <td className="px-5 py-3"><Link to={`/drives/${d.id}`} className="font-medium text-brand-700 hover:underline">{d.role}</Link><div className="text-xs text-ink-muted">{d.ctc_lpa} LPA</div></td>
                    <td><Badge value={d.status} label={d.status_label} /></td>
                    <td className="text-right tabular-nums">{d.applicants}</td>
                    <td className="text-right tabular-nums">{d.avg_ats ?? "—"}</td>
                    <td className="text-right tabular-nums pr-5">{d.funnel.find((f) => f.stage === "offered").count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
