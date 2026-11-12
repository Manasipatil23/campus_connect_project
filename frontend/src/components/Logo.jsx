export function LogoMark({ className = "h-6 w-6" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="cc-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#a585fa" />
          <stop offset="1" stopColor="#6d28d9" />
        </linearGradient>
      </defs>
      <path d="M12 1.5v5M12 17.5v5M1.5 12h5M17.5 12h5" stroke="url(#cc-g)" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M12 6.5c.6 3 2.5 4.9 5.5 5.5-3 .6-4.9 2.5-5.5 5.5-.6-3-2.5-4.9-5.5-5.5 3-.6 4.9-2.5 5.5-5.5z" fill="url(#cc-g)" />
    </svg>
  );
}

export default function Logo({ sub, dark }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark />
      <div className="leading-tight">
        <div className={`text-[15px] font-medium ${dark ? "text-white" : "text-ink"}`}>Campus Connect</div>
        {sub && <div className="text-[10px] font-semibold uppercase tracking-eyebrow text-brand-600">{sub}</div>}
      </div>
    </div>
  );
}
