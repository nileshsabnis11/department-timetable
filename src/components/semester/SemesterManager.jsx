import { useState } from 'react';
import Button from '../ui/Button';
import { Field, Select, TextInput } from '../ui/inputs';
import {
  getLastStorageError,
  semesterSummary,
  semesterShortLabel,
} from '../../utils/semesterStore';
import {
  describeStorageKey,
  formatBytes,
  measureStorage,
} from '../../utils/storageHealth';

const CLONE_OPTIONS = [
  { key: 'timeGrid', label: 'Time Grid & Print Settings' },
  { key: 'divisions', label: 'Divisions & Lab Batches' },
  { key: 'rooms', label: 'Rooms & Labs' },
  { key: 'faculty', label: 'Faculty List' },
  { key: 'subjects', label: 'Subjects, Fixed Slots & Electives' },
];

function StatusPill({ status }) {
  const archived = status === 'Archived';
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
        archived ? 'bg-slate-200 text-slate-600' : 'bg-emerald-100 text-emerald-700'
      }`}
    >
      {status}
    </span>
  );
}

function formatCreated(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function StorageCard() {
  const usage = measureStorage();
  const error = getLastStorageError();
  const top = usage.keys.slice(0, 3);

  return (
    <section className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Browser storage
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            usage.critical
              ? 'bg-rose-100 text-rose-700'
              : usage.warning
                ? 'bg-amber-100 text-amber-800'
                : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {formatBytes(usage.bytes)} of ~{formatBytes(usage.budget)}
        </span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
        <div
          className={`h-full rounded-full ${
            usage.critical ? 'bg-rose-500' : usage.warning ? 'bg-amber-500' : 'bg-emerald-500'
          }`}
          style={{ width: `${Math.min(100, Math.round(usage.percent))}%` }}
        />
      </div>
      <p className="mt-1 text-[10px] text-slate-500">
        {usage.warning
          ? 'Storage is filling up. Export a JSON backup from the toolbar, then archive or delete an old semester.'
          : 'Every semester keeps its own master data, timetable, print settings and proxy history.'}
      </p>
      {top.length > 0 ? (
        <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-[10px] text-slate-400">
          {top.map((entry) => (
            <li key={entry.key}>
              {describeStorageKey(entry.key)} · {formatBytes(entry.bytes)}
            </li>
          ))}
        </ul>
      ) : null}
      {error ? (
        <p className="mt-1.5 rounded-md bg-rose-50 px-2 py-1 text-[10px] font-medium text-rose-700">
          {error.message}
        </p>
      ) : null}
    </section>
  );
}

function CloneWizard({ semesters, activeId, onCreate }) {
  const [academicYear, setAcademicYear] = useState('');
  const [termType, setTermType] = useState('Odd');
  const [cloneFromId, setCloneFromId] = useState(activeId ?? semesters[0]?.id ?? '');
  const [flags, setFlags] = useState({
    timeGrid: true,
    divisions: true,
    rooms: true,
    faculty: true,
    subjects: false,
    resetFacultyAvailability: true,
  });

  const cloning = Boolean(cloneFromId);
  const toggle = (key) =>
    setFlags((previous) => ({ ...previous, [key]: !previous[key] }));

  const submit = (event) => {
    event.preventDefault();
    const year = academicYear.trim();
    if (!year) return;
    onCreate({
      academicYear: year,
      termType,
      cloneFromId: cloning ? cloneFromId : '',
      clone: cloning ? flags : {},
    });
    setAcademicYear('');
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <h3 className="text-sm font-semibold text-slate-900">Create New Semester</h3>
      <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500">
        The new term starts with an empty timetable, ready for generation.
      </p>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Academic Year">
          <TextInput
            value={academicYear}
            onChange={(event) => setAcademicYear(event.target.value)}
            placeholder="2027–28"
            aria-label="New academic year"
            required
          />
        </Field>
        <Field label="Term">
          <Select
            value={termType}
            onChange={(event) => setTermType(event.target.value)}
            aria-label="New term"
          >
            <option value="Odd">Odd</option>
            <option value="Even">Even</option>
          </Select>
        </Field>
      </div>

      <div className="mt-3">
        <Field label="Clone from an existing semester">
          <Select
            value={cloneFromId}
            onChange={(event) => setCloneFromId(event.target.value)}
            aria-label="Clone source semester"
          >
            <option value="">Start blank (default time grid only)</option>
            {semesters.map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semesterShortLabel(semester)} · {semester.status}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <fieldset className="mt-3" disabled={!cloning}>
        <legend className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Carry forward
        </legend>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {CLONE_OPTIONS.map((option) => (
            <label
              key={option.key}
              className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                cloning
                  ? 'cursor-pointer border-slate-200 bg-white text-slate-700'
                  : 'border-slate-200 bg-slate-100 text-slate-400'
              }`}
            >
              <input
                type="checkbox"
                checked={Boolean(flags[option.key])}
                onChange={() => toggle(option.key)}
                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              {option.label}
            </label>
          ))}
        </div>

        {flags.faculty ? (
          <label className="mt-2 flex items-center gap-2 text-[11px] font-medium text-slate-600">
            <input
              type="checkbox"
              checked={Boolean(flags.resetFacultyAvailability)}
              onChange={() => toggle('resetFacultyAvailability')}
              className="h-3.5 w-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            Reset unavailable slots for the new term
          </label>
        ) : null}
      </fieldset>

      <div className="mt-4 flex justify-end">
        <Button type="submit" size="sm" disabled={!academicYear.trim()}>
          Create Semester
        </Button>
      </div>
    </form>
  );
}

function ManageModal({
  semesters,
  activeId,
  onClose,
  onSwitch,
  onCreate,
  onToggleStatus,
  onDelete,
  onRename,
  onDuplicate,
}) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState({ academicYear: '', termType: 'Odd' });
  const lastRemaining = semesters.length <= 1;

  const startEdit = (semester) => {
    setEditingId(semester.id);
    setDraft({ academicYear: semester.academicYear, termType: semester.termType });
  };

  const saveEdit = () => {
    if (!draft.academicYear.trim()) return;
    onRename(editingId, {
      academicYear: draft.academicYear,
      termType: draft.termType,
    });
    setEditingId(null);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="semester-modal-title"
      className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="sticky top-0 flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4">
          <div>
            <h2 id="semester-modal-title" className="text-base font-semibold text-slate-900">
              Manage Semesters
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Switch terms, clone the department structure forward, or archive a completed
              semester. Archived terms stay readable, printable and exportable.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close semester manager"
            className="rounded-lg px-2 py-1 text-sm text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Semesters ({semesters.length})
            </h3>
            <ul className="space-y-2">
              {semesters.map((semester) => {
                const summary = semesterSummary(semester);
                const isActive = semester.id === activeId;
                const editing = editingId === semester.id;
                return (
                  <li
                    key={semester.id}
                    className={`rounded-xl border px-3.5 py-3 ${
                      isActive
                        ? 'border-indigo-200 bg-indigo-50/60'
                        : 'border-slate-200 bg-white'
                    }`}
                  >
                    {editing ? (
                      <div className="flex flex-wrap items-end gap-2">
                        <Field label="Academic Year" className="min-w-32 flex-1">
                          <TextInput
                            value={draft.academicYear}
                            onChange={(event) =>
                              setDraft((previous) => ({
                                ...previous,
                                academicYear: event.target.value,
                              }))
                            }
                          />
                        </Field>
                        <Field label="Term" className="w-28">
                          <Select
                            value={draft.termType}
                            onChange={(event) =>
                              setDraft((previous) => ({
                                ...previous,
                                termType: event.target.value,
                              }))
                            }
                          >
                            <option value="Odd">Odd</option>
                            <option value="Even">Even</option>
                          </Select>
                        </Field>
                        <div className="flex gap-1.5 pb-0.5">
                          <Button size="sm" onClick={saveEdit}>
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => setEditingId(null)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-sm font-semibold text-slate-900">
                              {semester.academicYear} {semester.termType} Semester
                            </p>
                            <StatusPill status={semester.status} />
                            {isActive ? (
                              <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                                Loaded
                              </span>
                            ) : null}
                          </div>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {summary.divisions} division{summary.divisions === 1 ? '' : 's'} ·{' '}
                            {summary.faculty} faculty · {summary.rooms} rooms/labs ·{' '}
                            {summary.subjects} subjects · {summary.electiveGroups} elective
                            groups · {summary.sessions} sessions
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-400">
                            Created {formatCreated(semester.createdAt)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <Button
                            size="sm"
                            variant={isActive ? 'secondary' : 'primary'}
                            onClick={() => onSwitch(semester.id)}
                            disabled={isActive}
                          >
                            {isActive ? 'Open' : 'Switch'}
                          </Button>
                          <Button size="sm" variant="secondary" onClick={() => startEdit(semester)}>
                            Edit
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onDuplicate(semester.id)}
                          >
                            Duplicate
                          </Button>
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => onToggleStatus(semester.id)}
                          >
                            {semester.status === 'Archived' ? 'Unarchive' : 'Archive'}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => {
                              const confirmed = window.confirm(
                                `Delete "${semester.academicYear} ${semester.termType} Semester"? Its timetable, faculty and rooms are removed permanently.`,
                              );
                              if (confirmed) onDelete(semester.id);
                            }}
                            disabled={lastRemaining}
                            title={
                              lastRemaining
                                ? 'At least one semester must be kept.'
                                : 'Delete this semester'
                            }
                          >
                            Delete
                          </Button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            {lastRemaining ? (
              <p className="mt-2 text-[11px] text-slate-400">
                The last remaining semester cannot be deleted.
              </p>
            ) : null}
          </section>

          <StorageCard />

          <CloneWizard semesters={semesters} activeId={activeId} onCreate={onCreate} />
        </div>
      </div>
    </div>
  );
}

/**
 * Compact semester dropdown + "Manage Semesters" button for the top bar.
 */
export default function SemesterManager({
  semesters = [],
  activeId,
  open = false,
  onOpenChange,
  onSwitch,
  onCreate,
  onToggleStatus,
  onDelete,
  onRename,
  onDuplicate,
}) {
  const active = semesters.find((semester) => semester.id === activeId) ?? semesters[0] ?? null;
  const archived = active?.status === 'Archived';

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <label
          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 shadow-sm ${
            archived ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-white'
          }`}
        >
          <span aria-hidden="true">📅</span>
          <span className="sr-only">Current semester</span>
          <select
            value={active?.id ?? ''}
            onChange={(event) => onSwitch(event.target.value)}
            aria-label="Current semester"
            className="max-w-[13rem] cursor-pointer bg-transparent text-xs font-semibold text-slate-800 outline-none"
          >
            {semesters.map((semester) => (
              <option key={semester.id} value={semester.id}>
                {semesterShortLabel(semester)} · {semester.status}
              </option>
            ))}
          </select>
        </label>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            archived ? 'bg-amber-200 text-amber-900' : 'bg-emerald-100 text-emerald-700'
          }`}
        >
          {active?.status ?? 'Active'}
        </span>
        <Button size="sm" variant="secondary" onClick={() => onOpenChange(true)}>
          Manage Semesters
        </Button>
      </div>

      {open ? (
        <ManageModal
          semesters={semesters}
          activeId={active?.id}
          onClose={() => onOpenChange(false)}
          onSwitch={(id) => {
            onSwitch(id);
            onOpenChange(false);
          }}
          onCreate={(input) => {
            onCreate(input);
            onOpenChange(false);
          }}
          onToggleStatus={onToggleStatus}
          onDelete={onDelete}
          onRename={onRename}
          onDuplicate={(id) => {
            onDuplicate(id);
            onOpenChange(false);
          }}
        />
      ) : null}
    </>
  );
}
