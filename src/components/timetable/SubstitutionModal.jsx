import { useEffect, useMemo, useState } from 'react';
import Button from '../ui/Button';
import {
  facultyScheduledHours,
  planSubstitutions,
  suggestSubstitutions,
} from '../../engine/substitution';

/**
 * Marks faculty as absent and proposes clash-free cover for every session they
 * teach. The replacement keeps the session's day, slot and room; only the
 * teacher of the affected lecture or lab batch changes.
 */
export default function SubstitutionModal({
  open,
  onClose,
  sessions,
  masterData,
  onApply,
}) {
  const [absentIds, setAbsentIds] = useState([]);
  const [choices, setChoices] = useState({});

  useEffect(() => {
    if (!open) return;
    setAbsentIds([]);
    setChoices({});
  }, [open]);

  const suggestions = useMemo(
    () => suggestSubstitutions(sessions, masterData, absentIds),
    [sessions, masterData, absentIds],
  );

  useEffect(() => {
    setChoices((previous) => {
      const next = {};
      for (const entry of suggestions.entries) {
        const chosen =
          previous[entry.key] && entry.candidates.some((c) => c.facultyId === previous[entry.key])
            ? previous[entry.key]
            : entry.candidates[0]?.facultyId ?? '';
        if (chosen) next[entry.key] = chosen;
      }
      return next;
    });
  }, [suggestions]);

  const plan = useMemo(
    () => planSubstitutions(sessions, masterData, absentIds, choices),
    [sessions, masterData, absentIds, choices],
  );

  if (!open) return null;

  const hours = facultyScheduledHours(sessions);
  const coverable = plan.applied;
  const uncovered = plan.uncovered.length;

  const toggleAbsent = (facultyId) => {
    setAbsentIds((previous) =>
      previous.includes(facultyId)
        ? previous.filter((id) => id !== facultyId)
        : [...previous, facultyId],
    );
  };

  const handleApply = () => {
    if (plan.applied > 0) onApply(plan.sessions);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="substitution-title"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h3 id="substitution-title" className="text-base font-semibold text-slate-900">
              Absence &amp; Substitution Assistant
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Pick who is absent. Each affected session gets the least-loaded colleague who
              is free for the whole slot, available, and within their weekly limit.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close substitution assistant"
            className="rounded-lg p-1 text-lg leading-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Absent faculty
            </p>
            {masterData.faculty.length === 0 ? (
              <p className="text-xs text-slate-500">No faculty configured.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {masterData.faculty.map((member) => {
                  const active = absentIds.includes(member.id);
                  const load = hours.get(member.id) ?? 0;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => toggleAbsent(member.id)}
                      aria-pressed={active}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        active
                          ? 'border-rose-300 bg-rose-50 text-rose-700'
                          : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {member.shortCode} · {load}/
                      {Number(member.maxWeeklyLoad) || '—'} hrs
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {absentIds.length > 0 ? (
            suggestions.entries.length === 0 ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                None of the selected faculty teach a scheduled session, so no cover is needed.
              </p>
            ) : (
              <div className="space-y-2">
                {suggestions.entries.map((entry) => {
                  const chosen = choices[entry.key] ?? '';
                  return (
                    <div
                      key={entry.key}
                      className={`rounded-xl border px-3 py-2.5 ${
                        entry.candidates.length > 0
                          ? 'border-slate-200 bg-white'
                          : 'border-amber-200 bg-amber-50'
                      }`}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-xs font-semibold text-slate-800">
                            {entry.subjectCode}
                            {entry.isPractical ? ` · batch ${entry.batchId}` : ' · theory'}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {entry.divisionName} · {entry.dayLabel} ·{' '}
                            {entry.slotLabels.join(' + ')}
                          </p>
                        </div>
                        <p className="text-[11px] font-medium text-rose-600">
                          Absent: {entry.absentFacultyShortCode || entry.absentFacultyName}
                        </p>
                      </div>

                      {entry.candidates.length === 0 ? (
                        <p className="mt-1.5 text-[11px] font-medium text-amber-800">
                          No colleague is free for the whole slot within their weekly load.
                          Free a slot, raise a load limit, or rearrange the session manually.
                        </p>
                      ) : (
                        <label className="mt-1.5 flex items-center gap-2 text-[11px] text-slate-500">
                          Cover with
                          <select
                            value={chosen}
                            onChange={(event) =>
                              setChoices((previous) => ({
                                ...previous,
                                [entry.key]: event.target.value,
                              }))
                            }
                            className="min-w-52 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800"
                          >
                            {entry.candidates.map((candidate) => (
                              <option key={candidate.facultyId} value={candidate.facultyId}>
                                {candidate.shortCode} — {candidate.name} ({candidate.hours}/
                                {candidate.maxWeeklyLoad || '—'} hrs)
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Select one or more absent faculty members to see the affected sessions.
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3">
          <p className="text-[11px] text-slate-500">
            {suggestions.entries.length > 0
              ? `${coverable} of ${suggestions.entries.length} affected session${
                  suggestions.entries.length === 1 ? '' : 's'
                } can be covered now${uncovered > 0 ? ` · ${uncovered} need manual attention` : ''}.`
              : 'No affected sessions yet.'}
          </p>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApply} disabled={coverable === 0}>
              Apply {coverable > 0 ? `${coverable} ` : ''}substitution
              {coverable === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
