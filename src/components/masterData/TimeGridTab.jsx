import { ToggleChip } from '../ui/Toggle';
import SectionCard from '../ui/SectionCard';
import { Field, TimeInput, TextInput, Select } from '../ui/inputs';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import { newId } from '../../lib/id';
import {
  computePracticalBlocks,
  durationLabel,
  formatTime12h,
  formatSlotRange,
} from '../../lib/time';
import { BREAK_KINDS } from '../../data/types';

export default function TimeGridTab({ timeGrid, onChange }) {
  const { workingDays = [], slots = [], breaks = [] } = timeGrid;
  const practicalBlocks = computePracticalBlocks(slots, breaks);

  const patchSlot = (slotId, patch) =>
    onChange({
      ...timeGrid,
      slots: slots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)),
    });

  const patchBreak = (breakId, patch) =>
    onChange({
      ...timeGrid,
      breaks: breaks.map((item) => (item.id === breakId ? { ...item, ...patch } : item)),
    });

  const toggleDay = (dayId) =>
    onChange({
      ...timeGrid,
      workingDays: workingDays.map((day) =>
        day.id === dayId ? { ...day, enabled: !day.enabled } : day,
      ),
    });

  const addBreak = () =>
    onChange({
      ...timeGrid,
      breaks: [
        ...breaks,
        {
          id: newId('BRK'),
          label: 'Short Break',
          kind: BREAK_KINDS.RECESS,
          afterSlotId: slots[1]?.id ?? slots[0]?.id ?? '',
          start: slots[1]?.end ?? '12:00',
          end: slots[1]?.end ?? '12:15',
        },
      ],
    });

  const removeBreak = (breakId) =>
    onChange({ ...timeGrid, breaks: breaks.filter((item) => item.id !== breakId) });

  return (
    <div className="space-y-5">
      <SectionCard
        title="Working days"
        description="Days enabled here form the teaching week used by the scheduler."
      >
        <div className="flex flex-wrap gap-2">
          {workingDays.map((day) => (
            <ToggleChip
              key={day.id}
              active={day.enabled}
              onClick={() => toggleDay(day.id)}
            >
              {day.label}
            </ToggleChip>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {workingDays.filter((day) => day.enabled).length} of {workingDays.length} days active
          · {slots.length} teaching slots per day.
        </p>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          title="Daily slot timings"
          description="Six 60-minute teaching slots from 10:00 AM to 5:00 PM."
        >
          <div className="space-y-2">
            {slots.map((slot) => (
              <div
                key={slot.id}
                className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/60 p-3 sm:flex-row sm:items-end"
              >
                <Field label="Slot" className="sm:w-36">
                  <TextInput
                    value={slot.label}
                    onChange={(event) => patchSlot(slot.id, { label: event.target.value })}
                  />
                </Field>
                <Field label="Start" className="sm:w-32">
                  <TimeInput
                    value={slot.start}
                    onChange={(event) => patchSlot(slot.id, { start: event.target.value })}
                  />
                </Field>
                <Field label="End" className="sm:w-32">
                  <TimeInput
                    value={slot.end}
                    onChange={(event) => patchSlot(slot.id, { end: event.target.value })}
                  />
                </Field>
                <p className="pb-2 text-xs text-slate-500 sm:ml-auto">
                  {durationLabel(slot.start, slot.end)} ·{' '}
                  {formatSlotRange(slot)}
                </p>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard
          title="Breaks & recess"
          description="Non-teaching gaps. Practicals never span a break."
          actions={
            <Button size="sm" variant="secondary" onClick={addBreak}>
              Add break
            </Button>
          }
        >
          <div className="space-y-3">
            {breaks.length === 0 ? (
              <p className="text-xs text-slate-500">No breaks configured.</p>
            ) : null}
            {breaks.map((item) => (
              <div key={item.id} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-start justify-between gap-2">
                  <Badge tone={item.kind === BREAK_KINDS.LUNCH ? 'amber' : 'emerald'}>
                    {item.kind}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-slate-400 hover:text-rose-600"
                    onClick={() => removeBreak(item.id)}
                    aria-label={`Remove ${item.label}`}
                  >
                    Remove
                  </Button>
                </div>
                <div className="mt-2 space-y-2">
                  <Field label="Label">
                    <TextInput
                      value={item.label}
                      onChange={(event) => patchBreak(item.id, { label: event.target.value })}
                    />
                  </Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Start">
                      <TimeInput
                        value={item.start}
                        onChange={(event) => patchBreak(item.id, { start: event.target.value })}
                      />
                    </Field>
                    <Field label="End">
                      <TimeInput
                        value={item.end}
                        onChange={(event) => patchBreak(item.id, { end: event.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Type">
                      <Select
                        value={item.kind}
                        onChange={(event) => patchBreak(item.id, { kind: event.target.value })}
                      >
                        <option value={BREAK_KINDS.LUNCH}>Lunch</option>
                        <option value={BREAK_KINDS.RECESS}>Recess</option>
                      </Select>
                    </Field>
                    <Field label="After slot">
                      <Select
                        value={item.afterSlotId}
                        onChange={(event) =>
                          patchBreak(item.id, { afterSlotId: event.target.value })
                        }
                      >
                        {slots.slice(0, -1).map((slot) => (
                          <option key={slot.id} value={slot.id}>
                            {slot.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {formatTime12h(item.start)} – {formatTime12h(item.end)} (
                    {durationLabel(item.start, item.end)})
                  </p>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      </div>

      <SectionCard
        title="Valid 2-hour practical blocks"
        description="Derived from the grid above. Labs may only occupy one of these pairs."
      >
        <div className="flex flex-wrap gap-2">
          {practicalBlocks.length === 0 ? (
            <p className="text-xs text-rose-600">
              No valid 2-hour block found. Check that consecutive slots touch and do not cross a
              break.
            </p>
          ) : null}
          {practicalBlocks.map((block) => (
            <div
              key={block.id}
              className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2"
            >
              <p className="text-xs font-semibold text-indigo-800">{block.label}</p>
              <p className="text-[11px] text-indigo-600">
                {formatTime12h(block.start)} – {formatTime12h(block.end)}
              </p>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
