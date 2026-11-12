import { useMemo, useState } from "react";
import { CheckCircle2, Mail, Phone, Search, XCircle } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Empty, ErrorNote, PageHeader, Spinner, Tabs, useApi } from "../components/ui";

export default function CollegeStudents() {
  const { user } = useAuth();
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
      <PageHeader eyebrow={user.college?.name} title="Who can" accent="join." subtitle="Students sign up with a verified email and your college. Check their roll number and details, then approve them." />
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
                  <td className="text-xs text-ink-muted">{s.created_at ? new Date(s.created_at).toLocaleDateString() : "—"}</td>
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
    </>
  );
}
