import { useEffect, useState } from 'react';
import Button from '../ui/Button';

const DEFAULT_OPTIONS = {
  includeMaster: true,
  includeDivisions: true,
  includeFaculty: true,
  includeRooms: true,
  includeSummaries: true,
  includeHealth: true,
  use24h: false,
  fileName: '',
};

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

const CHOICES = [
  {
    field: 'includeMaster',
    label: 'Master timetable (A3)',
    hint: 'All divisions on one landscape sheet.',
  },
  {
    field: 'includeDivisions',
    label: 'Division tabs',
    hint: 'One A4 landscape sheet per class, with legend and signatures.',
  },
  {
    field: 'includeFaculty',
    label: 'Faculty tabs',
    hint: 'One sheet per faculty member with load and covering duties.',
  },
  {
    field: 'includeRooms',
    label: 'Room / lab tabs',
    hint: 'One sheet per room showing who occupies it each hour.',
  },
  {
    field: 'includeHealth',
    label: 'Schedule Health',
    hint: 'Validator findings, unscheduled hours and room utilisation.',
  },
  {
    field: 'includeSummaries',
    label: 'Workload & utilisation summaries',
    hint: 'Faculty hours and free room slots.',
  },
];

export default function ExcelExportModal({ open, onClose, onExport, busy = false }) {
  const [draft, setDraft] = useState(DEFAULT_OPTIONS);

  useEffect(() => {
    if (open) setDraft(DEFAULT_OPTIONS);
  }, [open]);

  if (!open) return null;

  const toggle = (field) => (event) => {
    const checked = event.target.checked;
    setDraft((previous) => ({ ...previous, [field]: checked }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    onExport(draft);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="excel-export-title"
      className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-900/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 id="excel-export-title" className="text-base font-semibold text-slate-900">
              Export Excel Workbook
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Choose the sheets to include. Every timetable tab carries the institutional
              header, W.E.F. date, legend, signature block and page numbers.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Close Excel export options"
            className="rounded-lg p-1 text-lg leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
          >
            ×
          </button>
        </div>

        <fieldset className="mt-4 grid gap-2 sm:grid-cols-2">
          <legend className="sr-only">Included sheets</legend>
          {CHOICES.map((choice) => (
            <label
              key={choice.field}
              className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 px-3 py-2 transition hover:border-slate-300"
            >
              <input
                type="checkbox"
                checked={Boolean(draft[choice.field])}
                onChange={toggle(choice.field)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>
                <span className="block text-xs font-semibold text-slate-800">
                  {choice.label}
                </span>
                <span className="block text-[11px] leading-snug text-slate-500">
                  {choice.hint}
                </span>
              </span>
            </label>
          ))}
        </fieldset>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-slate-600">
              File name (optional)
            </span>
            <input
              type="text"
              value={draft.fileName}
              onChange={(event) =>
                setDraft((previous) => ({ ...previous, fileName: event.target.value }))
              }
              placeholder="timetable-2026-27-even"
              className={inputClass}
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-slate-200 px-3 py-2">
            <input
              type="checkbox"
              checked={Boolean(draft.use24h)}
              onChange={toggle('use24h')}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-xs font-medium text-slate-700">
              24-hour slot times
            </span>
          </label>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <Button type="button" size="sm" variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? 'Preparing…' : 'Export workbook'}
          </Button>
        </div>
      </form>
    </div>
  );
}
