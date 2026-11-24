import { useState } from 'react';
import SectionCard from '../ui/SectionCard';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { Field, NumberInput, TextInput } from '../ui/inputs';
import { newId } from '../../lib/id';
import { formatSlotRange, slotKey } from '../../lib/time';
import CsvImportControls from './CsvImportControls';

const blankFaculty = () => ({
  id: newId('FAC'),
  name: '',
  shortCode: '',
  maxWeeklyLoad: 16,
  unavailableSlots: {},
});

export default function FacultyTab({ faculty, timeGrid, onChange }) {
  const [draft, setDraft] = useState(blankFaculty);
  const [error, setError] = useState('');

  const days = timeGrid.workingDays.filter((day) => day.enabled);
  const { slots } = timeGrid;

  const patchFaculty = (facultyId, patch) =>
    onChange(
      faculty.map((member) => (member.id === facultyId ? { ...member, ...patch } : member)),
    );

  const addFaculty = (event) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.shortCode.trim()) {
      setError('Faculty name and short code are required.');
      return;
    }
    onChange([
      ...faculty,
      {
        ...draft,
        name: draft.name.trim(),
        shortCode: draft.shortCode.trim().toUpperCase(),
      },
    ]);
    setDraft(blankFaculty());
    setError('');
  };

  const toggleUnavailable = (member, key) => {
    const next = { ...(member.unavailableSlots ?? {}) };
    if (next[key]) delete next[key];
    else next[key] = true;
    patchFaculty(member.id, { unavailableSlots: next });
  };

  return (
    <div className="space-y-5">
      <SectionCard
        title="Add faculty"
        description="Short codes appear in the timetable grid and the legend."
        actions={
          <CsvImportControls
            kind="faculty"
            existingRows={faculty}
            onChange={onChange}
          />
        }
      >
        <form onSubmit={addFaculty} className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <Field label="Full name" className="lg:flex-1">
            <TextInput
              value={draft.name}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              placeholder="e.g. Dr. Asha Kadam"
            />
          </Field>
          <Field label="Short code" className="lg:w-32">
            <TextInput
              value={draft.shortCode}
              maxLength={6}
              onChange={(event) => setDraft({ ...draft, shortCode: event.target.value })}
              placeholder="AKD"
            />
          </Field>
          <Field label="Max weekly load" className="lg:w-40" hint="Teaching hours per week">
            <NumberInput
              min="1"
              max="40"
              value={draft.maxWeeklyLoad}
              onChange={(event) =>
                setDraft({ ...draft, maxWeeklyLoad: Number(event.target.value) || 0 })
              }
            />
          </Field>
          <Button type="submit">Add faculty</Button>
        </form>
        {error ? <p className="mt-2 text-xs text-rose-600">{error}</p> : null}
      </SectionCard>

      <SectionCard
        title="Faculty members"
        description="Expand a member to block the day/slot pairs they cannot teach."
        actions={<Badge>{faculty.length} members</Badge>}
      >
        {faculty.length === 0 ? (
          <EmptyState
            title="No faculty yet"
            description="Add teaching staff above, or load the sample department from the header."
          />
        ) : null}

        <div className="space-y-3">
          {faculty.map((member) => {
            const blockedCount = Object.keys(member.unavailableSlots ?? {}).length;
            return (
              <div key={member.id} className="rounded-xl border border-slate-200 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <Field label="Full name" className="lg:flex-1">
                    <TextInput
                      value={member.name}
                      onChange={(event) => patchFaculty(member.id, { name: event.target.value })}
                    />
                  </Field>
                  <Field label="Short code" className="lg:w-28">
                    <TextInput
                      value={member.shortCode}
                      maxLength={6}
                      onChange={(event) =>
                        patchFaculty(member.id, {
                          shortCode: event.target.value.toUpperCase(),
                        })
                      }
                    />
                  </Field>
                  <Field label="Max load (hrs/wk)" className="lg:w-36">
                    <NumberInput
                      min="1"
                      max="40"
                      value={member.maxWeeklyLoad}
                      onChange={(event) =>
                        patchFaculty(member.id, {
                          maxWeeklyLoad: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </Field>
                  <div className="flex items-center gap-2 lg:pb-1">
                    {blockedCount > 0 ? (
                      <Badge tone="rose">{blockedCount} blocked</Badge>
                    ) : (
                      <Badge tone="emerald">Fully available</Badge>
                    )}
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        onChange(faculty.filter((item) => item.id !== member.id))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                <details className="mt-3 group">
                  <summary className="cursor-pointer list-none text-xs font-medium text-indigo-600 hover:text-indigo-700">
                    <span className="group-open:hidden">Show unavailable slots</span>
                    <span className="hidden group-open:inline">Hide unavailable slots</span>
                  </summary>
                  <div className="mt-3 overflow-x-auto rounded-lg bg-slate-50 p-2">
                    <table className="min-w-full text-[11px]">
                      <thead>
                        <tr>
                          <th className="px-2 py-1 text-left font-medium text-slate-400">
                            Day
                          </th>
                          {slots.map((slot) => (
                            <th
                              key={slot.id}
                              className="px-1 py-1 text-center font-medium text-slate-500"
                              title={formatSlotRange(slot)}
                            >
                              S{slot.label.replace(/\D/g, '')}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {days.map((day) => (
                          <tr key={day.id}>
                            <td className="whitespace-nowrap px-2 py-1 text-slate-600">
                              {day.short}
                            </td>
                            {slots.map((slot) => {
                              const key = slotKey(day.id, slot.id);
                              const blocked = !!member.unavailableSlots?.[key];
                              return (
                                <td key={slot.id} className="p-0.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleUnavailable(member, key)}
                                    aria-pressed={blocked}
                                    title={`${day.label} · ${slot.label} · ${formatSlotRange(slot)}`}
                                    className={`h-7 w-full min-w-10 rounded text-[10px] font-semibold transition ${
                                      blocked
                                        ? 'bg-rose-500 text-white hover:bg-rose-600'
                                        : 'bg-white text-slate-300 ring-1 ring-inset ring-slate-200 hover:bg-slate-100'
                                    }`}
                                  >
                                    {blocked ? '✕' : '·'}
                                  </button>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
