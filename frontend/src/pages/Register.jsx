import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, GraduationCap, Mail, Search } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { Tilt } from "../components/fx/motion";
import { BRANCHES, EmailVerify, Field, INDIAN_STATES, PasswordFields, Stepper, check, domainFromUrl, openBatches } from "../components/forms";
import { ErrorNote, useApi } from "../components/ui";
import { AuthShell } from "./Login";

function Nav({ step, setStep, next, last, busy, canNext = true }) {
  return (
    <div className="mt-8 flex items-center justify-between">
      {step > 0 ? <button type="button" className="btn-ghost" onClick={() => setStep(step - 1)}><ArrowLeft className="h-4 w-4" /> Back</button> : <span />}
      <button type={last ? "submit" : "button"} className="btn-primary px-6" disabled={busy || !canNext} onClick={last ? undefined : next}>
        {busy ? "Creating account…" : last ? "Create account" : <>Continue <ArrowRight className="h-4 w-4" /></>}
      </button>
    </div>
  );
}

function useForm(init) {
  const [f, setF] = useState(init);
  const [errors, setErrors] = useState({});
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  const validate = (rules) => {
    const errs = {};
    for (const [k, fn] of Object.entries(rules)) {
      const msg = fn(f[k], f);
      if (msg) errs[k] = msg;
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };
  return { f, setF, set, errors, validate };
}
// Sign-up progress kept in this browser (never the password), so "Verify my email" in the
// email can reopen the form at the verify step with everything filled in.
export const DRAFT_KEY = "cc-signup-draft";
function useSignupDraft(kind, f, setF, step, setStep, emailField, verifyStep) {
  const [params] = useSearchParams();
  const restored = useRef(false);
  useEffect(() => {
    if (params.get("resume") !== "1" || restored.current) return;
    restored.current = true;
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
      if (!d || d.kind !== kind || Date.now() - d.at > 60 * 60 * 1000) return;
      const code = sessionStorage.getItem("cc-verify-code") || "";
      sessionStorage.removeItem("cc-verify-code");
      setF((x) => ({ ...x, ...d.f, code }));
      setStep(verifyStep);
    } catch { /* storage unavailable: start fresh */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (step < 1) return;
    const { password, confirm, code, ...rest } = f; // eslint-disable-line no-unused-vars
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ kind, f: rest, email: (f[emailField] || "").trim().toLowerCase(), at: Date.now() }));
    } catch { /* ignore */ }
  }, [f, step]); // eslint-disable-line react-hooks/exhaustive-deps
  return () => { try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ } };
}

const req = (label) => (v) => (String(v ?? "").trim() ? null : `${label} is required`);

// ---------------------------------------------------------------- student
function StudentSignup() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const { data: colleges } = useApi("/colleges");
  const { data: batchData } = useApi("/grad-years");
  const batches = batchData?.years || openBatches();
  const [step, setStep] = useState(0);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { f, setF, set, errors, validate } = useForm({
    college_id: "", first_name: "", last_name: "", roll_number: "", branch: "", grad_year: "",
    phone: "", email: "", code: "", password: "", confirm: "",
  });
  const clearDraft = useSignupDraft("student", f, setF, step, setStep, "email", 2);
  const college = (colleges || []).find((c) => c.id === f.college_id);
  const list = useMemo(() => (colleges || []).filter((c) => `${c.name} ${c.city} ${c.state}`.toLowerCase().includes(q.toLowerCase())), [colleges, q]);

  const steps = ["College", "About you", "Verify email", "Password"];
  const next = () => {
    if (step === 0 && !validate({ college_id: (v) => (v ? null : "Choose your college") })) return;
    if (step === 1 && !validate({
      first_name: req("First name"), last_name: req("Last name"), roll_number: req("Roll number"), branch: req("Branch"),
      phone: (v) => check(v, "phone"), grad_year: (v) => (batches.includes(Number(v)) ? null : `Choose ${batches.join(" or ")}`),
    })) return;
    if (step === 2 && !validate({ code: (v) => (/^\d{6}$/.test(v) ? null : "Enter the 6-digit code from your email") })) return;
    if (!f.email_domain && domainFromUrl(f.website)) setF((x) => ({ ...x, email_domain: domainFromUrl(x.website) }));
    setStep(step + 1);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!validate({ password: (v) => (v.length >= 8 ? null : "At least 8 characters"), confirm: (v, x) => (v === x.password ? null : "Passwords don't match") })) return;
    setBusy(true); setError(null);
    try {
      const { confirm, ...body } = f;
      signIn(await api("/auth/register/student", { method: "POST", body: { ...body, grad_year: Number(f.grad_year) } }));
      clearDraft();
      navigate("/");
    } catch (err) {
      setError(err.message); setBusy(false);
      // a code problem can only be fixed on the email step: take them back there with a fresh box
      if (/verification code/i.test(err.message)) { setF((x) => ({ ...x, code: "" })); setStep(2); }
    }
  };

  return (
    <form onSubmit={submit}>
      <Stepper steps={steps} current={step} />
      {step === 0 && (
        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input className="input pl-10" placeholder="Search your college or city" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {list.map((c) => (
              <button type="button" key={c.id} onClick={() => set("college_id")(c.id)}
                className={`flex w-full items-center justify-between rounded-xl border px-4 py-3 text-left transition ${f.college_id === c.id ? "border-brand-500 bg-brand-50 ring-4 ring-brand-100" : "border-black/[.06] bg-white hover:border-brand-200"}`}>
                <div><div className="text-sm font-medium">{c.name}</div><div className="text-xs text-ink-muted">{c.city}, {c.state}</div></div>
                <span className="chip bg-brand-50 text-brand-700"><BadgeCheck className="mr-1 h-3 w-3" />Verified</span>
              </button>
            ))}
            {colleges && list.length === 0 && <p className="py-6 text-center text-sm text-ink-muted">No verified college matches “{q}”.</p>}
          </div>
          {errors.college_id && <p className="text-xs text-rose-600">{errors.college_id}</p>}
          <p className="text-xs text-ink-muted">Don't see your college? Only colleges verified by Campus Connect are listed — ask your placement cell to <Link to="/register?as=college" className="text-brand-700 underline">register it</Link>.</p>
        </div>
      )}
      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name" error={errors.first_name}><input className="input" value={f.first_name} onChange={set("first_name")} autoComplete="given-name" /></Field>
          <Field label="Last name" error={errors.last_name}><input className="input" value={f.last_name} onChange={set("last_name")} autoComplete="family-name" /></Field>
          <Field label="Roll / enrolment number" error={errors.roll_number}><input className="input uppercase" value={f.roll_number} onChange={set("roll_number")} /></Field>
          <Field label="Mobile number" error={errors.phone}><input className="input" inputMode="tel" placeholder="98XXXXXXXX" value={f.phone} onChange={set("phone")} autoComplete="tel" /></Field>
          <Field label="Branch" error={errors.branch}>
            <select className="input" value={f.branch} onChange={set("branch")}><option value="">Select…</option>{BRANCHES.map((b) => <option key={b}>{b}</option>)}</select>
          </Field>
          <Field label="Graduation year" error={errors.grad_year} hint={`Open to the ${batches.join(" and ")} batches: this year's placement batch and the one just junior to it.`}>
            <select className="input" value={f.grad_year} onChange={set("grad_year")}>
              <option value="" disabled>Select…</option>
              {batches.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <p className="text-xs text-ink-muted sm:col-span-2">Your placement cell at <b className="font-medium text-ink">{college?.name}</b> will check these details before approving you.</p>
        </div>
      )}
      {step === 2 && (
        <div>
          <EmailVerify email={f.email} setEmail={set("email")} code={f.code} setCode={set("code")}
            payload={{ kind: "student", college_id: f.college_id }}
            label={college?.student_email_domain ? "College email" : "Email"}
            hint={college?.student_email_domain ? `${college.name} requires your @${college.student_email_domain} address.` : "We'll send a 6-digit code to confirm it's yours."} />
          {errors.code && <p className="mt-2 text-xs text-rose-600">{errors.code}</p>}
        </div>
      )}
      {step === 3 && <PasswordFields pw={f.password} setPw={set("password")} confirm={f.confirm} setConfirm={set("confirm")} />}
      <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>
      <Nav step={step} setStep={setStep} next={next} last={step === 3} busy={busy} />
    </form>
  );
}

// ---------------------------------------------------------------- college
function CollegeSignup() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { f, setF, set, errors, validate } = useForm({
    name: "", aishe_code: "", institution_type: "", affiliated_university: "", established_year: "", naac_grade: "", nirf_rank: "",
    website: "", email_domain: "", student_email_domain: "", address: "", city: "", state: "", pincode: "", phone: "",
    tpo_name: "", tpo_designation: "Training & Placement Officer", tpo_email: "", tpo_phone: "", code: "", password: "", confirm: "",
  });
  const clearDraft = useSignupDraft("college", f, setF, step, setStep, "tpo_email", 2);
  const steps = ["Institution", "Address & web", "Placement officer", "Password"];
  const next = () => {
    if (step === 0 && !validate({
      name: (v) => (v.trim().length >= 5 ? null : "Enter the full registered name"), aishe_code: (v) => check(v, "aishe"),
      institution_type: req("Type"), affiliated_university: req("Affiliating university"), naac_grade: req("NAAC grade"),
      established_year: (v) => (v >= 1850 && v <= 2026 ? null : "Enter a valid year"),
      nirf_rank: (v) => (!v || (v >= 1 && v <= 1000) ? null : "NIRF rank is 1–1000"),
    })) return;
    if (step === 1 && !validate({
      website: (v) => check(v, "url"), email_domain: (v, x) => check(v || domainFromUrl(x.website), "domain"),
      student_email_domain: (v) => (!v ? null : check(v, "domain")),
      address: (v) => (v.trim().length >= 10 ? null : "Enter the full address"), city: req("City"), state: req("State"),
      pincode: (v) => check(v, "pincode"), phone: (v) => check(v, "landline"),
    })) return;
    if (step === 2 && !validate({
      tpo_name: req("Name"), tpo_designation: req("Designation"), tpo_phone: (v) => check(v, "phone"),
      code: (v) => (/^\d{6}$/.test(v) ? null : "Verify your official email"),
    })) return;
    if (!f.email_domain && domainFromUrl(f.website)) setF((x) => ({ ...x, email_domain: domainFromUrl(x.website) }));
    setStep(step + 1);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!validate({ password: (v) => (v.length >= 8 ? null : "At least 8 characters"), confirm: (v, x) => (v === x.password ? null : "Passwords don't match") })) return;
    setBusy(true); setError(null);
    try {
      const { confirm, ...body } = f;
      signIn(await api("/auth/register/college", { method: "POST", body: {
        ...body, aishe_code: f.aishe_code.toUpperCase(), established_year: Number(f.established_year),
        nirf_rank: f.nirf_rank ? Number(f.nirf_rank) : null, student_email_domain: f.student_email_domain || null } }));
      clearDraft();
      navigate("/");
    } catch (err) {
      setError(err.message); setBusy(false);
      // a code problem can only be fixed on the email step: take them back there with a fresh box
      if (/verification code/i.test(err.message)) { setF((x) => ({ ...x, code: "" })); setStep(2); }
    }
  };
  return (
    <form onSubmit={submit}>
      <Stepper steps={steps} current={step} />
      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registered name of the institution" error={errors.name} className="sm:col-span-2"><input className="input" value={f.name} onChange={set("name")} /></Field>
          <Field label="AISHE code" error={errors.aishe_code} hint="From aishe.gov.in, e.g. C-41234"><input className="input uppercase" value={f.aishe_code} onChange={set("aishe_code")} /></Field>
          <Field label="Type" error={errors.institution_type}>
            <select className="input" value={f.institution_type} onChange={set("institution_type")}><option value="">Select…</option>
              {["Government", "Government-aided", "Private", "Autonomous", "Deemed university"].map((x) => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field label="Affiliating university" error={errors.affiliated_university} className="sm:col-span-2"><input className="input" value={f.affiliated_university} onChange={set("affiliated_university")} /></Field>
          <Field label="Year established" error={errors.established_year}><input type="number" className="input" value={f.established_year} onChange={set("established_year")} /></Field>
          <Field label="NAAC grade" error={errors.naac_grade}>
            <select className="input" value={f.naac_grade} onChange={set("naac_grade")}><option value="">Select…</option>
              {["A++", "A+", "A", "B++", "B+", "B", "C", "Not accredited"].map((x) => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field label="NIRF rank (optional)" error={errors.nirf_rank}><input type="number" className="input" value={f.nirf_rank} onChange={set("nirf_rank")} /></Field>
        </div>
      )}
      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Official website" error={errors.website} className="sm:col-span-2">
            <input className="input" placeholder="https://www.yourcollege.edu.in" value={f.website}
              onChange={(e) => { const w = e.target.value; setF((x) => ({ ...x, website: w, email_domain: x.email_domain || "" })); }}
              />
          </Field>
          <Field label="Official email domain" error={errors.email_domain} hint="Staff emails end with this"><input className="input" placeholder={domainFromUrl(f.website) || "college.edu.in"} value={f.email_domain} onChange={set("email_domain")} onFocus={(e) => { const d = domainFromUrl(f.website); if (!f.email_domain && d) { const el = e.target; setF((x) => ({ ...x, email_domain: d })); requestAnimationFrame(() => el.select()); } }} /></Field>
          <Field label="Student email domain (optional)" error={errors.student_email_domain} hint="If set, students must sign up with it"><input className="input" placeholder={f.email_domain ? `student.${f.email_domain}` : ""} value={f.student_email_domain} onChange={set("student_email_domain")} /></Field>
          <Field label="Address" error={errors.address} className="sm:col-span-2"><input className="input" value={f.address} onChange={set("address")} /></Field>
          <Field label="City" error={errors.city}><input className="input" value={f.city} onChange={set("city")} /></Field>
          <Field label="State" error={errors.state}><select className="input" value={f.state} onChange={set("state")}><option value="">Select…</option>{INDIAN_STATES.map((s) => <option key={s}>{s}</option>)}</select></Field>
          <Field label="PIN code" error={errors.pincode}><input className="input" inputMode="numeric" value={f.pincode} onChange={set("pincode")} /></Field>
          <Field label="Office phone" error={errors.phone}><input className="input" inputMode="tel" placeholder="022XXXXXXXX" value={f.phone} onChange={set("phone")} /></Field>
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Placement officer's name" error={errors.tpo_name}><input className="input" value={f.tpo_name} onChange={set("tpo_name")} /></Field>
            <Field label="Designation" error={errors.tpo_designation}><input className="input" value={f.tpo_designation} onChange={set("tpo_designation")} /></Field>
            <Field label="Mobile number" error={errors.tpo_phone}><input className="input" inputMode="tel" value={f.tpo_phone} onChange={set("tpo_phone")} /></Field>
          </div>
          <EmailVerify email={f.tpo_email} setEmail={set("tpo_email")} code={f.code} setCode={set("code")} label="Official email"
            payload={{ kind: "college", domain: f.email_domain }} hint={`Must be an @${f.email_domain || "your-college-domain"} address.`} />
          {errors.code && <p className="text-xs text-rose-600">{errors.code}</p>}
        </div>
      )}
      {step === 3 && (
        <div className="space-y-4">
          <PasswordFields pw={f.password} setPw={set("password")} confirm={f.confirm} setConfirm={set("confirm")} />
          <p className="rounded-xl bg-brand-50 p-3 text-xs text-brand-800">Campus Connect will verify your AISHE code and details, usually within a working day. You'll be able to sign in and approve students once your college is verified.</p>
        </div>
      )}
      <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>
      <Nav step={step} setStep={setStep} next={next} last={step === 3} busy={busy} />
    </form>
  );
}

// ---------------------------------------------------------------- company
function CompanySignup() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { f, setF, set, errors, validate } = useForm({
    name: "", website: "", email_domain: "", industry: "", size: "", hq_city: "", cin: "", gstin: "", about: "",
    hr_name: "", hr_designation: "", hr_email: "", hr_phone: "", code: "", password: "", confirm: "",
  });
  const clearDraft = useSignupDraft("company", f, setF, step, setStep, "hr_email", 1);
  const steps = ["Company", "Hiring contact", "Password"];
  const next = () => {
    if (step === 0 && !validate({
      name: req("Company name"), website: (v) => check(v, "url"), email_domain: (v, x) => check(v || domainFromUrl(x.website), "domain"),
      industry: req("Industry"), size: req("Company size"), hq_city: req("Headquarters city"),
      cin: (v, x) => (!v && !x.gstin ? "Enter your CIN or GSTIN" : v ? check(v, "cin") : null),
      gstin: (v) => (v ? check(v.toUpperCase(), "gstin") : null),
      about: (v) => (v.trim().length >= 20 ? null : "Tell students a little about the company (20+ characters)"),
    })) return;
    if (step === 1 && !validate({
      hr_name: req("Name"), hr_designation: req("Designation"), hr_phone: (v) => check(v, "phone"),
      code: (v) => (/^\d{6}$/.test(v) ? null : "Verify your work email"),
    })) return;
    if (!f.email_domain && domainFromUrl(f.website)) setF((x) => ({ ...x, email_domain: domainFromUrl(x.website) }));
    setStep(step + 1);
  };
  const submit = async (e) => {
    e.preventDefault();
    if (!validate({ password: (v) => (v.length >= 8 ? null : "At least 8 characters"), confirm: (v, x) => (v === x.password ? null : "Passwords don't match") })) return;
    setBusy(true); setError(null);
    try {
      const { confirm, ...body } = f;
      signIn(await api("/auth/register/company", { method: "POST", body: {
        ...body, cin: f.cin ? f.cin.toUpperCase() : null, gstin: f.gstin ? f.gstin.toUpperCase() : null } }));
      clearDraft();
      navigate("/");
    } catch (err) {
      setError(err.message); setBusy(false);
      // a code problem can only be fixed on the email step: take them back there with a fresh box
      if (/verification code/i.test(err.message)) { setF((x) => ({ ...x, code: "" })); setStep(1); }
    }
  };
  return (
    <form onSubmit={submit}>
      <Stepper steps={steps} current={step} />
      {step === 0 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company name" error={errors.name}><input className="input" value={f.name} onChange={set("name")} /></Field>
          <Field label="Website" error={errors.website}>
            <input className="input" placeholder="https://www.company.com" value={f.website} onChange={set("website")}
              />
          </Field>
          <Field label="Work email domain" error={errors.email_domain} hint="Your team's emails end with this"><input className="input" placeholder={domainFromUrl(f.website) || "company.com"} value={f.email_domain} onChange={set("email_domain")} onFocus={(e) => { const d = domainFromUrl(f.website); if (!f.email_domain && d) { const el = e.target; setF((x) => ({ ...x, email_domain: d })); requestAnimationFrame(() => el.select()); } }} /></Field>
          <Field label="Industry" error={errors.industry}><input className="input" placeholder="Fintech, SaaS, Manufacturing…" value={f.industry} onChange={set("industry")} /></Field>
          <Field label="Company size" error={errors.size}>
            <select className="input" value={f.size} onChange={set("size")}><option value="">Select…</option>{["1-50", "51-200", "201-1000", "1001-5000", "5000+"].map((x) => <option key={x}>{x}</option>)}</select>
          </Field>
          <Field label="Headquarters city" error={errors.hq_city}><input className="input" value={f.hq_city} onChange={set("hq_city")} /></Field>
          <Field label="CIN" error={errors.cin} hint="Corporate Identification Number"><input className="input uppercase" value={f.cin} onChange={set("cin")} /></Field>
          <Field label="GSTIN (if no CIN)" error={errors.gstin}><input className="input uppercase" value={f.gstin} onChange={set("gstin")} /></Field>
          <Field label="About the company" error={errors.about} className="sm:col-span-2"><textarea className="input h-24" value={f.about} onChange={set("about")} /></Field>
        </div>
      )}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Your name" error={errors.hr_name}><input className="input" value={f.hr_name} onChange={set("hr_name")} /></Field>
            <Field label="Designation" error={errors.hr_designation}><input className="input" placeholder="Campus Hiring Lead" value={f.hr_designation} onChange={set("hr_designation")} /></Field>
            <Field label="Mobile number" error={errors.hr_phone}><input className="input" inputMode="tel" value={f.hr_phone} onChange={set("hr_phone")} /></Field>
          </div>
          <EmailVerify email={f.hr_email} setEmail={set("hr_email")} code={f.code} setCode={set("code")} label="Work email"
            payload={{ kind: "company", domain: f.email_domain }} hint={`Must be an @${f.email_domain || "company-domain"} address — personal webmail isn't accepted.`} />
          {errors.code && <p className="text-xs text-rose-600">{errors.code}</p>}
        </div>
      )}
      {step === 2 && (
        <div className="space-y-4">
          <PasswordFields pw={f.password} setPw={set("password")} confirm={f.confirm} setConfirm={set("confirm")} />
          <p className="rounded-xl bg-brand-50 p-3 text-xs text-brand-800">Campus Connect verifies your CIN/GSTIN before you can connect with colleges.</p>
        </div>
      )}
      <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>
      <Nav step={step} setStep={setStep} next={next} last={step === 2} busy={busy} />
    </form>
  );
}

const KINDS = [
  { k: "student", icon: GraduationCap, title: "Student", text: "Track drives at your college and learn why you weren't shortlisted.", gate: "Approved by your placement cell" },
  { k: "college", icon: Building2, title: "College", text: "Register your institution, approve students and connect with companies.", gate: "Verified by Campus Connect" },
  { k: "company", icon: BadgeCheck, title: "Company", text: "Find colleges by tier and city and run drives on campus.", gate: "Verified by Campus Connect" },
];

/** Left panel during sign-up: who checks the account, and that the decision arrives by email. */
const NEXT = {
  student: {
    who: "Your placement cell",
    steps: [
      ["Verify your email", "Enter the 6-digit code we email you."],
      ["Your placement cell checks you", "They match your roll number and details with college records, usually within a few working days."],
      ["Watch your inbox", "We email you the moment you're approved, or if they need anything from you."],
      ["Start applying", "See the drives you're eligible for and track every round."],
    ],
  },
  college: {
    who: "Campus Connect",
    steps: [
      ["Verify your official email", "Enter the 6-digit code we email the placement officer."],
      ["Campus Connect verifies your college", "We check your AISHE code, NAAC grade and official domain, usually within a working day."],
      ["Watch your inbox", "We email the placement officer as soon as it's approved, or if we need more details."],
      ["Bring in students and companies", "Approve student sign-ups and connect with verified companies."],
    ],
  },
  company: {
    who: "Campus Connect",
    steps: [
      ["Verify your work email", "Enter the 6-digit code we email you."],
      ["Campus Connect verifies your company", "We check your CIN/GSTIN and work domain, usually within a working day."],
      ["Watch your inbox", "We email you as soon as it's approved, or if we need more details."],
      ["Hire on campus", "Connect with verified colleges and run drives."],
    ],
  },
};

function NextSteps({ kind }) {
  const n = NEXT[kind];
  return (
    <div className="mt-auto">
      <div className="text-xs font-semibold uppercase tracking-eyebrow text-brand-300">What happens next</div>
      <ol className="mt-5 space-y-0">
        {n.steps.map(([t, d], i) => (
          <li key={t} className="relative flex gap-4 pb-6 last:pb-0">
            {i < n.steps.length - 1 && <span aria-hidden className="absolute left-[15px] top-9 h-[calc(100%-2.25rem)] w-px bg-white/15" />}
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium ${i === 2 ? "bg-brand-500 text-white" : "border border-white/20 text-white/80"}`}>
              {i === 2 ? <Mail className="h-4 w-4" /> : i + 1}
            </span>
            <div className="pt-1">
              <div className="font-medium">{t}</div>
              <div className="mt-0.5 text-sm leading-relaxed text-white/60">{d}</div>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-8 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-relaxed text-white/75 backdrop-blur">
        <b className="font-medium text-white">Keep checking your email</b>, including Spam, for updates from {n.who === "Campus Connect" ? "Campus Connect" : "your placement cell"}.
        You can also sign in any time to see where things stand.
      </div>
    </div>
  );
}

export default function Register() {
  const [params, setParams] = useSearchParams();
  const kind = params.get("as");
  const meta = KINDS.find((x) => x.k === kind);

  if (!meta) {
    return (
      <AuthShell mode="signup" title="Join" accent="Campus Connect." subtitle="Who are you signing up as?" wide>
        <div className="grid gap-4 sm:grid-cols-3">
          {KINDS.map(({ k, icon: Icon, title, text, gate }) => (
            <Tilt key={k} className="rounded-3xl">
              <button onClick={() => setParams({ as: k })} className="card flex h-full w-full flex-col p-6 text-left transition hover:border-brand-200">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50"><Icon className="h-5 w-5 text-brand-600" /></span>
                <div className="mt-5 text-lg font-medium">{title}</div>
                <p className="mt-1 flex-1 text-sm text-ink-muted">{text}</p>
                <div className="mt-5 text-xs font-medium text-brand-700">{gate}</div>
              </button>
            </Tilt>
          ))}
        </div>
        <p className="mt-8 text-center text-sm text-ink-muted">Already have an account? <Link to="/login" className="font-medium text-brand-700 hover:underline">Sign in</Link> · Just exploring? <Link to="/login" className="font-medium text-brand-700 hover:underline">Try a demo account</Link></p>
      </AuthShell>
    );
  }
  return (
    <AuthShell mode="signup" wide aside={<NextSteps kind={kind} />} title={kind === "student" ? "Join as a" : "Register your"} accent={kind === "student" ? "student." : `${kind}.`}
      subtitle={<button className="inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink" onClick={() => setParams({})}><ArrowLeft className="h-3.5 w-3.5" /> Choose a different account type</button>}>
      {kind === "student" && <StudentSignup />}
      {kind === "college" && <CollegeSignup />}
      {kind === "company" && <CompanySignup />}
    </AuthShell>
  );
}
