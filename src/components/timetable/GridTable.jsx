import { formatSlotRange } from '../../lib/time';
import { buildTimeRows, enabledDays } from './timetableUtils';

export default function GridTable({ masterData, renderCell, dense = false }) {
  const days = enabledDays(masterData);
  const rows = buildTimeRows(masterData);

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[960px] border-collapse align-top text-left">
        <thead>
          <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
            <th className="sticky left-0 z-10 w-28 border-b border-slate-200 bg-slate-50 px-3 py-2 font-semibold">
              Time
            </th>
            {days.map((day) => (
              <th
                key={day.id}
                className="border-b border-l border-slate-200 px-3 py-2 font-semibold"
              >
                {day.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) =>
            row.type === 'break' ? (
              <tr key={`break-${row.break.id}`} className="bg-slate-100/80">
                <td className="sticky left-0 z-10 border-b border-slate-200 bg-slate-100 px-3 py-1.5 text-[10px] font-medium text-slate-500">
                  {formatSlotRange(row.break)}
                </td>
                <td
                  colSpan={days.length}
                  className="border-b border-l border-slate-200 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                >
                  {row.break.label} · non-teaching
                </td>
              </tr>
            ) : (
              <tr key={row.slot.id}>
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-b border-slate-200 bg-white px-3 py-2 text-left align-top"
                >
                  <span className="block text-[11px] font-semibold text-slate-700">
                    {row.slot.label}
                  </span>
                  <span className="block text-[10px] font-normal text-slate-400">
                    {formatSlotRange(row.slot)}
                  </span>
                </th>
                {days.map((day) => renderCell(day, row.slot, row.index, dense))}
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}
