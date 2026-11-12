import { useEffect, useRef } from "react";

/**
 * A field of small dashes that drift on a slow flow field and swirl away from
 * the cursor, then spring back home. Each particle has a depth (z) that sets
 * its size, opacity and how strongly it reacts, which gives a parallax feel.
 */
export default function ParticleField({ density = 1, className = "", interactive = true }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const mouse = { x: -9999, y: -9999, active: false };
    const colors = ["124,58,237", "139,92,246", "165,133,250", "99,102,241", "196,178,253"];
    let w = 0, h = 0, parts = [], raf = 0, t = 0, visible = true;

    const build = () => {
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(((w * h) / 5200) * density);
      parts = Array.from({ length: n }, () => {
        const z = Math.random();
        const hx = Math.random() * w, hy = Math.random() * h;
        return { hx, hy, x: hx, y: hy, vx: 0, vy: 0, z, c: colors[(Math.random() * colors.length) | 0],
                 len: 2 + z * 4, phase: Math.random() * Math.PI * 2 };
      });
    };

    const draw = () => {
      t += 0.006;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        // slow drift around home on a cheap flow field
        const fx = Math.sin(p.hy * 0.008 + t + p.phase) * 10 * (0.4 + p.z);
        const fy = Math.cos(p.hx * 0.008 + t * 0.8 + p.phase) * 10 * (0.4 + p.z);
        let ax = (p.hx + fx - p.x) * 0.012;
        let ay = (p.hy + fy - p.y) * 0.012;
        if (mouse.active) {
          const dx = p.x - mouse.x, dy = p.y - mouse.y;
          const d2 = dx * dx + dy * dy, r = 150 + p.z * 60;
          if (d2 < r * r) {
            const d = Math.sqrt(d2) || 1, f = (1 - d / r) * (1.6 + p.z * 2.2);
            ax += (dx / d) * f - (dy / d) * f * 0.6; // push out + swirl
            ay += (dy / d) * f + (dx / d) * f * 0.6;
          }
        }
        p.vx = (p.vx + ax) * 0.88;
        p.vy = (p.vy + ay) * 0.88;
        p.x += p.vx; p.y += p.vy;
        const speed = Math.min(1, Math.hypot(p.vx, p.vy) / 4);
        const ang = Math.atan2(p.vy, p.vx) || p.phase;
        const L = p.len + speed * 6;
        ctx.strokeStyle = `rgba(${p.c},${0.18 + p.z * 0.5 + speed * 0.3})`;
        ctx.lineWidth = 0.8 + p.z * 1.4;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(p.x - Math.cos(ang) * L * 0.5, p.y - Math.sin(ang) * L * 0.5);
        ctx.lineTo(p.x + Math.cos(ang) * L * 0.5, p.y + Math.sin(ang) * L * 0.5);
        ctx.stroke();
      }
      if (!reduce && visible) raf = requestAnimationFrame(draw);
    };

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top;
      mouse.active = mouse.x >= 0 && mouse.y >= 0 && mouse.x <= r.width && mouse.y <= r.height;
    };
    const onLeave = () => { mouse.active = false; };
    const io = new IntersectionObserver(([e]) => {
      const was = visible; visible = e.isIntersecting;
      if (visible && !was && !reduce) raf = requestAnimationFrame(draw);
    });

    build();
    draw();
    io.observe(canvas);
    const ro = new ResizeObserver(() => { build(); if (reduce) draw(); });
    ro.observe(canvas);
    if (interactive) {
      window.addEventListener("pointermove", onMove, { passive: true });
      window.addEventListener("pointerleave", onLeave);
    }
    return () => {
      cancelAnimationFrame(raf); io.disconnect(); ro.disconnect();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, [density, interactive]);

  return <canvas ref={ref} className={`pointer-events-none absolute inset-0 h-full w-full ${className}`} aria-hidden="true" />;
}
