import { Link } from "react-router-dom";
import {
  ArrowRight, Check, ChevronRight, Lightbulb, MessageSquareQuote, PartyPopper, Sparkles, Target, TrendingDown, TrendingUp, X,
} from "lucide-react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { useAuth } from "../auth";
import { Reveal } from "../components/fx/motion";
import { Badge, ErrorNote, PageHeader, ScoreRing, Spinner, ago, scoreColor, useApi } from "../components/ui";

function Column({ tone, icon: Icon, title, items, empty }) {
  const t = {
    good: ["text-emerald-600", "bg-emerald-50", "border-emerald-100"],
    bad: ["text-rose-500", "bg-rose-50", "border-rose-100"],
    focus: ["text-brand-600", "bg-brand-50", "border-brand-100"],
  }[tone];
  return (
    <div className={`card flex flex-col p-6`}>
      <div className="mb-5 flex items-center gap-2">
        <span className={`flex h-8 w-8 items-center justify-center rounded-full ${t[1]}`}><Icon className={`h-4 w-4 ${t[0]}`} /></span>
        <h2 className="font-medium">{title}</h2>
        <span className="ml-auto text-xs text-ink-muted">{items.length}</span>
      </div>
      {items.length === 0 ? <p className="text-sm text-ink-muted">{empty}</p> : (
        <ul className="space-y-3">
          {items.map((x, i) => (
            <li key={i} className={`rounded-2xl border ${t[2]} bg-white p-4`}>
              <div className="flex items-start gap-3">
                {tone === "focus" && <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-xs text-white">{i + 1}</span>}
                <div className="min-w-0">
                  <div className="text-sm font-medium">{x.title}</div>
                  <div className="mt-1 text-sm text-ink-muted">{x.detail}</div>
                  {x.impact && <div className="mt-2 inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-xs text-brand-700">{x.area} · {x.impact}</div>}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RoundBars({ rows }) {
  return (
    <div className="space-y-5">
      {rows.map((r) => (
        <div key={r.round}>
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span>{r.round}</span>
            <span className="text-ink-muted">{r.attempted ? <><b className="font-medium text-ink">{r.cleared}/{r.attempted}</b> cleared</> : "not reached yet"}</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-3 text-xs">
              <span className="w-14 text-ink-muted">You</span>
              <div className="h-2 flex-1 rounded-full bg-brand-50"><div className="h-2 rounded-full bg-gradient-to-r from-brand-400 to-brand-700 transition-all duration-700" style={{ width: `${r.rate ?? 0}%` }} /></div>
              <span className="w-10 text-right tabular-nums">{r.rate ?? "—"}{r.rate != null && "%"}</span>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="w-14 text-ink-muted">College</span>
              <div className="h-2 flex-1 rounded-full bg-black/[.04]"><div className="h-2 rounded-full bg-black/20" style={{ width: `${r.college_rate ?? 0}%` }} /></div>
              <span className="w-10 text-right tabular-nums text-ink-muted">{r.college_rate ?? "—"}{r.college_rate != null && "%"}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Skills({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.drives));
  return (
    <ul className="space-y-3">
      {rows.map((s) => (
        <li key={s.skill} className="grid grid-cols-[130px_1fr_auto] items-center gap-3 text-sm">
          <span className="flex items-center gap-2 truncate">
            {s.you ? <Check className="h-4 w-4 shrink-0 text-emerald-600" /> : <X className="h-4 w-4 shrink-0 text-rose-500" />}
            <span className={s.you ? "" : "font-medium"}>{s.skill}</span>
          </span>
          <div className="h-2 rounded-full bg-brand-50">
            <div className={`h-2 rounded-full ${s.you ? "bg-emerald-300" : "bg-gradient-to-r from-brand-400 to-brand-700"}`} style={{ width: `${(100 * s.drives) / max}%` }} />
          </div>
          <span className="whitespace-nowrap text-xs text-ink-muted">{s.drives} drive{s.drives === 1 ? "" : "s"}{s.open_drives ? ` · ${s.open_drives} open` : ""}</span>
        </li>
      ))}
    </ul>
  );
}

export default function Insights() {
  const { user } = useAuth();
  const { data: a, error } = useApi("/students/me/analytics");
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!a) return <Spinner label="Crunching your season…" />;
  const rejected = a.timeline.filter((t) => t.status === "rejected" && ["resume_screening", "assessment"].includes(t.rejected_round));

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={user.college?.name} title="Your season," accent="in detail."
        subtitle="How you compare with students who cleared each round, and which skills your college's drives ask for." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Reveal delay={0}><Column tone="good" icon={TrendingUp} title="Going well" items={a.going_well} empty="Sit a few rounds and we'll show what's working." /></Reveal>
        <Reveal delay={100}><Column tone="bad" icon={TrendingDown} title="Going wrong" items={a.going_wrong} empty="Nothing stands out yet — keep going." /></Reveal>
        <Reveal delay={200}><Column tone="focus" icon={Target} title="Focus next" items={a.focus} empty="You're on track. Apply to your best-matched drives." /></Reveal>
      </div>

      {rejected.length > 0 && (
        <Link to={`/applications/${rejected[0].id}`} className="flex items-center gap-4 rounded-3xl bg-ink p-5 text-white shadow-float transition hover:bg-black">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10"><Sparkles className="h-5 w-5 text-brand-300" /></span>
          <div className="flex-1"><div className="font-medium">See exactly why you weren't selected at {rejected[0].company}</div>
            <div className="text-sm text-white/60">{rejected.length} drive{rejected.length > 1 ? "s have" : " has"} a round-by-round comparison with students who cleared.</div></div>
          <ChevronRight className="h-5 w-5 text-white/60" />
        </Link>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="card p-6">
          <h2 className="font-medium">Round by round</h2>
          <p className="mb-5 mt-1 text-xs text-ink-muted">How often you clear each round vs. everyone at your college.</p>
          <RoundBars rows={a.round_stats} />
        </div>
        <div className="card p-6">
          <h2 className="font-medium">Assessment sections</h2>
          <p className="mb-2 mt-1 text-xs text-ink-muted">Your average vs. students who cleared, across your tests.</p>
          {a.sections.length === 0 ? <p className="py-10 text-center text-sm text-ink-muted">No assessment scores yet.</p> : (
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={a.sections} outerRadius="72%">
                <PolarGrid stroke="#ece6ff" />
                <PolarAngleAxis dataKey="section" tick={{ fontSize: 11, fill: "#71717a" }} />
                <Radar name="Cleared" dataKey="cleared" stroke="#c4b2fd" fill="#c4b2fd" fillOpacity={0.35} />
                <Radar name="You" dataKey="you" stroke="#6d28d9" fill="#7c3aed" fillOpacity={0.35} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #eee", fontSize: 12 }} />
              </RadarChart>
            </ResponsiveContainer>
          )}
          <div className="flex justify-center gap-5 text-xs text-ink-muted"><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-600" />You</span><span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-brand-300" />Cleared</span></div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <div className="card p-6">
          <h2 className="font-medium">Skills your college's drives ask for</h2>
          <p className="mb-5 mt-1 text-xs text-ink-muted">Green: on your resume. Purple: missing — fill the ones open drives need first.</p>
          {a.skills.length ? <Skills rows={a.skills} /> : <p className="text-sm text-ink-muted">No drives at your college yet. Skills appear here once companies post drives.</p>}
        </div>
        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-medium">Best matches open now</h2>
            <ul className="mt-4 space-y-3">
              {a.open_matches.length === 0 && <li className="text-sm text-ink-muted">No open drives right now.</li>}
              {a.open_matches.map((m) => (
                <li key={m.company + m.role} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0"><div className="truncate font-medium">{m.role}</div><div className="text-xs text-ink-muted">{m.company}</div></div>
                  <span className={`font-medium tabular-nums ${scoreColor(m.match)}`}>{m.match}</span>
                </li>
              ))}
            </ul>
            <Link to="/drives" className="btn-ghost mt-5 w-full">Browse drives</Link>
          </div>
          <Link to="/experiences" className="card group flex items-center gap-4 p-6 transition hover:border-brand-200">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50"><MessageSquareQuote className="h-5 w-5 text-brand-600" /></span>
            <div className="flex-1"><div className="font-medium">Interview experiences</div><div className="text-sm text-ink-muted">See what was asked — and share yours.</div></div>
            <ChevronRight className="h-5 w-5 text-ink-muted transition group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

    </div>
  );
}
