import { useState } from "react";
import { Building2, CheckCircle2, ExternalLink, GraduationCap, Handshake, Mail, MessageSquareQuote, Phone, ShieldCheck, XCircle } from "lucide-react";
import { api } from "../api";
import { Reveal } from "../components/fx/motion";
import { Empty, ErrorNote, Modal, PageHeader, Spinner, Stat, Tabs, useApi } from "../components/ui";

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
      <div><label className="label">{decision === "reject" ? "Reason (shared with them)" : "Note (optional)"}</label>
        <textarea className="input h-20" required={decision === "reject"} value={note} onChange={(e) => setNote(e.target.value)} /></div>
      <ErrorNote>{err}</ErrorNote>
      <div className="flex justify-end gap-2"><button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className={decision === "reject" ? "btn bg-rose-600 text-white hover:bg-rose-700" : "btn-primary"}>{decision === "reject" ? "Reject" : "Approve"}</button></div>
    </form>
  );
}

export default function AdminDashboard() {
  const { data: o, reload: reloadOverview } = useApi("/admin/overview");
  const [kind, setKind] = useState("college");
  const [status, setStatus] = useState("pending");
  const { data, error, reload } = useApi(`/admin/${kind === "college" ? "colleges" : "companies"}?status=${status}`);
  const [deciding, setDeciding] = useState(null);

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Verify the" accent="network." subtitle="Colleges and companies can only use Campus Connect once you approve them." />
      {o && (
        <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-6">
          <Stat label="Colleges waiting" value={o.colleges.pending} icon={Building2} />
          <Stat label="Companies waiting" value={o.companies.pending} icon={Handshake} />
          <Stat label="Verified colleges" value={o.colleges.approved} icon={ShieldCheck} />
          <Stat label="Verified companies" value={o.companies.approved} icon={ShieldCheck} />
          <Stat label="Active students" value={o.students} hint={`${o.pending_students} awaiting their college`} icon={GraduationCap} />
          <Stat label="Experiences" value={o.experiences} hint={`${o.connections} connections`} icon={MessageSquareQuote} />
        </div>
      )}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <Tabs value={kind} onChange={setKind} options={[["college", `Colleges${o ? ` (${o.colleges.pending})` : ""}`], ["company", `Companies${o ? ` (${o.companies.pending})` : ""}`]]} />
        <Tabs value={status} onChange={setStatus} options={[["pending", "Waiting"], ["approved", "Approved"], ["rejected", "Rejected"]]} />
      </div>
      <ErrorNote>{error}</ErrorNote>
      {!data ? <Spinner /> : data.length === 0 ? <div className="card"><Empty>Nothing {status === "pending" ? "waiting for review" : status} here.</Empty></div> : (
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
