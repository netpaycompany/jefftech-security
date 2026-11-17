import { AlertTriangle, CheckCircle2, Fingerprint, RotateCcw, ShieldCheck } from "lucide-react";

export type HealthMetrics = { total: number; weak: number; reused: number; old: number };

export function HealthPanel({ metrics }: { metrics: HealthMetrics }) {
  const recommendations = [
    metrics.weak > 0 && `${metrics.weak} weak password${metrics.weak === 1 ? "" : "s"} need strengthening.`,
    metrics.reused > 0 && `${metrics.reused} password record${metrics.reused === 1 ? " uses" : "s use"} a reused password.`,
    metrics.old > 0 && `${metrics.old} password${metrics.old === 1 ? " is" : "s are"} over one year old.`,
  ].filter(Boolean) as string[];

  return (
    <section className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-white">Security health</p>
        <p className="text-xs text-slate-400">Analysis runs locally. Passwords are never sent for analysis.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { label: "Saved passwords", value: metrics.total, icon: Fingerprint, color: "text-blue-300" },
          { label: "Weak", value: metrics.weak, icon: AlertTriangle, color: "text-amber-300" },
          { label: "Reused", value: metrics.reused, icon: RotateCcw, color: "text-orange-300" },
          { label: "Older than a year", value: metrics.old, icon: ShieldCheck, color: "text-violet-300" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="metric-card">
            <Icon size={16} className={color} />
            <p className="mt-3 text-xl font-semibold text-white">{value}</p>
            <p className="mt-1 text-[11px] text-slate-400">{label}</p>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <p className="text-xs font-semibold uppercase tracking-[.14em] text-slate-300">Recommendations</p>
        {recommendations.length ? (
          <ul className="mt-3 space-y-2 text-xs text-slate-400">
            {recommendations.map((item) => <li key={item} className="flex gap-2"><AlertTriangle size={14} className="shrink-0 text-amber-300" />{item}</li>)}
          </ul>
        ) : (
          <p className="mt-3 flex items-center gap-2 text-xs text-emerald-300"><CheckCircle2 size={15} /> No issues were found by these local checks.</p>
        )}
      </div>
    </section>
  );
}
