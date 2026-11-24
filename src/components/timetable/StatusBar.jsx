import Badge from '../ui/Badge';

function Stat({ label, value }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
        {label}
      </span>
      <span className="text-xs font-semibold tabular-nums text-slate-700">{value}</span>
    </div>
  );
}

export default function StatusBar({ stats, validation, clashCount }) {
  if (!stats) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-white px-4 py-3 text-xs text-slate-500">
        No timetable generated yet — press Generate Timetable to run the engine.
      </div>
    );
  }

  const failed = stats.success === false;
  const liveClashes = clashCount ?? 0;

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <Stat label="Generated in" value={`${stats.durationMs} ms`} />
      <Stat label="Soft score" value={stats.softScore} />
      <Stat label="Search steps" value={stats.attempts} />
      <div className="ml-auto flex items-center gap-2">
        {failed ? (
          <Badge tone="rose">
            Incomplete · {stats.conflicts?.length ?? 0} conflict
            {(stats.conflicts?.length ?? 0) === 1 ? '' : 's'}
          </Badge>
        ) : liveClashes === 0 ? (
          <Badge tone="emerald">0 Clashes ✓</Badge>
        ) : (
          <Badge tone="rose">
            {liveClashes} Clash{liveClashes === 1 ? '' : 'es'}
          </Badge>
        )}
        {validation && !validation.isValid && liveClashes === 0 ? (
          <Badge tone="rose">Validation failed</Badge>
        ) : null}
      </div>
    </div>
  );
}
