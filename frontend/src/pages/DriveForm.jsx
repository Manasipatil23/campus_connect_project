import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, FileText, Loader2, Plus, Sparkles, Trash2, Upload, X } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { ErrorNote, PageHeader, useApi } from "../components/ui";
import { SeasonBatch, seasonBatch } from "../components/forms";

const BRANCHES = ["Computer", "IT", "EXTC", "Electronics", "Mechanical", "AI & DS", "Civil", "Chemical"];
const ROUND_KINDS = ["Online assessment", "Group discussion", "Technical interview", "HR interview", "Other"];

export default function DriveForm() {
  const { user } = useAuth();
  const isCollege = user.role === "coordinator";
  const navigate = useNavigate();
  const { data: directory } = useApi(isCollege ? "/colleges" : "/directory/colleges");
  const colleges = (directory || []).filter((c) => c.connection?.status === "accepted");
  const [f, setF] = useState({
    college_id: "", sections: "Aptitude, Coding, Technical MCQ",
    company: user.company || "", role: "", description: "", ctc_lpa: "", location: "", tier: "regular",
    skills: "", preferred: "", min_cgpa: "6.5", max_backlogs: "0", branches: [], deadline: "",
  });
  const [rounds, setRounds] = useState([{ name: "Online assessment", kind: "Online assessment", date: "", time: "" }]);
  const [confirmed, setConfirmed] = useState(false);
  const [suggested, setSuggested] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [jd, setJd] = useState(null);          // {file_id, name, size} once uploaded
  const [jdBusy, setJdBusy] = useState(false);
  const jdInput = useRef(null);
  const set = (k) => (e) => { setF({ ...f, [k]: e.target.value }); if (k === "skills" || k === "preferred") setConfirmed(false); };
  const toggleBranch = (b) => setF({ ...f, branches: f.branches.includes(b) ? f.branches.filter((x) => x !== b) : [...f.branches, b] });
  const setRound = (i, k, v) => setRounds(rounds.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const uploadJd = async (file) => {
    if (!file) return;
    setError(null); setJdBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const r = await api("/drives/jd-file", { method: "POST", form });
      const replace = !f.description.trim() || window.confirm("Replace the job description you've typed with the text from this file?");
      const have = new Set(f.skills.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
      setF((cur) => ({ ...cur, description: replace ? r.text : cur.description,
        skills: [...have, ...r.skills.filter((s) => !have.has(s))].join(", ") }));
      setSuggested(r.skills);
      setConfirmed(false);
      // remember what the file filled in, so removing the file can take it back out
      setJd({ file_id: r.file_id, name: r.name, size: r.size, filledText: replace, addedSkills: r.skills.filter((x) => !have.has(x)) });
    } catch (e) { setError(e.message); } finally {
      setJdBusy(false);
      if (jdInput.current) jdInput.current.value = "";
    }
  };

  const removeJd = () => {
    const added = new Set(jd?.addedSkills || []);
    setF((cur) => ({
      ...cur,
      description: jd?.filledText ? "" : cur.description,
      skills: cur.skills.split(",").map((x) => x.trim()).filter((x) => x && !added.has(x.toLowerCase())).join(", "),
    }));
    if (jd?.filledText) setSuggested(null);
    setConfirmed(false);
    if (jd?.file_id) api(`/drives/jd-file/${jd.file_id}`, { method: "DELETE" }).catch(() => {});  // tidy up the unused upload
    setJd(null);
  };

  const extract = async () => {
    setError(null);
    try {
      const { skills } = await api("/drives/extract-skills", { method: "POST", body: { description: f.description } });
      setSuggested(skills);
      const have = new Set(f.skills.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
      setF({ ...f, skills: [...have, ...skills.filter((s) => !have.has(s))].join(", ") });
      setConfirmed(false);
    } catch (e) { setError(e.message); }
  };

  const submit = (send) => async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const d = await api("/drives", {
        method: "POST",
        body: {
          company: f.company, role: f.role, description: f.description, ctc_lpa: Number(f.ctc_lpa),
          location: f.location, tier: f.tier, deadline: f.deadline || null,
          college_id: isCollege ? null : f.college_id,
          assessment_sections: f.sections.split(",").map((s) => s.trim()).filter(Boolean),
          required_skills: f.skills.split(",").map((s) => s.trim()).filter(Boolean),
          preferred_skills: f.preferred.split(",").map((s) => s.trim()).filter(Boolean),
          criteria_confirmed: confirmed, submit: send, jd_file_id: jd?.file_id || null,
          rounds: rounds.filter((r) => r.name.trim()).map((r) => ({ ...r, date: r.date || null, time: r.time || null })),
          criteria: {
            min_cgpa: f.min_cgpa === "" ? null : Number(f.min_cgpa),
            max_backlogs: f.max_backlogs === "" ? null : Number(f.max_backlogs),
            branches: f.branches,
            grad_years: [seasonBatch()],
          },
        },
      });
      navigate(`/drives/${d.id}`);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  const checklist = [
    ...(isCollege ? [] : [["College selected", Boolean(f.college_id)]]),
    ["Role and CTC", Boolean(f.role && f.ctc_lpa)],
    ["Job description", f.description.length >= 30],
    ["Required skills", f.skills.trim().length > 0],
    ...(isCollege ? [] : [["Criteria confirmed", confirmed]]),
    ["At least one round", rounds.some((r) => r.name.trim())],
  ];

  return (
    <>
      <PageHeader eyebrow={isCollege ? user.college?.name : user.company} title="New placement" accent="drive."
        subtitle={isCollege
          ? "A drive your placement cell runs itself. It's approved on creation; publish it when you're ready."
          : "Save it as a draft or send it to the placement cell. Students only see it after the college reviews and publishes it."} />
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <form onSubmit={submit(!isCollege)} className="card space-y-6 p-6 sm:p-8">
        {!isCollege && (
          <div>
            <label className="label">College</label>
            <select className="input" value={f.college_id} onChange={set("college_id")} required>
              <option value="" disabled>{colleges.length ? "Which college is this drive for?" : "Connect with a college first"}</option>
              {colleges.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.city} · Tier {c.tier}</option>)}
            </select>
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <div><label className="label">Company</label><input className="input" value={f.company} onChange={set("company")} required disabled={!isCollege} /></div>
          <div><label className="label">Role / department</label><input className="input" value={f.role} onChange={set("role")} required /></div>
          <div><label className="label">CTC (LPA, if shareable)</label><input type="number" step="0.1" min="0.1" className="input" value={f.ctc_lpa} onChange={set("ctc_lpa")} required /></div>
          <div><label className="label">Location</label><input className="input" value={f.location} onChange={set("location")} /></div>
          <div>
            <label className="label">Tier</label>
            <select className="input" value={f.tier} onChange={set("tier")}>
              <option value="regular">Regular</option><option value="dream">Dream (open to placed students)</option>
            </select>
          </div>
          <div><label className="label">Application deadline</label><input type="date" className="input" value={f.deadline} onChange={set("deadline")} /></div>
        </div>

        <div>
          <div className="mb-1.5 flex flex-wrap items-end justify-between gap-2">
            <label className="label mb-0" htmlFor="jd-text">Job description</label>
            <input ref={jdInput} type="file" accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              className="hidden" onChange={(e) => uploadJd(e.target.files?.[0])} />
            {!jd && (
              <button type="button" className="btn-soft px-3 py-1.5 text-xs" disabled={jdBusy} onClick={() => jdInput.current?.click()}>
                {jdBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {jdBusy ? "Reading file…" : "Upload JD (PDF or Word)"}
              </button>
            )}
          </div>
          {jd && (
            <div className="mb-2 flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-2 text-sm">
              <FileText className="h-4 w-4 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{jd.name}</div>
                <div className="text-xs text-ink-muted">{Math.max(1, Math.round(jd.size / 1024))} KB · attached for students to download · text copied below</div>
              </div>
              <button type="button" className="rounded-full p-1 text-ink-muted hover:bg-white hover:text-ink" title="Remove file and the text it filled in" onClick={removeJd}><X className="h-4 w-4" /></button>
            </div>
          )}
          <textarea id="jd-text" className="input h-36" value={f.description} onChange={set("description")} required minLength={30}
            placeholder="Paste the JD here, or upload the PDF/Word file above to fill this in." />
        </div>

        <fieldset className="rounded-2xl border border-brand-100 bg-brand-50/30 p-5">
          <legend className="px-1 text-sm font-medium">Screening criteria</legend>
          <p className="mb-4 text-xs text-ink-muted">Resumes are compared against exactly these skills. The system suggests them from the JD; you edit and confirm. Nobody is rejected automatically.</p>
          <button type="button" className="btn-soft mb-4" onClick={extract} disabled={f.description.length < 20}><Sparkles className="h-4 w-4" /> Suggest skills from the JD</button>
          {suggested && <p className="mb-3 text-xs text-ink-muted">Found {suggested.length ? suggested.join(", ") : "no known skills"} in the JD.</p>}
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Required (must show)</label><input className="input" value={f.skills} onChange={set("skills")} placeholder="python, sql, docker" /></div>
            <div><label className="label">Preferred (nice to have)</label><input className="input" value={f.preferred} onChange={set("preferred")} placeholder="aws, power bi" /></div>
          </div>
          {!isCollege && (
            <label className="mt-4 flex items-start gap-2 text-sm">
              <input type="checkbox" className="mt-0.5 accent-brand-600" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              I've reviewed these criteria and they reflect what we'll screen for.
            </label>
          )}
        </fieldset>

        <fieldset className="rounded-2xl border border-black/[.06] p-5">
          <legend className="px-1 text-sm font-medium">Eligibility</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Min CGPA</label><input type="number" step="0.1" className="input" value={f.min_cgpa} onChange={set("min_cgpa")} /></div>
            <div><label className="label">Max backlogs</label><input type="number" min="0" className="input" value={f.max_backlogs} onChange={set("max_backlogs")} /></div>
          </div>
          <div className="mt-4"><div className="label">Graduating batch</div><SeasonBatch /></div>
          <div className="mt-4">
            <div className="label">Branches (none selected = all)</div>
            <div className="flex flex-wrap gap-2">
              {BRANCHES.map((b) => (
                <button type="button" key={b} onClick={() => toggleBranch(b)}
                  className={`chip px-3 py-1 text-sm ${f.branches.includes(b) ? "bg-brand-600 text-white" : "border border-black/10 bg-white text-ink-muted"}`}>{b}</button>
              ))}
            </div>
          </div>
        </fieldset>

        <fieldset className="rounded-2xl border border-black/[.06] p-5">
          <legend className="px-1 text-sm font-medium">Selection rounds</legend>
          <p className="mb-4 text-xs text-ink-muted">Only include the rounds this drive uses. Dates are tentative until the placement cell confirms them.</p>
          <div className="space-y-3">
            {rounds.map((r, i) => (
              <div key={i} className="grid gap-2 sm:grid-cols-[1.4fr_1.2fr_1fr_.8fr_auto]">
                <input className="input" placeholder="Round name" value={r.name} onChange={(e) => setRound(i, "name", e.target.value)} />
                <select className="input" value={r.kind} onChange={(e) => setRound(i, "kind", e.target.value)}>{ROUND_KINDS.map((k) => <option key={k}>{k}</option>)}</select>
                <input type="date" className="input" value={r.date} onChange={(e) => setRound(i, "date", e.target.value)} />
                <input type="time" className="input" value={r.time} onChange={(e) => setRound(i, "time", e.target.value)} />
                <button type="button" className="rounded-full p-2 text-ink-muted hover:bg-rose-50 hover:text-rose-600" onClick={() => setRounds(rounds.filter((_, j) => j !== i))} aria-label="Remove round"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <button type="button" className="btn-ghost mt-3 px-3 py-1.5" onClick={() => setRounds([...rounds, { name: "", kind: "Technical interview", date: "", time: "" }])}><Plus className="h-4 w-4" /> Add round</button>
          <div className="mt-4"><label className="label">Assessment sections (scored per candidate)</label><input className="input" value={f.sections} onChange={set("sections")} /></div>
        </fieldset>

        <ErrorNote>{error}</ErrorNote>
        <div className="flex flex-wrap gap-2">
          {isCollege ? <button className="btn-primary" disabled={busy}>{busy ? "Saving…" : "Create drive"}</button> : (
            <>
              <button className="btn-primary" disabled={busy || !confirmed}>{busy ? "Sending…" : "Send to placement cell"}</button>
              <button type="button" className="btn-ghost" disabled={busy} onClick={submit(false)}>Save draft</button>
            </>
          )}
        </div>
      </form>

      <aside className="space-y-4 lg:sticky lg:top-24">
        <div className="card p-6">
          <div className="flex items-baseline justify-between">
            <h2 className="font-medium">Ready to send</h2>
            <span className="text-sm tabular-nums text-ink-muted">{checklist.filter(([, ok]) => ok).length}/{checklist.length}</span>
          </div>
          <div className="mt-3 h-1.5 rounded-full bg-brand-50">
            <div className="h-1.5 rounded-full bg-gradient-to-r from-brand-400 to-brand-700 transition-all" style={{ width: `${(100 * checklist.filter(([, ok]) => ok).length) / checklist.length}%` }} />
          </div>
          <ul className="mt-4 space-y-2.5 text-sm">
            {checklist.map(([label, ok]) => (
              <li key={label} className={`flex items-center gap-2 ${ok ? "text-ink" : "text-ink-muted"}`}>
                {ok ? <Check className="h-4 w-4 text-emerald-600" /> : <span className="h-4 w-4 rounded-full border border-black/15" />}{label}
              </li>
            ))}
          </ul>
        </div>
        <div className="card p-6">
          <h2 className="font-medium">What happens next</h2>
          <ol className="mt-4 space-y-4 text-sm">
            {(isCollege
              ? [["Created", "Approved straight away, since your college runs it"], ["Publish", "Eligible students are notified"], ["Run rounds", "Confirm dates and track applicants"]]
              : [["Placement cell reviews", "They approve it or ask for changes"], ["Published to students", "Only eligible students see it"], ["You screen applicants", "Resumes are compared with your JD"]]
            ).map(([t, d], i) => (
              <li key={t} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-medium text-brand-700">{i + 1}</span>
                <div><div className="font-medium">{t}</div><div className="text-xs text-ink-muted">{d}</div></div>
              </li>
            ))}
          </ol>
        </div>
      </aside>
      </div>
    </>
  );
}
