import { useMemo, useState } from "react";
import { Award, BookOpen, CheckCircle2, FileText, GraduationCap, Layers, Mail, Phone, Search, UserCheck, XCircle } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Empty, ErrorNote, PageHeader, Spinner, Stat, Tabs, useApi, fmtDate } from "../components/ui";

function Overview({ onApprovals }) {
  const [year, setYear] = useState(null);
  const { data, error } = useApi(`/college/student-stats${year ? `?grad_year=${year}` : ""}`);
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
            <tr><th className="py-2 pl-0">Branch</th><th className="w-[32%]">Students</th><th className="text-right">Placed</th><th className="text-right">Avg CGPA</th><th className="text-right">Ready pool</th><th className="text-right">With backlogs</th><th className="pr-0 text-right">Resumes</th></tr>
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
                    <span className="w-8 text-right tabular-nums">{b.students}</span>
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

export default function CollegeStudents() {
  const { user } = useAuth();
  const [view, setView] = useState("overview");
  const [status, setStatus] = useState("pending");
  const [q, setQ] = useState("");
  const { data, error, setData } = useApi(`/college/students?status=${status}`);
  const { data: pending, reload: reloadPending } = useApi("/college/students?status=pending");
  const [err, setErr] = useState(null);
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

  return (
    <>
      <PageHeader eyebrow={user.college?.name} title="Your" accent="students."
        subtitle={view === "overview" ? "Your student body by branch, batch and CGPA, straight from student records." : "Students sign up with a verified email and your college. Check their roll number and details, then approve them."} />
      <div className="mb-6"><Tabs value={view} onChange={setView} options={[["overview", "Overview"], ["approvals", `Sign-ups & approvals${pending?.length ? ` (${pending.length})` : ""}`]]} /></div>
      {view === "overview" ? <Overview onApprovals={() => { setView("approvals"); setStatus("pending"); }} /> : <>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Tabs value={status} onChange={setStatus} options={[["pending", `Waiting${pending ? ` (${pending.length})` : ""}`], ["active", "Approved"], ["rejected", "Not approved"]]} />
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input className="input pl-10" placeholder="Search name, roll number, branch" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <ErrorNote>{err || error}</ErrorNote>
      <div className="card mt-2 overflow-x-auto">
        {!data ? <Spinner /> : list.length === 0 ? <Empty>{status === "pending" ? "No sign-ups waiting. New students appear here after they verify their email." : "No students here."}</Empty> : (
          <table className="w-full min-w-[760px] text-sm [&_td]:px-3 [&_th]:px-3">
            <thead className="border-b border-black/[.06] text-left text-xs text-ink-muted">
              <tr><th className="py-3 pl-6">Student</th><th>Roll no.</th><th>Branch</th><th>Year</th><th>Contact</th><th>Signed up</th><th className="pr-6 text-right">{status === "pending" ? "Decision" : ""}</th></tr>
            </thead>
            <tbody className="divide-y divide-black/[.05]">
              {list.map((s) => (
                <tr key={s.id} className="hover:bg-brand-50/30">
                  <td className="py-4 pl-6"><div className="font-medium">{s.name}</div>{s.review_note && status === "rejected" && <div className="text-xs text-rose-600">{s.review_note}</div>}</td>
                  <td className="font-mono text-xs">{s.roll_number}</td>
                  <td>{s.profile?.branch}</td>
                  <td>{s.profile?.grad_year}</td>
                  <td className="text-xs text-ink-muted"><div className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</div>{s.phone && <div className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</div>}</td>
                  <td className="text-xs text-ink-muted">{s.created_at ? fmtDate(s.created_at) : "—"}</td>
                  <td className="whitespace-nowrap py-4 pr-6 text-right">
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
