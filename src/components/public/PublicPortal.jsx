import { Fragment, useEffect, useMemo, useState } from 'react';
import { fetchLiveTimetable, getPublicCache } from '../../utils/publicPublish';

const CANONICAL_DAYS = [
  { id: 'MON', label: 'Monday', short: 'Mon' },
  { id: 'TUE', label: 'Tuesday', short: 'Tue' },
  { id: 'WED', label: 'Wednesday', short: 'Wed' },
  { id: 'THU', label: 'Thursday', short: 'Thu' },
  { id: 'FRI', label: 'Friday', short: 'Fri' },
  { id: 'SAT', label: 'Saturday', short: 'Sat' },
];

const DAILY_SCHEDULE = [
  { isSlot: true, slotIndex: 0, label: 'Slot 1', timeRange: '10:00 AM – 11:00 AM' },
  { isSlot: true, slotIndex: 1, label: 'Slot 2', timeRange: '11:00 AM – 12:00 PM' },
  { isBreak: true, label: 'Lunch Break', timeRange: '12:00 PM – 12:45 PM', icon: '🍽️' },
  { isSlot: true, slotIndex: 2, label: 'Slot 3', timeRange: '12:45 PM – 01:45 PM' },
  { isSlot: true, slotIndex: 3, label: 'Slot 4', timeRange: '01:45 PM – 02:45 PM' },
  { isBreak: true, label: 'Short Recess', timeRange: '02:45 PM – 03:00 PM', icon: '☕' },
  { isSlot: true, slotIndex: 4, label: 'Slot 5', timeRange: '03:00 PM – 04:00 PM' },
  { isSlot: true, slotIndex: 5, label: 'Slot 6', timeRange: '04:00 PM – 05:00 PM' },
];

function getTodayDayId() {
  const d = new Date().getDay(); // 0 is Sun, 1 is Mon...
  if (d >= 1 && d <= 6) return CANONICAL_DAYS[d - 1].id;
  return 'MON';
}

function batchLabel(batch) {
  const name = batch?.batchName ?? batch?.batchId ?? '';
  return name.split('-').pop() || name || 'Batch';
}

export default function PublicPortal() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [portalData, setPortalData] = useState(() => getPublicCache());

  // Navigation State
  const [viewType, setViewType] = useState('division'); // 'division' | 'faculty' | 'room'
  const [selectedId, setSelectedId] = useState('');
  const [selectedDayId, setSelectedDayId] = useState(getTodayDayId);

  // Load from server on mount
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await fetchLiveTimetable();
        if (active && data) {
          setPortalData(data);
          setError('');
        }
      } catch (err) {
        if (active && !portalData) {
          setError(err.message || 'Could not load timetable data.');
        }
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const data = await fetchLiveTimetable();
      if (data) {
        setPortalData(data);
        setError('');
      }
    } catch (err) {
      setError(err.message || 'Refresh failed.');
    } finally {
      setRefreshing(false);
    }
  };

  const masterData = portalData?.masterData || {};
  const printSettings = portalData?.printSettings || {};
  const rawTimetable = portalData?.timetable;
  const sessions = useMemo(() => {
    if (Array.isArray(rawTimetable)) return rawTimetable;
    if (Array.isArray(rawTimetable?.sessions)) return rawTimetable.sessions;
    return [];
  }, [rawTimetable]);

  const divisions = masterData.divisions || [];
  const facultyList = masterData.faculty || [];
  const roomsList = masterData.rooms || [];

  // Default entity selection if current is invalid
  useEffect(() => {
    if (viewType === 'division') {
      if (!divisions.some((d) => d.id === selectedId)) {
        setSelectedId(divisions[0]?.id || '');
      }
    } else if (viewType === 'faculty') {
      if (!facultyList.some((f) => f.id === selectedId)) {
        setSelectedId(facultyList[0]?.id || '');
      }
    } else if (viewType === 'room') {
      if (!roomsList.some((r) => r.id === selectedId)) {
        setSelectedId(roomsList[0]?.id || '');
      }
    }
  }, [viewType, divisions, facultyList, roomsList, selectedId]);

  // Current entity object
  const currentEntity = useMemo(() => {
    if (viewType === 'division') return divisions.find((d) => d.id === selectedId);
    if (viewType === 'faculty') return facultyList.find((f) => f.id === selectedId);
    return roomsList.find((r) => r.id === selectedId);
  }, [viewType, selectedId, divisions, facultyList, roomsList]);

  // Filter sessions matching current entity
  const entitySessions = useMemo(() => {
    if (!selectedId) return [];
    if (viewType === 'division') {
      return sessions.filter((s) => s.divisionId === selectedId);
    }
    if (viewType === 'faculty') {
      return sessions.filter((s) =>
        s.type === 'Practical'
          ? (s.batches ?? []).some((b) => b.facultyId === selectedId)
          : s.facultyId === selectedId,
      );
    }
    return sessions.filter((s) =>
      s.type === 'Practical'
        ? (s.batches ?? []).some((b) => b.roomId === selectedId)
        : s.roomId === selectedId,
    );
  }, [sessions, viewType, selectedId]);

  // Map slots & days
  const dayIndexMap = useMemo(() => {
    const map = new Map();
    CANONICAL_DAYS.forEach((cDay, idx) => map.set(cDay.id, idx));
    return map;
  }, []);

  const slotIndexMap = useMemo(() => {
    const map = new Map();
    (masterData?.timeGrid?.slots || []).forEach((s, idx) => map.set(s.id, idx));
    return map;
  }, [masterData]);

  // 6 Days x 6 Slots Matrix
  const sessionMatrix = useMemo(() => {
    const matrix = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => null));
    for (const session of entitySessions) {
      const dIdx = dayIndexMap.get(session.dayId);
      if (dIdx == null || dIdx < 0 || dIdx > 5) continue;
      const sIdx = slotIndexMap.get(session.slotIds?.[0]);
      if (sIdx == null || sIdx < 0 || sIdx > 5) continue;
      matrix[dIdx][sIdx] = session;
    }
    return matrix;
  }, [entitySessions, dayIndexMap, slotIndexMap]);

  // Subject–Faculty Legend for division and room views
  const legend = useMemo(() => {
    if (viewType === 'faculty' || !entitySessions.length) return [];
    const facultyById = new Map(facultyList.map((f) => [f.id, f]));
    const entries = new Map();

    for (const session of entitySessions) {
      if (session.type === 'Fixed') continue;
      const key = session.subjectId ?? session.subjectCode;
      if (!entries.has(key)) {
        entries.set(key, {
          code: session.subjectCode,
          name: session.subjectName,
          type: session.type,
          faculty: new Map(),
          rooms: new Set(),
        });
      }
      const entry = entries.get(key);
      if (session.type === 'Practical') {
        for (const batch of session.batches ?? []) {
          const f = facultyById.get(batch.facultyId);
          const name = batch.facultyName || f?.name || batch.facultyShortCode || f?.shortCode;
          if (name) entry.faculty.set(batch.facultyId, name);
          if (batch.roomName) entry.rooms.add(batch.roomName);
        }
      } else {
        const f = facultyById.get(session.facultyId);
        const name = session.facultyName || f?.name || session.facultyShortCode || f?.shortCode;
        if (name) entry.faculty.set(session.facultyId, name);
        if (session.roomName) entry.rooms.add(session.roomName);
      }
    }

    return [...entries.values()]
      .map((entry) => ({
        code: entry.code,
        name: entry.name,
        type: entry.type === 'Practical' ? 'PR' : 'TH',
        faculty: [...entry.faculty.values()].join(', ') || '—',
        rooms: [...entry.rooms].join(', ') || '—',
      }))
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  }, [entitySessions, viewType, facultyList]);

  // Loading Screen
  if (loading && !portalData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
        <h2 className="mt-4 text-base font-semibold text-slate-800">Loading Department Timetable…</h2>
        <p className="mt-1 text-xs text-slate-500">Connecting to live timetable service</p>
      </div>
    );
  }

  // Error Empty State
  if (error && !portalData) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-6 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-2xl bg-amber-100 text-2xl">
          📅
        </div>
        <h2 className="mt-4 text-lg font-bold text-slate-900">No Timetable Published Yet</h2>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-slate-600">
          The department timetable has not been published to the live portal yet, or the server is
          temporarily unreachable. Please check back later or contact your department timetable coordinator.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={handleRefresh}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow hover:bg-indigo-700"
          >
            Retry Connection
          </button>
          <a
            href="?admin=true"
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100"
          >
            Coordinator Login ↗
          </a>
        </div>
      </div>
    );
  }

  const selectedDayIndex = dayIndexMap.get(selectedDayId) ?? 0;
  const lastUpdated = portalData?.publishedAt
    ? new Date(portalData.publishedAt).toLocaleString(undefined, {
        dateStyle: 'medium',
        timeStyle: 'short',
      })
    : null;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* 1. Header Banner */}
      <header className="border-b border-slate-200 bg-white shadow-sm print:hidden">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-indigo-700">
                  Live Public Portal
                </span>
                {lastUpdated ? (
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    Updated: {lastUpdated}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs font-medium text-slate-500">
                {printSettings?.societyName || "K.E. Society's"}
              </p>
              <h1 className="text-base font-bold sm:text-lg text-slate-900 leading-tight">
                {printSettings?.instituteName || 'Rajarambapu Institute of Technology, Rajaramnagar'}
              </h1>
              <p className="text-xs font-semibold text-indigo-900">
                {printSettings?.departmentName || 'Department of Robotics and Automation'}
                <span className="font-normal text-slate-500">
                  {' '}· {printSettings?.termLabel || '2026-27 PART-1'}
                  {printSettings?.revisionInfo ? ` (${printSettings.revisionInfo})` : ''}
                </span>
              </p>
            </div>

            {/* Top Action Buttons */}
            <div className="flex items-center gap-2 self-start md:self-auto">
              <button
                type="button"
                onClick={handleRefresh}
                disabled={refreshing}
                title="Refresh latest schedule"
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
              >
                <span className={refreshing ? 'animate-spin' : ''}>↻</span>
                <span>{refreshing ? 'Refreshing…' : 'Refresh'}</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                title="Print or Save as PDF"
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <span>🖨️</span>
                <span>Print / PDF</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 2. Interactive Selector Toolbar */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-20 print:hidden">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          {/* Segmented View Switcher */}
          <div className="flex rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setViewType('division')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewType === 'division'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🎓 Class / Division
            </button>
            <button
              type="button"
              onClick={() => setViewType('faculty')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewType === 'faculty'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              👨‍🏫 Faculty
            </button>
            <button
              type="button"
              onClick={() => setViewType('room')}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewType === 'room'
                  ? 'bg-white text-indigo-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              🏛️ Room / Lab
            </button>
          </div>

          {/* Entity Dropdown */}
          <div className="flex items-center gap-2">
            <label htmlFor="entity-select" className="text-xs font-semibold text-slate-600">
              {viewType === 'division' ? 'Select Class:' : viewType === 'faculty' ? 'Select Faculty:' : 'Select Room:'}
            </label>
            <select
              id="entity-select"
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {viewType === 'division' &&
                divisions.map((d) => (
                  <option key={d.id} value={d.id}>
                    Division {d.name}
                  </option>
                ))}
              {viewType === 'faculty' &&
                facultyList.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name} ({f.shortCode})
                  </option>
                ))}
              {viewType === 'room' &&
                roomsList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.type})
                  </option>
                ))}
            </select>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
        {/* Selected Entity Title Header */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-900">
              {viewType === 'division'
                ? `Class Timetable — Division ${currentEntity?.name ?? ''}`
                : viewType === 'faculty'
                  ? `Faculty Timetable — ${currentEntity?.name ?? ''} (${currentEntity?.shortCode ?? ''})`
                  : `Room Timetable — ${currentEntity?.name ?? ''}`}
            </h2>
            <p className="text-xs text-slate-500">
              {viewType === 'division' && currentEntity?.defaultRoomId
                ? `Default Classroom: ${roomsList.find((r) => r.id === currentEntity.defaultRoomId)?.name || 'CR 203'}`
                : viewType === 'faculty' && currentEntity?.maxWeeklyLoad
                  ? `Max Weekly Teaching Load: ${currentEntity.maxWeeklyLoad} hrs`
                  : viewType === 'room' && currentEntity?.capacity
                    ? `Capacity: ${currentEntity.capacity} seats · Type: ${currentEntity.type}`
                    : ''}
            </p>
          </div>
        </div>

        {/* ===================================================================
            3. MOBILE VIEW (< 768px): Day Tabs + Stacked Session Cards
            =================================================================== */}
        <div className="block md:hidden">
          {/* Day Tabs */}
          <div className="grid grid-cols-6 gap-1 rounded-xl bg-slate-200/80 p-1 mb-4">
            {CANONICAL_DAYS.map((day) => {
              const active = day.id === selectedDayId;
              return (
                <button
                  key={day.id}
                  type="button"
                  onClick={() => setSelectedDayId(day.id)}
                  className={`rounded-lg py-2 text-center text-xs font-bold transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-700 hover:bg-white/60'
                  }`}
                >
                  <span className="block">{day.short}</span>
                </button>
              );
            })}
          </div>

          {/* Cards for Selected Day */}
          <div className="space-y-3">
            {DAILY_SCHEDULE.map((item, idx) => {
              if (item.isBreak) {
                return (
                  <div
                    key={`break-${idx}`}
                    className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-amber-900"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base">{item.icon}</span>
                      <span className="text-xs font-bold uppercase tracking-wider">{item.label}</span>
                    </div>
                    <span className="font-mono text-xs font-semibold text-amber-800">{item.timeRange}</span>
                  </div>
                );
              }

              const session = sessionMatrix[selectedDayIndex][item.slotIndex];
              const isPrStart = session && session.type === 'Practical' && (session.slotIds?.length ?? 1) >= 2;
              const isPrSecondHour =
                !session &&
                (item.slotIndex === 1 || item.slotIndex === 3 || item.slotIndex === 5) &&
                sessionMatrix[selectedDayIndex][item.slotIndex - 1]?.type === 'Practical';

              // If this is the second hour of a 2-hour practical, skip rendering redundant card
              if (isPrSecondHour) return null;

              if (!session) {
                return (
                  <div
                    key={`empty-${item.slotIndex}`}
                    className="rounded-xl border border-dashed border-slate-200 bg-white/60 p-3.5 text-slate-400"
                  >
                    <div className="flex items-center justify-between text-xs font-medium">
                      <span>{item.label}</span>
                      <span className="font-mono text-[11px]">{item.timeRange}</span>
                    </div>
                    <p className="mt-2 text-center text-xs italic text-slate-400">Free / No class scheduled</p>
                  </div>
                );
              }

              // Practical Block Card (2 Hours)
              if (isPrStart) {
                const batches = session.batches ?? [];
                return (
                  <div
                    key={session.id}
                    className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-2 border-b border-amber-200/80 pb-2">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-amber-200 px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-amber-900">
                            2 Hours Practical
                          </span>
                          <span className="font-mono text-xs font-semibold text-amber-900">
                            {item.slotIndex === 0
                              ? '10:00 AM – 12:00 PM'
                              : item.slotIndex === 2
                                ? '12:45 PM – 02:45 PM'
                                : '03:00 PM – 05:00 PM'}
                          </span>
                        </div>
                        <h4 className="mt-1 text-sm font-bold text-slate-900">{session.subjectName}</h4>
                        <p className="text-[11px] font-medium text-slate-500">{session.subjectCode}</p>
                      </div>
                    </div>

                    {/* Batches Stack */}
                    <div className="mt-2.5 space-y-1.5">
                      {batches.length > 0 ? (
                        batches.map((b) => (
                          <div
                            key={b.batchId}
                            className="flex items-center justify-between rounded-lg bg-white/80 px-2.5 py-1.5 text-xs ring-1 ring-amber-200"
                          >
                            <span className="font-bold text-slate-800">{batchLabel(b)}</span>
                            <span className="text-slate-600 font-medium">
                              {b.facultyName || b.facultyShortCode || '—'}
                            </span>
                            <span className="font-mono text-slate-500 text-[11px]">{b.roomName || '—'}</span>
                          </div>
                        ))
                      ) : (
                        <div className="rounded bg-white/80 px-2.5 py-1.5 text-xs text-slate-700">
                          {session.roomName || '—'}
                        </div>
                      )}
                    </div>
                  </div>
                );
              }

              // Theory Lecture Card
              return (
                <div
                  key={session.id}
                  className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 shadow-sm"
                >
                  <div className="flex items-center justify-between text-xs font-medium text-slate-500">
                    <span className="font-bold text-indigo-700">{item.label} · Lecture</span>
                    <span className="font-mono">{item.timeRange}</span>
                  </div>
                  <h4 className="mt-1 text-sm font-bold text-slate-900">{session.subjectName}</h4>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded bg-white px-2 py-0.5 font-semibold text-slate-700 shadow-xs">
                      {session.subjectCode}
                    </span>
                    <span className="rounded bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-800">
                      {session.facultyName || session.facultyShortCode || '—'}
                    </span>
                    <span className="text-slate-500">📍 {session.roomName || '—'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* ===================================================================
            4. DESKTOP VIEW (>= 768px): Full Mon-Sat Institutional Grid
            =================================================================== */}
        <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-900 text-white">
                <th className="w-28 p-3 text-center font-bold uppercase tracking-wider text-[11px]">
                  Time Slot
                </th>
                {CANONICAL_DAYS.map((day) => (
                  <th key={day.id} className="p-3 text-center font-bold uppercase tracking-wider text-[11px] border-l border-slate-700">
                    {day.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* Slot 1: 10:00 - 11:00 */}
              <tr className="border-b border-slate-200">
                <td className="bg-slate-50 p-2.5 text-center font-bold text-slate-700">
                  <div className="text-xs">Slot 1</div>
                  <div className="text-[10px] font-normal text-slate-500">10:00–11:00</div>
                </td>
                {CANONICAL_DAYS.map((_, dIdx) => {
                  const session = sessionMatrix[dIdx][0];
                  return renderDesktopCell(session, 0, dIdx, sessionMatrix, viewType);
                })}
              </tr>

              {/* Slot 2: 11:00 - 12:00 */}
              <tr className="border-b border-slate-200">
                <td className="bg-slate-50 p-2.5 text-center font-bold text-slate-700">
                  <div className="text-xs">Slot 2</div>
                  <div className="text-[10px] font-normal text-slate-500">11:00–12:00</div>
                </td>
                {CANONICAL_DAYS.map((_, dIdx) => {
                  // If covered by slot 0 practical, skip cell
                  if (sessionMatrix[dIdx][0]?.type === 'Practical') return null;
                  const session = sessionMatrix[dIdx][1];
                  return renderDesktopCell(session, 1, dIdx, sessionMatrix, viewType);
                })}
              </tr>

              {/* Lunch Break: 12:00 - 12:45 */}
              <tr className="border-b border-amber-200 bg-amber-50/90 text-amber-900">
                <td className="p-2 text-center font-mono text-[11px] font-bold">12:00–12:45</td>
                <td
                  colSpan={6}
                  className="p-2 text-center text-xs font-bold uppercase tracking-[0.18em] border-l border-amber-200"
                >
                  🍽️ Lunch Break · Non-Teaching
                </td>
              </tr>

              {/* Slot 3: 12:45 - 1:45 */}
              <tr className="border-b border-slate-200">
                <td className="bg-slate-50 p-2.5 text-center font-bold text-slate-700">
                  <div className="text-xs">Slot 3</div>
                  <div className="text-[10px] font-normal text-slate-500">12:45–1:45</div>
                </td>
                {CANONICAL_DAYS.map((_, dIdx) => {
                  const session = sessionMatrix[dIdx][2];
                  return renderDesktopCell(session, 2, dIdx, sessionMatrix, viewType);
                })}
              </tr>

              {/* Slot 4: 1:45 - 2:45 */}
              <tr className="border-b border-slate-200">
                <td className="bg-slate-50 p-2.5 text-center font-bold text-slate-700">
                  <div className="text-xs">Slot 4</div>
                  <div className="text-[10px] font-normal text-slate-500">1:45–2:45</div>
                </td>
                {CANONICAL_DAYS.map((_, dIdx) => {
                  if (sessionMatrix[dIdx][2]?.type === 'Practical') return null;
                  const session = sessionMatrix[dIdx][3];
                  return renderDesktopCell(session, 3, dIdx, sessionMatrix, viewType);
                })}
              </tr>

              {/* Recess: 2:45 - 3:00 */}
              <tr className="border-b border-amber-200 bg-amber-50/90 text-amber-900">
                <td className="p-2 text-center font-mono text-[11px] font-bold">2:45–3:00</td>
                <td
                  colSpan={6}
                  className="p-2 text-center text-xs font-bold uppercase tracking-[0.18em] border-l border-amber-200"
                >
                  ☕ Short Recess · Non-Teaching
                </td>
              </tr>

              {/* Slot 5: 3:00 - 4:00 */}
              <tr className="border-b border-slate-200">
                <td className="bg-slate-50 p-2.5 text-center font-bold text-slate-700">
                  <div className="text-xs">Slot 5</div>
                  <div className="text-[10px] font-normal text-slate-500">3:00–4:00</div>
                </td>
                {CANONICAL_DAYS.map((_, dIdx) => {
                  const session = sessionMatrix[dIdx][4];
                  return renderDesktopCell(session, 4, dIdx, sessionMatrix, viewType);
                })}
              </tr>

              {/* Slot 6: 4:00 - 5:00 */}
              <tr>
                <td className="bg-slate-50 p-2.5 text-center font-bold text-slate-700">
                  <div className="text-xs">Slot 6</div>
                  <div className="text-[10px] font-normal text-slate-500">4:00–5:00</div>
                </td>
                {CANONICAL_DAYS.map((_, dIdx) => {
                  if (sessionMatrix[dIdx][4]?.type === 'Practical') return null;
                  const session = sessionMatrix[dIdx][5];
                  return renderDesktopCell(session, 5, dIdx, sessionMatrix, viewType);
                })}
              </tr>
            </tbody>
          </table>
        </div>

        {/* 5. Subject–Faculty Legend (Division & Room Views) */}
        {legend.length > 0 ? (
          <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-bold uppercase tracking-wider text-slate-900">
              Subject–Faculty Legend
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                    <th className="p-2.5 font-bold">Subject Code</th>
                    <th className="p-2.5 font-bold">Subject Name</th>
                    <th className="p-2.5 font-bold text-center">Type</th>
                    <th className="p-2.5 font-bold">Faculty Name</th>
                    <th className="p-2.5 font-bold">Room / Lab</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {legend.map((entry) => (
                    <tr key={entry.code} className="hover:bg-slate-50/70">
                      <td className="p-2.5 font-mono font-semibold text-slate-900">{entry.code}</td>
                      <td className="p-2.5 font-medium text-slate-800">{entry.name}</td>
                      <td className="p-2.5 text-center">
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            entry.type === 'PR'
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {entry.type}
                        </span>
                      </td>
                      <td className="p-2.5 text-slate-700">{entry.faculty}</td>
                      <td className="p-2.5 text-slate-600">{entry.rooms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}
      </main>

      {/* 6. Footer Block */}
      <footer className="mt-12 border-t border-slate-200 bg-white py-6 text-xs text-slate-500 print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <div>
            <p className="font-medium text-slate-700">
              {printSettings?.instituteName || 'Rajarambapu Institute of Technology'}
            </p>
            <p className="text-[11px] text-slate-400">
              Timetable Studio · Read-Only Student &amp; Faculty Live Portal
            </p>
          </div>
          <div>
            <a
              href="?admin=true"
              className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-medium text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            >
              🔒 Coordinator Login
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** Helper: Render a desktop grid cell with clean styling and 2-hour practical merging */
function renderDesktopCell(session, sIdx, dIdx, matrix, viewType) {
  if (!session) {
    return <td key={`empty-${dIdx}-${sIdx}`} className="border-l border-slate-200 p-2 text-center" />;
  }

  const isPractical = session.type === 'Practical';
  const rowSpan = isPractical ? 2 : 1;

  if (isPractical) {
    const batches = session.batches ?? [];
    return (
      <td
        key={`session-${dIdx}-${sIdx}`}
        rowSpan={rowSpan}
        className="border-l border-slate-200 bg-amber-50/60 p-2.5 align-top ring-1 ring-inset ring-amber-200/50"
      >
        <div className="flex items-start justify-between gap-1 mb-1">
          <p className="line-clamp-2 text-xs font-bold leading-tight text-amber-950">
            {session.subjectName}
          </p>
          <span className="shrink-0 rounded bg-amber-200/80 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider text-amber-900">
            2 Hrs
          </span>
        </div>
        <p className="text-[10px] font-semibold text-amber-800 mb-1.5">{session.subjectCode}</p>

        {batches.length > 0 ? (
          <div className="space-y-1">
            {batches.map((b) => (
              <div
                key={b.batchId}
                className="rounded bg-white/90 p-1 text-[10px] shadow-xs ring-1 ring-amber-200"
              >
                <div className="flex items-center justify-between font-semibold text-slate-800">
                  <span>{batchLabel(b)}</span>
                  <span>{b.facultyShortCode || b.facultyName || '—'}</span>
                </div>
                <div className="truncate text-slate-500 text-[9px]">{b.roomName}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[10px] text-slate-600 font-medium">{session.roomName}</div>
        )}
      </td>
    );
  }

  // Theory Cell
  return (
    <td
      key={`session-${dIdx}-${sIdx}`}
      rowSpan={rowSpan}
      className="border-l border-slate-200 bg-blue-50/50 p-2.5 align-top hover:bg-blue-50 transition"
    >
      <div className="flex flex-col h-full justify-between gap-1">
        <div>
          <p className="line-clamp-2 text-xs font-bold leading-tight text-slate-900" title={session.subjectName}>
            {session.subjectName}
          </p>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{session.subjectCode}</p>
        </div>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-1 border-t border-blue-100 pt-1 text-[10px]">
          <span className="font-semibold text-indigo-700">
            {session.facultyShortCode || session.facultyName || '—'}
          </span>
          <span className="text-slate-500 font-mono text-[9.5px]">{session.roomName}</span>
        </div>
      </div>
    </td>
  );
}
