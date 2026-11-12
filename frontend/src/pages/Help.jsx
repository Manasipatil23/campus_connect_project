import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { LifeBuoy, Send } from "lucide-react";
import { api } from "../api";
import { Badge, Empty, ErrorNote, PageHeader, Spinner, ago, fmtTime, useApi } from "../components/ui";

const CATEGORIES = ["Unclear update", "Schedule", "Eligibility", "Application status", "Technical problem", "Other"];
const STEPS = ["open", "in_progress", "resolved"];

export default function Help() {
  const [params] = useSearchParams();
  const { data, error, reload } = useApi("/issues");
  const { data: drives } = useApi("/drives");
  const [f, setF] = useState({ category: params.get("drive") ? "Unclear update" : "Schedule", subject: "", description: "", drive_id: params.get("drive") || "" });
  const [err, setErr] = useState(null);
  const [ok, setOk] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault(); setErr(null); setOk(false);
    try { await api("/issues", { method: "POST", body: { ...f, drive_id: f.drive_id || null } }); setF({ ...f, subject: "", description: "" }); setOk(true); reload(); }
    catch (e2) { setErr(e2.message); }
  };
  return (
    <>
      <PageHeader eyebrow="Placement cell" title="Raise an" accent="issue."
        subtitle="Unclear update, schedule clash, eligibility question? Your placement cell sees it, assigns someone and you can track it here. Only you and placement staff can see your issues." />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <form onSubmit={submit} className="card h-fit space-y-4 p-6">
          <h2 className="flex items-center gap-2 font-medium"><LifeBuoy className="h-4 w-4 text-brand-600" /> New issue</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="label">Category</label><select className="input" value={f.category} onChange={set("category")}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label">Related drive (optional)</label>
              <select className="input" value={f.drive_id} onChange={set("drive_id")}>
                <option value="">None</option>
                {(drives || []).map((d) => <option key={d.id} value={d.id}>{d.company} · {d.role}</option>)}
              </select></div>
          </div>
          <div><label className="label">Subject</label><input className="input" value={f.subject} onChange={set("subject")} required minLength={4} /></div>
          <div><label className="label">What happened?</label><textarea className="input h-28" value={f.description} onChange={set("description")} required minLength={10} /></div>
          <ErrorNote>{err}</ErrorNote>
          {ok && <div className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">Sent to your placement cell.</div>}
          <button className="btn-primary"><Send className="h-4 w-4" /> Submit</button>
        </form>

        <div className="space-y-4">
          <ErrorNote>{error}</ErrorNote>
          {!data ? <Spinner /> : data.length === 0 ? <div className="card"><Empty>You haven't raised any issues.</Empty></div> : data.map((i) => {
            const at = STEPS.indexOf(i.status === "waiting" ? "in_progress" : i.status === "closed" ? "resolved" : i.status);
            return (
              <article key={i.id} className="card p-6">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-medium">{i.subject}</h2><Badge value={i.status} label={i.status_label} />
                </div>
                <div className="mt-1 text-xs text-ink-muted">{i.category}{i.drive_label && ` · ${i.drive_label}`} · raised {fmtTime(i.created_at)}{i.owner_name && ` · handled by ${i.owner_name}`}</div>
                <div className="mt-4 flex items-center gap-2">
                  {STEPS.map((s, k) => <div key={s} className={`h-1.5 flex-1 rounded-full ${k <= at ? "bg-brand-500" : "bg-black/[.06]"}`} />)}
                </div>
                <p className="mt-4 text-sm text-ink-soft">{i.description}</p>
                {i.replies?.map((r, k) => (
                  <div key={k} className="mt-3 rounded-xl bg-brand-50/60 p-3 text-sm">{r.text}<div className="mt-1 text-xs text-ink-muted">{r.by} · {ago(r.at)}</div></div>
                ))}
              </article>
            );
          })}
        </div>
      </div>
    </>
  );
}
