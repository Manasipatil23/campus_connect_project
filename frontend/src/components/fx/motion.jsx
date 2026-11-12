import { useEffect, useRef, useState } from "react";

/** Fades/slides children in when they scroll into view. */
export function Reveal({ children, delay = 0, className = "", as: Tag = "div" }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setShown(true); io.disconnect(); } }, { threshold: 0.15 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${shown ? "reveal-in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  );
}

/** 3D tilt that follows the cursor, with a moving highlight. */
export function Tilt({ children, className = "", max = 10 }) {
  const ref = useRef(null);
  const onMove = (e) => {
    const el = ref.current, r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    el.style.transform = `perspective(900px) rotateX(${(0.5 - y) * max}deg) rotateY(${(x - 0.5) * max}deg) translateZ(0)`;
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
  };
  const reset = () => { ref.current.style.transform = "perspective(900px) rotateX(0) rotateY(0)"; };
  return (
    <div ref={ref} onPointerMove={onMove} onPointerLeave={reset} className={`tilt ${className}`}>
      {children}
    </div>
  );
}

/** Counts up to `to` once visible. */
export function CountUp({ to, suffix = "", duration = 1400 }) {
  const ref = useRef(null);
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - start) / duration);
        setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, duration]);
  return <span ref={ref} className="tabular-nums">{v.toLocaleString("en-IN")}{suffix}</span>;
}

/** Splits text into words that rise in one after another. */
export function WordsIn({ text, className = "", start = 0, step = 70 }) {
  return text.split(" ").map((w, i) => (
    <span key={i} className="inline-block overflow-hidden pb-[0.08em] align-bottom">
      <span className={`word-in inline-block ${className}`} style={{ animationDelay: `${start + i * step}ms` }}>{w}&nbsp;</span>
    </span>
  ));
}

/** Follows the cursor with a soft purple glow (desktop only). */
export function CursorGlow() {
  const ref = useRef(null);
  useEffect(() => {
    let x = 0, y = 0, cx = 0, cy = 0, raf;
    const move = (e) => { x = e.clientX; y = e.clientY; };
    const loop = () => {
      cx += (x - cx) * 0.12; cy += (y - cy) * 0.12;
      if (ref.current) ref.current.style.transform = `translate(${cx - 200}px, ${cy - 200}px)`;
      raf = requestAnimationFrame(loop);
    };
    window.addEventListener("pointermove", move, { passive: true });
    loop();
    return () => { window.removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, []);
  return <div ref={ref} className="pointer-events-none fixed left-0 top-0 z-0 hidden h-[400px] w-[400px] rounded-full bg-brand-300/20 blur-3xl md:block" aria-hidden="true" />;
}
