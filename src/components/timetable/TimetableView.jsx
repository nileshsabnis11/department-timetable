import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '../ui/Button';
import EmptyState from '../ui/EmptyState';
import { Select } from '../ui/inputs';
import { useTimetable } from '../../hooks/useTimetable';
import { buildClashInfo } from './timetableUtils';
import GeneratorBar from './GeneratorBar';
import StatusBar from './StatusBar';
import ConflictReport from './ConflictReport';
import ClashBanner from './ClashBanner';
import DivisionGrid from './DivisionGrid';
import FacultyGrid from './FacultyGrid';
import RoomGrid from './RoomGrid';
import SubstitutionModal from './SubstitutionModal';
import VersionsPanel from './VersionsPanel';
import PrintSettingsModal from '../print/PrintSettingsModal';
import PrintableMaster from '../print/PrintableMaster';
import PrintableTimetable from '../print/PrintableTimetable';
import PrintableWorkload from '../print/PrintableWorkload';
import PrintableDepartment from '../print/PrintableDepartment';
import PrintableAnalytics from '../print/PrintableAnalytics';
import { usePrintSettings } from '../print/printSettings';
import { buildAnalytics } from '../analytics/analyticsUtils';
import {
  loadSchedulerSettings,
  saveSchedulerSettings,
} from '../../utils/schedulerSettings';
import { proposeClashFixes } from '../../utils/conflictFixer';

const VIEWS = [
  { id: 'division', label: 'Division' },
  { id: 'faculty', label: 'Faculty' },
  { id: 'room', label: 'Room / Lab' },
];

export default function TimetableView({ masterData, readOnly = false, semester = null }) {
  const {
    sessions,
    baseline,
    stats,
    generatedAt,
    validation,
    generate,
    regenerateScope,
    applySessions,
    undo,
    togglePin,
    clearPins,
    resetToGenerated,
    versions,
    publishedVersionId,
    pinnedSessions,
    saveVersion,
    restoreVersion,
    deleteVersion,
    togglePublished,
    canUndo,
    canReset,
    undoDepth,
    hasTimetable,
    storageWarning,
  } = useTimetable(masterData);

  const [view, setView] = useState('division');
  const [editMode, setEditMode] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [hint, setHint] = useState('');
  const [divisionId, setDivisionId] = useState(masterData.divisions[0]?.id ?? '');
  const [facultyId, setFacultyId] = useState(masterData.faculty[0]?.id ?? '');
  const [roomId, setRoomId] = useState(masterData.rooms[0]?.id ?? '');
  const {
    settings: printSettings,
    saveSettings: savePrintSettings,
    resetSettings: resetPrintSettings,
  } = usePrintSettings();
  const [printSettingsOpen, setPrintSettingsOpen] = useState(false);
  const [printMode, setPrintMode] = useState(null);
  const [substitutionOpen, setSubstitutionOpen] = useState(false);
  const [schedulerSettings, setSchedulerSettings] = useState(loadSchedulerSettings);

  const handleWeightsChange = (weights) => {
    setSchedulerSettings(saveSchedulerSettings({ weights }));
  };

  useEffect(() => {
    if (!masterData.divisions.some((division) => division.id === divisionId)) {
      setDivisionId(masterData.divisions[0]?.id ?? '');
    }
  }, [masterData.divisions, divisionId]);

  useEffect(() => {
    if (!masterData.faculty.some((member) => member.id === facultyId)) {
      setFacultyId(masterData.faculty[0]?.id ?? '');
    }
  }, [masterData.faculty, facultyId]);

  useEffect(() => {
    if (!masterData.rooms.some((item) => item.id === roomId)) {
      setRoomId(masterData.rooms[0]?.id ?? '');
    }
  }, [masterData.rooms, roomId]);

  useEffect(() => {
    if (!readOnly) return;
    setEditMode(false);
    setSelectedId(null);
    setHint('');
  }, [readOnly]);

  const clashInfo = useMemo(
    () => buildClashInfo(validation, sessions),
    [validation, sessions],
  );

  const fixProposals = useMemo(
    () =>
      !readOnly && clashInfo.count > 0
        ? proposeClashFixes(sessions, masterData, { maxSessions: 2, perSession: 2 })
        : [],
    [readOnly, clashInfo.count, sessions, masterData],
  );

  const analytics = useMemo(
    () => (printMode === 'department' ? buildAnalytics(masterData, sessions) : null),
    [printMode, masterData, sessions],
  );

  const division = masterData.divisions.find((item) => item.id === divisionId);
  const faculty = masterData.faculty.find((item) => item.id === facultyId);
  const room = masterData.rooms.find((item) => item.id === roomId);

  const printPages = useMemo(() => {
    if (!hasTimetable) return [];
    if (printMode === 'department' || printMode === 'workloads') return [];
    if (printMode === 'divisions') {
      return masterData.divisions.map((item) => ({
        key: `division-${item.id}`,
        view: 'division',
        entity: item,
      }));
    }
    if (printMode === 'faculty') {
      return masterData.faculty.map((item) => ({
        key: `faculty-${item.id}`,
        view: 'faculty',
        entity: item,
      }));
    }
    if (printMode === 'master') {
      return [{ key: 'master', view: 'master', entity: null }];
    }
    if (view === 'faculty') {
      return faculty ? [{ key: `faculty-${faculty.id}`, view: 'faculty', entity: faculty }] : [];
    }
    if (view === 'room') {
      return room ? [{ key: `room-${room.id}`, view: 'room', entity: room }] : [];
    }
    return division
      ? [{ key: `division-${division.id}`, view: 'division', entity: division }]
      : [];
  }, [
    hasTimetable,
    printMode,
    view,
    faculty,
    room,
    division,
    masterData.divisions,
    masterData.faculty,
  ]);

  useEffect(() => {
    if (!printMode) return undefined;
    // The effect runs after the print portal has been committed, so every page
    // is in the DOM before the browser snapshots the printout.
    const reset = () => setPrintMode(null);
    window.addEventListener('afterprint', reset, { once: true });
    window.print();
    return () => window.removeEventListener('afterprint', reset);
  }, [printMode]);

  const handlePrintCurrent = () => {
    if (!hasTimetable) return;
    if (printMode) {
      setPrintMode(null);
      window.setTimeout(() => window.print(), 80);
      return;
    }
    window.print();
  };

  const handleGenerate = () => {
    generate({ weights: schedulerSettings.weights });
    setSelectedId(null);
    setHint('');
    setEditMode(false);
  };

  const handleRegenerateScope = (scope) => {
    regenerateScope(scope, { weights: schedulerSettings.weights });
    setSelectedId(null);
    setHint('');
    setEditMode(false);
  };

  const handleViewChange = (nextView) => {
    setView(nextView);
    setSelectedId(null);
    setHint('');
  };

  const handleUndo = () => {
    undo();
    setSelectedId(null);
    setHint('');
  };

  const handleReset = () => {
    resetToGenerated();
    setSelectedId(null);
    setHint('');
  };

  return (
    <div className="space-y-4">
      <GeneratorBar
        onGenerate={handleGenerate}
        hasTimetable={hasTimetable}
        pinnedCount={pinnedSessions.length}
        disabled={readOnly}
        weights={schedulerSettings.weights}
        onWeightsChange={handleWeightsChange}
        divisions={masterData.divisions}
        faculty={masterData.faculty}
        onRegenerateScope={handleRegenerateScope}
      />

      {stats?.success === false ? (
        <ConflictReport
          conflicts={stats.conflicts ?? []}
          suggestions={stats.suggestions ?? []}
          unscheduled={validation?.missingHours ?? []}
        />
      ) : null}

      {storageWarning ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-900">
          {storageWarning}
        </div>
      ) : null}

      <StatusBar stats={stats} validation={validation} clashCount={clashInfo.count} />

      {hasTimetable && clashInfo.count > 0 ? (
        <ClashBanner
          clashInfo={clashInfo}
          proposals={fixProposals}
          onApply={(next) => {
            applySessions(next);
            setSelectedId(null);
            setHint('Clash fix applied — review the highlighted cells.');
          }}
        />
      ) : null}

      {hasTimetable ? (
        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="space-y-3 border-b border-slate-100 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex rounded-lg bg-slate-100 p-1">
                {VIEWS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleViewChange(item.id)}
                    aria-pressed={view === item.id}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                      view === item.id
                        ? 'bg-white text-indigo-700 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {view === 'division' ? (
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Division
                    <Select
                      value={divisionId}
                      onChange={(event) => setDivisionId(event.target.value)}
                      className="w-32"
                      aria-label="Select division"
                    >
                      {masterData.divisions.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : null}

                {view === 'faculty' ? (
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Faculty
                    <Select
                      value={facultyId}
                      onChange={(event) => setFacultyId(event.target.value)}
                      className="w-52"
                      aria-label="Select faculty"
                    >
                      {masterData.faculty.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.shortCode} — {item.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : null}

                {view === 'room' ? (
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    Room
                    <Select
                      value={roomId}
                      onChange={(event) => setRoomId(event.target.value)}
                      className="w-48"
                      aria-label="Select room"
                    >
                      {masterData.rooms.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </Select>
                  </label>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setPrintSettingsOpen(true)}>
                Print Settings
              </Button>
              <Button size="sm" variant="secondary" onClick={handlePrintCurrent}>
                Print Current View
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setSubstitutionOpen(true)}
                disabled={!hasTimetable || readOnly}
              >
                Absence / Substitutions
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPrintMode('divisions')}
                disabled={printMode !== null}
              >
                Print All Divisions
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPrintMode('faculty')}
                disabled={printMode !== null}
              >
                Print All Faculty
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPrintMode('master')}
                disabled={printMode !== null}
              >
                Print Master (A3)
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPrintMode('workloads')}
                disabled={printMode !== null}
              >
                Print Workloads
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPrintMode('department')}
                disabled={printMode !== null}
              >
                Print Department Report
              </Button>
              <span className="text-[11px] text-slate-400">
                A4 landscape · header, legend and signatures
              </span>
            </div>

            {view === 'division' && !readOnly ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={editMode ? 'primary' : 'secondary'}
                  onClick={() => {
                    setEditMode((previous) => !previous);
                    setSelectedId(null);
                    setHint('');
                  }}
                >
                  {editMode ? 'Edit / Swap mode: ON' : 'Edit / Swap mode'}
                </Button>
                <Button size="sm" variant="secondary" onClick={handleUndo} disabled={!canUndo}>
                  Undo Last Swap{undoDepth > 0 ? ` (${undoDepth})` : ''}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleReset}
                  disabled={!canReset}
                >
                  Reset to Generated
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={clearPins}
                  disabled={pinnedSessions.length === 0}
                >
                  Clear pins{pinnedSessions.length > 0 ? ` (${pinnedSessions.length})` : ''}
                </Button>
                {editMode ? (
                  <span className="text-[11px] text-slate-500">
                    Click a session, then a destination. Practicals only move into whole
                    2-hour blocks; every move is validated instantly. Keyboard: Tab to a
                    slot, Enter to select, Escape to cancel.
                  </span>
                ) : null}
              </div>
            ) : null}

            {hint ? (
              <p className="text-xs font-medium text-amber-600" role="status">
                {hint}
              </p>
            ) : null}
          </div>

          <div className="p-4">
            {view === 'division' ? (
              division ? (
                <DivisionGrid
                  masterData={masterData}
                  sessions={sessions}
                  division={division}
                  clashInfo={clashInfo}
                  editMode={editMode}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onSwap={applySessions}
                  onHint={setHint}
                  onTogglePin={readOnly ? undefined : togglePin}
                  readOnly={readOnly}
                />
              ) : (
                <EmptyState
                  title="No divisions configured"
                  description="Add a division in Master Data, then generate the timetable."
                />
              )
            ) : null}

            {view === 'faculty' ? (
              faculty ? (
                <FacultyGrid
                  masterData={masterData}
                  sessions={sessions}
                  faculty={faculty}
                  clashInfo={clashInfo}
                />
              ) : (
                <EmptyState
                  title="No faculty configured"
                  description="Add faculty in Master Data to inspect their weekly load."
                />
              )
            ) : null}

            {view === 'room' ? (
              room ? (
                <RoomGrid
                  masterData={masterData}
                  sessions={sessions}
                  room={room}
                  clashInfo={clashInfo}
                />
              ) : (
                <EmptyState
                  title="No rooms configured"
                  description="Add classrooms and labs in Master Data to inspect utilisation."
                />
              )
            ) : null}
          </div>
        </section>
      ) : (
        <EmptyState
          title="No timetable yet"
          description="Load the sample department (or fill in Master Data), then press Generate Timetable to build the weekly schedule."
          action={
            readOnly ? undefined : (
              <Button onClick={handleGenerate}>Generate Timetable</Button>
            )
          }
        />
      )}

      {hasTimetable ? (
        <VersionsPanel
          versions={versions}
          publishedVersionId={publishedVersionId}
          onSave={() => saveVersion()}
          onRestore={restoreVersion}
          onDelete={deleteVersion}
          onTogglePublish={togglePublished}
          disabled={readOnly}
        />
      ) : null}

      <SubstitutionModal
        open={substitutionOpen}
        onClose={() => setSubstitutionOpen(false)}
        sessions={sessions}
        masterData={masterData}
        onApply={applySessions}
      />

      {hasTimetable && typeof document !== 'undefined'
        ? createPortal(
            <div className="print-root">
              {printPages.map((page) =>
                page.view === 'master' ? (
                  <PrintableMaster
                    key={page.key}
                    masterData={masterData}
                    sessions={sessions}
                    baseline={baseline}
                    settings={printSettings}
                  />
                ) : (
                  <PrintableTimetable
                    key={page.key}
                    masterData={masterData}
                    sessions={sessions}
                    baseline={baseline}
                    view={page.view}
                    entity={page.entity}
                    settings={printSettings}
                  />
                ),
              )}
              {printMode === 'workloads'
                ? masterData.faculty.map((member) => (
                    <PrintableWorkload
                      key={`workload-${member.id}`}
                      masterData={masterData}
                      sessions={sessions}
                      faculty={member}
                      settings={printSettings}
                      store={semester}
                    />
                  ))
                : null}
              {printMode === 'department' ? (
                <>
                  <PrintableDepartment
                    analytics={analytics}
                    settings={printSettings}
                    store={semester}
                  />
                  {masterData.divisions.map((item) => (
                    <PrintableTimetable
                      key={`department-${item.id}`}
                      masterData={masterData}
                      sessions={sessions}
                      baseline={baseline}
                      view="division"
                      entity={item}
                      settings={printSettings}
                    />
                  ))}
                  <PrintableAnalytics
                    analytics={analytics ?? buildAnalytics(masterData, sessions)}
                    settings={printSettings}
                    generatedAt={generatedAt}
                  />
                </>
              ) : null}
            </div>,
            document.body,
          )
        : null}

      <PrintSettingsModal
        open={printSettingsOpen}
        onClose={() => setPrintSettingsOpen(false)}
        settings={printSettings}
        onSave={savePrintSettings}
        onReset={resetPrintSettings}
        semester={semester}
      />
    </div>
  );
}
