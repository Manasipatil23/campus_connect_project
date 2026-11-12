import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Building2, CheckCircle2, ExternalLink, GraduationCap, Handshake, Mail, MessageSquareQuote, Phone, ShieldCheck, XCircle } from "lucide-react";
import { api } from "../api";
import { Reveal } from "../components/fx/motion";
import { Empty, ErrorNote, Modal, PageHeader, Spinner, Stat, Tabs, ago, useApi } from "../components/ui";

function Detail({ label, value, href }) {
  if (!value) return null;
  return (
    <div><div className="text-xs text-ink-muted">{label}</div>
      {href ? <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">{value}<ExternalLink className="h-3 w-3" /></a>
        : <div className="text-sm">{value}</div>}</div>
  );
}

function OrgCard({ org, kind, status, onDecide }) {
  const c = org.contact;
  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-medium tracking-tight">{org.name}</div>
          <div className="text-sm text-ink-muted">{kind === "college" ? `${org.city}, ${org.state}` : `${org.industry} · ${org.hq_city}`}</div>
        </div>
        {status !== "pending" && <span className={`chip ${status === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{status}{org.tier ? ` · Tier ${org.tier}` : ""}</span>}
      </div>
      <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {kind === "college" ? <>
          <Detail label="AISHE code" value={org.aishe_code} />
          <Detail label="Type" value={org.institution_type} />
          <Detail label="NAAC" value={org.naac_grade} />
          <Detail label="Established" value={org.established_year} />
          <Detail label="NIRF rank" value={org.nirf_rank} />
          <Detail label="University" value={org.affiliated_university} />
          <Detail label="Website" value={org.website?.replace(/^https?:\/\//, "")} href={org.website} />
          <Detail label="Domain" value={org.email_domain} />
          <Detail label="PIN code" value={org.pincode} />
        </> : <>
          <Detail label="CIN" value={org.cin} />
          <Detail label="GSTIN" value={org.gstin} />
          <Detail label="Size" value={org.size} />
          <Detail label="Website" value={org.website?.replace(/^https?:\/\//, "")} href={org.website} />
          <Detail label="Domain" value={org.email_domain} />
        </>}
      </div>
      {kind === "company" && org.about && <p className="mt-4 text-sm text-ink-muted">{org.about}</p>}
      {c && (
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 rounded-2xl bg-brand-50/50 p-4 text-sm">
          <span className="font-medium">{c.name}</span><span className="text-ink-muted">{c.designation}</span>
          <span className="flex items-center gap-1 text-ink-muted"><Mail className="h-3.5 w-3.5" />{c.email}</span>
          {c.phone && <span className="flex items-center gap-1 text-ink-muted"><Phone className="h-3.5 w-3.5" />{c.phone}</span>}
        </div>
      )}
      {status === "pending" && (
        <div className="mt-6 flex justify-end gap-2">
          <button className="btn-ghost text-rose-600" onClick={() => onDecide(org, "reject")}><XCircle className="h-4 w-4" /> Reject</button>
          <button className="btn-primary" onClick={() => onDecide(org, "approve")}><CheckCircle2 className="h-4 w-4" /> Approve</button>
        </div>
      )}
    </div>
  );
}

function DecideForm({ org, kind, decision, onDone, onCancel }) {
  const [tier, setTier] = useState(org.nirf_rank && org.nirf_rank <= 100 ? 1 : 2);
  const [note, setNote] = useState("");
  const [err, setErr] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      await api(`/admin/${kind === "college" ? "colleges" : "companies"}/${org.id}/decision`, { method: "POST",
        body: { decision, note: note || null, tier: kind === "college" && decision === "approve" ? Number(tier) : null } });
      onDone();
    } catch (e2) { setErr(e2.message); }
  };
  return (
    <form onSubmit={submit} className="space-y-4">
      {kind === "college" && decision === "approve" && (
        <div>
          <div className="label">Tier</div>
          <div className="flex gap-2">{[1, 2, 3].map((t) => (
            <button type="button" key={t} onClick={() => setTier(t)} className={`flex-1 rounded-xl border px-4 py-3 text-sm ${tier === t ? "border-ink bg-ink text-white" : "border-black/10 bg-white"}`}>Tier {t}</button>
          ))}</div>
          <p className="mt-2 text-xs text-ink-muted">Companies see the tier when they browse colleges.</p>
        </div>
      )}
      <div><label className="label">{decision === "reject" ? "Reason (emailed to them)" : "Note (optional)"}</label>
        <textarea className="input h-20" required={decision === "reject"} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <ErrorNote>{err}</ErrorNote>
      <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className={decision === "reject" ? "btn bg-rose-600 text-white hover:bg-rose-700" : "btn-primary"}>{decision === "reject" ? "Reject" : "Approve"}</button></div>
    </form>
  );
}

/** Approval queue for one kind of organisation: its own section in the admin sidebar. */
export function AdminApprovals({ kind }) {
  const { data: o, reload: reloadOverview } = useApi("/admin/overview");
  const [status, setStatus] = useState("pending");
  const { data, error, reload } = useApi(`/admin/${kind === "college" ? "colleges" : "companies"}?status=${status}`);
  const [deciding, setDeciding] = useState(null);
  const counts = o ? (kind === "college" ? o.colleges : o.companies) : null;
  const isCollege = kind === "college";

  return (
    <>
      <PageHeader eyebrow="Platform admin" title={isCollege ? "College" : "Company"} accent="approvals."
        subtitle={isCollege
          ? "Check the AISHE code, NAAC grade and official domain, then assign a tier. The placement officer can use Campus Connect once approved."
          : "Check the CIN or GSTIN and the work email domain. The company's HR can connect with colleges once approved."} />
      <div className="mb-6">
        <Tabs value={status} onChange={setStatus} options={[
          ["pending", `Waiting${counts ? ` (${counts.pending})` : ""}`],
          ["approved", `Approved${counts ? ` (${counts.approved})` : ""}`],
          ["rejected", `Rejected${counts ? ` (${counts.rejected})` : ""}`],
        ]} />
      </div>
      <ErrorNote>{error}</ErrorNote>
      {!data ? <Spinner /> : data.length === 0 ? <div className="card"><Empty>{status === "pending" ? `No ${isCollege ? "colleges" : "companies"} waiting for review.` : `No ${status} ${isCollege ? "colleges" : "companies"}.`}</Empty></div> : (
        <div className="grid gap-6 xl:grid-cols-2">
          {data.map((org, i) => <Reveal key={org.id} delay={i * 60}><OrgCard org={org} kind={kind} status={status} onDecide={(org2, decision) => setDeciding({ org: org2, decision })} /></Reveal>)}
        </div>
      )}
      <Modal open={Boolean(deciding)} onClose={() => setDeciding(null)} title={deciding ? `${deciding.decision === "approve" ? "Approve" : "Reject"} ${deciding.org.name}` : ""}>
        {deciding && <DecideForm org={deciding.org} kind={kind} decision={deciding.decision} onCancel={() => setDeciding(null)}
          onDone={() => { setDeciding(null); reload(); reloadOverview(); }} />}
      </Modal>
    </>
  );
}

function QueueCard({ to, icon: Icon, title, waiting, approved, rejected }) {
  return (
    <Link to={to} className="card group flex flex-col p-6 transition hover:border-brand-200">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50"><Icon className="h-5 w-5 text-brand-600" /></span>
        <h2 className="text-lg font-medium">{title}</h2>
        <ArrowRight className="ml-auto h-5 w-5 text-ink-muted transition group-hover:translate-x-1 group-hover:text-ink" />
      </div>
      <div className="mt-6 grid grid-cols-3 gap-3 text-center">
        <div className={`rounded-xl px-3 py-3 ${waiting ? "bg-amber-50" : "bg-black/[.03]"}`}><div className={`text-2xl font-medium tabular-nums ${waiting ? "text-amber-700" : ""}`}>{waiting}</div><div className="text-xs text-ink-muted">waiting</div></div>
        <div className="rounded-xl bg-emerald-50 px-3 py-3"><div className="text-2xl font-medium tabular-nums text-emerald-700">{approved}</div><div className="text-xs text-ink-muted">approved</div></div>
        <div className="rounded-xl bg-black/[.03] px-3 py-3"><div className="text-2xl font-medium tabular-nums">{rejected}</div><div className="text-xs text-ink-muted">rejected</div></div>
      </div>
      <span className="mt-5 text-sm font-medium text-brand-700">{waiting ? `Review ${waiting} waiting` : "Nothing waiting"}</span>
    </Link>
  );
}

function RecentDecisions() {
  const { data } = useApi("/admin/approvals?limit=8");
  if (!data) return null;
  const KIND = { college: "College", company: "Company", student: "Student" };
  return (
    <section className="card mt-6 p-6">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="font-medium">Recent decisions</h2>
        <span className="text-xs text-ink-muted">Approvals and rejections by you and placement cells</span>
      </div>
      {data.length === 0 ? <p className="text-sm text-ink-muted">No approvals or rejections yet.</p> : (
        <ul className="divide-y divide-black/[.05]">
          {data.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 text-sm first:pt-0 last:pb-0">
              <span className={`chip ${a.decision === "approved" ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"}`}>{a.decision}</span>
              <span className="font-medium">{a.name}</span>
              <span className="text-ink-muted">{KIND[a.kind]}{a.tier ? ` · Tier ${a.tier}` : ""}</span>
              {a.email && <span className="text-ink-muted">{a.email}</span>}
              <span className="ml-auto text-xs text-ink-muted">by {a.decided_by?.name} · {ago(a.decided_at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function AdminDashboard() {
  const { data: o } = useApi("/admin/overview");
  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Verify the" accent="network." subtitle="Colleges and companies can only use Campus Connect once you approve them." />
      {!o ? <Spinner /> : <>
        <div className="mb-6 grid gap-6 lg:grid-cols-2">
          <QueueCard to="/approvals/colleges" icon={Building2} title="College approvals" waiting={o.colleges.pending} approved={o.colleges.approved} rejected={o.colleges.rejected} />
          <QueueCard to="/approvals/companies" icon={Handshake} title="Company approvals" waiting={o.companies.pending} approved={o.companies.approved} rejected={o.companies.rejected} />
        </div>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <Stat label="Active students" value={o.students} hint={`${o.pending_students} awaiting their college`} icon={GraduationCap} />
          <Stat label="Drives" value={o.drives} icon={ShieldCheck} />
          <Stat label="Connections" value={o.connections} hint="College–company" icon={Handshake} />
          <Stat label="Experiences" value={o.experiences} icon={MessageSquareQuote} />
        </div>
        <RecentDecisions />
      </>}
    </>
  );
}
