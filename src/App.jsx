import { useCallback, useState } from 'react';
import AppHeader from './components/layout/AppHeader';
import SemesterManager from './components/semester/SemesterManager';
import MasterDataManager from './components/masterData/MasterDataManager';
import ExportToolbar from './components/export/ExportToolbar';
import TimetableView from './components/timetable/TimetableView';
import ProxyManager from './components/proxy/ProxyManager';
import AnalyticsDashboard from './components/analytics/AnalyticsDashboard';
import PublishModal from './components/public/PublishModal';
import PublicPortal from './components/public/PublicPortal';
import CoordinatorLoginGate from './components/public/CoordinatorLoginGate';
import { useMasterData } from './hooks/useMasterData';
import {
  activateSemester,
  createSemester,
  deleteSemester,
  duplicateSemester,
  loadSemesterState,
  renameSemester,
  semesterShortLabel,
  setSemesterStatus,
  syncActiveFromApp,
} from './utils/semesterStore';
import { formatBytes, measureStorage } from './utils/storageHealth';

const VIEWS = [
  {
    id: 'master',
    label: 'Master Data',
    hint: 'Time grid, divisions, rooms, faculty and subjects',
  },
  {
    id: 'timetable',
    label: 'Timetable',
    hint: 'Generate, inspect and fine-tune the weekly schedule',
  },
  {
    id: 'proxy',
    label: 'Leave & Proxy',
    hint: 'Daily absence cover, WhatsApp notice and substitution slip',
  },
  {
    id: 'analytics',
    label: 'Analytics',
    hint: 'Faculty load balance and department utilisation',
  },
];

/**
 * One semester's working session. Mounted fresh (by key) whenever the loaded
 * semester changes so every existing store re-reads its localStorage keys.
 */
function Studio({ readOnly, semester, semesterControls, onUnarchive, onLock }) {
  const {
    data,
    notice,
    dismissNotice,
    restorePreserved,
    updateSection,
    loadSample,
    resetAll,
  } = useMasterData();
  const [activeView, setActiveView] = useState('master');
  const [restoreMessage, setRestoreMessage] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);

  const handleRestorePreserved = useCallback(() => {
    const restored = restorePreserved();
    setRestoreMessage(
      restored
        ? 'Preserved Master Data restored.'
        : 'No preserved copy is available to restore.',
    );
  }, [restorePreserved]);

  const handleLoadSample = useCallback(() => {
    if (readOnly) return;
    const confirmed = window.confirm(
      'Load the sample SY & TY department? This replaces the current master data.',
    );
    if (confirmed) loadSample();
  }, [loadSample, readOnly]);

  const handleReset = useCallback(() => {
    if (readOnly) return;
    const confirmed = window.confirm(
      'Clear all master data? The default 10:00 AM – 5:00 PM time grid is kept.',
    );
    if (confirmed) resetAll();
  }, [resetAll, readOnly]);

  return (
    <>
      <AppHeader
        onLoadSample={handleLoadSample}
        onReset={handleReset}
        onOpenPublish={() => setPublishOpen(true)}
        onLock={onLock}
        disabled={readOnly}
        semesterControls={semesterControls}
      />

      <PublishModal
        open={publishOpen}
        onClose={() => setPublishOpen(false)}
        masterData={data}
        semester={semester}
        notify={(msg) => alert(msg)}
      />

      {readOnly ? (
        <div className="border-b border-amber-200 bg-amber-50">
          <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2.5 sm:px-6 lg:px-8">
            <p className="text-xs font-medium text-amber-900">
              Viewing Archived Semester — Read-Only
              <span className="ml-1.5 font-normal text-amber-700">
                ({semesterShortLabel(semester)}). View, print, analytics and Excel export
                remain available.
              </span>
            </p>
            <button
              type="button"
              onClick={onUnarchive}
              className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-amber-900 transition hover:bg-amber-100"
            >
              Unarchive to edit
            </button>
          </div>
        </div>
      ) : null}

      <div className="border-b border-slate-200 bg-white/70">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2 sm:px-6 lg:px-8">
          <p className="text-[11px] font-medium text-slate-400">
            {semester
              ? `${semester.name} · ${semester.status}`
              : 'No semester loaded'}
          </p>
          <ExportToolbar masterData={data} readOnly={readOnly} />
        </div>
      </div>

      {notice ? (
        <div className="mx-auto w-full max-w-7xl px-4 pt-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-amber-900">
                  Saved data needed attention
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-amber-800">
                  {notice.message}
                </p>
                {restoreMessage ? (
                  <p className="mt-1 text-[11px] font-medium text-emerald-700">
                    {restoreMessage}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {notice.preserved && !readOnly ? (
                  <button
                    type="button"
                    onClick={handleRestorePreserved}
                    className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-xs font-medium text-amber-900 transition hover:bg-amber-100"
                  >
                    Restore preserved copy
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={dismissNotice}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-amber-800 transition hover:bg-amber-100"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-7xl px-4 pt-5 sm:px-6 lg:px-8">
        <nav className="grid gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm sm:grid-cols-2 lg:grid-cols-4">
          {VIEWS.map((item) => {
            const active = item.id === activeView;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveView(item.id)}
                aria-current={active ? 'page' : undefined}
                className={`rounded-lg px-4 py-2.5 text-left transition ${
                  active
                    ? 'bg-indigo-50 text-indigo-800 ring-1 ring-inset ring-indigo-200'
                    : 'text-slate-600 hover:bg-slate-50'
                }`}
              >
                <span className="block text-sm font-semibold">{item.label}</span>
                <span
                  className={`mt-0.5 block text-[11px] ${
                    active ? 'text-indigo-600' : 'text-slate-400'
                  }`}
                >
                  {item.hint}
                </span>
              </button>
            );
          })}
        </nav>
      </div>

      <main className="mx-auto w-full max-w-7xl px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        {activeView === 'master' ? (
          <>
            <div className="mb-5">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                Master Data Manager
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Configure the teaching grid, divisions, rooms, faculty, subjects, student
                elective choices and the fixed institutional slots (Open Elective,
                Mentoring, Library, T&amp;P) the generator must keep free. Everything here
                feeds the scheduling engine, and is saved in this browser automatically.
              </p>
            </div>
            <MasterDataManager
              data={data}
              updateSection={updateSection}
              readOnly={readOnly}
            />
          </>
        ) : activeView === 'timetable' ? (
          <>
            <div className="mb-5">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                Weekly Timetable
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Generate a clash-free plan, inspect it by division, faculty or room, and
                fine-tune it with validated manual swaps.
              </p>
            </div>
            <TimetableView
              masterData={data}
              readOnly={readOnly}
              semester={semester}
            />
          </>
        ) : activeView === 'analytics' ? (
          <>
            <div className="mb-5">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                Department Analytics
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Live utilisation and load balance from the saved timetable — faculty hours,
                classroom and lab occupancy, and the 2-hour blocks still free for extra labs.
              </p>
            </div>
            <AnalyticsDashboard masterData={data} />
          </>
        ) : (
          <>
            <div className="mb-5">
              <h2 className="text-xl font-semibold tracking-tight text-slate-900">
                Daily Leave &amp; Proxy Manager
              </h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Mark who is absent, assign free colleagues as proxies, then share the
                notice or print the signed substitution order.
              </p>
            </div>
            <ProxyManager masterData={data} readOnly={readOnly} />
          </>
        )}

        <footer className="mt-8 border-t border-slate-200 pt-4 text-xs text-slate-400">
          Phases 1–4 · Master Data, scheduling engine, interactive timetable, backup/export
          and print-ready A4 output.
        </footer>
      </main>
    </>
  );
}

function CoordinatorApp({ onLock }) {
  const [semesterState, setSemesterState] = useState(loadSemesterState);
  const [manageOpen, setManageOpen] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);

  const activeSemester =
    semesterState.semesters.find((semester) => semester.id === semesterState.currentId) ??
    semesterState.semesters[0] ??
    null;
  const readOnly = activeSemester?.status === 'Archived';

  const handleSwitch = (id) => {
    if (id === semesterState.currentId) return;
    setSemesterState(activateSemester(semesterState, id));
    setSessionKey((key) => key + 1);
  };

  const handleCreate = (input) => {
    setSemesterState(createSemester(semesterState, input));
    setSessionKey((key) => key + 1);
  };

  const handleToggleStatus = (id) => {
    const target = semesterState.semesters.find((semester) => semester.id === id);
    if (!target) return;
    const nextStatus = target.status === 'Archived' ? 'Active' : 'Archived';
    setSemesterState(setSemesterStatus(semesterState, id, nextStatus));
  };

  const handleDelete = (id) => {
    if (semesterState.semesters.length <= 1) return;
    const deletingCurrent = id === semesterState.currentId;
    setSemesterState(deleteSemester(semesterState, id));
    if (deletingCurrent) setSessionKey((key) => key + 1);
  };

  const handleRename = (id, patch) => {
    setSemesterState(renameSemester(semesterState, id, patch));
  };

  const handleDuplicate = (id) => {
    setSemesterState(duplicateSemester(semesterState, id));
    setSessionKey((key) => key + 1);
  };

  const handleOpenManage = () => {
    setSemesterState(syncActiveFromApp(semesterState));
    setManageOpen(true);
  };

  const storageStatus = measureStorage();

  return (
    <div className="min-h-screen bg-slate-50">
      {storageStatus.warning ? (
        <div
          className={`border-b px-4 py-2 text-[11px] font-medium sm:px-6 lg:px-8 ${
            storageStatus.critical
              ? 'border-rose-200 bg-rose-50 text-rose-800'
              : 'border-amber-200 bg-amber-50 text-amber-800'
          }`}
        >
          Browser storage is {Math.round(storageStatus.percent)}% full (
          {formatBytes(storageStatus.bytes)}). Export a JSON backup from the toolbar, then
          archive or delete an older semester. Archived terms keep their timetable in this
          browser.
        </div>
      ) : null}
      <Studio
        key={sessionKey}
        readOnly={readOnly}
        semester={activeSemester}
        onLock={onLock}
        onUnarchive={() => {
          if (activeSemester) handleToggleStatus(activeSemester.id);
        }}
        semesterControls={
          <SemesterManager
            semesters={semesterState.semesters}
            activeId={semesterState.currentId}
            open={manageOpen}
            onOpenChange={(open) => (open ? handleOpenManage() : setManageOpen(false))}
            onSwitch={handleSwitch}
            onCreate={handleCreate}
            onToggleStatus={handleToggleStatus}
            onDelete={handleDelete}
            onRename={handleRename}
            onDuplicate={handleDuplicate}
          />
        }
      />
    </div>
  );
}

const COORDINATOR_SESSION_KEY = 'timetable-studio.coordinator-unlocked';

export default function App() {
  const searchParams =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search)
      : new URLSearchParams();
  const isAdmin = searchParams.get('admin') === 'true';
  const isPublicView = searchParams.get('view') === 'public';
  const isLocalhost =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  const [coordinatorUnlocked, setCoordinatorUnlocked] = useState(() => {
    try {
      return (
        typeof window !== 'undefined' &&
        window.sessionStorage?.getItem(COORDINATOR_SESSION_KEY) === 'true'
      );
    } catch {
      return false;
    }
  });

  const handleUnlock = useCallback(() => {
    try {
      window.sessionStorage?.setItem(COORDINATOR_SESSION_KEY, 'true');
    } catch {
      // ignore storage errors
    }
    setCoordinatorUnlocked(true);
  }, []);

  const handleLock = useCallback(() => {
    try {
      window.sessionStorage?.removeItem(COORDINATOR_SESSION_KEY);
    } catch {
      // ignore storage errors
    }
    setCoordinatorUnlocked(false);
    if (typeof window !== 'undefined' && window.location.search.includes('admin=true')) {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('admin');
      window.location.href = nextUrl.toString();
    }
  }, []);

  // When ?admin=true is present, or when running on localhost without ?view=public, open Coordinator Mode.
  // In production (or with ?view=public), default to the clean read-only PublicPortal.
  const showCoordinator = isAdmin || (isLocalhost && !isPublicView);

  if (!showCoordinator) {
    return <PublicPortal />;
  }

  // On non-localhost (production), gate Coordinator Mode behind a passcode login screen.
  if (!isLocalhost && !coordinatorUnlocked) {
    return <CoordinatorLoginGate onUnlock={handleUnlock} />;
  }

  return <CoordinatorApp onLock={!isLocalhost ? handleLock : undefined} />;
}
