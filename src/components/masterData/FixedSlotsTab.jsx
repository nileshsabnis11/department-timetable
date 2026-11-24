import { useMemo, useState } from 'react';
import SectionCard from '../ui/SectionCard';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { Field, Select, TextInput } from '../ui/inputs';
import { newId } from '../../lib/id';
import {
  FIXED_SLOT_ALL,
  FIXED_SLOT_PRESETS,
  describeFixedSlots,
  resolveFixedDayId,
  resolveFixedDivisionId,
} from '../../lib/fixedSlots';

const blankFixedSlot = (timeGrid) => ({
  id: newId('FIX'),
  division: FIXED_SLOT_ALL,
  day: (timeGrid?.workingDays ?? []).find((day) => day.enabled !== false)?.id ?? 'MON',
  slotIndices: [],
  label: FIXED_SLOT_PRESETS[0],
  facultyId: '',
  roomId: '',
});

export default function FixedSlotsTab({
  fixedSlots = [],
  divisions = [],
  faculty = [],
  rooms = [],
  timeGrid,
  onChange,
}) {
  const [draft, setDraft] = useState(() => blankFixedSlot(timeGrid));
  const [error, setError] = useState('');

  const days = (timeGrid?.workingDays ?? []).filter((day) => day.enabled !== false);
  const slots = timeGrid?.slots ?? [];

  const resolved = useMemo(
    () =>
      describeFixedSlots({
        timeGrid,
        divisions,
        faculty,
        rooms,
        fixedSlots,
      }),
    [timeGrid, divisions, faculty, rooms, fixedSlots],
  );

  const divisionName = (value) => {
    const id = resolveFixedDivisionId({ divisions }, value);
    if (id === FIXED_SLOT_ALL) return 'All divisions';
    return divisions.find((division) => division.id === id)?.name ?? String(value ?? '—');
  };

  const dayLabel = (value) => {
    const id = resolveFixedDayId({ timeGrid }, value);
    return days.find((day) => day.id === id)?.label ?? String(value ?? '—');
  };

  const slotLabels = (entry) => {
    const indices = Array.isArray(entry.slotIndices) ? entry.slotIndices : [];
    const labels = indices
      .map((index) => slots[index]?.label)
      .filter(Boolean);
    return labels.length > 0 ? labels.join(' + ') : '—';
  };

  const toggleSlot = (index) => {
    setDraft((previous) => ({
      ...previous,
      slotIndices: previous.slotIndices.includes(index)
        ? previous.slotIndices.filter((item) => item !== index)
        : [...previous.slotIndices, index].sort((first, second) => first - second),
    }));
  };

  const addFixedSlot = (event) => {
    event.preventDefault();

    const label = draft.label.trim();
    const divisionId = resolveFixedDivisionId({ divisions }, draft.division);
    const dayId = resolveFixedDayId({ timeGrid }, draft.day);
    const slotIndices = [...draft.slotIndices].sort((first, second) => first - second);

    if (!label) {
      setError('Give the fixed block a label, e.g. “Open Elective”.');
      return;
    }
    if (!dayId) {
      setError('Choose a working day.');
      return;
    }
    if (slotIndices.length === 0) {
      setError('Choose at least one slot.');
      return;
    }

    const overlap = resolved.entries.find((entry) => {
      if (entry.dayId !== dayId) return false;
      const sameScope =
        divisionId === FIXED_SLOT_ALL ||
        entry.divisionId === FIXED_SLOT_ALL ||
        entry.divisionId === divisionId;
      return sameScope && entry.slotIndices.some((index) => slotIndices.includes(index));
    });
    if (overlap) {
      setError(
        `That slot is already locked by “${overlap.label}” (${divisionName(
          overlap.divisionId,
        )} · ${overlap.dayLabel} · ${overlap.slotLabels.join(' + ')}).`,
      );
      return;
    }

    onChange([
      ...fixedSlots,
      {
        id: draft.id,
        division: divisionId,
        day: dayId,
        slotIndices,
        label,
        facultyId: draft.facultyId,
        roomId: draft.roomId,
      },
    ]);
    setDraft(blankFixedSlot(timeGrid));
    setError('');
  };

  const removeFixedSlot = (id) => {
    onChange(fixedSlots.filter((entry) => entry.id !== id));
  };

  return (
    <div className="space-y-5">
      <SectionCard
        title="Add a fixed slot"
        description="Pre-assigned blocks the generator must keep free — Open Electives, Honours/Minor, Mentoring, Library, T&P or Project hours."
      >
        <form onSubmit={addFixedSlot} className="space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <Field label="Division" className="lg:w-44">
              <Select
                value={draft.division}
                onChange={(event) => setDraft({ ...draft, division: event.target.value })}
              >
                <option value={FIXED_SLOT_ALL}>All divisions</option>
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Day" className="lg:w-40">
              <Select
                value={draft.day}
                onChange={(event) => setDraft({ ...draft, day: event.target.value })}
              >
                {days.map((day) => (
                  <option key={day.id} value={day.id}>
                    {day.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Quick preset" className="lg:w-48">
              <Select
                value={FIXED_SLOT_PRESETS.includes(draft.label) ? draft.label : ''}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    label: event.target.value || draft.label,
                  })
                }
              >
                <option value="">Custom label…</option>
                {FIXED_SLOT_PRESETS.map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Label" className="lg:flex-1">
              <TextInput
                value={draft.label}
                onChange={(event) => setDraft({ ...draft, label: event.target.value })}
                placeholder="e.g. Mentoring / Library"
              />
            </Field>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
            <Field label="Faculty (optional)" className="lg:w-64">
              <Select
                value={draft.facultyId}
                onChange={(event) => setDraft({ ...draft, facultyId: event.target.value })}
              >
                <option value="">No specific faculty</option>
                {faculty.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.shortCode} — {member.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Room / lab (optional)" className="lg:w-56">
              <Select
                value={draft.roomId}
                onChange={(event) => setDraft({ ...draft, roomId: event.target.value })}
              >
                <option value="">No specific room</option>
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="lg:flex-1">
              <span className="mb-1 block text-xs font-medium text-slate-600">
                Slots — pick one 60-minute slot or two consecutive slots
              </span>
              <div className="flex flex-wrap gap-1.5">
                {slots.map((slot, index) => {
                  const active = draft.slotIndices.includes(index);
                  return (
                    <button
                      key={slot.id}
                      type="button"
                      onClick={() => toggleSlot(index)}
                      aria-pressed={active}
                      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition ${
                        active
                          ? 'border-violet-400 bg-violet-50 text-violet-800'
                          : 'border-slate-300 bg-white text-slate-600 hover:border-violet-300'
                      }`}
                    >
                      {slot.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <Button type="submit">Add fixed slot</Button>
          </div>
        </form>
        {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
        <p className="mt-2 text-[11px] text-slate-400">
          Locked cells can never be overwritten or used as a swap target. Faculty and room are
          optional — leave them blank when the block has no fixed department resource.
        </p>
      </SectionCard>

      <SectionCard
        title="Fixed slots"
        description="Applied before the practical and theory stages of every generation run."
        actions={
          <Badge tone="violet">
            {fixedSlots.length} lock{fixedSlots.length === 1 ? '' : 's'}
          </Badge>
        }
      >
        {fixedSlots.length === 0 ? (
          <EmptyState
            title="No fixed slots yet"
            description="Add Open Elective, Mentoring, Library, T&P or Project-hour blocks above so the generator keeps them free."
          />
        ) : (
          <div className="-mx-5 overflow-x-auto px-5">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="pb-2 pr-3 font-medium">Label</th>
                  <th className="pb-2 pr-3 font-medium">Division</th>
                  <th className="pb-2 pr-3 font-medium">Day</th>
                  <th className="pb-2 pr-3 font-medium">Slots</th>
                  <th className="pb-2 pr-3 font-medium">Faculty</th>
                  <th className="pb-2 pr-3 font-medium">Room</th>
                  <th className="pb-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {fixedSlots.map((entry) => {
                  const member = faculty.find((item) => item.id === entry.facultyId);
                  const room = rooms.find((item) => item.id === entry.roomId);
                  return (
                    <tr key={entry.id}>
                      <td className="py-2 pr-3 font-medium text-slate-800">
                        <span aria-hidden="true" className="mr-1">
                          🔒
                        </span>
                        {entry.label || 'Fixed Slot'}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">
                        {divisionName(entry.division)}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{dayLabel(entry.day)}</td>
                      <td className="py-2 pr-3 text-slate-600">{slotLabels(entry)}</td>
                      <td className="py-2 pr-3 text-slate-600">
                        {member ? `${member.shortCode} — ${member.name}` : '—'}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">{room?.name ?? '—'}</td>
                      <td className="py-2 text-right">
                        <Button
                          size="sm"
                          variant="danger"
                          onClick={() => removeFixedSlot(entry.id)}
                        >
                          Remove
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {resolved.problems.length > 0 ? (
          <ul className="mt-3 space-y-1">
            {resolved.problems.map((problem) => (
              <li key={problem.id} className="text-[11px] leading-relaxed text-rose-600">
                ✕ {problem.message}
              </li>
            ))}
          </ul>
        ) : null}
      </SectionCard>
    </div>
  );
}
