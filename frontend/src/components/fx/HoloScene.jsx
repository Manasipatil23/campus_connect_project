import { useEffect, useRef, useState } from "react";
import { BadgeCheck, Building2, Check, GraduationCap, Landmark, ShieldCheck, Sparkles, User } from "lucide-react";

/**
 * "How Campus Connect works" — an isometric scene played by scrolling.
 * Four glass pedestals (admin, companies, students, placement cells) sit on a
 * glowing grid around a glass orb. As you scroll: holographic panels rise, data
 * streams flow into the orb, it produces a matched profile wrapped in an
 * orbiting ring of skills, and an interview request goes out.
 *
 * Built with a hand-rolled isometric projection: canvas for the floor and
 * particles, SVG for pedestals and light streams, HTML for crisp glass panels.
 */

// HX stretches the isometric view sideways (true isometric is 0.866) so the four
// corners and their cards have room to breathe without making the scene taller.
const W = 1800, H = 780, CX = 900, CY = 440, S = 88, HX = 1.45;
const P = (x, y, z = 0) => [CX + (x - y) * S * HX, CY + (x + y) * S * 0.5 - z * S];
const pts = (arr) => arr.map((p) => P(...p).join(",")).join(" ");
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ease = (v) => 1 - Math.pow(1 - clamp(v), 3);
const span = (p, a, b) => ease((p - a) / (b - a));

const PEDESTALS = [
  { key: "admin", x: -3.2, y: 0, label: "PLATFORM ADMIN", icon: ShieldCheck, color: "#7c3aed" },
  { key: "companies", x: 0, y: -3.2, label: "COMPANIES", icon: Building2, color: "#6366f1" },
  { key: "students", x: 0, y: 3.2, label: "STUDENTS", icon: GraduationCap, color: "#a855f7" },
  { key: "placement", x: 3.2, y: 0, label: "PLACEMENT CELLS", icon: Landmark, color: "#8b5cf6" },
];
const PH = 0.32; // pedestal height
const ORB_Z = 1.45;
const RING = 1.45; // radius of the orbiting skills ring
const SKILLS = ["Python", "SQL", "AWS Certified", "Kubernetes", "DSA", "Power BI", "React", "Communication"];

export const STAGES = [
  { at: 0.0, title: "Four verified sides,", accent: "one network.", text: "Students, placement cells, companies and admins — all verified." },
  { at: 0.17, title: "Everyone brings", accent: "their signal.", text: "Resumes, round results and open roles flow in." },
  { at: 0.37, title: "Campus Connect", accent: "brings it together.", text: "One engine compares, ranks and explains." },
  { at: 0.57, title: "Matched on skills,", accent: "not guesswork.", text: "Students see their match and their gaps." },
  { at: 0.77, title: "From signal", accent: "to shortlist.", text: "Companies find the right students. Students know what's next." },
];

// quadratic bezier in 3D, projected
function arcPoint(a, b, lift, t) {
  const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.max(a[2], b[2]) + lift];
  const q = (i) => (1 - t) * (1 - t) * a[i] + 2 * (1 - t) * t * m[i] + t * t * b[i];
  return P(q(0), q(1), q(2));
}
function arcPath(a, b, lift) {
  let d = "";
  for (let i = 0; i <= 48; i++) {
    const [x, y] = arcPoint(a, b, lift, i / 48);
    d += `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
  }
  return d;
}

const STREAM_LABEL = { admin: "Verification", companies: "Roles & JDs", students: "Resumes & scores", placement: "Round results" };
const INFLOWS = PEDESTALS.map((p) => ({ key: p.key, color: p.color, a: [p.x, p.y, PH + 0.9], b: [0, 0, ORB_Z], lift: 1.6 }));
const OUTFLOW = { a: [0, 0, ORB_Z + 0.4], b: [0, -3.2, PH + 1.2], lift: 2.6, color: "#7c3aed" };
const SWEEP = { a: [-3.2, 0, PH + 1.6], b: [0, -3.2, PH + 1.6], lift: 3.0, color: "#a78bfa" };

function Pedestal({ p, glow }) {
  const r = 0.95, { x, y } = p;
  const top = pts([[x - r, y - r, PH], [x + r, y - r, PH], [x + r, y + r, PH], [x - r, y + r, PH]]);
  const right = pts([[x + r, y - r, 0], [x + r, y + r, 0], [x + r, y + r, PH], [x + r, y - r, PH]]);
  const front = pts([[x - r, y + r, 0], [x + r, y + r, 0], [x + r, y + r, PH], [x - r, y + r, PH]]);
  const pad = pts([[x - 0.55, y - 0.55, PH], [x + 0.55, y - 0.55, PH], [x + 0.55, y + 0.55, PH], [x - 0.55, y + 0.55, PH]]);
  return (
    <g>
      <polygon points={right} fill="url(#ped-right)" stroke="rgba(124,58,237,.18)" />
      <polygon points={front} fill="url(#ped-front)" stroke="rgba(124,58,237,.18)" />
      <polygon points={top} fill="url(#ped-top)" stroke="rgba(255,255,255,.9)" strokeWidth="1.5" />
      <polygon points={pad} fill={p.color} opacity={0.12 + glow * 0.35} filter="url(#soft)" />
      <polygon points={pad} fill="none" stroke={p.color} strokeOpacity={0.35 + glow * 0.5} strokeWidth="1.5" />
    </g>
  );
}

function FloorLabel({ x, y, text, size = 15, weight = 600, opacity = 0.75 }) {
  const [px, py] = P(x, y, 0);
  // text lying on the floor along the x axis
  return (
    <text transform={`matrix(0.866,0.5,-0.866,0.5,${px},${py})`} textAnchor="middle" fontSize={size} fontWeight={weight}
      letterSpacing="3" fill="#2e1065" opacity={opacity} style={{ fontFamily: "Inter, sans-serif" }}>{text}</text>
  );
}

function Panel({ anchor, show, children, className = "", tilt = 0, width = 190 }) {
  const [x, y] = P(...anchor);
  return (
    <div className={`absolute ${className}`}
      style={{
        left: x - width / 2, top: y, width, transform: `translateY(calc(-100% + ${(1 - show) * 40}px)) perspective(800px) rotateY(${tilt}deg) scale(${0.92 + 0.08 * show})`,
        opacity: show, transformOrigin: "bottom center", pointerEvents: "none",
      }}>
      <div className="rounded-2xl border border-white/80 bg-white/75 p-3.5 shadow-[0_20px_50px_-12px_rgba(91,33,182,.35)] backdrop-blur-xl">{children}</div>
      {/* light beam down to the pedestal */}
      <div className="mx-auto h-10 w-[70%] bg-gradient-to-b from-brand-300/40 to-transparent" style={{ clipPath: "polygon(10% 0,90% 0,100% 100%,0 100%)" }} />
    </div>
  );
}

function Orb({ energy }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, ctx = c.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1), R = 190;
    c.width = R * dpr; c.height = R * dpr; ctx.scale(dpr, dpr);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const N = 20, nodes = [];
    for (let i = 0; i < N; i++) {
      const yy = 1 - (i / (N - 1)) * 2, rr = Math.sqrt(1 - yy * yy), th = i * 2.399963;
      const k = 0.35 + Math.random() * 0.6;
      nodes.push([Math.cos(th) * rr * k, yy * k, Math.sin(th) * rr * k, Math.random() < 0.3 ? "#f0abfc" : Math.random() < 0.5 ? "#a78bfa" : "#7c3aed"]);
    }
    let raf, a = 0;
    const draw = () => {
      a += 0.006;
      ctx.clearRect(0, 0, R, R);
      const cs = Math.cos(a), sn = Math.sin(a), proj = nodes.map(([x, y, z, col]) => {
        const X = x * cs - z * sn, Z = x * sn + z * cs;
        return { x: R / 2 + X * R * 0.36, y: R / 2 + y * R * 0.36, z: Z, col };
      });
      ctx.lineWidth = 0.6;
      for (let i = 0; i < proj.length; i++) for (let j = i + 1; j < proj.length; j++) {
        const dx = proj[i].x - proj[j].x, dy = proj[i].y - proj[j].y, d = dx * dx + dy * dy;
        if (d < 900) { ctx.strokeStyle = `rgba(124,58,237,${0.25 * (1 - d / 900)})`; ctx.beginPath(); ctx.moveTo(proj[i].x, proj[i].y); ctx.lineTo(proj[j].x, proj[j].y); ctx.stroke(); }
      }
      for (const p of proj.sort((m, n) => m.z - n.z)) {
        const s = 1.6 + (p.z + 1) * 1.6;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 4);
        g.addColorStop(0, p.col); g.addColorStop(1, "rgba(167,139,250,0)");
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, s * 4, 0, 7); ctx.fill();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(p.x, p.y, s * 0.6, 0, 7); ctx.fill();
      }
      const core = ctx.createRadialGradient(R / 2, R / 2, 0, R / 2, R / 2, R * 0.22);
      core.addColorStop(0, "rgba(255,255,255,.95)"); core.addColorStop(0.4, "rgba(240,171,252,.6)"); core.addColorStop(1, "rgba(167,139,250,0)");
      ctx.fillStyle = core; ctx.beginPath(); ctx.arc(R / 2, R / 2, R * 0.22, 0, 7); ctx.fill();
      if (!reduce) raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);
  const [x, y] = P(0, 0, ORB_Z);
  return (
    <div className="absolute" style={{ left: x - 95, top: y - 95, width: 190, height: 190, zIndex: 20 }}>
      <div className="absolute inset-0 rounded-full" style={{
        background: "radial-gradient(circle at 34% 28%, rgba(255,255,255,.98), rgba(245,240,255,.75) 30%, rgba(221,210,254,.45) 62%, rgba(124,58,237,.25) 100%)",
        boxShadow: `0 0 ${50 + energy * 70}px ${energy * 18}px rgba(139,92,246,${0.25 + energy * 0.3}), inset 0 -20px 40px rgba(124,58,237,.25), inset 0 10px 30px rgba(255,255,255,.9)`,
        border: "1px solid rgba(255,255,255,.9)",
      }} />
      <canvas ref={ref} className="absolute inset-0 h-full w-full rounded-full" style={{ opacity: 0.75 + energy * 0.25 }} />
      <div className="absolute left-[18%] top-[10%] h-[22%] w-[38%] rotate-[-25deg] rounded-full bg-white/70 blur-md" />
    </div>
  );
}

function Floor() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current, ctx = c.getContext("2d"), dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = W * dpr; c.height = H * dpr; ctx.scale(dpr, dpr);
    const lanes = [];
    for (let k = -6; k <= 6; k++) { lanes.push({ axis: "x", c: k }); lanes.push({ axis: "y", c: k }); }
    const main = [{ axis: "x", c: 0 }, { axis: "y", c: 0 }, { axis: "x", c: 3.2 }, { axis: "y", c: 3.2 }, { axis: "x", c: -3.2 }, { axis: "y", c: -3.2 }];
    let raf;
    const line = (a, b, style, w) => { ctx.strokeStyle = style; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(...P(...a)); ctx.lineTo(...P(...b)); ctx.stroke(); };
    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      // tiles
      for (let i = -6; i < 6; i++) for (let j = -6; j < 6; j++) {
        if ((i * 7 + j * 3) % 5 !== 0) continue;
        ctx.fillStyle = "rgba(237,231,255,.45)";
        ctx.beginPath(); [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]].forEach(([a, b], k) => ctx[k ? "lineTo" : "moveTo"](...P(a, b))); ctx.fill();
      }
      for (let k = -6; k <= 6; k++) {
        line([k, -7, 0], [k, 7, 0], "rgba(124,58,237,.10)", 1);
        line([-7, k, 0], [7, k, 0], "rgba(124,58,237,.10)", 1);
      }
      for (const m of main) {
        const a = m.axis === "x" ? [m.c, -7, 0] : [-7, m.c, 0], b = m.axis === "x" ? [m.c, 7, 0] : [7, m.c, 0];
        line(a, b, "rgba(124,58,237,.10)", 7);
        line(a, b, "rgba(124,58,237,.28)", 1.2);
      }
    };
    draw(); // static floor - nothing moves here
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} className="absolute inset-0" style={{ width: W, height: H, maskImage: "radial-gradient(ellipse 60% 62% at 50% 56%, black 45%, transparent 85%)", WebkitMaskImage: "radial-gradient(ellipse 60% 62% at 50% 56%, black 45%, transparent 85%)" }} />;
}

export default function HoloScene({ progress }) {
  const p = progress;
  const assemble = span(p, 0.0, 0.12);
  const panels = span(p, 0.15, 0.32);
  const flow = span(p, 0.35, 0.55);
  const match = span(p, 0.56, 0.72);
  const send = span(p, 0.76, 0.9);

  const chipRefs = useRef([]);
  const flowDots = useRef([]);
  const t = useRef(0);
  const live = useRef({ flow, match, send });
  live.current = { flow, match, send };

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf;
    const tick = () => {
      t.current += 0.016;
      const { flow: f, match: m, send: s } = live.current;
      // orbiting skill chips
      SKILLS.forEach((_, i) => {
        const el = chipRefs.current[i];
        if (!el) return;
        const ang = (i / SKILLS.length) * Math.PI * 2 + t.current * 0.35;
        const cx = Math.cos(ang) * RING, cy = Math.sin(ang) * RING;
        const [x, y] = P(cx, cy, ORB_Z - 0.35);
        const front = cx + cy > 0;
        el.style.transform = `translate(${x}px, ${y}px) translate(-50%,-50%) scale(${(front ? 1 : 0.86) * (0.6 + 0.4 * m)})`;
        el.style.opacity = String(m * (front ? 1 : 0.45));
        el.style.zIndex = front ? "30" : "10";
      });
      // particles travelling along the light streams
      flowDots.current.forEach((el, i) => {
        if (!el) return;
        const arc = i < 4 ? INFLOWS[i] : i === 4 ? OUTFLOW : SWEEP;
        const vis = i < 4 ? f : s;
        const u = ((t.current * 0.28 + i * 0.25) % 1) * Math.min(1, vis * 1.2);
        const [x, y] = arcPoint(arc.a, arc.b, arc.lift, u);
        el.setAttribute("cx", x); el.setAttribute("cy", y);
        el.setAttribute("opacity", vis > 0.05 ? 0.9 : 0);
      });
      if (!reduce) raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, []);

  const ring = (z) => { const [x, y] = P(0, 0, z); return { cx: x, cy: y, rx: RING * S * HX * Math.SQRT2, ry: RING * S * 0.7071 }; };
  const base = P(0, 0, 0);
  const glow = (key) => (key === "students" || key === "placement" ? Math.max(panels, flow) : panels) * (1 - 0.3 * match) + send * (key === "companies" ? 0.6 : 0);

  return (
    <div className="relative" style={{ width: W, height: H }}>
      <Floor />

      {/* pedestals, floor text, back half of rings, light streams */}
      <svg className="absolute inset-0" width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ opacity: assemble }}>
        <defs>
          <linearGradient id="ped-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#ffffff" /><stop offset="1" stopColor="#f3efff" /></linearGradient>
          <linearGradient id="ped-right" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e4dcff" /><stop offset="1" stopColor="#cbbcf9" /></linearGradient>
          <linearGradient id="ped-front" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#efe9ff" /><stop offset="1" stopColor="#ddd2fe" /></linearGradient>
          <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="6" /></filter>
          <filter id="glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>

        {/* orb base rings on the floor */}
        <ellipse cx={base[0]} cy={base[1]} rx={1.25 * S * HX * Math.SQRT2} ry={1.25 * S * 0.7071} fill="rgba(124,58,237,.10)" filter="url(#soft)" />
        <ellipse cx={base[0]} cy={base[1]} rx={0.95 * S * HX * Math.SQRT2} ry={0.95 * S * 0.7071} fill="url(#ped-top)" stroke="rgba(124,58,237,.35)" />
        <ellipse cx={base[0]} cy={base[1] - 6} rx={0.75 * S * HX * Math.SQRT2} ry={0.75 * S * 0.7071} fill="none" stroke="#a78bfa" strokeWidth="2" opacity={0.4 + flow * 0.6} filter="url(#glow)" />

        <FloorLabel x={1.7} y={1.7} text="CAMPUS CONNECT" size={30} weight={700} opacity={0.18 + assemble * 0.5} />
        {PEDESTALS.map((pd) => <Pedestal key={pd.key} p={pd} glow={glow(pd.key)} />)}

        {/* back half of the skills ring */}
        <path d={(() => { const r = ring(ORB_Z - 0.35); return `M${r.cx - r.rx},${r.cy} A${r.rx},${r.ry} 0 0 1 ${r.cx + r.rx},${r.cy}`; })()}
          fill="none" stroke="#a78bfa" strokeWidth="1.5" strokeDasharray="4 6" opacity={match * 0.8} />

        {/* light streams into the orb */}
        {INFLOWS.map((a) => (
          <g key={a.key} opacity={flow}>
            <path d={arcPath(a.a, a.b, a.lift)} fill="none" stroke={a.color} strokeWidth="6" strokeOpacity=".12" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - flow} />
            <path d={arcPath(a.a, a.b, a.lift)} fill="none" stroke={a.color} strokeWidth="1.8" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - flow} filter="url(#glow)" />
          </g>
        ))}
        {[OUTFLOW, SWEEP].map((a, i) => (
          <g key={i} opacity={send}>
            <path d={arcPath(a.a, a.b, a.lift)} fill="none" stroke={a.color} strokeWidth="2" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - send} filter="url(#glow)" />
          </g>
        ))}
        {Array.from({ length: 6 }, (_, i) => (
          <circle key={i} ref={(el) => (flowDots.current[i] = el)} r={4} fill="#fff" stroke={i < 4 ? INFLOWS[i].color : "#7c3aed"} strokeWidth="2" opacity="0" filter="url(#glow)" />
        ))}
      </svg>

      {/* what each stream carries */}
      {INFLOWS.map((a) => {
        const [x, y] = arcPoint(a.a, a.b, a.lift, 0.42);
        return (
          <div key={a.key} className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-brand-100 bg-white/95 px-2.5 py-1 text-[10px] font-medium text-brand-800 shadow-soft"
            style={{ left: x, top: y, opacity: flow * (1 - match), zIndex: 22 }}>{STREAM_LABEL[a.key]}</div>
        );
      })}

      {/* pedestal icons */}
      {PEDESTALS.map((pd) => {
        const [x, y] = P(pd.x, pd.y, PH);
        const Icon = pd.icon;
        return (
          <div key={pd.key} className="absolute" style={{ left: x - 26, top: y - 54 - (1 - assemble) * 30, opacity: assemble, transition: "top .2s" }}>
            <div className="mx-auto flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-white bg-gradient-to-b from-white to-brand-50 shadow-[0_12px_30px_-8px_rgba(124,58,237,.45)]">
              <Icon className="h-6 w-6" style={{ color: pd.color }} />
            </div>
            <div className="absolute left-1/2 top-[60px] -translate-x-1/2 whitespace-nowrap rounded-full bg-white/90 px-2.5 py-0.5 text-[9px] font-semibold tracking-[.18em] text-brand-900 shadow-soft">{pd.label}</div>
          </div>
        );
      })}

      <Orb energy={Math.max(flow, match)} />

      {/* holographic panels */}
      <Panel anchor={[-3.2, 0, PH + 0.95]} show={panels} tilt={10} width={178}>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-50"><BadgeCheck className="h-4 w-4 text-emerald-600" /></span>
          <div className="text-[11px] font-semibold leading-tight">College & company<br />verified</div>
        </div>
        <div className="mt-2.5 space-y-1.5 text-[10px] text-ink-muted">
          {["AISHE code checked", "CIN / GSTIN checked", "Official domain"].map((x) => <div key={x} className="flex items-center gap-1.5"><Check className="h-3 w-3 text-brand-600" />{x}</div>)}
        </div>
      </Panel>

      <Panel anchor={[0, -3.2, PH + 0.95]} show={panels} tilt={-10} width={196}>
        <div className="mb-2 flex items-center justify-between text-[11px] font-semibold">Company portal <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[9px] text-brand-700">3 drives</span></div>
        {[["Software Engineer", "Shortlist"], ["Data Analyst", "Assess"], ["Backend Dev", "Interview"]].map(([r, s]) => (
          <div key={r} className="mb-1.5 flex items-center justify-between rounded-lg bg-white/80 px-2 py-1.5 text-[10px]">
            <span className="flex items-center gap-1.5"><User className="h-3 w-3 text-ink-muted" />{r}</span><span className="rounded-full bg-ink px-2 py-0.5 text-[9px] text-white">{s}</span>
          </div>
        ))}
      </Panel>

      <Panel anchor={[0, 3.2, PH + 0.95]} show={panels} tilt={10} width={182}>
        <div className="flex items-center gap-3">
          <svg width="56" height="56" viewBox="0 0 56 56"><circle cx="28" cy="28" r="23" fill="none" stroke="#efeaff" strokeWidth="6" />
            <circle cx="28" cy="28" r="23" fill="none" stroke="#7c3aed" strokeWidth="6" strokeLinecap="round" strokeDasharray={144.5} strokeDashoffset={144.5 * (1 - 0.92 * panels)} transform="rotate(-90 28 28)" />
            <text x="28" y="32" textAnchor="middle" fontSize="13" fontWeight="600" fill="#111114">{Math.round(92 * panels)}%</text></svg>
          <div className="text-[11px] font-semibold leading-tight">Resume<br />match</div>
        </div>
        <div className="mt-2 flex flex-wrap gap-1 text-[9px]">
          {["Python", "SQL", "Cloud"].map((s) => <span key={s} className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">✓ {s}</span>)}
          <span className="rounded-full bg-rose-50 px-2 py-0.5 text-rose-600">✗ Power BI</span>
        </div>
      </Panel>

      <Panel anchor={[3.2, 0, PH + 0.95]} show={panels} tilt={-10} width={190}>
        <div className="text-[11px] font-semibold">Placement stats</div>
        <div className="text-lg font-medium leading-tight">{Math.round(87 * panels)}% <span className="text-[10px] font-normal text-ink-muted">placed</span></div>
        <svg viewBox="0 0 160 46" className="mt-1 w-full">
          <defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8b5cf6" stopOpacity=".45" /><stop offset="1" stopColor="#8b5cf6" stopOpacity="0" /></linearGradient></defs>
          <path d="M0,40 L20,34 L40,36 L60,26 L80,28 L100,18 L120,20 L140,8 L160,4 L160,46 L0,46Z" fill="url(#area)" />
          <path d="M0,40 L20,34 L40,36 L60,26 L80,28 L100,18 L120,20 L140,8 L160,4" fill="none" stroke="#6d28d9" strokeWidth="2" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - panels} />
        </svg>
      </Panel>

      {/* skills ring (front chips sit above the orb) */}
      {SKILLS.map((s, i) => (
        <div key={s} ref={(el) => (chipRefs.current[i] = el)} className="absolute left-0 top-0 whitespace-nowrap rounded-full border border-white bg-white/85 px-3 py-1 text-[11px] font-medium text-brand-800 shadow-[0_8px_20px_-6px_rgba(124,58,237,.4)] backdrop-blur" style={{ opacity: 0 }}>{s}</div>
      ))}
      <svg className="pointer-events-none absolute inset-0" width={W} height={H} style={{ zIndex: 25 }}>
        <path d={(() => { const r = ring(ORB_Z - 0.35); return `M${r.cx - r.rx},${r.cy} A${r.rx},${r.ry} 0 0 0 ${r.cx + r.rx},${r.cy}`; })()}
          fill="none" stroke="#7c3aed" strokeWidth="2" opacity={match * 0.7} />
      </svg>

      {/* matched profile from the orb */}
      {(() => {
        const [x, y] = P(0, 0, ORB_Z + 2.35);
        return (
          <div className="absolute" style={{ left: x - 140, top: y - 70 + (1 - match) * 90, width: 280, opacity: match, transform: `scale(${0.7 + 0.3 * match})`, zIndex: 40 }}>
            <div className="rounded-2xl border border-white bg-white/85 p-4 shadow-[0_30px_60px_-15px_rgba(91,33,182,.45)] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-brand-200 to-brand-500 text-xs font-semibold text-white">RS</span>
                <div className="flex-1"><div className="text-xs font-semibold">Top matched profile</div><div className="text-[10px] text-ink-muted">Backend Developer · Orbit Fintech</div></div>
                <span className="text-lg font-semibold text-brand-700">{Math.round(95 * match)}%</span>
              </div>
              <div className="mt-3 space-y-1.5 text-[10px]">
                {[["Skill coverage", 95], ["Project experience", 82], ["Assessment fit", 88]].map(([l, v]) => (
                  <div key={l} className="grid grid-cols-[96px_1fr] items-center gap-2"><span className="text-ink-muted">{l}</span>
                    <div className="h-1.5 rounded-full bg-brand-50"><div className="h-1.5 rounded-full bg-gradient-to-r from-brand-400 to-brand-700" style={{ width: `${v * match}%` }} /></div></div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* interview request toast */}
      <div className="absolute" style={{ left: CX + 560, top: 300 - (1 - send) * 24, opacity: send, zIndex: 45 }}>
        <div className="flex items-center gap-3 rounded-2xl border border-white bg-white/90 px-4 py-3 shadow-[0_20px_50px_-12px_rgba(91,33,182,.45)] backdrop-blur-xl">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white"><Check className="h-4 w-4" /></span>
          <div><div className="text-xs font-semibold">Interview request sent</div><div className="text-[10px] text-emerald-700">95% profile match</div></div>
        </div>
      </div>
      <div className="absolute flex items-center gap-2 rounded-2xl border border-white bg-white/90 px-4 py-2.5 text-xs text-ink-soft shadow-[0_20px_50px_-12px_rgba(91,33,182,.35)] backdrop-blur-xl" style={{ left: CX - 560, top: 660, opacity: send, zIndex: 45 }}>
        <Sparkles className="h-3.5 w-3.5 text-brand-600" /> Not shortlisted elsewhere? See why, then focus on <b className="font-medium text-brand-700">Power BI</b>
      </div>
    </div>
  );
}
