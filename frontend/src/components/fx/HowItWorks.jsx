import { useEffect, useRef, useState } from "react";
import HoloScene, { STAGES } from "./HoloScene";

/** Pins the isometric scene while the user scrolls through ~4 screens; scroll position drives the story. */
export default function HowItWorks() {
  const section = useRef(null);
  const stageBox = useRef(null);
  const [progress, setProgress] = useState(0);
  const [scale, setScale] = useState(1);
  const target = useRef(0);
  const shown = useRef(0);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf;
    const measure = () => {
      const el = section.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const total = r.height - window.innerHeight;
      target.current = reduce ? 1 : Math.min(1, Math.max(0, -r.top / total));
    };
    const loop = () => {
      // ease toward the scroll position so the scene glides rather than jumps
      shown.current += (target.current - shown.current) * 0.12;
      if (Math.abs(target.current - shown.current) < 0.0005) shown.current = target.current;
      setProgress((p) => (Math.abs(p - shown.current) > 0.0004 ? shown.current : p));
      raf = requestAnimationFrame(loop);
    };
    const fit = () => {
      const box = stageBox.current;
      if (!box) return;
      setScale(Math.min(box.clientWidth / 1800, box.clientHeight / 780, 1.15));
    };
    measure(); fit(); loop();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", () => { measure(); fit(); });
    const ro = new ResizeObserver(fit);
    ro.observe(stageBox.current);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", measure); ro.disconnect(); };
  }, []);

  const idx = STAGES.reduce((acc, s, i) => (progress >= s.at ? i : acc), 0);

  return (
    <section ref={section} id="how" className="relative" style={{ height: "430vh" }}>
      <div className="sticky top-0 flex h-screen flex-col overflow-hidden pt-24 sm:pt-28">
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-transparent via-brand-50/70 to-transparent" />
        <div className="relative mx-auto w-full max-w-7xl px-5 sm:px-8">
          <div className="eyebrow">How Campus Connect works</div>
          <div className="relative mt-4 h-[118px] sm:h-[132px]">
            {STAGES.map((s, i) => (
              <div key={i} className="absolute inset-0 transition-all duration-700"
                style={{ opacity: i === idx ? 1 : 0, transform: `translateY(${i === idx ? 0 : i < idx ? -18 : 18}px)`, pointerEvents: i === idx ? "auto" : "none" }}>
                <h2 className="text-3xl font-medium leading-tight tracking-[-0.03em] sm:text-5xl">{s.title} <span className="accent">{s.accent}</span></h2>
                <p className="mt-3 max-w-2xl text-sm text-ink-muted sm:text-base">{s.text}</p>
              </div>
            ))}
          </div>
          <div className="absolute right-5 top-0 hidden flex-col items-end gap-2 sm:right-8 md:flex">
            {STAGES.map((s, i) => (
              <div key={i} className="flex items-center gap-3 text-xs">
                <span className={`transition ${i === idx ? "text-ink" : "text-ink-muted/60"}`}>{s.accent.replace(/\.$/, "")}</span>
                <span className={`h-1.5 rounded-full transition-all duration-500 ${i <= idx ? "w-8 bg-brand-600" : "w-3 bg-brand-200"}`} />
              </div>
            ))}
          </div>
        </div>
        <div ref={stageBox} className="relative mx-auto w-full max-w-[1840px] flex-1">
          <div className="absolute left-1/2 top-1/2" style={{ transform: `translate(-50%, -50%) scale(${scale})`, transformOrigin: "center" }}>
            <HoloScene progress={progress} />
          </div>
        </div>
        <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 text-xs text-ink-muted transition-opacity" style={{ opacity: progress < 0.04 ? 1 : 0 }}>
          Scroll to see it come together ↓
        </div>
      </div>
    </section>
  );
}
