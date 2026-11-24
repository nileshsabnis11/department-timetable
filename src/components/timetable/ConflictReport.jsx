export default function ConflictReport({ conflicts = [], suggestions = [], unscheduled = [] }) {
  if (conflicts.length === 0) return null;

  return (
    <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-rose-800">Conflict Report</h3>
        <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
          {conflicts.length} issue{conflicts.length === 1 ? '' : 's'}
        </span>
      </div>
      <p className="mt-1 text-xs text-rose-600">
        A complete timetable could not be produced. Each issue lists the most direct fix;
        adjust the Master Data and regenerate.
      </p>
      <ul className="mt-3 space-y-2">
        {conflicts.map((message, index) => (
          <li
            key={`${index}-${message.slice(0, 24)}`}
            className="rounded-lg border border-rose-100 bg-white/60 px-3 py-2 text-xs leading-relaxed text-rose-700"
          >
            <div className="flex gap-2">
              <span aria-hidden="true" className="mt-0.5 text-rose-400">
                ●
              </span>
              <span>{message}</span>
            </div>
            {suggestions[index] ? (
              <p className="mt-1 pl-4 text-[11px] font-medium text-emerald-800">
                <span className="font-semibold">Suggested fix:</span> {suggestions[index]}
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      {unscheduled.length > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Unscheduled requirements — place these by hand or relax the constraints
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[11px] text-amber-800">
            {unscheduled.slice(0, 8).map((item, index) => (
              <li key={`${index}-${item.subjectId ?? item.message?.slice(0, 12)}`}>
                {item.message}
              </li>
            ))}
            {unscheduled.length > 8 ? (
              <li className="list-none pl-0 text-[10px] font-medium text-slate-500">
                +{unscheduled.length - 8} more requirement(s)
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
