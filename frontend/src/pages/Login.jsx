import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, GraduationCap, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import Logo from "../components/Logo";
import { ErrorNote } from "../components/ui";
import { OtpInput, PasswordFields } from "../components/forms";

const DEMO_ICON = { Student: GraduationCap, "Placement cell": Building2, Company: BadgeCheck };
const DEMO = [
  { role: "Student", email: "student@campusconnect.dev", password: "student123" },
  { role: "Placement cell", email: "tpo@campusconnect.dev", password: "tpo123" },
  { role: "Company", email: "recruiter@campusconnect.dev", password: "recruiter123" },
];

function AuthSwitch({ mode }) {
  return (
    <div className="mb-10 grid grid-cols-2 rounded-full border border-black/[.06] bg-white/80 p-1 text-sm shadow-soft">
      {[["signin", "Sign in", "/login"], ["signup", "Create account", "/register"]].map(([k, l, to]) => (
        <Link key={k} to={to} aria-current={mode === k ? "page" : undefined}
          className={`rounded-full py-2 text-center font-medium transition ${mode === k ? "bg-brand-800 text-white" : "text-ink-muted hover:text-ink"}`}>{l}</Link>
      ))}
    </div>
  );
}

export function AuthShell({ title, accent, subtitle, children, wide, mode }) {
  return (
    <div className="grid min-h-screen xl:grid-cols-[minmax(420px,.75fr)_1fr]">
      <aside className="relative hidden overflow-hidden bg-ink xl:sticky xl:top-0 xl:block xl:h-screen xl:self-start">
        <div aria-hidden className="absolute inset-0 bg-[radial-gradient(520px_360px_at_30%_15%,rgba(139,92,246,.35),transparent_70%)]" />
        <div className="absolute inset-0 bg-gradient-to-bl from-brand-900/40 via-transparent to-transparent" />
        <div className="relative flex h-full flex-col p-12 text-white">
          <Link to="/" className="w-fit"><Logo dark /></Link>
          <div className="mt-auto space-y-4">
            {[[ShieldCheck, "Verified network", "Every college and company is checked."],
              [GraduationCap, "Approved by your college", "Your placement cell confirms every student."],
              [BadgeCheck, "Real feedback", "Know why you weren't shortlisted."]].map(([Icon, t, d]) => (
              <div key={t} className="flex gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur">
                <Icon className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
                <div><div className="font-medium">{t}</div><div className="text-sm text-white/60">{d}</div></div>
              </div>
            ))}
          </div>
          <p className="mt-10 text-3xl font-medium leading-tight tracking-tight">Opportunities don't find you.<br /><span className="italic text-brand-300">You find them.</span></p>
        </div>
      </aside>
      <div className="relative isolate flex flex-col overflow-hidden px-5 py-6 sm:px-10">
        <div aria-hidden className="grid-squares absolute inset-0 -z-10" />
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="w-fit xl:hidden"><Logo /></Link>
          <Link to="/" className="group ml-auto inline-flex items-center gap-1.5 rounded-full border border-black/[.08] bg-white/80 px-4 py-2 text-sm text-ink-soft shadow-soft transition hover:border-brand-200 hover:text-ink">
            <ArrowLeft className="h-4 w-4 transition group-hover:-translate-x-0.5" /> Back to home
          </Link>
        </div>
        <div className={`mx-auto flex w-full flex-1 flex-col justify-center py-10 ${wide ? "max-w-2xl" : "max-w-md"}`}>
          {mode && <div className="mx-auto w-full max-w-md"><AuthSwitch mode={mode} /></div>}
          <h1 className="text-4xl font-medium tracking-[-0.03em]">{title} <span className="accent">{accent}</span></h1>
          {subtitle && <div className="mt-2 text-ink-muted">{subtitle}</div>}
          <div className="mt-8">{children}</div>
        </div>
      </div>
    </div>
  );
}

/** First sign-in or forgotten password for the platform admin: prove the inbox, then set a password. */
function AdminSetup({ onDone, onCancel }) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const send = async (e) => {
    e?.preventDefault(); setErr(null); setBusy(true);
    try {
      const r = await api("/auth/admin/send-code", { method: "POST", body: { email } });
      setSent(r);
      if (r.dev_code) setCode(r.dev_code);
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  const save = async (e) => {
    e.preventDefault(); setErr(null);
    if (pw !== confirm) { setErr("The passwords don't match"); return; }
    setBusy(true);
    try {
      signIn(await api("/auth/admin/setup", { method: "POST", body: { email, code, password: pw, name: name || null } }));
      onDone();
    } catch (e2) { setErr(e2.message); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-ink-muted">Setting up for the first time or forgot your password? We'll email a code to the approved admin address.</p>
      {!sent ? (
        <form onSubmit={send} className="space-y-4">
          <div><label className="label" htmlFor="admin-email">Admin email</label>
            <input id="admin-email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" /></div>
          <ErrorNote>{err}</ErrorNote>
          <button className="btn-primary w-full py-3" disabled={busy || !email}>{busy ? "Sending…" : "Email me a code"}</button>
        </form>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div className="rounded-xl bg-brand-50/60 px-4 py-3 text-sm text-brand-900">Code sent to <b className="font-medium">{sent.email}</b>. It's valid for 10 minutes.</div>
          <div><label className="label">6-digit code</label><OtpInput value={code} onChange={setCode} /></div>
          <div><label className="label" htmlFor="admin-name">Your name (optional)</label>
            <input id="admin-name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} /></div>
          <PasswordFields pw={pw} setPw={setPw} confirm={confirm} setConfirm={setConfirm} />
          <ErrorNote>{err}</ErrorNote>
          <button className="btn-primary w-full py-3" disabled={busy || code.length !== 6 || pw.length < 8}>{busy ? "Saving…" : "Set password and sign in"}</button>
          <button type="button" className="w-full text-center text-sm text-brand-700 hover:underline" onClick={send} disabled={busy}>Send a new code</button>
        </form>
      )}
      <p className="text-center text-sm"><button type="button" onClick={onCancel} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Back to admin sign in</button></p>
    </div>
  );
}

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [params, setParams] = useSearchParams();
  const admin = params.get("as") === "admin";
  const [setup, setSetup] = useState(false);
  const setAdmin = (on) => { setError(null); setSetup(false); setParams(on ? { as: "admin" } : {}, { replace: true }); };

  const submit = async (e, creds) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      signIn(await api("/auth/login", { method: "POST", body: creds || { email, password, ...(admin ? { role: "admin" } : {}) } }));
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell mode="signin" title={admin ? "Platform" : "Welcome"} accent={admin ? "admin." : "back."}
      subtitle={admin ? "Sign in to verify colleges and companies." : "Sign in to your Campus Connect account."}>
      {admin && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
          <ShieldCheck className="h-4 w-4 shrink-0 text-brand-700" />
          Only platform admin accounts can sign in here.
        </div>
      )}
      {admin && setup ? <AdminSetup onDone={() => navigate("/")} onCancel={() => setSetup(false)} /> : <>
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input id="password" type="password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <ErrorNote>{error}</ErrorNote>
        <button className="btn-primary group w-full py-3.5" disabled={busy}>{busy ? "Signing in…" : <>{admin ? "Sign in as admin" : "Sign in"} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></>}</button>
      </form>
      {admin ? (
        <p className="mt-5 flex flex-col items-center gap-2 text-center text-sm text-ink-muted">
          <button type="button" onClick={() => { setError(null); setSetup(true); }} className="font-medium text-brand-700 hover:underline">First time, or forgot your password?</button>
          <button type="button" onClick={() => setAdmin(false)} className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline"><ArrowLeft className="h-3.5 w-3.5" /> Back to regular sign in</button>
        </p>
      ) : <>
      <p className="mt-5 text-center text-sm text-ink-muted">New to Campus Connect? <Link to="/register" className="font-medium text-brand-700 hover:underline">Create an account</Link></p>

      <button type="button" onClick={() => setAdmin(true)}
        className="group mt-8 flex w-full items-center gap-3 rounded-xl border border-black/[.08] bg-white px-4 py-3 text-left text-sm transition hover:border-brand-200 hover:bg-brand-50/50">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-800 text-white"><ShieldCheck className="h-4 w-4" /></span>
        <span className="min-w-0 flex-1"><span className="block font-medium">Platform admin sign in</span><span className="block text-xs text-ink-muted">For the team that verifies colleges and companies</span></span>
        <ArrowRight className="h-4 w-4 text-ink-muted transition group-hover:translate-x-0.5 group-hover:text-ink" />
      </button>

      <div className="mt-8">
        <div className="mb-3 flex items-center gap-3 text-xs text-ink-muted"><span className="h-px flex-1 bg-black/[.08]" />Or try a demo account<span className="h-px flex-1 bg-black/[.08]" /></div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          {DEMO.map((d) => {
            const Icon = DEMO_ICON[d.role];
            return (
              <button key={d.role} disabled={busy} onClick={() => submit(null, { email: d.email, password: d.password })}
                className="flex items-center gap-3 rounded-xl border border-black/[.06] bg-white px-3.5 py-3 text-left text-sm transition hover:border-brand-200 hover:bg-brand-50/50 disabled:opacity-50">
                <Icon className="h-4 w-4 shrink-0 text-brand-600" />
                <span className="font-medium">{d.role}</span>
              </button>
            );
          })}
        </div>
      </div>
      </>}
      </>}
    </AuthShell>
  );
}
