import { useEffect, useRef } from "react";

/**
 * A rotating 3D sphere of dots (Fibonacci lattice) with glowing "campus" nodes
 * and arcs travelling between them. Dragging the mouse across it tilts the
 * rotation. Pure canvas 2D with a perspective projection — no 3D library.
 */
export default function DotGlobe({ className = "", size = 520 }) {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const N = 900;
    const pts = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const th = i * Math.PI * (3 - Math.sqrt(5));
      pts.push([Math.cos(th) * r, y, Math.sin(th) * r]);
    }
    const nodes = Array.from({ length: 14 }, () => pts[(Math.random() * N) | 0]);
    const arcs = Array.from({ length: 9 }, () => ({ a: nodes[(Math.random() * nodes.length) | 0], b: nodes[(Math.random() * nodes.length) | 0], t: Math.random() }));
    let rotY = 0, rotX = -0.35, tx = -0.35, ty = 0, raf = 0, w = 0, h = 0, visible = true;

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const project = ([x, y, z]) => {
      const cy = Math.cos(rotY), sy = Math.sin(rotY), cx = Math.cos(rotX), sx = Math.sin(rotX);
      let X = x * cy - z * sy, Z = x * sy + z * cy;
      let Y = y * cx - Z * sx; Z = y * sx + Z * cx;
      const R = Math.min(w, h) * 0.42, persp = 2.6 / (2.6 + Z);
      return { x: w / 2 + X * R * persp, y: h / 2 + Y * R * persp, z: Z, s: persp };
    };

    const slerp = (a, b, t) => {
      const v = a.map((ai, i) => ai * (1 - t) + b[i] * t);
      const len = Math.hypot(...v) || 1, lift = 1 + Math.sin(Math.PI * t) * 0.12;
      return v.map((c) => (c / len) * lift);
    };

    const frame = () => {
      rotY += 0.0028 + ty * 0.02;
      rotX += (tx - rotX) * 0.04;
      ty *= 0.95;
      ctx.clearRect(0, 0, w, h);

      // soft halo
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.min(w, h) * 0.5);
      g.addColorStop(0, "rgba(196,178,253,0.35)"); g.addColorStop(1, "rgba(196,178,253,0)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

      for (const p of pts) {
        const q = project(p);
        const front = (1 - q.z) / 2; // 0 back .. 1 front
        ctx.fillStyle = `rgba(109,40,217,${0.08 + front * 0.55})`;
        ctx.beginPath(); ctx.arc(q.x, q.y, 0.6 + front * 1.4 * q.s, 0, Math.PI * 2); ctx.fill();
      }
      for (const arc of arcs) {
        arc.t += 0.006; if (arc.t > 1.4) { arc.t = 0; arc.a = arc.b; arc.b = nodes[(Math.random() * nodes.length) | 0]; }
        let pen = false;
        ctx.beginPath();
        for (let k = 0; k <= 40; k++) {
          const tt = k / 40; if (tt > arc.t) break;
          const q = project(slerp(arc.a, arc.b, tt));
          if (q.z > 0.15) { pen = false; continue; } // hide the part behind the globe
          pen ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y);
          pen = true;
        }
        ctx.strokeStyle = "rgba(124,58,237,0.6)"; ctx.lineWidth = 1.3; ctx.stroke();
      }
      const pulse = (Math.sin(performance.now() / 400) + 1) / 2;
      for (const n of nodes) {
        const q = project(n); if (q.z > 0.2) continue;
        ctx.fillStyle = "rgba(124,58,237,0.18)";
        ctx.beginPath(); ctx.arc(q.x, q.y, 6 + pulse * 6, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#6d28d9";
        ctx.beginPath(); ctx.arc(q.x, q.y, 2.6, 0, Math.PI * 2); ctx.fill();
      }
      if (!reduce && visible) raf = requestAnimationFrame(frame);
    };

    const onMove = (e) => {
      const r = canvas.getBoundingClientRect();
      const nx = (e.clientX - r.left) / r.width - 0.5, ny = (e.clientY - r.top) / r.height - 0.5;
      if (Math.abs(nx) < 0.8 && Math.abs(ny) < 0.8) { ty = nx * 0.6; tx = -0.35 + ny * 0.6; }
    };
    const io = new IntersectionObserver(([e]) => {
      const was = visible; visible = e.isIntersecting;
      if (visible && !was && !reduce) raf = requestAnimationFrame(frame);
    });
    resize(); frame(); io.observe(canvas);
    const ro = new ResizeObserver(resize); ro.observe(canvas);
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { cancelAnimationFrame(raf); io.disconnect(); ro.disconnect(); window.removeEventListener("pointermove", onMove); };
  }, []);

  return <canvas ref={ref} className={className} style={{ width: "100%", height: size }} aria-hidden="true" />;
}
