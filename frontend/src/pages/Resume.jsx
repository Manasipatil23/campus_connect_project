import { useRef, useState } from "react";
import { ClipboardPaste, UploadCloud } from "lucide-react";
import { api } from "../api";
import { useAuth } from "../auth";
import { AtsBreakdown, Review } from "../components/AtsBreakdown";
import { ErrorNote, PageHeader, Spinner } from "../components/ui";

export default function Resume() {
  const { user, refresh } = useAuth();
  const [resume, setResume] = useState(user.resume);
  const [mode, setMode] = useState("upload");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
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
      <PageHeader title="Resume & ATS score"
        subtitle="Upload a PDF to get an ATS score and feedback. Use “Check match” on a drive to score against a specific job." />
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
            <div className="mt-4 text-xs text-ink-muted">
              Current: <span className="font-medium text-ink-soft">{resume.filename}</span> · {resume.ats.word_count} words
            </div>
          )}
        </div>

        <div className="lg:col-span-3 space-y-6">
          {busy ? <div className="card"><Spinner label="Parsing and scoring your resume…" /></div> : resume ? (
            <>
              <div className="card p-5"><h2 className="mb-4 font-medium">ATS breakdown</h2><AtsBreakdown ats={resume.ats} /></div>
              {resume.review && <div className="card p-5"><h2 className="mb-4 font-medium">Feedback</h2><Review review={resume.review} /></div>}
            </>
          ) : (
            <div className="card p-10 text-center text-sm text-ink-muted">No resume yet. Upload one to see your score.</div>
          )}
        </div>
      </div>
    </>
  );
}
