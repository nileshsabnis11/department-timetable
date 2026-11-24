import { useState } from 'react';
import Button from '../ui/Button';
import { Select } from '../ui/inputs';
import { WEIGHT_FIELDS, weightsAreDefault } from '../../lib/schedulerWeights';

export default function GeneratorBar({
  onGenerate,
  hasTimetable,
  pinnedCount = 0,
  disabled = false,
  weights,
  onWeightsChange,
  divisions = [],
  faculty = [],
  onRegenerateScope,
}) {
  const [scope, setScope] = useState('');
  const [setupOpen, setSetupOpen] = useState(false);

  const customWeights = weights && !weightsAreDefault(weights);
  const scopeParts = scope.split(':');
  const scopeLabel = scope
    ? scopeParts[0] === 'div'
      ? `division ${divisions.find((item) => item.id === scopeParts[1])?.name ?? ''}`
      : `faculty ${faculty.find((item) => item.id === scopeParts[1])?.shortCode ?? ''}`
    : '';

  return (
    <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Timetable Generator</h2>
          <p className="mt-0.5 max-w-xl text-xs text-slate-500">
            Runs the constraint solver on the current Master Data and saves the result in this
            browser. Practicals are placed as full 2-hour blocks first, then theory lectures;
            elective baskets claim their shared slot before both.
          </p>
          {pinnedCount > 0 ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700">
              📌 {pinnedCount} pinned session{pinnedCount === 1 ? '' : 's'} will be kept in
              place; only the remaining hours are re-scheduled.
            </p>
          ) : null}
          {disabled ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-800">
              Archived semester — generation is disabled. Unarchive to regenerate.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSetupOpen((previous) => !previous)}
            aria-expanded={setupOpen}
          >
            {setupOpen ? 'Hide options' : 'Scheduling options'}
            {customWeights ? ' · custom' : ''}
          </Button>
          <Button onClick={onGenerate} disabled={disabled} className="px-5 py-2.5">
            {hasTimetable
              ? pinnedCount > 0
                ? `Regenerate (keep ${pinnedCount} pinned)`
                : 'Regenerate Timetable'
              : 'Generate Timetable'}
          </Button>
        </div>
      </div>

      {setupOpen ? (
        <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 lg:grid-cols-2">
          <div>
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Soft constraints
              </p>
              {onWeightsChange ? (
                <button
                  type="button"
                  onClick={() =>
                    onWeightsChange({ fatigue: 1, sameDay: 1, balance: 1 })
                  }
                  className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800"
                >
                  Reset to balanced
                </button>
              ) : null}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Multipliers over the engine's built-in penalties. They change preference, never
              hard constraints.
            </p>
            <div className="mt-2 space-y-2">
              {WEIGHT_FIELDS.map((field) => (
                <label key={field.key} className="block">
                  <span className="flex items-center justify-between gap-2 text-xs font-medium text-slate-700">
                    {field.label}
                    <span className="tabular-nums text-slate-400">
                      ×{Number(weights?.[field.key] ?? 1).toFixed(1)}
                    </span>
                  </span>
                  <input
                    type="range"
                    min="0"
                    max="3"
                    step="0.5"
                    value={Number(weights?.[field.key] ?? 1)}
                    onChange={(event) =>
                      onWeightsChange?.({
                        ...(weights ?? {}),
                        [field.key]: Number(event.target.value),
                      })
                    }
                    disabled={!onWeightsChange || disabled}
                    className="mt-1 w-full accent-indigo-600"
                    aria-label={field.label}
                  />
                  <span className="block text-[10px] text-slate-400">{field.hint}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="lg:border-l lg:border-slate-200 lg:pl-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Partial regeneration
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Rebuild one division or one faculty member's hours, keeping every other session
              exactly where it is.
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <label className="min-w-48 flex-1">
                <span className="mb-1 block text-[11px] font-medium text-slate-600">Scope</span>
                <Select
                  value={scope}
                  onChange={(event) => setScope(event.target.value)}
                  disabled={disabled}
                  aria-label="Partial regeneration scope"
                >
                  <option value="">Choose what to rebuild…</option>
                  {divisions.length > 0 ? (
                    <optgroup label="One division">
                      {divisions.map((division) => (
                        <option key={division.id} value={`div:${division.id}`}>
                          {division.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {faculty.length > 0 ? (
                    <optgroup label="One faculty member">
                      {faculty.map((member) => (
                        <option key={member.id} value={`fac:${member.id}`}>
                          {member.shortCode} — {member.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                </Select>
              </label>
              <Button
                size="sm"
                variant="secondary"
                disabled={disabled || !scope || !hasTimetable || !onRegenerateScope}
                onClick={() => {
                  if (!scope) return;
                  onRegenerateScope(
                    scopeParts[0] === 'div'
                      ? { divisionId: scopeParts[1] }
                      : { facultyId: scopeParts[1] },
                  );
                }}
              >
                Rebuild {scopeLabel || 'scope'}
              </Button>
            </div>
            <p className="mt-2 text-[10px] text-slate-400">
              Fixed slots and pinned sessions outside the scope are preserved.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
