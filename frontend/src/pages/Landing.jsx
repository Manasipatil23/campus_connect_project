import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowRight, BadgeCheck, Building2, Landmark, Check, CheckCircle2, GraduationCap, Handshake, Lightbulb, MessageSquareQuote,
  Play, ShieldCheck, Sparkles, ThumbsUp, TrendingDown, TrendingUp, X,
} from "lucide-react";
import Logo from "../components/Logo";
import { CountUp, CursorGlow, Reveal, Tilt, WordsIn } from "../components/fx/motion";
import HowItWorks from "../components/fx/HowItWorks";

function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 10);
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition-all ${scrolled ? "border-b border-black/[.05] bg-white/70 backdrop-blur-xl" : ""}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-4 sm:px-8">
        <div className="shrink-0 whitespace-nowrap"><Logo /></div>
        <nav className="flex items-center gap-1 text-sm text-ink-soft sm:gap-6">
          <a href="#how" className="hidden px-2 hover:text-ink md:inline">How it works</a>
          <a href="#students" className="hidden px-2 hover:text-ink lg:inline">Students</a>
          <a href="#experiences" className="hidden px-2 hover:text-ink md:inline">Experiences</a>
          <a href="#colleges" className="hidden px-2 hover:text-ink md:inline">Colleges & companies</a>
          <Link to="/login" className="whitespace-nowrap px-2 hover:text-ink sm:px-3">Sign in</Link>
          <Link to="/register" className="btn-primary whitespace-nowrap px-4 py-2 sm:px-6 sm:py-3">Get Started</Link>
        </nav>
      </div>
    </header>
  );
}

// The headline's last word cycles; each word lights up the side of the platform it's about.
const WORDS = [
  { word: "opportunities.", who: ["students"] },
  { word: "connections.", who: ["companies"] },
  { word: "communication.", who: ["colleges"] },
  { word: "trust.", who: ["students", "colleges", "companies"] },
];
const AUDIENCES = [
  { key: "students", icon: GraduationCap, title: "Students", text: "Track every round and learn why you weren't shortlisted.", cta: "Join as a student", to: "/register" },
  { key: "colleges", icon: Landmark, title: "Placement cells", text: "Publish drives, confirm dates and see placements live.", cta: "Register your college", to: "/register?as=college" },
  { key: "companies", icon: Building2, title: "Companies", text: "Reach verified colleges and screen against your JD.", cta: "Register your company", to: "/register?as=company" },
];

function RotatingWord({ index }) {
  // the slot animates to the width of the current word so the line stays centred
  const refs = useRef([]);
  const [width, setWidth] = useState(null);
  useEffect(() => {
    const measure = () => setWidth(refs.current[index]?.offsetWidth ?? null);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [index]);
  return (
    <span className="relative inline-grid pb-[0.12em] align-bottom transition-[width] duration-700 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none"
      // clip only above and below (for the slide), never sideways, so a longer word isn't cut while the slot grows
      style={{ width: width ?? undefined, clipPath: "inset(0 -100vw)" }} aria-live="polite">
      {WORDS.map((w, i) => {
        const state = i === index ? "in" : i === (index - 1 + WORDS.length) % WORDS.length ? "out" : "wait";
        return (
          <span key={w.word} ref={(el) => (refs.current[i] = el)} aria-hidden={i !== index}
            className="accent col-start-1 row-start-1 justify-self-start whitespace-nowrap transition-all duration-700 ease-[cubic-bezier(.2,.7,.2,1)] motion-reduce:transition-none"
            style={{
              opacity: state === "in" ? 1 : 0,
              transform: state === "in" ? "translateY(0)" : state === "out" ? "translateY(-70%)" : "translateY(70%)",
            }}>
            {w.word}
          </span>
        );
      })}
    </span>
  );
}

function Hero() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => setI((x) => (x + 1) % WORDS.length), 2600);
    return () => clearInterval(t);
  }, [paused]);
  const active = WORDS[i].who;

  return (
    <section className="relative isolate overflow-hidden pt-32 sm:pt-40">
      <div aria-hidden className="grid-dots absolute inset-0 -z-20 [mask-image:linear-gradient(to_bottom,black_70%,transparent)]" />
      <div className="mx-auto flex max-w-6xl flex-col items-center px-5 pb-24 text-center sm:px-8 lg:pb-28">
        <h1 className=" text-[40px] font-medium leading-[1.06] tracking-[-0.04em] text-ink sm:text-6xl xl:text-[76px]">
          <WordsIn text="Campus placements," start={100} />
          <br />
          <span className="word-in inline-block" style={{ animationDelay: "350ms" }}>
            built on <RotatingWord index={i} />
          </span>
        </h1>

        <p className="word-in mt-7 max-w-2xl text-lg leading-relaxed text-ink-muted" style={{ animationDelay: "550ms" }}>
          One shared place for drives, dates and results.
        </p>

        <div className="word-in mt-9 flex flex-wrap justify-center gap-3" style={{ animationDelay: "700ms" }}>
          <Link to="/register" className="btn-primary group px-7 py-3.5">
            Get started <ArrowRight className="h-4 w-4 transition group-hover:translate-x-1" />
          </Link>
          <a href="#how" className="btn-ghost px-7 py-3.5">See how it works</a>
        </div>

        <div className="word-in mt-14 grid w-full gap-4 text-left md:grid-cols-3" style={{ animationDelay: "850ms" }}
          onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
          {AUDIENCES.map(({ key, icon: Icon, title, text, cta, to }) => {
            const on = active.includes(key);
            return (
              <Link key={key} to={to}
                className={`group rounded-3xl border p-6 transition-all duration-500 ${on
                  ? "-translate-y-1 border-brand-200 bg-white shadow-[0_24px_50px_-24px_rgba(91,33,182,.45)]"
                  : "border-black/[.06] bg-white/60 hover:bg-white"}`}>
                <span className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors duration-500 ${on ? "bg-ink text-white" : "bg-brand-50 text-brand-700"}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="mt-4 font-medium text-ink">{title}</div>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{text}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
                  {cta} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            );
          })}
        </div>

        <div className="word-in mt-8 flex items-center gap-2 text-sm text-ink-muted" style={{ animationDelay: "1000ms" }}>
          <ShieldCheck className="h-4 w-4 text-brand-600" /> Everyone on Campus Connect is verified
        </div>
      </div>
    </section>
  );
}

function Marquee({ names }) {
  if (!names.length) return null;
  const row = [...names, ...names];
  return (
    <section className="relative border-y border-black/[.05] bg-white/50 py-6">
      <div className="mx-auto mb-4 max-w-7xl px-5 text-center text-xs font-semibold uppercase tracking-eyebrow text-ink-muted sm:px-8">Verified colleges and companies on Campus Connect</div>
      <div className="overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_10%,black_90%,transparent)]">
        <div className="marquee flex w-max gap-12 whitespace-nowrap text-lg text-ink-muted/80">
          {row.map((n, i) => <span key={i} className="flex items-center gap-12">{n}<span className="text-brand-300">✦</span></span>)}
        </div>
      </div>
    </section>
  );
}

function AnalyticsMock() {
  const Row = ({ icon: Icon, tone, title, sub }) => (
    <div className="flex gap-3 rounded-xl bg-white/80 p-3">
      <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} />
      <div><div className="text-sm font-medium">{title}</div><div className="text-xs text-ink-muted">{sub}</div></div>
    </div>
  );
  return (
    <Tilt className="glass rounded-3xl p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <div className="text-sm font-medium">Your season so far</div>
        <span className="chip bg-brand-50 text-brand-700">Live</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-eyebrow text-emerald-600">Going well</div>
          <Row icon={TrendingUp} tone="text-emerald-600" title="Resume clears 2 of 3" sub="College avg 46%" />
          <Row icon={TrendingUp} tone="text-emerald-600" title="Aptitude is strong" sub="72% vs 65% cleared" />
        </div>
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-eyebrow text-rose-500">Going wrong</div>
          <Row icon={TrendingDown} tone="text-rose-500" title="Coding below the cut" sub="32% vs 63% cleared" />
          <Row icon={TrendingDown} tone="text-rose-500" title="Missing Power BI" sub="Cost you 1 shortlist" />
        </div>
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-eyebrow text-brand-600">Focus next</div>
          <Row icon={Lightbulb} tone="text-brand-600" title="Practise sliding window" sub="3 open drives test it" />
          <Row icon={Lightbulb} tone="text-brand-600" title="Quantify 4 bullets" sub="+ match on every drive" />
        </div>
      </div>
      <div className="mt-5 space-y-2.5">
        {[["SQL", 82, true], ["Python", 74, true], ["Power BI", 56, false], ["Docker", 41, false]].map(([s, v, ok]) => (
          <div key={s} className="grid grid-cols-[80px_1fr_auto] items-center gap-3 text-xs">
            <span className="flex items-center gap-1.5">{ok ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <X className="h-3.5 w-3.5 text-rose-500" />}{s}</span>
            <div className="h-1.5 rounded-full bg-brand-50"><div className="h-1.5 rounded-full bg-gradient-to-r from-brand-400 to-brand-700" style={{ width: `${v}%` }} /></div>
            <span className="text-ink-muted">{v}% of drives</span>
          </div>
        ))}
      </div>
    </Tilt>
  );
}

const EXPERIENCES = [
  { co: "Orbit Fintech", round: "Technical interview", q: ["Explain normalisation up to 3NF", "Design a URL shortener"], d: 4, rot: "-rotate-6" },
  { co: "Quantix Systems", round: "Online assessment", q: ["Longest substring without repeats", "SQL: second-highest salary"], d: 3, rot: "rotate-3" },
  { co: "Nimbus Analytics", round: "HR interview", q: ["Why Nimbus?", "Describe a team conflict"], d: 2, rot: "-rotate-1" },
];

function ExperienceStack() {
  return (
    <div className="relative mx-auto h-[440px] w-full max-w-md">
      {EXPERIENCES.map((e, i) => (
        <div key={e.co} className="absolute inset-x-0 hover:z-10" style={{ top: i * 96 }}>
        <Reveal delay={i * 150}>
          <div className={`rounded-2xl border border-black/[.06] bg-white p-5 shadow-float transition duration-500 hover:-translate-y-2 hover:rotate-0 ${e.rot}`}>
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">{e.co}</div>
              <span className="chip bg-emerald-50 text-emerald-700"><BadgeCheck className="mr-1 h-3 w-3" />Verified</span>
            </div>
            <div className="mt-1 text-xs text-ink-muted">{e.round} · difficulty {"●".repeat(e.d)}{"○".repeat(5 - e.d)}</div>
            <ul className="mt-3 space-y-1 text-sm text-ink-soft">{e.q.map((q) => <li key={q}>— {q}</li>)}</ul>
            <div className="mt-3 flex items-center gap-1 text-xs text-ink-muted"><ThumbsUp className="h-3.5 w-3.5" /> {12 + i * 7} found this helpful</div>
          </div>
        </Reveal>
        </div>
      ))}
    </div>
  );
}

const SIDES = [
  { icon: Landmark, eyebrow: "For placement cells", title: "Run every drive", accent: "from one place.",
    points: ["Review and publish company drives", "Confirm dates before students see them", "Live placement numbers, no spreadsheets"],
    stats: [["3", "drives to review"], ["2", "dates to confirm"], ["87%", "placed"]], cta: "Register your college", to: "/register?as=college" },
  { icon: Building2, eyebrow: "For companies", title: "Hire from campus,", accent: "faster.",
    points: ["Connect with verified colleges", "Screen resumes against your exact JD", "Move candidates; everyone stays updated"],
    stats: [["48", "applicants"], ["21", "shortlisted"], ["6", "offers"]], cta: "Register your company", to: "/register?as=company" },
];

const TRUST = [
  { icon: Building2, who: "Colleges", step: "AISHE code and official domain", gate: "Verified by Campus Connect" },
  { icon: GraduationCap, who: "Students", step: "College email, then your college", gate: "Approved by your placement cell" },
  { icon: Handshake, who: "Companies", step: "CIN/GSTIN and work email", gate: "Verified, then connects with colleges" },
];

export default function Landing() {
  const [stats, setStats] = useState(null);
  useEffect(() => { fetch("/api/stats").then((r) => r.json()).then(setStats).catch(() => {}); }, []);
  const names = stats ? [...stats.college_names, ...stats.company_names] : [];

  return (
    <div className="relative min-h-screen overflow-x-clip">
      <CursorGlow />
      <Nav />
      <Hero />
      <Marquee names={names} />
      <HowItWorks />

      {/* students: analytics */}
      <section id="students" className="relative mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid items-center gap-14 lg:grid-cols-2">
          <Reveal>
            <div className="eyebrow">For students</div>
            <h2 className="mt-6 text-4xl font-medium leading-tight tracking-[-0.03em] sm:text-5xl">
              Know what's working. <span className="accent">Fix what isn't.</span>
            </h2>
            <p className="mt-6 max-w-lg text-lg text-ink-muted">
              See how you compare with the students who cleared each round.
            </p>
            <ul className="mt-8 space-y-4">
              {[
                ["What's going well", "Rounds and skills where you're ahead."],
                ["What's going wrong", "What keeps costing you a shortlist."],
                ["What to focus on", "The next fix with the biggest payoff."],
              ].map(([t, d], i) => (
                <Reveal key={t} delay={i * 120} as="li" className="flex gap-4">
                  <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs text-white">{i + 1}</span>
                  <div><div className="font-medium">{t}</div><div className="text-sm text-ink-muted">{d}</div></div>
                </Reveal>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={150}><AnalyticsMock /></Reveal>
        </div>
      </section>

      {/* placement cells & companies: what they get, in brief */}
      <section id="colleges" className="relative mx-auto max-w-7xl px-5 pb-24 sm:px-8 sm:pb-32">
        <div className="grid gap-6 lg:grid-cols-2">
          {SIDES.map(({ icon: Icon, eyebrow, title, accent, points, stats, cta, to }, k) => (
            <Reveal key={eyebrow} delay={k * 150}>
              <div className="card flex h-full flex-col rounded-3xl p-8">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-white"><Icon className="h-5 w-5 text-brand-600" /></span>
                <div className="eyebrow mt-6">{eyebrow}</div>
                <h3 className="mt-4 text-3xl font-medium leading-tight tracking-[-0.03em]">{title} <span className="accent">{accent}</span></h3>
                <ul className="mt-6 space-y-3">
                  {points.map((t, i) => (
                    <li key={t} className="flex items-center gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink text-[11px] text-white">{i + 1}</span>{t}
                    </li>
                  ))}
                </ul>
                <div className="mt-8 grid grid-cols-3 gap-2 rounded-2xl bg-brand-50/50 p-3">
                  {stats.map(([v, l]) => (
                    <div key={l} className="rounded-xl bg-white px-3 py-2.5 text-center">
                      <div className="text-lg font-medium tabular-nums">{v}</div>
                      <div className="text-[11px] text-ink-muted">{l}</div>
                    </div>
                  ))}
                </div>
                <Link to={to} className="mt-6 inline-flex w-fit items-center gap-1 text-sm font-medium text-brand-700 hover:underline">{cta} <ArrowRight className="h-3.5 w-3.5" /></Link>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* experiences */}
      <section id="experiences" className="relative overflow-hidden py-24 sm:py-32">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-brand-50/60 to-transparent" />
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-2">
          <ExperienceStack />
          <Reveal>
            <div className="eyebrow">Shared by students</div>
            <h2 className="mt-6 text-4xl font-medium leading-tight tracking-[-0.03em] sm:text-5xl">
              Hear it from those <span className="accent">who sat it.</span>
            </h2>
            <p className="mt-6 max-w-lg text-lg text-ink-muted">
              Real questions and tips from seniors, checked by your placement cell.
            </p>
            <div className="mt-8 flex flex-wrap gap-3 text-sm">
              <span className="chip bg-white px-3 py-1.5 shadow-soft"><BadgeCheck className="mr-1.5 h-4 w-4 text-emerald-600" />Verified</span>
              <span className="chip bg-white px-3 py-1.5 shadow-soft"><MessageSquareQuote className="mr-1.5 h-4 w-4 text-brand-600" />Anonymous</span>
            </div>
          </Reveal>
        </div>
      </section>

      {/* trust chain */}
      <section id="trust" className="mx-auto max-w-7xl px-5 py-24 sm:px-8 sm:py-32">
        <Reveal className="text-center">
          <div className="eyebrow justify-center">Verified at every step</div>
          <h2 className="mx-auto mt-6 max-w-3xl text-4xl font-medium leading-tight tracking-[-0.03em] sm:text-5xl">
            A closed network of <span className="accent">real colleges, real companies.</span>
          </h2>
        </Reveal>
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {TRUST.map(({ icon: Icon, who, step, gate }, i) => (
            <Reveal key={who} delay={i * 150}>
              <Tilt className="card h-full rounded-3xl p-7">
                <div className="flex items-center justify-between">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-100 to-white"><Icon className="h-6 w-6 text-brand-600" /></span>
                  <span className="text-sm text-ink-muted">0{i + 1}</span>
                </div>
                <h3 className="mt-6 text-xl font-medium">{who}</h3>
                <p className="mt-2 text-sm text-ink-muted">{step}</p>
                <div className="mt-6 flex items-center gap-2 border-t border-black/[.06] pt-4 text-sm font-medium text-brand-700">
                  <ShieldCheck className="h-4 w-4" /> {gate}
                </div>
              </Tilt>
            </Reveal>
          ))}
        </div>
      </section>

      {/* numbers */}
      {stats && (
        <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-8">
          <div className="grid grid-cols-2 gap-6 md:grid-cols-4">
            {[["Verified colleges", stats.colleges], ["Hiring companies", stats.companies], ["Students", stats.students], ["Shared experiences", stats.experiences]].map(([l, v], i) => (
              <Reveal key={l} delay={i * 100} className="text-center">
                <div className="text-5xl font-medium tracking-tight text-ink"><CountUp to={v} /></div>
                <div className="mt-2 text-sm text-ink-muted">{l}</div>
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="px-5 pb-24 sm:px-8">
        <div className="relative mx-auto max-w-7xl overflow-hidden rounded-[2.5rem] bg-ink px-6 py-20 text-center text-white sm:px-16">
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(600px_300px_at_50%_0%,rgba(139,92,246,.35),transparent_70%)]" />
          <div className="relative">
            <h2 className="mx-auto max-w-3xl text-4xl font-medium leading-tight tracking-[-0.03em] sm:text-6xl">
              Your next offer starts with knowing <span className="italic text-brand-300">why.</span>
            </h2>
            <div className="mt-10 flex flex-wrap justify-center gap-4">
              <Link to="/register" className="btn bg-white px-7 py-4 text-ink hover:bg-brand-50">Join as a student <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/register?as=college" className="btn border border-white/20 px-7 py-4 text-white hover:bg-white/10">Register your college</Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 border-t border-black/[.06] px-5 py-10 text-sm text-ink-muted sm:px-8">
        <Logo />
        <div className="flex gap-6">
          <Link to="/register?as=college" className="hover:text-ink">For colleges</Link>
          <Link to="/register?as=company" className="hover:text-ink">For companies</Link>
          <Link to="/login" className="hover:text-ink">Sign in</Link>
        </div>
      </footer>
    </div>
  );
}
