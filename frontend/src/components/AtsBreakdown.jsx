import { CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { Bar, ScoreRing } from "./ui";

export function AtsBreakdown({ ats }) {
  // older saved scores have no mode/weights: they were always job-style weights
  const job = ats.mode ? ats.mode === "job" : ats.similarity != null;
  const w = ats.weights || (job ? { skills: 0.4, similarity: 0.3, structure: 0.2, impact: 0.1 } : { skills: 0.45, similarity: 0, structure: 0.35, impact: 0.2 });
  const pct = (x) => `${Math.round(x * 100)}%`;
  const rows = [
    [job ? "Skill coverage" : "Skill breadth", ats.skill_coverage, pct(w.skills)],
    job && ["JD similarity", Math.min(100, (ats.similarity / 0.35) * 100), pct(w.similarity)],
    ["Structure", ats.structure, pct(w.structure)],
    ["Quantified impact", ats.impact, pct(w.impact)],
  ].filter(Boolean);

  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
      <div className="flex flex-col items-center gap-2">
        <ScoreRing score={ats.score} label={job ? "Job match" : "Quality"} />
        {!job && <p className="max-w-[10rem] text-center text-[11px] leading-snug text-ink-muted">General resume quality. Open a drive to see your match for that job.</p>}
      </div>
      <div className="space-y-3">
        {rows.map(([label, v, w]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-sm">
              <span>{label} <span className="text-xs text-ink-muted/70">weight {w}</span></span>
              <span className="tabular-nums font-medium">{Math.round(v)}%</span>
            </div>
            <Bar value={v} />
          </div>
        ))}
        {ats.length_penalty && <p className="text-xs text-amber-700">−5 points: aim for 250–900 words (yours has {ats.word_count}).</p>}
      </div>
      <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-ink-muted mb-2">{job ? "Matched skills" : "Skills found"}</div>
          <div className="flex flex-wrap gap-1.5">
            {ats.matched_skills.length ? ats.matched_skills.map((s) => (
              <span key={s} className="chip bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />{s}</span>
            )) : <span className="text-sm text-ink-muted/70">None</span>}
          </div>
        </div>
        {job && <div>
          <div className="text-xs font-medium uppercase tracking-wide text-ink-muted mb-2">Missing skills</div>
          <div className="flex flex-wrap gap-1.5">
            {ats.missing_skills.length ? ats.missing_skills.map((s) => (
              <span key={s} className="chip bg-rose-50 text-rose-700"><XCircle className="mr-1 h-3 w-3" />{s}</span>
            )) : <span className="text-sm text-ink-muted/70">None — great coverage</span>}
          </div>
        </div>}
        {ats.sections_missing.length > 0 && (
          <div className="sm:col-span-2 text-sm text-ink-muted">
            Missing sections: <span className="font-medium">{ats.sections_missing.join(", ")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export function Review({ review }) {
  if (!review) return null;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm">
        <Sparkles className="h-4 w-4 text-brand-500" />
        <span className="font-medium">{review.summary}</span>
        <span className="chip bg-black/[.04] text-ink-muted ml-auto">{review.source === "llm" ? "AI review" : "Rule-based review"}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-emerald-700 mb-2">Strengths</div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">{review.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-amber-700 mb-2">Improve</div>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">{review.improvements.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      </div>
      {review.rewritten_bullets?.length > 0 && (
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-ink-muted mb-2">Suggested rewrites</div>
          <div className="space-y-2">
            {review.rewritten_bullets.map((b, i) => (
              <div key={i} className="rounded-xl border border-black/[.06] p-3 text-sm">
                <div className="text-ink-muted/70 line-through">{b.before}</div>
                <div className="mt-1 text-ink-soft">{b.after}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
