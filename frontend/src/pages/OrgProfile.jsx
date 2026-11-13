import { useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, Building2, Check, GraduationCap, Landmark, Lock, Mail, Phone, ShieldCheck, User, Users } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useAuth } from "../auth";
import { ErrorNote, PageHeader, Spinner, useApi } from "../components/ui";

const SIZES = ["1-50", "51-200", "201-1000", "1001-5000", "5000+"];
const VERIFIED_LABEL = {
  cin: "CIN", gstin: "GSTIN", email_domain: "Official domain", aishe_code: "AISHE code", naac_grade: "NAAC grade",
  tier: "Tier", institution_type: "Institution type", affiliated_university: "Affiliated university", established_year: "Established",
};

function Section({ icon: Icon, title, hint, children }) {
  return (
    <section className="card p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50"><Icon className="h-4 w-4 text-brand-600" /></span>
        <div><h2 className="font-medium">{title}</h2>{hint && <p className="text-xs text-ink-muted">{hint}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function StudentBody() {
  const { data } = useApi("/college/student-stats");
  if (!data) return null;
  const t = data.totals;
  const max = Math.max(1, ...data.branches.map((b) => b.students));
  return (
    <div className="card p-6">
      <h2 className="flex items-center gap-2 font-medium"><GraduationCap className="h-4 w-4 text-brand-600" />Student body</h2>
      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        {[[t.students, "students"], [t.branches, "branches"], [data.batches.map((b) => b.grad_year).join(", ") || "—", "batch"]].map(([v, l]) => (
          <div key={l} className="rounded-xl bg-brand-50/60 px-2 py-2.5"><div className="font-medium tabular-nums">{v}</div><div className="text-[11px] text-ink-muted">{l}</div></div>
        ))}
      </div>
      <ul className="mt-4 space-y-2">
        {data.branches.map((b) => (
          <li key={b.branch} className="grid grid-cols-[5.5rem_1fr_2rem] items-center gap-2 text-xs">
            <span className="truncate text-ink-soft">{b.branch}</span>
            <div className="h-1.5 rounded-full bg-brand-50"><div className="h-1.5 rounded-full bg-brand-600" style={{ width: `${(100 * b.students) / max}%` }} /></div>
            <span className="text-right tabular-nums">{b.students}</span>
          </li>
        ))}
      </ul>
      <Link to="/students" className="mt-4 inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">Full breakdown <ArrowRight className="h-3.5 w-3.5" /></Link>
    </div>
  );
}

function Field({ label, children, wide }) {
  return <div className={wide ? "sm:col-span-2" : ""}><label className="label">{label}</label>{children}</div>;
}

export default function OrgProfile() {
  const { user, refresh } = useAuth();
  const { data, error } = useApi("/org/profile");
  const [person, setPerson] = useState(null);
  const [org, setOrg] = useState(null);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data) return;
    setPerson({ name: data.person.name || "", designation: data.person.designation || "", phone: data.person.phone || "" });
    const o = data.org;
    setOrg(data.kind === "company"
      ? { website: o.website || "", industry: o.industry || "", size: o.size || "201-1000", hq_city: o.hq_city || "", about: o.about || "", careers_email: o.careers_email || "" }
      : { website: o.website || "", address: o.address || "", city: o.city || "", state: o.state || "", pincode: o.pincode || "", phone: o.phone || "", about: o.about || "", placement_email: o.placement_email || "" });
  }, [data]);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data || !person || !org) return <Spinner />;
  const isCompany = data.kind === "company";
  const o = data.org;
  const setP = (k) => (e) => setPerson({ ...person, [k]: e.target.value });
  const setO = (k) => (e) => setOrg({ ...org, [k]: e.target.value });

  const save = async (e) => {
    e.preventDefault();
    setErr(null); setMsg(null); setBusy(true);
    try {
      const clean = Object.fromEntries(Object.entries(org).map(([k, v]) => [k, v === "" ? null : v]));
      await api("/org/profile", { method: "PUT", body: { person, [data.kind]: clean } });
      await refresh();
      setMsg("Profile saved");
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };

  const OrgIcon = isCompany ? Building2 : Landmark;
  const short = (o.short || o.name).slice(0, 3).toUpperCase();

  return (
    <>
      <PageHeader eyebrow={isCompany ? "Company" : "Placement cell"} title={isCompany ? "Company" : "College"} accent="profile."
        subtitle={`Your contact details are shared only with ${isCompany ? "placement cells" : "companies"} you connect with — never with students.`} />
      <form onSubmit={save} className="grid items-start gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
        <aside className="space-y-6 lg:sticky lg:top-24">
          <div className="card overflow-hidden">
            <div className="h-20 bg-gradient-to-br from-brand-200 via-brand-100 to-white" />
            <div className="-mt-10 px-6 pb-6">
              <span className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-white bg-brand-800 text-xl font-medium text-white">{short}</span>
              <h1 className="mt-3 flex items-center gap-1.5 text-xl font-medium tracking-tight">{o.name}<BadgeCheck className="h-5 w-5 text-brand-600" /></h1>
              <p className="text-sm text-ink-muted">{isCompany ? `${o.industry || ""} · ${o.hq_city || ""}` : `${o.city}, ${o.state}`}</p>
              {!isCompany && o.tier && <span className="chip mt-3 bg-brand-50 text-brand-700">Tier {o.tier}</span>}
            </div>
          </div>

          {!isCompany && <StudentBody />}
          <div className="card p-6">
            <h2 className="flex items-center gap-2 font-medium"><Lock className="h-4 w-4 text-brand-600" />Who sees your contact</h2>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{isCompany ? "Colleges" : "Companies"} you send a request to</li>
              <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />{isCompany ? "Colleges" : "Companies"} you're connected with ({data.shared_with})</li>
              <li className="flex gap-2 text-ink-muted"><span className="mt-0.5 h-4 w-4 shrink-0 text-center leading-4 text-rose-500">✕</span>Students</li>
              <li className="flex gap-2 text-ink-muted"><span className="mt-0.5 h-4 w-4 shrink-0 text-center leading-4 text-rose-500">✕</span>Anyone you aren't connected with</li>
            </ul>
          </div>
        </aside>

        <div className="space-y-6">
          <Section icon={User} title={isCompany ? "HR / hiring contact" : "Training & placement officer"} hint={`The person ${isCompany ? "colleges" : "companies"} reach out to`}>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Full name"><input className="input" value={person.name} onChange={setP("name")} required /></Field>
              <Field label="Designation"><input className="input" value={person.designation} onChange={setP("designation")} required /></Field>
              <Field label="Email (your sign-in)">
                <div className="relative"><Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <input className="input bg-black/[.02] pl-10 text-ink-muted" value={user.email} disabled /></div>
              </Field>
              <Field label="Phone">
                <div className="relative"><Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <input className="input pl-10" value={person.phone} onChange={setP("phone")} placeholder="98XXXXXXXX" required /></div>
              </Field>
            </div>
            {data.colleagues.length > 0 && (
              <div className="mt-5 border-t border-black/[.06] pt-4 text-sm">
                <div className="mb-2 flex items-center gap-2 text-xs text-ink-muted"><Users className="h-3.5 w-3.5" />Also on this account</div>
                {data.colleagues.map((c) => <div key={c.email}>{c.name} · <span className="text-ink-muted">{c.designation} · {c.email}</span></div>)}
              </div>
            )}
          </Section>

          <Section icon={OrgIcon} title={isCompany ? "Company details" : "College details"} hint={isCompany ? "Shown to colleges in the company directory" : "Shown to companies in the college directory"}>
            {isCompany ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Website"><input className="input" value={org.website} onChange={setO("website")} required /></Field>
                <Field label="Industry"><input className="input" value={org.industry} onChange={setO("industry")} required /></Field>
                <Field label="Company size"><select className="input" value={org.size} onChange={setO("size")}>{SIZES.map((x) => <option key={x}>{x}</option>)}</select></Field>
                <Field label="Headquarters city"><input className="input" value={org.hq_city} onChange={setO("hq_city")} required /></Field>
                <Field label="Campus hiring email (optional)" wide><input className="input" value={org.careers_email} onChange={setO("careers_email")} placeholder="campus@yourcompany.com" /></Field>
                <Field label="About the company" wide><textarea className="input h-28" value={org.about} onChange={setO("about")} required minLength={20} /></Field>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Website"><input className="input" value={org.website} onChange={setO("website")} required /></Field>
                <Field label="Office phone"><input className="input" value={org.phone} onChange={setO("phone")} required /></Field>
                <Field label="Address" wide><input className="input" value={org.address} onChange={setO("address")} required /></Field>
                <Field label="City"><input className="input" value={org.city} onChange={setO("city")} required /></Field>
                <Field label="State"><input className="input" value={org.state} onChange={setO("state")} required /></Field>
                <Field label="Pincode"><input className="input" value={org.pincode} onChange={setO("pincode")} required /></Field>
                <Field label="Placement cell email (optional)"><input className="input" value={org.placement_email} onChange={setO("placement_email")} placeholder="placements@college.edu.in" /></Field>
                <Field label="About the college (optional)" wide><textarea className="input h-24" value={org.about} onChange={setO("about")} /></Field>
              </div>
            )}
          </Section>

          <Section icon={ShieldCheck} title="Verified details" hint="Checked by Campus Connect when you joined. Contact support to change them.">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              {data.verified_fields.filter((k) => o[k] != null && o[k] !== "").map((k) => (
                <div key={k} className="flex items-center justify-between gap-3 border-b border-black/[.05] pb-2">
                  <dt className="text-ink-muted">{VERIFIED_LABEL[k] || k}</dt><dd className="font-medium [overflow-wrap:anywhere]">{String(o[k])}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[.06] bg-white/90 px-5 py-3 shadow-float backdrop-blur">
            <div className="flex-1 text-sm">
              <ErrorNote>{err}</ErrorNote>
              {msg && <span className="flex items-center gap-1.5 text-emerald-700"><Check className="h-4 w-4" />{msg}</span>}
              {!err && !msg && <span className="text-ink-muted">Changes reach connected {isCompany ? "colleges" : "companies"} straight away.</span>}
            </div>
            <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
          </div>
        </div>
      </form>
    </>
  );
}
