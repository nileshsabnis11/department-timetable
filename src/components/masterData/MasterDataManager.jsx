import { useMemo, useState } from 'react';
import { auditMasterData } from '../../lib/masterDataAudit';
import TimeGridTab from './TimeGridTab';
import DivisionsTab from './DivisionsTab';
import RoomsTab from './RoomsTab';
import FacultyTab from './FacultyTab';
import SubjectsTab from './SubjectsTab';
import ElectiveChoicesTab from './ElectiveChoicesTab';
import FixedSlotsTab from './FixedSlotsTab';

const TABS = [
  { id: 'time-grid', label: 'Time Grid' },
  { id: 'divisions', label: 'Divisions & Lab Batches' },
  { id: 'rooms', label: 'Rooms & Labs' },
  { id: 'faculty', label: 'Faculty' },
  { id: 'subjects', label: 'Subjects' },
  { id: 'elective-choices', label: 'Elective Choices' },
  { id: 'fixed-slots', label: 'Fixed Slots' },
];

export default function MasterDataManager({ data, updateSection, readOnly = false }) {
  const [activeTab, setActiveTab] = useState('time-grid');
  const [auditOpen, setAuditOpen] = useState(true);

  const issues = useMemo(() => auditMasterData(data), [data]);
  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  const warningCount = issues.length - errorCount;

  const stats = [
    { label: 'Teaching slots', value: data.timeGrid.slots.length },
    {
      label: 'Working days',
      value: data.timeGrid.workingDays.filter((day) => day.enabled).length,
    },
    { label: 'Divisions', value: data.divisions.length },
    { label: 'Rooms & labs', value: data.rooms.length },
    { label: 'Faculty', value: data.faculty.length },
    { label: 'Subjects', value: data.subjects.length },
    { label: 'Fixed slots', value: (data.fixedSlots ?? []).length },
    {
      label: 'Elective groups',
      value: new Set(
        (data.subjects ?? [])
          .map((subject) => String(subject.electiveGroup ?? '').trim())
          .filter(Boolean),
      ).size,
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <p className="text-lg font-semibold tabular-nums text-slate-900">{stat.value}</p>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
              {stat.label}
            </p>
          </div>
        ))}
      </div>

      {issues.length > 0 ? (
        <section
          className={`rounded-2xl border p-4 shadow-sm ${
            errorCount > 0
              ? 'border-rose-200 bg-rose-50'
              : 'border-amber-200 bg-amber-50'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2
                className={`text-sm font-semibold ${
                  errorCount > 0 ? 'text-rose-800' : 'text-amber-900'
                }`}
              >
                Master Data health check
              </h2>
              {errorCount > 0 ? (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rose-700">
                  {errorCount} error{errorCount === 1 ? '' : 's'}
                </span>
              ) : null}
              {warningCount > 0 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-800">
                  {warningCount} warning{warningCount === 1 ? '' : 's'}
                </span>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setAuditOpen((previous) => !previous)}
              className={`rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
                errorCount > 0
                  ? 'text-rose-700 hover:bg-rose-100'
                  : 'text-amber-800 hover:bg-amber-100'
              }`}
            >
              {auditOpen ? 'Hide details' : 'Show details'}
            </button>
          </div>
          <p
            className={`mt-1 text-[11px] ${
              errorCount > 0 ? 'text-rose-600' : 'text-amber-700'
            }`}
          >
            Broken references are ignored by the generator — fix them before the next run.
          </p>
          {auditOpen ? (
            <ul className="mt-2 space-y-1">
              {issues.slice(0, 10).map((issue, index) => (
                <li
                  key={`${index}-${issue.message.slice(0, 20)}`}
                  className={`flex gap-2 text-[11px] leading-relaxed ${
                    issue.severity === 'error' ? 'text-rose-700' : 'text-amber-800'
                  }`}
                >
                  <span aria-hidden="true">
                    {issue.severity === 'error' ? '✕' : '!'}
                  </span>
                  <span>{issue.message}</span>
                </li>
              ))}
              {issues.length > 10 ? (
                <li className="pl-4 text-[11px] font-medium text-slate-500">
                  +{issues.length - 10} more issue{issues.length - 10 === 1 ? '' : 's'}
                </li>
              ) : null}
            </ul>
          ) : null}
        </section>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-2 pt-2">
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                aria-current={active ? 'page' : undefined}
                className={`whitespace-nowrap rounded-t-lg border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                  active
                    ? 'border-indigo-600 text-indigo-700'
                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700'
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 sm:p-5">
          {readOnly ? (
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800">
              Archived semester — Master Data is read-only. Unarchive the semester to make
              changes.
            </p>
          ) : null}
          <fieldset disabled={readOnly} className="m-0 min-w-0 border-0 p-0">
          {activeTab === 'time-grid' ? (
            <TimeGridTab
              timeGrid={data.timeGrid}
              onChange={(timeGrid) => updateSection('timeGrid', timeGrid)}
            />
          ) : null}

          {activeTab === 'divisions' ? (
            <DivisionsTab
              divisions={data.divisions}
              onChange={(divisions) => updateSection('divisions', divisions)}
            />
          ) : null}

          {activeTab === 'rooms' ? (
            <RoomsTab
              rooms={data.rooms}
              onChange={(rooms) => updateSection('rooms', rooms)}
            />
          ) : null}

          {activeTab === 'faculty' ? (
            <FacultyTab
              faculty={data.faculty}
              timeGrid={data.timeGrid}
              onChange={(faculty) => updateSection('faculty', faculty)}
            />
          ) : null}

          {activeTab === 'subjects' ? (
            <SubjectsTab
              subjects={data.subjects}
              divisions={data.divisions}
              faculty={data.faculty}
              rooms={data.rooms}
              onChange={(subjects) => updateSection('subjects', subjects)}
            />
          ) : null}

          {activeTab === 'elective-choices' ? (
            <ElectiveChoicesTab
              students={data.students ?? []}
              divisions={data.divisions}
              subjects={data.subjects}
              rooms={data.rooms}
              onChange={(students) => updateSection('students', students)}
            />
          ) : null}

          {activeTab === 'fixed-slots' ? (
            <FixedSlotsTab
              fixedSlots={data.fixedSlots ?? []}
              divisions={data.divisions}
              faculty={data.faculty}
              rooms={data.rooms}
              timeGrid={data.timeGrid}
              onChange={(fixedSlots) => updateSection('fixedSlots', fixedSlots)}
            />
          ) : null}

          </fieldset>
        </div>
      </div>

      <p className="text-xs text-slate-400">
        Changes save automatically to this browser. Open the Timetable tab to generate and
        fine-tune the weekly schedule.
      </p>
    </div>
  );
}
