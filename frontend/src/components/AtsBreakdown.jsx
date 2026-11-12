import { CheckCircle2, Sparkles, XCircle } from "lucide-react";
import { Bar, ScoreRing } from "./ui";

export function AtsBreakdown({ ats }) {
  const rows = [
    ["Skill coverage", ats.skill_coverage, "40%"],
    ["JD similarity", ats.similarity == null ? null : Math.min(100, (ats.similarity / 0.35) * 100), "30%"],
    ["Structure", ats.structure, "20%"],
    ["Quantified impact", ats.impact, "10%"],
  ].filter((r) => r[1] != null);

  return (
    <div className="grid gap-6 sm:grid-cols-[auto_1fr]">
      <div className="flex justify-center"><ScoreRing score={ats.score} label="ATS" /></div>
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
      </div>
      <div className="sm:col-span-2 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-ink-muted mb-2">Matched skills</div>
          <div className="flex flex-wrap gap-1.5">
            {ats.matched_skills.length ? ats.matched_skills.map((s) => (
              <span key={s} className="chip bg-emerald-50 text-emerald-700"><CheckCircle2 className="mr-1 h-3 w-3" />{s}</span>
            )) : <span className="text-sm text-ink-muted/70">None</span>}
          </div>
        </div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-ink-muted mb-2">Missing skills</div>
          <div className="flex flex-wrap gap-1.5">
            {ats.missing_skills.length ? ats.missing_skills.map((s) => (
              <span key={s} className="chip bg-rose-50 text-rose-700"><XCircle className="mr-1 h-3 w-3" />{s}</span>
            )) : <span className="text-sm text-ink-muted/70">None — great coverage</span>}
          </div>
        </div>
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
