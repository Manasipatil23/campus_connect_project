import { useState } from "react";
import { Link } from "react-router-dom";
import { Ban, Calendar, ChevronRight, MapPin, Search } from "lucide-react";
import { api } from "../api";
import { AtsBreakdown, Review } from "../components/AtsBreakdown";
import { Badge, Empty, ErrorNote, Modal, PageHeader, Spinner, Tabs, scoreColor, useApi } from "../components/ui";

export default function StudentDrives() {
  const { data, error, reload } = useApi("/drives");
  const [filter, setFilter] = useState("eligible");
  const [match, setMatch] = useState(null); // {drive, result, loading, error}
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;

  const shown = data.filter((d) =>
    filter === "all" ? true : filter === "eligible" ? d.accepting && d.eligible && !d.applied : d.applied);

  const checkMatch = async (drive) => {
    setMatch({ drive, loading: true });
    try {
      setMatch({ drive, result: await api(`/students/me/resume/match/${drive.id}`) });
    } catch (e) {
      setMatch({ drive, error: e.message });
    }
  };

  const apply = async (drive) => {
    setBusy(drive.id);
    setNotice(null);
    try {
      const res = await api(`/drives/${drive.id}/apply`, { method: "POST" });
      setNotice({ ok: true, text: `Applied to ${drive.company} — ${drive.role}. Match score ${res.ats_score}.` });
      reload();
    } catch (e) {
      setNotice({ ok: false, text: e.message });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Your college's drives" title="Placement" accent="drives."
        subtitle="Only drives your placement cell has published are listed. Eligibility is checked against your profile, and the match score compares your resume with each job." />
      <div className="mb-6">
        <Tabs value={filter} onChange={setFilter} options={[["eligible", "Open & eligible"], ["applied", "Applied"], ["all", "All drives"]]} />
      </div>
      {notice && <div className={`mb-6 rounded-xl px-4 py-2.5 text-sm ${notice.ok ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-700"}`}>{notice.text}</div>}

      {shown.length === 0 ? <div className="card"><Empty>No drives here.</Empty></div> : (
        <div className="grid gap-4 md:grid-cols-2">
          {shown.map((d) => (
            <div key={d.id} className="card flex flex-col p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-ink-muted">{d.company}</div>
                  <Link to={`/drives/${d.id}`} className="text-xl font-medium tracking-tight hover:text-brand-700">{d.role}</Link>
                </div>
                <div className="text-right">
                  <div className="text-xl font-medium">{d.ctc_lpa} <span className="text-xs font-normal text-ink-muted">LPA</span></div>
                  {d.match_score != null && <div className={`text-xs font-medium ${scoreColor(d.match_score)}`}>{d.match_score} match</div>}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-muted">
                <Badge value={d.status} label={d.accepting ? "Applications open" : d.status_label} />
                {d.tier === "dream" && <Badge value="dream" />}
                <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{d.location}</span>
                {d.deadline && <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{d.deadline}</span>}
                <span>· {d.applicants} applied</span><Link to={`/experiences?company=${encodeURIComponent(d.company)}`} className="text-brand-700 hover:underline">· Interview experiences →</Link>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {d.required_skills.map((s) => <span key={s} className="chip bg-black/[.04] text-ink-soft">{s}</span>)}
              </div>
              <div className="mt-3 text-xs text-ink-muted">
                Min CGPA {d.criteria.min_cgpa ?? "—"} · max backlogs {d.criteria.max_backlogs ?? "—"}
                {d.criteria.branches?.length > 0 && ` · ${d.criteria.branches.join(", ")}`}
              </div>
              {d.pending_fields?.length > 0 && (
                <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Update pending confirmation — details may change once the placement cell verifies them.</div>
              )}
              {d.rounds?.length > 0 && (
                <div className="mt-3 text-xs text-ink-muted">
                  Next: {(() => { const r = d.rounds.find((x) => x.status !== "cancelled"); return r ? `${r.name} — ${r.date ? r.date : r.note}` : "—"; })()}
                </div>
              )}
              {!d.eligible && (
                <div className="mt-4 flex gap-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  <Ban className="h-4 w-4 shrink-0" /> {d.ineligible_reasons.join("; ")}
                </div>
              )}
              <div className="mt-auto flex gap-2 pt-5">
                <button className="btn-ghost flex-1" onClick={() => checkMatch(d)}><Search className="h-4 w-4" /> Check match</button>
                {d.applied ? (
                  <Link to={`/applications/${d.application.id}`} className="btn-soft flex-1">
                    {d.application.status === "rejected" ? "See why" : "Track"} <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <button className="btn-primary flex-1" disabled={!d.eligible || !d.accepting || busy === d.id} onClick={() => apply(d)}>
                    {busy === d.id ? "Applying…" : "Apply"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={Boolean(match)} onClose={() => setMatch(null)} wide
        title={match ? `Resume match · ${match.drive.company} ${match.drive.role}` : ""}>
        {match?.loading && <Spinner label="Scoring your resume against this job…" />}
        <ErrorNote>{match?.error}</ErrorNote>
        {match?.result && (
          <div className="space-y-6">
            <AtsBreakdown ats={match.result.ats} />
            <div className="border-t border-black/[.06] pt-4"><Review review={match.result.review} /></div>
          </div>
        )}
      </Modal>
    </>
  );
}
