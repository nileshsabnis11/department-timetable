import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Button from '../ui/Button';
import ProxySlip from './ProxySlip';
import { loadPrintSettings } from '../print/printSettings';
import { getTimetableSnapshot } from '../../utils/exportUtils';
import {
  SELF_STUDY_LABEL,
  SELF_STUDY_VALUE,
  buildWhatsAppNotice,
  dateKey,
  dayIdForDate,
  dayLabelFor,
  formatNoticeDate,
  getAffectedSessions,
  getAvailableProxies,
  isSunday,
  loadProxyHistory,
  parseDateKey,
  proxyCounts,
  proxyOptionLabel,
  saveProxyRecord,
} from '../../utils/proxyManager';

const cardClass = 'rounded-2xl border border-slate-200 bg-white shadow-sm';
const selectClass =
  'w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-800 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';
const dateInputClass =
  'rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

function memberLabel(member) {
  return member.shortCode ? `${member.name} (${member.shortCode})` : member.name;
}

export default function ProxyManager({ masterData, readOnly = false }) {
  const [snapshot] = useState(() => getTimetableSnapshot());
  const [dateValue, setDateValue] = useState(() => dateKey(new Date()));
  const [absentIds, setAbsentIds] = useState([]);
  const [assignments, setAssignments] = useState({});
  const [history, setHistory] = useState(() => loadProxyHistory());
  const [printing, setPrinting] = useState(false);
  const [printingHistory, setPrintingHistory] = useState(false);
  const [status, setStatus] = useState(null);

  const settings = useMemo(() => loadPrintSettings(), []);
  const date = useMemo(() => parseDateKey(dateValue) ?? new Date(), [dateValue]);
  const sunday = isSunday(date);
  const dayId = dayIdForDate(date);
  const dayLabel = dayLabelFor(masterData, dayId);

  const faculty = masterData?.faculty ?? [];
  const hasTimetable = (snapshot?.sessions ?? []).length > 0;

  const absentFaculty = useMemo(
    () => faculty.filter((member) => absentIds.includes(member.id)),
    [faculty, absentIds],
  );

  const affectedSessions = useMemo(
    () =>
      sunday
        ? []
        : getAffectedSessions(snapshot, dayId, absentIds, masterData),
    [snapshot, sunday, dayId, absentIds, masterData],
  );

  const rowByKey = useMemo(
    () => new Map(affectedSessions.map((row) => [row.key, row])),
    [affectedSessions],
  );

  // Changing the day or the leave list invalidates old assignments.
  const absentKey = absentIds.join('|');
  useEffect(() => {
    setAssignments({});
  }, [dateValue, absentKey]);

  useEffect(() => {
    if (!status) return undefined;
    const timer = window.setTimeout(() => setStatus(null), 5000);
    return () => window.clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    if (!printing) return undefined;
    const reset = () => setPrinting(false);
    window.addEventListener('afterprint', reset, { once: true });
    window.print();
    return () => window.removeEventListener('afterprint', reset);
  }, [printing]);

  useEffect(() => {
    if (!printingHistory) return undefined;
    const reset = () => setPrintingHistory(false);
    window.addEventListener('afterprint', reset, { once: true });
    window.print();
    return () => window.removeEventListener('afterprint', reset);
  }, [printingHistory]);

  const candidatesByKey = useMemo(() => {
    const map = new Map();
    for (const row of affectedSessions) {
      const alreadyAssigned = Object.entries(assignments)
        .filter(([key, value]) => key !== row.key && value && value !== SELF_STUDY_VALUE)
        .map(([key, value]) => ({
          facultyId: value,
          slotIndices: rowByKey.get(key)?.slotIndices ?? [],
        }));

      map.set(
        row.key,
        getAvailableProxies(
          snapshot,
          masterData,
          dayId,
          row.slotIndices,
          absentIds,
          alreadyAssigned,
          { divisionId: row.divisionId },
        ),
      );
    }
    return map;
  }, [affectedSessions, assignments, rowByKey, snapshot, masterData, dayId, absentIds]);

  const filledAssignments = useMemo(
    () =>
      affectedSessions
        .map((row) => {
          const value = assignments[row.key];
          if (!value) return null;
          if (value === SELF_STUDY_VALUE) {
            return {
              ...row,
              isSelfStudy: true,
              proxyId: null,
              proxyName: SELF_STUDY_LABEL,
              proxyShortCode: '',
            };
          }
          const member = faculty.find((item) => item.id === value);
          if (!member) return null;
          return {
            ...row,
            isSelfStudy: false,
            proxyId: member.id,
            proxyName: member.name,
            proxyShortCode: member.shortCode ?? '',
          };
        })
        .filter(Boolean),
    [affectedSessions, assignments, faculty],
  );

  const historyCounts = useMemo(() => proxyCounts(history), [history]);

  const toggleAbsent = (facultyId) => {
    setAbsentIds((previous) =>
      previous.includes(facultyId)
        ? previous.filter((id) => id !== facultyId)
        : [...previous, facultyId],
    );
  };

  const handleAssign = (row, value) => {
    if (value && value !== SELF_STUDY_VALUE) {
      const clash = Object.entries(assignments).some(([otherKey, otherValue]) => {
        if (otherKey === row.key || otherValue !== value) return false;
        const other = rowByKey.get(otherKey);
        return (other?.slotIndices ?? []).some((index) =>
          row.slotIndices.includes(index),
        );
      });
      if (clash) {
        setStatus({
          tone: 'error',
          message:
            'That faculty member is already covering another class in this slot. Pick someone else.',
        });
        return;
      }
    }
    setAssignments((previous) => ({ ...previous, [row.key]: value }));
  };

  async function copyNotice() {
    const text = buildWhatsAppNotice({
      date: dateValue,
      dayLabel,
      absentFaculty,
      assignments: filledAssignments,
      settings,
    });

    try {
      await navigator.clipboard.writeText(text);
      setStatus({
        tone: 'success',
        message: 'Substitution notice copied — paste it into the department group.',
      });
    } catch {
      try {
        const area = document.createElement('textarea');
        area.value = text;
        area.style.position = 'fixed';
        area.style.opacity = '0';
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        area.remove();
        setStatus({ tone: 'success', message: 'Substitution notice copied.' });
      } catch {
        setStatus({
          tone: 'error',
          message: 'This browser blocked clipboard access. Try the print slip instead.',
        });
      }
    }
  }

  function saveRecord() {
    const record = {
      id: `PRX-${Date.now()}`,
      date: dateValue,
      dayLabel,
      savedAt: new Date().toISOString(),
      absentFaculty: absentFaculty.map((member) => ({
        id: member.id,
        name: member.name,
        shortCode: member.shortCode ?? '',
      })),
      assignments: filledAssignments.map((row) => {
        const { session, ...rest } = row;
        void session;
        return rest;
      }),
    };

    const next = saveProxyRecord(record, history);
    setHistory(next);
    setStatus({
      tone: 'success',
      message: `Saved ${filledAssignments.length} proxy assignment${
        filledAssignments.length === 1 ? '' : 's'
      } for ${formatNoticeDate(dateValue)}.`,
    });
  }

  const assignedCount = filledAssignments.length;
  const canOutput = assignedCount > 0;

  return (
    <div className="space-y-4">
      {!hasTimetable ? (
        <div className={`${cardClass} px-5 py-4`}>
          <p className="text-sm font-semibold text-slate-800">No timetable saved yet</p>
          <p className="mt-1 text-xs text-slate-500">
            Generate a weekly timetable first — the proxy manager reads the saved plan for
            the selected day.
          </p>
        </div>
      ) : null}

      {readOnly ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-medium text-amber-800">
          Archived semester — proxy planning is read-only. Copying and printing still work.
        </div>
      ) : null}

      {/* Selector bar ------------------------------------------------------- */}
      <section className={`${cardClass} px-4 py-4 sm:px-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Daily Leave &amp; Proxy</h2>
            <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-slate-500">
              Pick the date and the faculty on leave. Only completely free colleagues are
              offered as proxies, and a 2-hour practical requires cover in both slots.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Date
              </span>
              <input
                type="date"
                value={dateValue}
                onChange={(event) => setDateValue(event.target.value)}
                className={dateInputClass}
                aria-label="Substitution date"
              />
            </label>

            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <span className="block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Day
              </span>
              <span className="text-sm font-semibold text-slate-800">
                {sunday ? 'Sunday' : dayLabel}
              </span>
            </div>

            <details className="relative">
              <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition hover:bg-slate-50">
                <span>
                  {absentIds.length === 0
                    ? 'Faculty on leave'
                    : `${absentIds.length} on leave`}
                </span>
                <span className="text-xs text-slate-400">▾</span>
              </summary>
              <div className="absolute right-0 z-20 mt-1 max-h-64 w-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
                {faculty.length === 0 ? (
                  <p className="px-2 py-1 text-xs text-slate-500">
                    No faculty in Master Data.
                  </p>
                ) : (
                  faculty.map((member) => (
                    <label
                      key={member.id}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={absentIds.includes(member.id)}
                        onChange={() => toggleAbsent(member.id)}
                        className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      {memberLabel(member)}
                    </label>
                  ))
                )}
              </div>
            </details>
          </div>
        </div>

        {absentIds.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {absentFaculty.map((member) => (
              <button
                key={member.id}
                type="button"
                onClick={() => toggleAbsent(member.id)}
                className="inline-flex items-center gap-1 rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 transition hover:bg-rose-100"
                aria-label={`Remove ${member.name} from leave list`}
              >
                {memberLabel(member)} <span aria-hidden="true">×</span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {sunday ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm font-semibold text-amber-900">Sunday is not a working day</p>
          <p className="mt-0.5 text-xs text-amber-800">
            Pick a date between Monday and Saturday to plan substitutions.
          </p>
        </div>
      ) : null}

      {/* Assignment table --------------------------------------------------- */}
      {!sunday && absentIds.length > 0 ? (
        <section className={`${cardClass} overflow-hidden`}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 sm:px-5">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Affected sessions on {dayLabel}
              </h3>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {affectedSessions.length} session
                {affectedSessions.length === 1 ? '' : 's'} need cover · {assignedCount}{' '}
                assigned
              </p>
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              {formatNoticeDate(dateValue)}
            </span>
          </div>

          {affectedSessions.length === 0 ? (
            <p className="px-5 py-6 text-sm text-slate-500">
              No theory lectures or practical batches are scheduled for the selected
              faculty on {dayLabel}.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Time Slot</th>
                    <th className="px-3 py-2 font-semibold">Division / Batch</th>
                    <th className="px-3 py-2 font-semibold">Subject</th>
                    <th className="px-3 py-2 font-semibold">Room / Lab</th>
                    <th className="px-3 py-2 font-semibold">Absent Faculty</th>
                    <th className="px-3 py-2 font-semibold">Proxy Faculty</th>
                  </tr>
                </thead>
                <tbody>
                  {affectedSessions.map((row, index) => {
                    const candidates = candidatesByKey.get(row.key) ?? [];
                    const value = assignments[row.key] ?? '';

                    return (
                      <tr
                        key={row.key}
                        className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50/60'}
                      >
                        <td className="whitespace-nowrap px-3 py-2 align-top font-medium text-slate-700">
                          {row.timeLabel}
                          <span className="mt-0.5 block text-[10px] font-normal text-slate-400">
                            {row.type === 'Practical'
                              ? '2-hour practical'
                              : row.type === 'Fixed'
                                ? 'Locked block'
                                : 'Theory'}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top text-slate-700">
                          {row.divisionName}
                          {row.batchName ? (
                            <span className="ml-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-700">
                              {row.batchName}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 align-top text-slate-700">
                          <span className="font-semibold text-slate-900">
                            {row.subjectCode}
                          </span>{' '}
                          {row.subjectName}
                        </td>
                        <td className="px-3 py-2 align-top text-slate-600">{row.roomName}</td>
                        <td className="px-3 py-2 align-top text-slate-700">
                          {row.facultyName}
                          <span className="ml-1 text-[10px] text-slate-400">
                            {row.facultyShortCode}
                          </span>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <select
                            value={value}
                            onChange={(event) => handleAssign(row, event.target.value)}
                            disabled={readOnly}
                            className={selectClass}
                            aria-label={`Proxy for ${row.subjectCode} ${row.audience} ${row.timeLabel}`}
                          >
                            <option value="">Select proxy…</option>
                            {candidates.map((candidate) => (
                              <option
                                key={candidate.faculty.id}
                                value={candidate.faculty.id}
                              >
                                {proxyOptionLabel(candidate)}
                              </option>
                            ))}
                            <option value={SELF_STUDY_VALUE}>{SELF_STUDY_LABEL}</option>
                            {candidates.length === 0 ? (
                              <option value="" disabled>
                                No free faculty for this slot
                              </option>
                            ) : null}
                          </select>
                          {candidates.some((candidate) => candidate.teachesDivision) ? (
                            <p className="mt-1 text-[10px] text-slate-400">
                              [Teaches {row.divisionName}] marks colleagues already
                              familiar with this class.
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
            <p className="text-[11px] text-slate-500">
              {assignedCount} of {affectedSessions.length} rows assigned. Unassigned rows
              stay out of the notice.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={copyNotice}
                disabled={!canOutput}
              >
                Copy for WhatsApp
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setPrinting(true)}
                disabled={!canOutput}
              >
                Print Substitution Slip
              </Button>
              <Button size="sm" onClick={saveRecord} disabled={!canOutput || readOnly}>
                Save record
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {!sunday && absentIds.length === 0 && hasTimetable ? (
        <div className={`${cardClass} px-5 py-6`}>
          <p className="text-sm text-slate-600">
            Select one or more faculty members who are on leave to see their sessions for{' '}
            {dayLabel}.
          </p>
        </div>
      ) : null}

      {status ? (
        <div
          role="status"
          className={`rounded-xl border px-4 py-2.5 text-xs font-medium ${
            status.tone === 'error'
              ? 'border-rose-200 bg-rose-50 text-rose-700'
              : 'border-emerald-200 bg-emerald-50 text-emerald-800'
          }`}
        >
          {status.message}
        </div>
      ) : null}

      {/* History ------------------------------------------------------------ */}
      <details className={`${cardClass} px-4 py-3 sm:px-5`}>
        <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-2">
          <span>
            <span className="text-sm font-semibold text-slate-900">
              Past Substitutions &amp; Proxy Count
            </span>
            <span className="ml-2 text-[11px] text-slate-500">
              {history.length} saved day{history.length === 1 ? '' : 's'}
            </span>
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setPrintingHistory(true)}
              disabled={history.length === 0}
            >
              Print All Saved Days
            </Button>
            <span className="text-xs text-slate-400">▾</span>
          </div>
        </summary>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Proxies covered
            </h4>
            {historyCounts.length === 0 ? (
              <p className="text-xs text-slate-500">
                No proxy assignments saved yet.
              </p>
            ) : (
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="py-1 font-semibold">Faculty</th>
                    <th className="py-1 font-semibold">Code</th>
                    <th className="py-1 text-right font-semibold">Proxies</th>
                  </tr>
                </thead>
                <tbody>
                  {historyCounts.map((entry) => (
                    <tr key={entry.facultyId} className="border-t border-slate-100">
                      <td className="py-1.5 text-slate-700">{entry.name}</td>
                      <td className="py-1.5 text-slate-500">{entry.shortCode || '—'}</td>
                      <td className="py-1.5 text-right font-semibold tabular-nums text-slate-800">
                        {entry.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              Recent days
            </h4>
            {history.length === 0 ? (
              <p className="text-xs text-slate-500">Saved days will appear here.</p>
            ) : (
              <ul className="space-y-1.5">
                {history.slice(0, 8).map((record) => (
                  <li
                    key={record.id ?? `${record.date}-${record.savedAt}`}
                    className="rounded-lg border border-slate-100 bg-slate-50/60 px-2.5 py-1.5"
                  >
                    <p className="text-xs font-medium text-slate-700">
                      {formatNoticeDate(record.date)} · {record.dayLabel}
                      <span className="ml-1 font-normal text-slate-400">
                        ({record.assignments?.length ?? 0} proxies)
                      </span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {(record.absentFaculty ?? []).map(memberLabel).join(', ') || '—'}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </details>

      {printing && typeof document !== 'undefined'
        ? createPortal(
            <div className="print-root">
              <ProxySlip
                settings={settings}
                date={dateValue}
                dayLabel={dayLabel}
                absentFaculty={absentFaculty}
                assignments={filledAssignments}
              />
            </div>,
            document.body,
          )
        : null}

      {printingHistory && typeof document !== 'undefined'
        ? createPortal(
            <div className="print-root">
              {history.map((record) => (
                <ProxySlip
                  key={record.id ?? `${record.date}-${record.savedAt}`}
                  settings={settings}
                  date={record.date}
                  dayLabel={record.dayLabel ?? record.date}
                  absentFaculty={record.absentFaculty ?? []}
                  assignments={record.assignments ?? []}
                />
              ))}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
