import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ClipboardPaste, Download, Eye, UploadCloud } from "lucide-react";
import { api, downloadFile, fileUrl } from "../api";
import { useAuth } from "../auth";
import { AtsBreakdown, Review } from "../components/AtsBreakdown";
import { Badge, ErrorNote, Modal, PageHeader, Spinner, Tabs, fmtDate, useApi } from "../components/ui";

/** Shows the current resume: the uploaded PDF itself, or the text that was read from it. */
function ResumePreview({ resume, open, onClose }) {
  const file = resume.file;
  const isPdf = file?.content_type === "application/pdf";
  const [url, setUrl] = useState(null);
  const [err, setErr] = useState(null);
  const [view, setView] = useState(isPdf ? "file" : "text");

  useEffect(() => {
    if (!open || !isPdf) return undefined;
    let live = true, made = null;
    setErr(null); setUrl(null);
    fileUrl("/students/me/resume/file").then((u) => { made = u; if (live) setUrl(u); else URL.revokeObjectURL(u); })
      .catch((e) => live && setErr(e.message));
    return () => { live = false; if (made) URL.revokeObjectURL(made); };
  }, [open, isPdf, file?.id]);

  return (
    <Modal open={open} onClose={onClose} title={`Preview · ${resume.filename}`} wide>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {isPdf && <Tabs value={view} onChange={setView} options={[["file", "Your PDF"], ["text", "Text we read"]]} />}
        {file && <button className="btn-ghost ml-auto px-3 py-1.5 text-xs" onClick={() => downloadFile("/students/me/resume/file", file.name).catch((e) => setErr(e.message))}>
          <Download className="h-3.5 w-3.5" /> Download</button>}
      </div>
      <ErrorNote>{err}</ErrorNote>
      {view === "file" && isPdf ? (
        url ? <iframe src={url} title="Resume preview" className="h-[70vh] w-full rounded-xl border border-black/[.06] bg-white" />
          : !err && <Spinner label="Opening your resume…" />
      ) : (
        <>
          <p className="mb-2 text-xs text-ink-muted">
            {file ? "This is the text recruiters' screening reads from your file. If something is missing here, it can't be matched."
              : "Only the text of this resume is saved. Upload the file again to preview it as it looks."}
          </p>
          <pre className="max-h-[65vh] overflow-auto whitespace-pre-wrap rounded-xl bg-black/[.03] p-4 font-sans text-sm leading-relaxed text-ink-soft">{resume.text}</pre>
        </>
      )}
    </Modal>
  );
}

function Tile({ value, label, hint, tone = "text-ink" }) {
  return (
    <div className="rounded-2xl border border-black/[.06] bg-white p-4">
      <div className={`text-3xl font-medium tabular-nums tracking-tight ${tone}`}>{value}</div>
      <div className="mt-1 text-sm">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-muted">{hint}</div>}
    </div>
  );
}

function rowState(r) {
  if (r.application) return ["applied", <Link to={`/applications/${r.application.id}`} className="text-brand-700 hover:underline"><Badge value={r.application.status} /></Link>];
  if (!r.eligible) return ["ineligible", <span className="text-xs text-ink-muted" title={r.ineligible_reasons.join("; ")}>Not eligible</span>];
  if (r.open) return ["open", <Link to={`/drives/${r.drive_id}`} className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">Apply by {fmtDate(r.deadline)} <ArrowRight className="h-3 w-3" /></Link>];
  return ["missed", <span className="chip bg-amber-50 text-amber-700">Missed</span>];
}

/** Every drive that came to campus vs. what your resume shows. */
function DriveFit() {
  const { data, error } = useApi("/students/me/drive-fit");
  const [tab, setTab] = useState("fits");
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <div className="card"><Spinner label="Comparing your resume with every campus drive…" /></div>;
  if (!data.has_resume) return null;
  const s = data.summary;
  const rows = data.drives.filter((r) => tab === "all" || (tab === "fits" ? r.fits : r.fits && !r.application));
  return (
    <section className="card p-6">
      <h2 className="font-medium">Campus drives vs your skills</h2>
      <p className="mt-1 text-sm text-ink-muted">A drive fits your skills when your resume shows at least {data.threshold}% of its required skills.</p>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile value={s.total} label="Came to campus" />
        <Tile value={s.fits} label="Fit your skills" hint={s.total ? `${Math.round((100 * s.fits) / s.total)}% of drives` : ""} tone="text-brand-700" />
        <Tile value={s.applied} label="Applied" hint="of the ones that fit" tone="text-emerald-700" />
        <Tile value={s.not_applied} label="Didn't apply" hint={`${s.can_still_apply} still open · ${s.missed} missed`} tone={s.not_applied ? "text-amber-700" : "text-ink"} />
      </div>

      <div className="mt-6 overflow-x-auto"><Tabs value={tab} onChange={setTab} options={[["fits", `Fit your skills (${s.fits})`], ["gap", `Fit but not applied (${s.not_applied})`], ["all", `All drives (${s.total})`]]} /></div>
      {rows.length === 0 ? <p className="mt-6 text-sm text-ink-muted">Nothing here.</p> : (
        <ul className="mt-4 divide-y divide-black/[.05]">
          {rows.map((r) => {
            const [, state] = rowState(r);
            return (
              <li key={r.drive_id} className="grid gap-3 py-4 sm:grid-cols-[1.4fr_1fr_auto] sm:items-center">
                <div className="min-w-0">
                  <Link to={`/drives/${r.drive_id}`} className="font-medium hover:text-brand-700">{r.role}</Link>
                  <div className="text-xs text-ink-muted">{r.company} · {r.ctc_lpa} LPA · {r.open ? "open" : "closed"}</div>
                  {r.missing_skills.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">{r.missing_skills.map((m) => <span key={m} className="chip bg-rose-50 text-rose-600">{m}</span>)}</div>
                  )}
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-xs"><span className="text-ink-muted">Skills shown</span>
                    <span className="tabular-nums">{r.matched_skills.length}/{r.matched_skills.length + r.missing_skills.length}</span></div>
                  <div className="h-1.5 rounded-full bg-brand-50"><div className={`h-1.5 rounded-full ${r.fits ? "bg-gradient-to-r from-brand-400 to-brand-700" : "bg-black/20"}`} style={{ width: `${r.skill_fit}%` }} /></div>
                  <div className="mt-1 text-[11px] text-ink-muted">Job match {r.match}</div>
                </div>
                <div className="sm:text-right">{state}</div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export default function Resume() {
  const { user, refresh } = useAuth();
  const [resume, setResume] = useState(user.resume);
  const [mode, setMode] = useState("upload");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(false);
  const fileRef = useRef();

  const run = async (req) => {
    setBusy(true);
    setError(null);
    try {
      setResume(await req());
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const upload = (file) => {
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    run(() => api("/students/me/resume", { method: "POST", form }));
  };

  return (
    <>
      <PageHeader title="Resume" accent="score."
        subtitle="Without a job, this is a general quality score: skills, sections and quantified impact. Open a drive to score against its JD." />
      <div className="grid gap-6 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-2 h-fit">
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-xl bg-black/[.04] p-1">
            {[["upload", "Upload file"], ["paste", "Paste text"]].map(([k, l]) => (
              <button key={k} onClick={() => setMode(k)}
                className={`rounded-md py-1.5 text-sm font-medium ${mode === k ? "bg-white shadow-sm" : "text-ink-muted"}`}>{l}</button>
            ))}
          </div>
          {mode === "upload" ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files[0]); }}
              onClick={() => fileRef.current.click()}
              className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-black/10 p-8 text-center hover:border-brand-500 hover:bg-brand-50/40">
              <UploadCloud className="h-8 w-8 text-brand-500" />
              <div className="mt-2 text-sm font-medium">Drop your resume or click to browse</div>
              <div className="text-xs text-ink-muted">PDF or .txt, up to 5 MB</div>
              <input ref={fileRef} type="file" accept=".pdf,.txt,.md" className="hidden" onChange={(e) => upload(e.target.files[0])} />
            </div>
          ) : (
            <div className="space-y-3">
              <textarea className="input h-64 font-mono text-xs" placeholder="Paste your resume text…" value={text} onChange={(e) => setText(e.target.value)} />
              <button className="btn-primary w-full" disabled={busy || text.trim().length < 50}
                onClick={() => run(() => api("/students/me/resume/text", { method: "POST", body: { text } }))}>
                <ClipboardPaste className="h-4 w-4" /> Analyze
              </button>
            </div>
          )}
          <div className="mt-4"><ErrorNote>{error}</ErrorNote></div>
          {resume && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-ink-muted">
              <span className="min-w-0">Current: <span className="font-medium text-ink-soft [overflow-wrap:anywhere]">{resume.filename}</span> · {resume.ats.word_count} words</span>
              <button className="btn-soft ml-auto px-3 py-1.5 text-xs" onClick={() => setPreview(true)}><Eye className="h-3.5 w-3.5" /> Preview</button>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 space-y-6">
          {busy ? <div className="card"><Spinner label="Parsing and scoring your resume…" /></div> : resume ? (
            <>
              <div className="card p-5"><h2 className="mb-4 font-medium">Score breakdown</h2><AtsBreakdown ats={resume.ats} /></div>
              {resume.review && <div className="card p-5"><h2 className="mb-4 font-medium">Feedback</h2><Review review={resume.review} /></div>}
            </>
          ) : (
            <div className="card p-10 text-center text-sm text-ink-muted">No resume yet. Upload one to see your score.</div>
          )}
        </div>
      </div>
      {resume && <div className="mt-6"><DriveFit key={resume.updated_at} /></div>}
      {/* outside the cards: their blur would trap a fixed-position window inside them */}
      {resume && <ResumePreview key={resume.updated_at} resume={resume} open={preview} onClose={() => setPreview(false)} />}
    </>
  );
}
