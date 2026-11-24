import { useState } from 'react';
import SectionCard from '../ui/SectionCard';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { Field, NumberInput, Select, TextInput } from '../ui/inputs';
import { newId } from '../../lib/id';
import { ROOM_TYPES, SUBJECT_TYPES } from '../../data/types';
import CsvImportControls from './CsvImportControls';

const emptySubject = (divisionId) => ({
  id: newId('SUB'),
  code: '',
  name: '',
  divisionId,
  type: SUBJECT_TYPES.THEORY,
  weeklyHours: 3,
  facultyId: '',
  batchFaculty: {},
  requiredRoomType: ROOM_TYPES.CLASSROOM,
  requiredRoomId: '',
  electiveGroup: '',
});

export default function SubjectsTab({ subjects, divisions, faculty, rooms, onChange }) {
  const [filter, setFilter] = useState('all');
  const [draft, setDraft] = useState(() => emptySubject(divisions[0]?.id ?? ''));
  const [error, setError] = useState('');

  const visible = subjects.filter(
    (subject) => filter === 'all' || subject.divisionId === filter,
  );

  const patchSubject = (subjectId, patch) =>
    onChange(
      subjects.map((subject) =>
        subject.id === subjectId ? { ...subject, ...patch } : subject,
      ),
    );

  const addSubject = (event) => {
    event.preventDefault();
    if (!draft.divisionId) {
      setError('Add a division before creating subjects.');
      return;
    }
    if (!draft.code.trim() || !draft.name.trim()) {
      setError('Course code and subject name are required.');
      return;
    }
    if (!draft.facultyId) {
      setError('Assign a faculty member to the subject.');
      return;
    }
    onChange([
      ...subjects,
      {
        ...draft,
        code: draft.code.trim().toUpperCase(),
        name: draft.name.trim(),
      },
    ]);
    setDraft(emptySubject(draft.divisionId));
    setError('');
  };

  const setDraftType = (type) =>
    setDraft({
      ...draft,
      type,
      weeklyHours: type === SUBJECT_TYPES.PRACTICAL ? 2 : 3,
      requiredRoomType:
        type === SUBJECT_TYPES.PRACTICAL ? ROOM_TYPES.LAB : ROOM_TYPES.CLASSROOM,
      requiredRoomId: '',
      electiveGroup: type === SUBJECT_TYPES.PRACTICAL ? '' : draft.electiveGroup,
    });

  const divisionName = (divisionId) =>
    divisions.find((division) => division.id === divisionId)?.name ?? 'Unassigned';

  const facultyLabel = (member) => `${member.shortCode} — ${member.name}`;

  const roomOptions = rooms.filter((room) => room.type === draft.requiredRoomType);

  if (divisions.length === 0) {
    return (
      <SectionCard
        title="Subjects"
        description="Subjects belong to a division."
        actions={
          <CsvImportControls
            kind="subjects"
            existingRows={subjects}
            divisions={divisions}
            faculty={faculty}
            onChange={onChange}
          />
        }
      >
        <EmptyState
          title="No divisions available"
          description="Create a division first (or load the sample department), then map subjects to it."
        />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Add subject"
        description="Theory runs in single slots; practicals occupy one 2-hour block per batch."
        actions={
          <CsvImportControls
            kind="subjects"
            existingRows={subjects}
            divisions={divisions}
            faculty={faculty}
            onChange={onChange}
          />
        }
      >
        <form onSubmit={addSubject} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Course code">
              <TextInput
                value={draft.code}
                onChange={(event) => setDraft({ ...draft, code: event.target.value })}
                placeholder="CS301"
              />
            </Field>
            <Field label="Subject name" className="lg:col-span-2">
              <TextInput
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Data Structures & Algorithms"
              />
            </Field>
            <Field label="Division">
              <Select
                value={draft.divisionId}
                onChange={(event) => setDraft({ ...draft, divisionId: event.target.value })}
              >
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <Field label="Type">
              <Select
                value={draft.type}
                onChange={(event) => setDraftType(event.target.value)}
              >
                <option value={SUBJECT_TYPES.THEORY}>Theory</option>
                <option value={SUBJECT_TYPES.PRACTICAL}>Practical</option>
              </Select>
            </Field>
            <Field
              label="Weekly hours"
              hint={
                draft.type === SUBJECT_TYPES.PRACTICAL
                  ? 'Fixed: 2 hrs per batch'
                  : '60-minute slots per week'
              }
            >
              <NumberInput
                min="1"
                max="6"
                disabled={draft.type === SUBJECT_TYPES.PRACTICAL}
                value={draft.weeklyHours}
                onChange={(event) =>
                  setDraft({ ...draft, weeklyHours: Number(event.target.value) || 0 })
                }
              />
            </Field>
            <Field label="Faculty">
              <Select
                value={draft.facultyId}
                onChange={(event) => setDraft({ ...draft, facultyId: event.target.value })}
              >
                <option value="">Select faculty</option>
                {faculty.map((member) => (
                  <option key={member.id} value={member.id}>
                    {facultyLabel(member)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Requires">
              <Select
                value={draft.requiredRoomType}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    requiredRoomType: event.target.value,
                    requiredRoomId: '',
                  })
                }
              >
                <option value={ROOM_TYPES.CLASSROOM}>Classroom</option>
                <option value={ROOM_TYPES.LAB}>Lab</option>
              </Select>
            </Field>
            <Field label="Specific room" hint="Optional — any of the type if blank">
              <Select
                value={draft.requiredRoomId}
                onChange={(event) =>
                  setDraft({ ...draft, requiredRoomId: event.target.value })
                }
              >
                <option value="">Any {draft.requiredRoomType.toLowerCase()}</option>
                {roomOptions.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Elective Group (Optional)" hint="PE-I, PE-II, OE-I …">
              <TextInput
                value={draft.electiveGroup}
                onChange={(event) =>
                  setDraft({ ...draft, electiveGroup: event.target.value })
                }
                placeholder="PE-I"
              />
            </Field>
          </div>

          <p className="text-[11px] leading-relaxed text-slate-500">
            Subjects in the same division with the same Elective Group name will be
            scheduled in parallel during the same slot in separate rooms.
          </p>

          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          <div className="flex justify-end">
            <Button type="submit">Add subject</Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard
        title="Subject catalogue"
        description="Practical batches auto-assign by default; lock a specific faculty to a batch below."
        actions={
          <Select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="w-44"
            aria-label="Filter subjects by division"
          >
            <option value="all">All divisions</option>
            {divisions.map((division) => (
              <option key={division.id} value={division.id}>
                {division.name}
              </option>
            ))}
          </Select>
        }
      >
        {visible.length === 0 ? (
          <EmptyState
            title="No subjects in this view"
            description="Add a subject above, or switch the division filter."
          />
        ) : null}

        <div className="space-y-3">
          {visible.map((subject) => {
            const division = divisions.find((item) => item.id === subject.divisionId);
            const isPractical = subject.type === SUBJECT_TYPES.PRACTICAL;
            const roomChoices = rooms.filter(
              (room) => room.type === subject.requiredRoomType,
            );

            return (
              <div key={subject.id} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {subject.code || 'NO-CODE'}
                      <span className="mx-1.5 text-slate-300">·</span>
                      {subject.name || 'Untitled subject'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {division?.name ?? 'Unassigned'} ·{' '}
                      {isPractical
                        ? `${subject.weeklyHours} hrs per batch (one 2-hour block)`
                        : `${subject.weeklyHours} hrs / week`}
                      {subject.electiveGroup
                        ? ` · Elective group ${subject.electiveGroup}`
                        : ''}
                      {subject.requiredRoomId
                        ? ` · ${rooms.find((room) => room.id === subject.requiredRoomId)?.name ?? 'Room removed'}`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {subject.electiveGroup ? (
                      <Badge tone="violet">{subject.electiveGroup}</Badge>
                    ) : null}
                    <Badge tone={isPractical ? 'amber' : 'indigo'}>{subject.type}</Badge>
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() =>
                        onChange(subjects.filter((item) => item.id !== subject.id))
                      }
                    >
                      Remove
                    </Button>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <Field label="Code">
                    <TextInput
                      value={subject.code}
                      onChange={(event) =>
                        patchSubject(subject.id, { code: event.target.value.toUpperCase() })
                      }
                    />
                  </Field>
                  <Field label="Name" className="lg:col-span-2">
                    <TextInput
                      value={subject.name}
                      onChange={(event) =>
                        patchSubject(subject.id, { name: event.target.value })
                      }
                    />
                  </Field>
                  <Field label="Division">
                    <Select
                      value={subject.divisionId}
                      onChange={(event) =>
                        patchSubject(subject.id, { divisionId: event.target.value })
                      }
                    >
                      {divisions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Type">
                    <Select
                      value={subject.type}
                      onChange={(event) => {
                        const type = event.target.value;
                        patchSubject(subject.id, {
                          type,
                          weeklyHours: type === SUBJECT_TYPES.PRACTICAL ? 2 : 3,
                          requiredRoomType:
                            type === SUBJECT_TYPES.PRACTICAL
                              ? ROOM_TYPES.LAB
                              : ROOM_TYPES.CLASSROOM,
                          requiredRoomId: '',
                          electiveGroup:
                            type === SUBJECT_TYPES.PRACTICAL
                              ? ''
                              : subject.electiveGroup ?? '',
                        });
                      }}
                    >
                      <option value={SUBJECT_TYPES.THEORY}>Theory</option>
                      <option value={SUBJECT_TYPES.PRACTICAL}>Practical</option>
                    </Select>
                  </Field>
                  <Field
                    label="Weekly hours"
                    hint={isPractical ? 'Per batch, fixed 2-hour block' : 'Single slots'}
                  >
                    <NumberInput
                      min="1"
                      max="6"
                      disabled={isPractical}
                      value={subject.weeklyHours}
                      onChange={(event) =>
                        patchSubject(subject.id, {
                          weeklyHours: Number(event.target.value) || 0,
                        })
                      }
                    />
                  </Field>
                  <Field label="Faculty">
                    <Select
                      value={subject.facultyId}
                      onChange={(event) =>
                        patchSubject(subject.id, { facultyId: event.target.value })
                      }
                    >
                      <option value="">Select faculty</option>
                      {faculty.map((member) => (
                        <option key={member.id} value={member.id}>
                          {facultyLabel(member)}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Requires">
                    <Select
                      value={subject.requiredRoomType}
                      onChange={(event) =>
                        patchSubject(subject.id, {
                          requiredRoomType: event.target.value,
                          requiredRoomId: '',
                        })
                      }
                    >
                      <option value={ROOM_TYPES.CLASSROOM}>Classroom</option>
                      <option value={ROOM_TYPES.LAB}>Lab</option>
                    </Select>
                  </Field>
                  <Field label="Specific room" hint="Blank = any of that type">
                    <Select
                      value={subject.requiredRoomId}
                      onChange={(event) =>
                        patchSubject(subject.id, { requiredRoomId: event.target.value })
                      }
                    >
                      <option value="">Any {subject.requiredRoomType.toLowerCase()}</option>
                      {roomChoices.map((room) => (
                        <option key={room.id} value={room.id}>
                          {room.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Elective Group (Optional)" hint="Same name ⇒ parallel">
                    <TextInput
                      value={subject.electiveGroup ?? ''}
                      placeholder="PE-I"
                      onChange={(event) =>
                        patchSubject(subject.id, { electiveGroup: event.target.value })
                      }
                    />
                  </Field>
                </div>

                {isPractical && division?.batches?.length ? (
                  <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Faculty per batch (lock or auto-assign)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                      {division.batches.map((batch) => (
                        <Field key={batch.id} label={batch.name}>
                          <Select
                            value={subject.batchFaculty?.[batch.id] ?? ''}
                            onChange={(event) =>
                              patchSubject(subject.id, {
                                batchFaculty: {
                                  ...subject.batchFaculty,
                                  [batch.id]: event.target.value,
                                },
                              })
                            }
                          >
                            <option value="">Auto-assign (any free faculty)</option>
                            {faculty.map((member) => (
                              <option key={member.id} value={member.id}>
                                {member.shortCode} — {member.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
