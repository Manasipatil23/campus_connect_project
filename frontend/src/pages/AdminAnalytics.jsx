import { Activity, Award, Briefcase, IndianRupee, Send, Users } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import Funnel from "../components/Funnel";
import { Link } from "react-router-dom";
import { Badge, ErrorNote, PageHeader, Spinner, Stat, scoreColor, useApi, plural } from "../components/ui";
import { ActionsPanel } from "../components/workflow";
import { useAuth } from "../auth";

const BAND_COLORS = { Strong: "#6d28d9", Moderate: "#a585fa", "At risk": "#f43f5e" };
const tooltipStyle = { contentStyle: { borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 } };

function Panel({ title, children, className = "" }) {
  return (
    <div className={`card p-6 ${className}`}>
      <h2 className="mb-5 font-medium">{title}</h2>
      {children}
    </div>
  );
}

export default function AdminAnalytics() {
  const { user } = useAuth();
  const { data, error } = useApi("/analytics/overview");
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;
  const k = data.kpis;
  const empty = k.applications === 0 && (data.companies || []).length === 0;

  return (
    <>
      <PageHeader eyebrow={user.college?.name} title="Placement season," accent="at a glance." subtitle="Live view of drives, rounds and students at your college." />
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 mb-8">
        <Stat label="Students" value={k.students} icon={Users} />
        <Stat label="Placed" value={k.placed} hint={`${k.placement_rate}% placement rate`} icon={Award} />
        <Stat label="Avg CTC" value={`${k.avg_ctc} L`} hint={`Median ${k.median_ctc} · High ${k.highest_ctc}`} icon={IndianRupee} />
        <Stat label="Open drives" value={k.open_drives} icon={Briefcase} />
        <Stat label="Applications" value={k.applications} icon={Send} />
        <Stat label="Avg health" value={k.avg_health ?? "—"} hint={k.avg_health == null ? "Not enough data yet" : "Unplaced students"} icon={Activity} />
      </div>

      <div className="mb-8"><ActionsPanel /></div>
      {empty ? (
        <div className="card p-8">
          <h2 className="text-lg font-medium">No placement activity yet</h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-muted">Charts appear here as soon as there is real data. To get started:</p>
          <ol className="mt-5 grid gap-3 md:grid-cols-3">
            {[["Approve your students", "Students who sign up with your college wait for you.", "/students"],
              ["Connect with companies", "Accept requests or reach out to verified companies.", "/connect"],
              ["Publish a drive", "Review drives companies send, or create your own.", "/drives"]].map(([t, d, to], i) => (
              <li key={t}><Link to={to} className="block h-full rounded-2xl border border-black/[.06] p-4 transition hover:border-brand-200 hover:bg-brand-50/40">
                <span className="text-xs text-brand-600">{i + 1}</span><div className="mt-1 font-medium">{t}</div><div className="mt-1 text-sm text-ink-muted">{d}</div></Link></li>
            ))}
          </ol>
        </div>
      ) : <>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel title="Placement funnel">
          <Funnel data={data.funnel} />
          {data.dropoff.length > 0 && (
            <div className="mt-6 border-t border-black/[.06] pt-4">
              <div className="mb-2 text-xs text-ink-muted">Where students were not selected</div>
              <div className="flex flex-wrap gap-2">
                {data.dropoff.map((d) => <span key={d.round} className="chip bg-brand-50 px-3 py-1 text-brand-800">{d.round} · <b className="ml-1 font-medium">{d.count}</b></span>)}
              </div>
            </div>
          )}
        </Panel>

        <Panel title="Branch-wise placement rate">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.branches} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#efeaff" />
              <XAxis dataKey="branch" tick={{ fontSize: 10 }} interval={0} />
              <YAxis unit="%" tick={{ fontSize: 11 }} domain={[0, 100]} />
              <Tooltip {...tooltipStyle} formatter={(v, _n, p) => [`${v}% (${p.payload.placed}/${p.payload.total})`, "Placed"]} />
              <Bar dataKey="rate" fill="#7c3aed" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="CTC distribution (placed students)">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.ctc_distribution} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#efeaff" />
              <XAxis dataKey="range" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="count" name="Students" fill="#a585fa" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Applications per week">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.weekly_applications} margin={{ left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#efeaff" />
              <XAxis dataKey="week" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip {...tooltipStyle} />
              <Line type="monotone" dataKey="count" name="Applications" stroke="#7c3aed" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Placement Health of unplaced students">
          {!data.model.ready ? (
            <p className="text-sm text-ink-muted">Not enough data yet. Placement health is estimated from your college's real past placement outcomes, so it appears once a placement season has finished.</p>
          ) : (
          <div className="flex flex-wrap items-center gap-6">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={data.health_bands} dataKey="count" nameKey="band" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {data.health_bands.map((b) => <Cell key={b.band} fill={BAND_COLORS[b.band]} />)}
                </Pie>
                <Tooltip {...tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <ul className="space-y-2 text-sm">
              {data.health_bands.map((b) => (
                <li key={b.band} className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-sm" style={{ background: BAND_COLORS[b.band] }} />
                  {b.band} <b className="tabular-nums">{b.count}</b>
                </li>
              ))}
              <li className="pt-2 text-xs text-ink-muted/70">
                Model: logistic regression on {data.model.trained_on} past students
                {data.model.train_accuracy != null && ` · ${Math.round(data.model.train_accuracy * 100)}% train accuracy`}
              </li>
            </ul>
          </div>
          )}
        </Panel>

        <Panel title="Offers by company">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data.top_companies} layout="vertical" margin={{ left: 30 }}>
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="company" tick={{ fontSize: 11 }} width={110} />
              <Tooltip {...tooltipStyle} />
              <Bar dataKey="offers" fill="#5b21b6" radius={[0, 8, 8, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Company & role-wise progress" className="lg:col-span-2 overflow-x-auto">
          <p className="-mt-2 mb-3 text-xs text-ink-muted">Calculated from application and offer records — updates as recruiters move candidates.</p>
          <table className="w-full min-w-[720px] text-sm [&_td]:px-2 [&_th]:px-2">
            <thead className="border-b border-black/[.06] text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="py-2">Drive</th><th>Status</th><th className="text-right">Applied</th><th className="text-right">Shortlisted</th><th className="text-right">Cleared OA</th><th className="text-right">Offers</th><th className="text-right">Accepted</th></tr>
            </thead>
            <tbody className="divide-y divide-black/[.05]">
              {data.companies.map((r) => (
                <tr key={r.id}>
                  <td className="py-2"><Link to={`/drives/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.role}</Link><div className="text-xs text-ink-muted">{r.company}</div></td>
                  <td><Badge value={r.status} /></td>
                  <td className="text-right tabular-nums">{r.applications}</td>
                  <td className="text-right tabular-nums">{r.shortlisted}</td>
                  <td className="text-right tabular-nums">{r.cleared_assessment}</td>
                  <td className="text-right tabular-nums">{r.offers}</td>
                  <td className="text-right tabular-nums">{r.accepted}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>

        <Panel title="Branch-wise screening conversion">
          <ul className="space-y-3 text-sm">
            {data.branch_applications.map((b) => (
              <li key={b.branch} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3">
                <span>{b.branch}</span>
                <div className="h-2 rounded-full bg-brand-50"><div className="h-2 rounded-full bg-gradient-to-r from-brand-400 to-brand-600" style={{ width: `${b.conversion}%` }} /></div>
                <span className="text-xs tabular-nums text-ink-muted">{b.shortlisted}/{b.applications} · {b.offers} offers</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Skill gaps for training">
          <p className="-mt-2 mb-3 text-xs text-ink-muted">Skills recruiters required vs. share of your students who list them — candidates for workshops.</p>
          <ul className="space-y-3 text-sm">
            {data.skill_gaps.map((g) => (
              <li key={g.skill} className="grid grid-cols-[7rem_1fr_auto] items-center gap-3">
                <span>{g.skill}</span>
                <div className="h-2 rounded-full bg-black/[.04]"><div className={`h-2 rounded-full ${g.coverage < 30 ? "bg-rose-400" : g.coverage < 60 ? "bg-amber-400" : "bg-emerald-400"}`} style={{ width: `${g.coverage}%` }} /></div>
                <span className="text-xs tabular-nums text-ink-muted">{g.coverage}% · {plural(g.drives, "drive")}</span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Students needing attention" className="lg:col-span-2 overflow-x-auto">
          <p className="-mt-2 mb-3 text-xs text-ink-muted">Unplaced students in the “At risk” band, lowest score first, with the factor hurting them most.</p>
          <table className="w-full min-w-[640px] text-sm [&_td]:px-2 [&_th]:px-2">
            <thead className="border-b border-black/[.06] text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="py-2">Student</th><th>Branch</th><th className="text-right">CGPA</th><th className="text-right">ATS</th><th className="text-right">Apps</th><th className="text-right">Health</th><th className="pl-6">Biggest drag</th></tr>
            </thead>
            <tbody className="divide-y divide-black/[.05]">
              {data.at_risk.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-ink-muted">{data.model.ready ? "No students in the at-risk band." : "Not enough data yet."}</td></tr>}
              {data.at_risk.map((s) => {
                const drag = s.drivers.find((d) => d.direction === "negative");
                return (
                  <tr key={s.id}>
                    <td className="py-2"><div className="font-medium">{s.name}</div><div className="text-xs text-ink-muted">{s.email}</div></td>
                    <td>{s.branch}</td>
                    <td className="text-right tabular-nums">{s.cgpa}</td>
                    <td className="text-right tabular-nums">{s.ats_score}</td>
                    <td className="text-right tabular-nums">{s.applications}</td>
                    <td className={`text-right font-medium tabular-nums ${scoreColor(s.score)}`}>{s.score}</td>
                    <td className="pl-6 text-ink-muted">{drag ? drag.feature : "Low funnel activity"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      </div>
      </>}
    </>
  );
}
