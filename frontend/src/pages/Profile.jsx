import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, Briefcase, Check, Code, ExternalLink, Github, Globe, GraduationCap, Link2, Linkedin, Pencil, Phone, Plus, Sparkles, X,
} from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { ErrorNote, PageHeader } from "../components/ui";

const BRANCHES = ["Computer", "IT", "EXTC", "Electronics", "Mechanical", "AI & DS", "Civil", "Chemical"];
const LINKS = [
  { k: "github", label: "GitHub", icon: Github, placeholder: "username or github.com/…" },
  { k: "leetcode", label: "LeetCode", icon: Code, placeholder: "username or leetcode.com/u/…" },
  { k: "linkedin", label: "LinkedIn", icon: Linkedin, placeholder: "username or linkedin.com/in/…" },
  { k: "portfolio", label: "Portfolio", icon: Globe, placeholder: "yourname.dev" },
];

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

function Stepper({ label, value, onChange }) {
  const n = Number(value) || 0;
  return (
    <div className="rounded-2xl border border-black/[.06] bg-white p-4">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className="mt-2 flex items-center justify-between">
        <button type="button" onClick={() => onChange(Math.max(0, n - 1))} className="h-8 w-8 rounded-full border border-black/10 text-lg leading-none hover:bg-brand-50" aria-label={`Fewer ${label}`}>−</button>
        <span className="text-2xl font-medium tabular-nums">{n}</span>
        <button type="button" onClick={() => onChange(n + 1)} className="h-8 w-8 rounded-full border border-black/10 text-lg leading-none hover:bg-brand-50" aria-label={`More ${label}`}>+</button>
      </div>
    </div>
  );
}

function SkillInput({ skills, onChange }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const parts = draft.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (parts.length) onChange([...new Set([...skills, ...parts])]);
    setDraft("");
  };
  return (
    <div className="rounded-xl border border-black/10 bg-white p-2 focus-within:border-brand-400 focus-within:ring-4 focus-within:ring-brand-100">
      <div className="flex flex-wrap gap-1.5">
        {skills.map((s) => (
          <span key={s} className="chip gap-1 bg-brand-50 py-1 text-brand-800">
            {s}<button type="button" onClick={() => onChange(skills.filter((x) => x !== s))} aria-label={`Remove ${s}`}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <input className="min-w-[10rem] flex-1 bg-transparent px-1.5 py-1 text-sm outline-none" value={draft} placeholder={skills.length ? "Add another…" : "python, sql, react…"}
          onChange={(e) => setDraft(e.target.value)} onBlur={add}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(); } else if (e.key === "Backspace" && !draft && skills.length) onChange(skills.slice(0, -1)); }} />
      </div>
    </div>
  );
}

/** Students can fix their own name; the email stays fixed. The placement cell is notified. */
function NameEditor({ user, refresh }) {
  const split = () => ({ first: user.first_name || user.name.split(" ")[0], last: user.last_name || user.name.split(" ").slice(1).join(" ") });
  const [edit, setEdit] = useState(false);
  const [n, setN] = useState(split);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [err, setErr] = useState(null);
  const save = async () => {
    setErr(null); setBusy(true);
    try {
      const r = await api("/students/me/name", { method: "PUT", body: { first_name: n.first, last_name: n.last } });
      await refresh();
      setEdit(false);
      setMsg(r.changed ? "Name updated. Your placement cell has been told." : null);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const enter = (e) => { if (e.key === "Enter") { e.preventDefault(); save(); } if (e.key === "Escape") setEdit(false); };
  if (!edit) {
    return (
      <>
        <div className="mt-3 flex items-center gap-2">
          <h1 className="text-xl font-medium tracking-tight">{user.name}</h1>
          <button type="button" title="Edit your name" onClick={() => { setN(split()); setMsg(null); setEdit(true); }}
            className="rounded-full p-1.5 text-ink-muted hover:bg-black/[.04] hover:text-ink"><Pencil className="h-3.5 w-3.5" /></button>
        </div>
        {msg && <p className="mt-1 text-xs text-emerald-700">{msg}</p>}
      </>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input className="input px-3 py-2 text-sm" aria-label="First name" value={n.first} onChange={(e) => setN({ ...n, first: e.target.value })} onKeyDown={enter} autoFocus maxLength={60} />
        <input className="input px-3 py-2 text-sm" aria-label="Last name" value={n.last} onChange={(e) => setN({ ...n, last: e.target.value })} onKeyDown={enter} maxLength={60} />
      </div>
      <p className="text-xs text-ink-muted">Use your name as it appears in college records. Your placement cell is notified of the change.</p>
      {err && <p className="text-xs text-rose-600">{err}</p>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy || !n.first.trim() || !n.last.trim()} onClick={save}><Check className="h-3.5 w-3.5" />{busy ? "Saving…" : "Save name"}</button>
        <button type="button" className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setEdit(false)}>Cancel</button>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();
  const p = user.profile || {};
  const [f, setF] = useState({
    branch: p.branch || "", cgpa: p.cgpa ?? "", backlogs: p.backlogs ?? 0, grad_year: p.grad_year || new Date().getFullYear(),
    internships: p.internships ?? 0, projects: p.projects ?? 0, certifications: p.certifications ?? 0,
    skills: p.skills || [], phone: p.phone || user.phone || "",
    linkedin: p.linkedin || "", github: p.github || "", leetcode: p.leetcode || "", portfolio: p.portfolio || "",
    other_links: p.other_links || [],
  });
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const firstTime = !p.branch;

  const checks = [
    ["Academic details", f.branch && f.cgpa !== ""],
    ["5+ skills", f.skills.length >= 5],
    ["GitHub", f.github], ["LeetCode", f.leetcode], ["LinkedIn", f.linkedin],
    ["Resume uploaded", user.resume],
  ];
  const done = checks.filter(([, ok]) => ok).length;

  const submit = async (e) => {
    e.preventDefault();
    setError(null); setMsg(null); setBusy(true);
    try {
      const saved = await api("/students/me/profile", {
        method: "PUT",
        body: {
          ...f, cgpa: Number(f.cgpa), backlogs: Number(f.backlogs), grad_year: Number(f.grad_year),
          internships: Number(f.internships), projects: Number(f.projects), certifications: Number(f.certifications),
          other_links: f.other_links.filter((l) => l.url.trim()).map((l) => ({ label: l.label.trim() || "Link", url: l.url })),
        },
      });
      // show links the way they were saved (usernames become full URLs)
      setF((cur) => ({ ...cur, linkedin: saved.linkedin || "", github: saved.github || "", leetcode: saved.leetcode || "",
        portfolio: saved.portfolio || "", other_links: saved.other_links || [] }));
      await refresh();
      if (firstTime) navigate("/resume");
      else setMsg("Profile saved");
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const initials = user.name.split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const setOther = (i, k, v) => setF({ ...f, other_links: f.other_links.map((l, j) => (j === i ? { ...l, [k]: v } : l)) });

  return (
    <>
    <PageHeader eyebrow={user.college?.name} title="Your" accent="profile."
      subtitle="Academic details, skills and coding profiles in one place." />
    <form onSubmit={submit} className="grid gap-6 lg:grid-cols-[300px_1fr]">
      {/* summary */}
      <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
        <div className="card overflow-hidden">
          <div className="h-20 bg-gradient-to-br from-brand-200 via-brand-100 to-white" />
          <div className="-mt-10 px-6 pb-6">
            <span className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-white bg-ink text-2xl font-medium text-white">{initials}</span>
            <NameEditor user={user} refresh={refresh} />
            <p className="text-sm text-ink-muted">{user.college?.name}</p>
            <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
              {f.branch && <span className="chip bg-black/[.04] text-ink-soft">{f.branch}</span>}
              <span className="chip bg-black/[.04] text-ink-soft">Batch {f.grad_year}</span>
              {user.roll_number && <span className="chip bg-black/[.04] text-ink-soft">{user.roll_number}</span>}
            </div>
            {LINKS.some(({ k }) => f[k]) && (
              <div className="mt-4 flex gap-2">
                {LINKS.filter(({ k }) => f[k] && /^https?:/.test(f[k])).map(({ k, label, icon: Icon }) => (
                  <a key={k} href={f[k]} target="_blank" rel="noreferrer" title={label}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-black/[.08] text-ink-soft hover:border-brand-200 hover:text-brand-700"><Icon className="h-4 w-4" /></a>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Profile strength</h2>
            <span className="text-sm tabular-nums text-ink-muted">{done}/{checks.length}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-brand-50"><div className="h-2 rounded-full bg-gradient-to-r from-brand-400 to-brand-700 transition-all" style={{ width: `${(100 * done) / checks.length}%` }} /></div>
          <ul className="mt-4 space-y-2 text-sm">
            {checks.map(([l, ok]) => (
              <li key={l} className={`flex items-center gap-2 ${ok ? "text-ink" : "text-ink-muted"}`}>
                {ok ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="h-4 w-4 rounded-full border border-black/15" />}{l}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-ink-muted">Academic details decide your eligibility for drives.</p>
        </div>
      </aside>

      {/* editable sections */}
      <div className="space-y-6">
        <Section icon={GraduationCap} title="Academics" hint="Checked against each drive's eligibility rules">
          <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
            <div>
              <label className="label">Branch</label>
              <select className="input" value={f.branch} onChange={set("branch")} required>
                <option value="" disabled>Select…</option>
                {BRANCHES.map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            <div><label className="label">CGPA (out of 10)</label><input type="number" step="0.01" min="0" max="10" className="input" value={f.cgpa} onChange={set("cgpa")} required /></div>
            <div><label className="label">Graduation year</label><input type="number" min="2020" max="2035" className="input" value={f.grad_year} onChange={set("grad_year")} required /></div>
            <div><label className="label">Active backlogs</label><input type="number" min="0" className="input" value={f.backlogs} onChange={set("backlogs")} required /></div>
          </div>
        </Section>

        <Section icon={Briefcase} title="Experience" hint="Counts used in your placement health score">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stepper label="Internships" value={f.internships} onChange={(v) => setF({ ...f, internships: v })} />
            <Stepper label="Projects" value={f.projects} onChange={(v) => setF({ ...f, projects: v })} />
            <Stepper label="Certifications" value={f.certifications} onChange={(v) => setF({ ...f, certifications: v })} />
          </div>
        </Section>

        <Section icon={Sparkles} title="Skills" hint="Press Enter or comma to add. Skills found in your resume are added automatically.">
          <SkillInput skills={f.skills} onChange={(skills) => setF({ ...f, skills })} />
        </Section>

        <Section icon={Link2} title="Coding profiles & links" hint="A username is enough — we'll turn it into a link">
          <div className="grid gap-4 xl:grid-cols-2">
            {LINKS.map(({ k, label, icon: Icon, placeholder }) => (
              <div key={k}>
                <label className="label" htmlFor={k}>{label}</label>
                <div className="relative">
                  <Icon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                  <input id={k} className="input pl-10 pr-10" value={f[k]} onChange={set(k)} placeholder={placeholder} />
                  {/^https?:/.test(f[k]) && <a href={f[k]} target="_blank" rel="noreferrer" className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-brand-700" aria-label={`Open ${label}`}><ExternalLink className="h-4 w-4" /></a>}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 space-y-2">
            <div className="label">Other links <span className="font-normal">(Kaggle, Codeforces, Behance, a blog…)</span></div>
            {f.other_links.map((l, i) => (
              <div key={i} className="grid grid-cols-[8rem_1fr_auto] gap-2">
                <input className="input" placeholder="Label" value={l.label} onChange={(e) => setOther(i, "label", e.target.value)} />
                <input className="input" placeholder="https://…" value={l.url} onChange={(e) => setOther(i, "url", e.target.value)} />
                <button type="button" className="rounded-full p-2 text-ink-muted hover:bg-rose-50 hover:text-rose-600" aria-label="Remove link"
                  onClick={() => setF({ ...f, other_links: f.other_links.filter((_, j) => j !== i) })}><X className="h-4 w-4" /></button>
              </div>
            ))}
            {f.other_links.length < 5 && (
              <button type="button" className="btn-ghost px-3 py-1.5" onClick={() => setF({ ...f, other_links: [...f.other_links, { label: "", url: "" }] })}><Plus className="h-4 w-4" /> Add a link</button>
            )}
          </div>
        </Section>

        <Section icon={Phone} title="Contact" hint="Shared with your placement cell">
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Email</label><input className="input bg-black/[.02] text-ink-muted" value={user.email} disabled /><p className="mt-1 text-xs text-ink-muted">Your sign-in email can't be changed.</p></div>
            <div><label className="label">Phone</label><input className="input" value={f.phone} onChange={set("phone")} /></div>
          </div>
        </Section>

        <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/[.06] bg-white/90 px-5 py-3 shadow-float backdrop-blur">
          <div className="flex-1 text-sm">
            <ErrorNote>{error}</ErrorNote>
            {msg && <span className="flex items-center gap-1.5 text-emerald-700"><Check className="h-4 w-4" />{msg}</span>}
            {!error && !msg && <span className="flex items-center gap-1.5 text-ink-muted"><BookOpen className="h-4 w-4" />Keep this up to date before each drive.</span>}
          </div>
          <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : firstTime ? "Save and continue" : "Save profile"}</button>
        </div>
      </div>
    </form>
    </>
  );
}
