const SHADES = ["#2e1065", "#5b21b6", "#7c3aed", "#a585fa", "#c4b2fd"];

export default function Funnel({ data }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <div className="space-y-3.5">
      {data.map((d, i) => (
        <div key={d.stage} className="grid grid-cols-[130px_1fr_78px] items-center gap-3 text-sm">
          <span className="text-ink-muted">{d.label || d.stage}</span>
          <div className="h-7 rounded-full bg-brand-50">
            <div className="h-7 rounded-full transition-all" style={{ width: `${Math.max(2, (d.count / max) * 100)}%`, background: SHADES[i] }} />
          </div>
          <span className="text-right tabular-nums"><span className="font-medium">{d.count}</span> <span className="text-xs text-ink-muted">{d.pct}%</span></span>
        </div>
      ))}
    </div>
  );
}
