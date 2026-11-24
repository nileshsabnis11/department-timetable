import { useMemo, useState } from 'react';
import SectionCard from '../ui/SectionCard';
import Button from '../ui/Button';
import Badge from '../ui/Badge';
import EmptyState from '../ui/EmptyState';
import { Field, Select, TextInput } from '../ui/inputs';
import { newId } from '../../lib/id';
import { parseCsv } from '../../utils/csvImport';
import { parseStudentChoiceRows } from '../../utils/studentImport';
import {
  electiveEnrollmentSummary,
  electiveGroups,
} from '../../lib/electiveEnrollment';

const SAMPLE_PASTE = `rollNo,name,division,PE-I,PE-II
26CS001,Aarav Sharma,TY,CS601A,CS602B
26CS002,Diya Patil,TY,CS601B,CS602A`;

export default function ElectiveChoicesTab({
  students = [],
  divisions,
  subjects,
  rooms,
  onChange,
}) {
  const [filter, setFilter] = useState('all');
  const [draft, setDraft] = useState(() => ({
    rollNo: '',
    name: '',
    divisionId: divisions[0]?.id ?? '',
  }));
  const [paste, setPaste] = useState('');
  const [importResult, setImportResult] = useState(null);
  const [error, setError] = useState('');

  const groups = useMemo(() => electiveGroups({ subjects }), [subjects]);
  const summary = useMemo(
    () => electiveEnrollmentSummary({ subjects, rooms, students }),
    [subjects, rooms, students],
  );

  const demandGroups = summary.filter(
    (group) => filter === 'all' || group.divisionId === filter,
  );
  const incompleteGroups = demandGroups.filter((group) => !group.roster.complete);

  const groupsFor = (divisionId) =>
    groups.filter((group) => group.divisionId === divisionId);

  const visible = students.filter(
    (student) => filter === 'all' || student.divisionId === filter,
  );

  const divisionName = (divisionId) =>
    divisions.find((division) => division.id === divisionId)?.name ?? 'Unassigned';

  const patchStudent = (studentId, patch) =>
    onChange(
      students.map((student) =>
        student.id === studentId ? { ...student, ...patch } : student,
      ),
    );

  const setChoice = (student, label, subjectId) => {
    const choices = { ...(student.choices ?? {}) };
    if (subjectId) choices[label] = subjectId;
    else delete choices[label];
    patchStudent(student.id, { choices });
  };

  const addStudent = (event) => {
    event.preventDefault();
    if (!draft.divisionId) {
      setError('Add a division first.');
      return;
    }
    if (!draft.rollNo.trim() || !draft.name.trim()) {
      setError('Roll number and student name are required.');
      return;
    }
    const duplicate = students.some(
      (student) =>
        student.divisionId === draft.divisionId &&
        String(student.rollNo).trim().toLowerCase() ===
          draft.rollNo.trim().toLowerCase(),
    );
    if (duplicate) {
      setError('That roll number is already in this division.');
      return;
    }

    onChange([
      ...students,
      {
        id: newId('STU'),
        rollNo: draft.rollNo.trim(),
        name: draft.name.trim(),
        divisionId: draft.divisionId,
        choices: {},
      },
    ]);
    setDraft({ ...draft, rollNo: '', name: '' });
    setError('');
  };

  const importRows = () => {
    if (!paste.trim()) {
      setImportResult({ tone: 'error', message: 'Paste some rows first.' });
      return;
    }
    const result = parseStudentChoiceRows(parseCsv(paste), {
      divisions,
      subjects,
      existingStudents: students,
    });

    if (result.validRows.length > 0) {
      onChange([...students, ...result.validRows]);
    }

    const parts = [`Imported ${result.validRows.length} student${
      result.validRows.length === 1 ? '' : 's'
    }.`];
    if (result.errors.length > 0) {
      parts.push(`${result.errors.length} row(s) skipped.`);
    }
    setImportResult({
      tone: result.validRows.length > 0 ? 'success' : 'error',
      message: parts.join(' '),
      errors: result.errors.slice(0, 4),
    });
    if (result.validRows.length > 0) setPaste('');
  };

  if (groups.length === 0) {
    return (
      <SectionCard
        title="Elective Choices"
        description="Student choices only apply to subjects with an Elective Group."
      >
        <EmptyState
          title="No elective groups yet"
          description="Add an Elective Group (for example PE-I) to two or more Theory subjects in the Subjects tab, then record student choices here."
        />
      </SectionCard>
    );
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Elective roster"
        description="One row per student and one choice per elective group. Once the roster covers the whole division, each option's room is sized to the students who chose it; until then every option is sized for the division strength."
        actions={<Badge tone="violet">{students.length} students</Badge>}
      >
        <form onSubmit={addStudent} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Roll number">
              <TextInput
                value={draft.rollNo}
                onChange={(event) => setDraft({ ...draft, rollNo: event.target.value })}
                placeholder="26CS001"
              />
            </Field>
            <Field label="Student name" className="lg:col-span-2">
              <TextInput
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
                placeholder="Aarav Sharma"
              />
            </Field>
            <Field label="Division">
              <Select
                value={draft.divisionId}
                onChange={(event) =>
                  setDraft({ ...draft, divisionId: event.target.value })
                }
              >
                {divisions.map((division) => (
                  <option key={division.id} value={division.id}>
                    {division.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {error ? <p className="text-xs text-rose-600">{error}</p> : null}
          <div className="flex justify-end">
            <Button type="submit">Add student</Button>
          </div>
        </form>

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Bulk paste / CSV
            </p>
            <Button
              size="sm"
              variant="secondary"
              type="button"
              onClick={() => setPaste(SAMPLE_PASTE)}
            >
              Use example
            </Button>
          </div>
          <textarea
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            rows={5}
            spellCheck={false}
            aria-label="Paste student elective choices"
            className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-800 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
            placeholder={SAMPLE_PASTE}
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] text-slate-500">
              Columns: rollNo, name, division, then one column per elective group
              holding the subject code.
            </p>
            <Button size="sm" type="button" onClick={importRows}>
              Import rows
            </Button>
          </div>
          {importResult ? (
            <div
              className={`mt-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
                importResult.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
              <p className="font-medium">{importResult.message}</p>
              {(importResult.errors ?? []).map((row) => (
                <p key={`${row.rowNumber}-${row.message}`}>
                  Row {row.rowNumber}: {row.message}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Demand by option"
        description="Chosen students versus the largest suitable room for each option. An incomplete roster falls back to the division strength."
        actions={
          <Select
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            className="w-44"
            aria-label="Filter students by division"
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
        {incompleteGroups.length > 0 ? (
          <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800">
            <p className="font-semibold">
              Roster incomplete — rooms are sized for the division strength, not
              by these choices.
            </p>
            <p>
              {incompleteGroups
                .map(
                  (group) =>
                    `${divisionName(group.divisionId)} ${group.label}: ${
                      group.roster.students
                    } of ${
                      group.roster.strength > 0 ? group.roster.strength : 'unknown'
                    } students listed`,
                )
                .join(' · ')}
              .
            </p>
            <p>
              Import every student in the division (their choices may stay
              blank) so each option's room is sized to the students who chose it.
              {incompleteGroups.some((group) => group.roster.strength <= 0)
                ? ' Set the batch strengths in Divisions so the division head count is known.'
                : ''}
            </p>
          </div>
        ) : null}

        <div className="space-y-3">
          {demandGroups.map((group) => (
              <div
                key={group.id}
                className="rounded-xl border border-slate-200 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {group.label}
                      <span className="ml-1.5 text-xs font-normal text-slate-500">
                        {divisionName(group.divisionId)}
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {group.chosen} chosen of {group.students} students
                    </p>
                  </div>
                  {!group.roster.complete ? (
                    <Badge tone="amber">
                      Roster {group.roster.students} /{' '}
                      {group.roster.strength > 0 ? group.roster.strength : '?'} · using
                      division strength
                    </Badge>
                  ) : group.missing > 0 ? (
                    <Badge tone="amber">{group.missing} without a choice</Badge>
                  ) : (
                    <Badge tone="emerald">Every student chose</Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {group.options.map(({ subject, count, seats, overloaded }) => (
                    <span
                      key={subject.id}
                      className={`rounded-lg border px-2 py-1 text-[11px] ${
                        overloaded
                          ? 'border-rose-200 bg-rose-50 text-rose-700'
                          : 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                      title={
                        overloaded
                          ? 'More students chose this option than its largest room seats.'
                          : undefined
                      }
                    >
                      <span className="font-semibold">{subject.code}</span>{' '}
                      {group.roster.complete && seats > 0
                        ? `${count} / ${seats} seats`
                        : `${count} chosen`}
                    </span>
                  ))}
                </div>
              </div>
            ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Students"
        description="Change a choice at any time; regenerate the timetable afterwards to apply the new cohort sizes."
      >
        {visible.length === 0 ? (
          <EmptyState
            title="No students yet"
            description="Add one above, or paste a class list with its option codes."
          />
        ) : null}

        <div className="space-y-2">
          {visible.map((student) => {
            const studentGroups = groupsFor(student.divisionId);
            return (
              <div
                key={student.id}
                className="rounded-xl border border-slate-200 p-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900">
                      {student.rollNo}
                      <span className="mx-1.5 text-slate-300">·</span>
                      {student.name}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {divisionName(student.divisionId)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() =>
                      onChange(students.filter((item) => item.id !== student.id))
                    }
                  >
                    Remove
                  </Button>
                </div>

                {studentGroups.length === 0 ? (
                  <p className="mt-2 text-[11px] text-slate-500">
                    No elective groups in this division.
                  </p>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {studentGroups.map((group) => {
                      const choices = student.choices ?? {};
                      const value = group.subjects.some(
                        (subject) => subject.id === choices[group.label],
                      )
                        ? choices[group.label]
                        : '';
                      return (
                        <Field key={group.id} label={group.label}>
                          <Select
                            value={value}
                            onChange={(event) =>
                              setChoice(student, group.label, event.target.value)
                            }
                          >
                            <option value="">No choice</option>
                            {group.subjects.map((subject) => (
                              <option key={subject.id} value={subject.id}>
                                {subject.code} — {subject.name}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>
    </div>
  );
}
