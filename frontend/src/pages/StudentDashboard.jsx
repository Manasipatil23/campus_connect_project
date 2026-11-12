import { Link } from "react-router-dom";
import { ArrowRight, BarChart3, CalendarClock, ChevronRight, PartyPopper, TrendingDown } from "lucide-react";
import { useAuth } from "../auth";
import { Badge, ErrorNote, ScoreRing, Spinner, fmtDate, useApi } from "../components/ui";

/**
 * The student's first screen: only what needs attention now.
 * Detailed analysis lives on /insights.
 */

function Card({ title, action, children }) {
  return (
    <section className="card p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function nextSteps(actions, a, d) {
  const steps = [];
  if (!d.profile_complete) steps.push({ title: "Complete your profile", detail: "Needed to check eligibility", to: "/profile", cta: "Open profile" });
  if (!d.has_resume) steps.push({ title: "Upload your resume", detail: "Needed to apply and see your match", to: "/resume", cta: "Upload" });
  for (const x of actions || []) {
    if (x.kind === "resume") continue;
    steps.push({ title: x.title, detail: x.detail, to: x.link, cta: x.kind === "offer" ? "Respond" : x.kind === "deadline" ? "Apply" : "Open" });
  }
  const best = a.open_matches?.[0];
  const applied = new Set(a.timeline.map((t) => `${t.company}|${t.role}`));
  if (best && !applied.has(`${best.company}|${best.role}`)) {
    steps.push({ title: `Apply to ${best.role}`, detail: `${best.company} · your best open match (${best.match})`, to: "/drives", cta: "View" });
  }
  // only suggest a skill to work on if it actually matters for drives right now
  const focus = a.focus?.find((f) => !/apply/i.test(f.title) && !/^0 /.test(f.impact || ""));
  if (focus) {
    const SPECIAL = { "power bi": "Power BI", sql: "SQL", aws: "AWS", dsa: "DSA", etl: "ETL", nlp: "NLP", "html/css": "HTML/CSS", "node.js": "Node.js", "rest api": "REST API" };
    const pretty = (sk) => SPECIAL[sk.toLowerCase()] || sk.charAt(0).toUpperCase() + sk.slice(1);
    const title = focus.title.replace(/(show )(.+)$/i, (_, lead, sk) => lead + pretty(sk));
    const detail = (focus.impact || focus.area).replace(/^1 open drive\(s\) need it/, "1 open drive needs it").replace("drive(s)", "drives");
    steps.push({ title, detail, to: "/insights", cta: "Why" });
  }
  return steps.slice(0, 3);
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const { data: a, error } = useApi("/students/me/analytics");
  const { data: d } = useApi("/students/me/dashboard");
  const { data: actions } = useApi("/actions");
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!a || !d) return <Spinner label="Loading your season…" />;

  const steps = nextSteps(actions, a, d);
  const upcoming = (d.upcoming_rounds || []).slice(0, 3);
  const apps = a.timeline.slice(0, 4);
  const drag = a.going_wrong?.[0];
  const s = a.summary;

  return (
    <div className="space-y-6">
      {/* 1. where you stand */}
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <div className="eyebrow">{user.college?.name}</div>
          <h1 className="mt-4 text-4xl font-medium tracking-[-0.035em] sm:text-5xl">
            Hi {user.name.split(" ")[0]}, <span className="accent">here's today.</span>
          </h1>
          <p className="mt-3 text-ink-muted">
            {s.applications} applications · {s.in_progress} in progress · {s.offers} offer{s.offers === 1 ? "" : "s"}
            {d.eligible_open_drives > 0 && <> · <Link to="/drives" className="text-brand-700 hover:underline">{d.eligible_open_drives} open drive{d.eligible_open_drives === 1 ? "" : "s"} you can apply to</Link></>}
          </p>
        </div>
        <Link to="/insights" className="card flex items-center gap-4 px-5 py-4 transition hover:border-brand-200">
          <ScoreRing score={d.health.score} size={64} />
          <div className="text-sm">
            <div className="font-medium">Placement health · {d.health.band}</div>
            <div className="text-ink-muted">Resume quality {d.ats_score ?? "—"}</div>
          </div>
        </Link>
      </div>

      {d.placement?.status === "placed" && (
        <div className="card flex items-center gap-3 p-5"><PartyPopper className="h-5 w-5 text-brand-600" />
          <span className="text-sm">Placed at <b className="font-medium">{d.placement.company}</b> · {d.placement.ctc_lpa} LPA. Only dream-tier drives remain open to you.</span></div>
      )}

      {/* 2. what to do next */}
      <section className="rounded-3xl bg-gradient-to-br from-brand-800 to-brand-900 p-6 text-white shadow-[0_24px_50px_-24px_rgba(91,33,182,.6)] sm:p-7">
        <h2 className="text-lg font-medium">Do this next</h2>
        {steps.length === 0 ? <p className="mt-3 text-sm text-white/70">You're all caught up. We'll tell you when something needs you.</p> : (
          <ol className={`mt-4 grid gap-3 ${steps.length === 1 ? "" : steps.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
            {steps.map((x, i) => (
              <li key={i}>
                <Link to={x.to} className="group flex h-full flex-col rounded-2xl bg-white/[.08] p-4 transition hover:bg-white/[.14]">
                  <span className="text-xs text-brand-200">{i + 1}</span>
                  <span className="mt-1 font-medium leading-snug">{x.title}</span>
                  <span className="mt-1 line-clamp-2 text-sm text-white/70">{x.detail}</span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-3 text-sm text-white">{x.cta} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" /></span>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* 3. coming up + your applications */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Coming up" action={<span className="text-xs text-ink-muted">confirmed dates only</span>}>
          {upcoming.length === 0 ? <p className="text-sm text-ink-muted">Nothing scheduled for drives you're in. You'll be notified when dates are confirmed.</p> : (
            <ul className="divide-y divide-black/[.05]">
              {upcoming.map((r) => (
                <li key={r.drive_id + r.id}>
                  <Link to={`/drives/${r.drive_id}`} className="flex items-center gap-4 py-3 first:pt-0 last:pb-0">
                    <span className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                      {r.date ? <><span className="text-[10px] uppercase leading-none">{fmtDate(r.date).split(" ")[1]}</span><span className="text-base font-medium leading-tight">{fmtDate(r.date).split(" ")[0]}</span></>
                        : <CalendarClock className="h-4 w-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{r.name}</div>
                      <div className="truncate text-xs text-ink-muted">{r.company} · {r.date ? (r.time || "time TBA") : r.note}</div>
                    </div>
                    {r.pending_change && <Badge value="pending" label="Date changing" />}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Your applications" action={a.timeline.length > 4 && <Link to="/drives" className="text-xs text-brand-700 hover:underline">All {a.timeline.length}</Link>}>
          {apps.length === 0 ? (
            <p className="text-sm text-ink-muted">No applications yet. <Link to="/drives" className="text-brand-700 hover:underline">Browse drives</Link></p>
          ) : (
            <ul className="divide-y divide-black/[.05]">
              {apps.map((t) => (
                <li key={t.id}>
                  <Link to={`/applications/${t.id}`} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.role}</div>
                      <div className="truncate text-xs text-ink-muted">{t.company}</div>
                    </div>
                    <Badge value={t.status} />
                    <span className="flex items-center text-xs text-brand-700">{t.status === "rejected" ? "See why" : "Track"}<ChevronRight className="h-3.5 w-3.5" /></span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* 4. one insight, with the rest one click away */}
      <Link to="/insights" className="card group flex items-center gap-4 p-5 transition hover:border-brand-200">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${drag ? "bg-rose-50" : "bg-brand-50"}`}>
          {drag ? <TrendingDown className="h-5 w-5 text-rose-500" /> : <BarChart3 className="h-5 w-5 text-brand-600" />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-ink-muted">{drag ? "Biggest thing holding you back" : "Your insights"}</div>
          <div className="truncate font-medium">{drag ? drag.title : "See how you compare with students who cleared each round"}</div>
        </div>
        <span className="hidden items-center gap-1 text-sm text-brand-700 sm:flex">All insights <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
      </Link>
    </div>
  );
}
