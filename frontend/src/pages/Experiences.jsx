import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BadgeCheck, Clock, Monitor, Plus, Search, ThumbsUp, Trash2, X } from "lucide-react";
import { api } from "../api";
import { Reveal } from "../components/fx/motion";
import { ErrorNote, Modal, PageHeader, Spinner, Tabs, useApi, fmtDate } from "../components/ui";
import { Field } from "../components/forms";

const ROUNDS = ["Online assessment", "Coding round", "Technical interview", "HR interview", "Group discussion", "Other"];
const OUTCOME = { cleared: ["Cleared", "bg-emerald-50 text-emerald-700"], not_cleared: ["Not cleared", "bg-rose-50 text-rose-600"], awaiting: ["Awaiting result", "bg-black/[.05] text-ink-soft"] };

function Difficulty({ n }) {
  return (
    <span className="inline-flex items-center gap-0.5" title={`Difficulty ${n}/5`}>
      {[1, 2, 3, 4, 5].map((i) => <span key={i} className={`h-1.5 w-3 rounded-full ${i <= n ? "bg-brand-600" : "bg-brand-100"}`} />)}
    </span>
  );
}

function ExperienceCard({ e, onHelpful, onDelete }) {
  return (
    <article className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-medium tracking-tight">{e.company}</div>
          <div className="text-sm text-ink-muted">{e.role}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {e.verified && <span className="chip bg-emerald-50 text-emerald-700"><BadgeCheck className="mr-1 h-3.5 w-3.5" />Verified</span>}
          <span className={`chip ${OUTCOME[e.outcome][1]}`}>{OUTCOME[e.outcome][0]}</span>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-ink-muted">
        <span className="chip bg-ink px-3 py-1 text-white">{e.round_type}</span>
        <span className="flex items-center gap-2">Difficulty <Difficulty n={e.difficulty} /></span>
        {e.platform && <span className="flex items-center gap-1"><Monitor className="h-3.5 w-3.5" />{e.platform}</span>}
        {e.duration_minutes && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{e.duration_minutes} min</span>}
      </div>
      {e.questions.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-xs font-medium text-ink-muted">What was asked</div>
          <ul className="space-y-1.5">
            {e.questions.map((q, i) => <li key={i} className="flex gap-2 text-sm"><span className="text-brand-500">—</span>{q}</li>)}
          </ul>
        </div>
      )}
      {e.topics.length > 0 && <div className="mt-4 flex flex-wrap gap-1.5">{e.topics.map((t) => <span key={t} className="chip bg-brand-50 text-brand-700">{t}</span>)}</div>}
      {e.tips && <blockquote className="mt-5 rounded-2xl bg-brand-50/60 p-4 text-sm text-ink-soft">“{e.tips}”</blockquote>}
      <div className="mt-5 flex items-center justify-between border-t border-black/[.05] pt-4 text-xs text-ink-muted">
        <span>{e.author ? `${e.author}` : "Anonymous"} · {e.college} · {fmtDate(e.created_at)}</span>
        <div className="flex items-center gap-2">
          {e.mine && <button onClick={() => onDelete(e)} className="rounded-full p-1.5 hover:bg-rose-50 hover:text-rose-600" aria-label="Delete"><Trash2 className="h-4 w-4" /></button>}
          <button onClick={() => onHelpful(e)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${e.marked_helpful ? "bg-brand-600 text-white" : "bg-black/[.04] hover:bg-brand-50 hover:text-brand-700"}`}>
            <ThumbsUp className="h-3.5 w-3.5" /> Helpful · {e.helpful}
          </button>
        </div>
      </div>
    </article>
  );
}

function ShareForm({ onDone }) {
  const { data: shareable } = useApi("/experiences/shareable");
  const [mode, setMode] = useState("linked");
  const [f, setF] = useState({ drive_id: "", company: "", role: "", round_type: "", platform: "", duration_minutes: "", difficulty: 3,
    outcome: "cleared", topics: "", questions: [""], tips: "", anonymous: true });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e?.target ? (e.target.type === "checkbox" ? e.target.checked : e.target.value) : e });
  const pick = (shareable || []).find((s) => s.drive_id === f.drive_id);
  const rounds = mode === "linked" && pick ? pick.rounds : ROUNDS;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const body = { round_type: f.round_type, platform: f.platform || null, duration_minutes: f.duration_minutes ? Number(f.duration_minutes) : null,
        difficulty: Number(f.difficulty), outcome: f.outcome, topics: f.topics.split(",").map((t) => t.trim()).filter(Boolean),
        questions: f.questions.map((q) => q.trim()).filter(Boolean), tips: f.tips || null, anonymous: f.anonymous };
      if (mode === "linked") body.drive_id = f.drive_id; else { body.company = f.company; body.role = f.role; }
      onDone(await api("/experiences", { method: "POST", body }));
    } catch (e2) { setErr(e2.message); setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <Tabs value={mode} onChange={setMode} options={[["linked", "From my application"], ["other", "Another company"]]} />
      {mode === "linked" ? (
        <Field label="Application" hint="Linked experiences get a Verified badge.">
          <select className="input" required value={f.drive_id} onChange={(e) => setF({ ...f, drive_id: e.target.value, round_type: "" })}>
            <option value="">{shareable?.length ? "Choose a drive you sat…" : "No applications have reached a round yet"}</option>
            {(shareable || []).map((s) => <option key={s.drive_id} value={s.drive_id}>{s.company} — {s.role}</option>)}
          </select>
        </Field>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Company"><input className="input" required value={f.company} onChange={set("company")} /></Field>
          <Field label="Role"><input className="input" required value={f.role} onChange={set("role")} /></Field>
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Round">
          <select className="input" required value={f.round_type} onChange={set("round_type")}><option value="">Select…</option>{rounds.map((r) => <option key={r}>{r}</option>)}</select>
        </Field>
        <Field label="Platform / mode"><input className="input" placeholder="HackerRank, on campus…" value={f.platform} onChange={set("platform")} /></Field>
        <Field label="Duration (min)"><input type="number" min="5" className="input" value={f.duration_minutes} onChange={set("duration_minutes")} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Difficulty: ${f.difficulty}/5`}><input type="range" min="1" max="5" value={f.difficulty} onChange={set("difficulty")} className="w-full accent-brand-600" /></Field>
        <Field label="Outcome">
          <select className="input" value={f.outcome} onChange={set("outcome")}><option value="cleared">Cleared</option><option value="not_cleared">Not cleared</option><option value="awaiting">Awaiting result</option></select>
        </Field>
      </div>
      <Field label="Questions asked" hint="Add each question separately. Paraphrase — don’t paste confidential test content.">
        <div className="space-y-2">
          {f.questions.map((q, i) => (
            <div key={i} className="flex gap-2">
              <input className="input" value={q} placeholder={i === 0 ? "e.g. Reverse a linked list" : ""} onChange={(e) => { const qs = [...f.questions]; qs[i] = e.target.value; setF({ ...f, questions: qs }); }} />
              {f.questions.length > 1 && <button type="button" className="rounded-full p-2 text-ink-muted hover:bg-black/[.04]" onClick={() => setF({ ...f, questions: f.questions.filter((_, j) => j !== i) })} aria-label="Remove"><X className="h-4 w-4" /></button>}
            </div>
          ))}
          <button type="button" className="text-sm text-brand-700 hover:underline" onClick={() => setF({ ...f, questions: [...f.questions, ""] })}>+ Add a question</button>
        </div>
      </Field>
      <Field label="Topics (comma separated)"><input className="input" placeholder="sql, dbms, arrays" value={f.topics} onChange={set("topics")} /></Field>
      <Field label="Tips for others"><textarea className="input h-24" value={f.tips} onChange={set("tips")} /></Field>
      <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={f.anonymous} onChange={set("anonymous")} className="h-4 w-4 accent-brand-600" /> Post anonymously (only your college is shown)</label>
      <ErrorNote>{err}</ErrorNote>
      <button className="btn-primary w-full py-3" disabled={busy}>{busy ? "Sharing…" : "Share experience"}</button>
    </form>
  );
}

export default function Experiences() {
  const [params, setParams] = useSearchParams();
  const company = params.get("company") || "";
  const [round, setRound] = useState("");
  const [q, setQ] = useState("");
  const [sharing, setSharing] = useState(false);
  const qs = new URLSearchParams({ ...(company && { company }), ...(round && { round_type: round }) }).toString();
  const { data, error, setData, reload } = useApi(`/experiences${qs ? `?${qs}` : ""}`);
  const { data: companies, reload: reloadCompanies } = useApi("/experiences/companies");
  const shown = useMemo(() => (data || []).filter((e) => !q || JSON.stringify([e.company, e.role, e.questions, e.topics]).toLowerCase().includes(q.toLowerCase())), [data, q]);

  const helpful = async (e) => {
    const r = await api(`/experiences/${e.id}/helpful`, { method: "POST" });
    setData(data.map((x) => (x.id === e.id ? { ...x, ...r } : x)));
  };
  const remove = async (e) => {
    if (!window.confirm("Delete your experience?")) return;
    await api(`/experiences/${e.id}`, { method: "DELETE" });
    setData(data.filter((x) => x.id !== e.id));
    reloadCompanies();
  };

  return (
    <>
      <PageHeader eyebrow="Shared by students" title="Interview" accent="experiences."
        subtitle="What was asked in each round, how hard it felt, and what people would do differently. Verified posts come from students who really sat that round."
        action={<button className="btn-primary" onClick={() => setSharing(true)}><Plus className="h-4 w-4" /> Share yours</button>} />

      <div className="mb-8 flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none]">
        <button onClick={() => setParams({})} className={`shrink-0 rounded-2xl border px-5 py-4 text-left transition ${!company ? "border-ink bg-ink text-white" : "border-black/[.06] bg-white hover:border-brand-200"}`}>
          <div className="text-sm font-medium">All companies</div><div className={`text-xs ${!company ? "text-white/60" : "text-ink-muted"}`}>{(companies || []).reduce((n, c) => n + c.count, 0)} experiences</div>
        </button>
        {(companies || []).map((c) => (
          <button key={c.company} onClick={() => setParams({ company: c.company })}
            className={`w-56 shrink-0 rounded-2xl border px-5 py-4 text-left transition ${company === c.company ? "border-ink bg-ink text-white" : "border-black/[.06] bg-white hover:border-brand-200"}`}>
            <div className="truncate text-sm font-medium">{c.company}</div>
            <div className={`mt-0.5 text-xs ${company === c.company ? "text-white/60" : "text-ink-muted"}`}>{c.count} experiences · difficulty {c.avg_difficulty}/5</div>
            <div className="mt-2 truncate text-xs">{c.top_topics.slice(0, 3).join(" · ")}</div>
          </button>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
          <input className="input pl-10" placeholder="Search questions or topics" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Tabs value={round} onChange={setRound} options={[["", "All rounds"], ["Online assessment", "Assessment"], ["Technical interview", "Technical"], ["HR interview", "HR"]]} />
      </div>

      <ErrorNote>{error}</ErrorNote>
      {!data ? <Spinner /> : shown.length === 0 ? (
        <div className="card p-10 text-center text-sm text-ink-muted">No experiences here yet. Be the first to share one.</div>
      ) : (
        <div className="columns-1 gap-6 lg:columns-2 [&>*]:mb-6 [&>*]:break-inside-avoid">
          {shown.map((e, i) => <Reveal key={e.id} delay={(i % 4) * 60}><ExperienceCard e={e} onHelpful={helpful} onDelete={remove} /></Reveal>)}
        </div>
      )}

      <Modal open={sharing} onClose={() => setSharing(false)} title="Share an interview experience" wide>
        <ShareForm onDone={() => { setSharing(false); reload(); reloadCompanies(); }} />
      </Modal>
    </>
  );
}
