import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, BadgeCheck, Building2, GraduationCap, ShieldCheck } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import Logo from "../components/Logo";
import { ErrorNote } from "../components/ui";

const DEMO_ICON = { Student: GraduationCap, "Placement cell": Building2, Company: BadgeCheck, "Platform admin": ShieldCheck };
const DEMO = [
  { role: "Student", email: "student@campusconnect.dev", password: "student123" },
  { role: "Placement cell", email: "tpo@campusconnect.dev", password: "tpo123" },
  { role: "Company", email: "recruiter@campusconnect.dev", password: "recruiter123" },
  { role: "Platform admin", email: "admin@campusconnect.dev", password: "admin123" },
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
      <aside className="relative hidden overflow-hidden bg-ink xl:block">
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
        <Link to="/" className="w-fit xl:hidden"><Logo /></Link>
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

export default function Login() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e, creds) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      signIn(await api("/auth/login", { method: "POST", body: creds || { email, password } }));
      navigate("/");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell mode="signin" title="Welcome" accent="back." subtitle="Sign in to your Campus Connect account.">
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
        <button className="btn-primary group w-full py-3.5" disabled={busy}>{busy ? "Signing in…" : <>Sign in <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></>}</button>
      </form>
      <p className="mt-5 text-center text-sm text-ink-muted">New to Campus Connect? <Link to="/register" className="font-medium text-brand-700 hover:underline">Create an account</Link></p>

      <div className="mt-10">
        <div className="mb-3 flex items-center gap-3 text-xs text-ink-muted"><span className="h-px flex-1 bg-black/[.08]" />Or try a demo account<span className="h-px flex-1 bg-black/[.08]" /></div>
        <div className="grid grid-cols-2 gap-2">
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
    </AuthShell>
  );
}
