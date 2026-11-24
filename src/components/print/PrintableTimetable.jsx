import { Fragment, useMemo } from 'react';
import { buildSubstitutionIndex } from '../../utils/exportUtils';

/**
 * Phase 4B — official 20-column institutional timetable document (A4 Landscape).
 * Rendered 1:1 matching the official RIT format from NVS.pdf.
 */

const CANONICAL_DAYS = [
  { id: 'MON', label: 'Monday' },
  { id: 'TUE', label: 'Tuesday' },
  { id: 'WED', label: 'Wednesday' },
  { id: 'THU', label: 'Thursday' },
  { id: 'FRI', label: 'Friday' },
  { id: 'SAT', label: 'Saturday' },
];

function batchLabel(batch) {
  const name = batch?.batchName ?? batch?.batchId ?? '';
  return name.split('-').pop() || name || 'Batch';
}

function matchesView(session, view, entityId) {
  if (view === 'division') return session.divisionId === entityId;
  if (session.type === 'Fixed') {
    return view === 'faculty'
      ? session.facultyId === entityId
      : session.roomId === entityId;
  }
  if (view === 'faculty') {
    return session.type === 'Practical'
      ? (session.batches ?? []).some((batch) => batch.facultyId === entityId)
      : session.facultyId === entityId;
  }
  return session.type === 'Practical'
    ? (session.batches ?? []).some((batch) => batch.roomId === entityId)
    : session.roomId === entityId;
}

export default function PrintableTimetable({
  masterData,
  sessions,
  view,
  entity,
  settings,
  baseline,
}) {
  const workingDays = useMemo(
    () => (masterData?.timeGrid?.workingDays ?? []).filter((day) => day.enabled !== false),
    [masterData],
  );
  const slots = masterData?.timeGrid?.slots ?? [];

  const substitutions = useMemo(
    () => buildSubstitutionIndex(sessions ?? [], baseline ?? []),
    [sessions, baseline],
  );

  const entitySessions = useMemo(
    () =>
      (sessions ?? []).filter((session) =>
        entity?.id ? matchesView(session, view, entity.id) : false,
      ),
    [sessions, view, entity],
  );

  const dayIndexMap = useMemo(() => {
    const map = new Map();
    CANONICAL_DAYS.forEach((cDay, idx) => {
      map.set(cDay.id, idx);
      const matched = workingDays.find(
        (d) => d.id === cDay.id || d.label.toLowerCase() === cDay.label.toLowerCase(),
      );
      if (matched) map.set(matched.id, idx);
    });
    return map;
  }, [workingDays]);

  const slotIndexMap = useMemo(() => {
    const map = new Map();
    slots.forEach((s, idx) => map.set(s.id, idx));
    return map;
  }, [slots]);

  // Pre-index sessions by dayIndex and slotIndex
  const gridSessions = useMemo(() => {
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

  // Compute Faculty Workload Box (FY / UG / Total)
  const facultyWorkloadBox = useMemo(() => {
    if (view !== 'faculty' || !entity?.id) return null;
    let fyTh = 0, fyPr = 0, ugTh = 0, ugPr = 0;
    const divisionsById = new Map((masterData?.divisions ?? []).map((d) => [d.id, d]));

    for (const session of sessions ?? []) {
      const isMine =
        session.type === 'Practical'
          ? (session.batches ?? []).some((b) => b.facultyId === entity.id)
          : session.facultyId === entity.id;
      if (!isMine) continue;

      const div = divisionsById.get(session.divisionId);
      const divName = (div?.name || session.divisionName || '').toLowerCase();
      const isFy = divName.includes('fy') || divName.includes('first year');
      const hrs = session.slotIds?.length || 1;

      if (session.type === 'Practical') {
        const bCount = (session.batches ?? []).filter((b) => b.facultyId === entity.id).length || 1;
        if (isFy) fyPr += hrs * bCount;
        else ugPr += hrs * bCount;
      } else {
        if (isFy) fyTh += hrs;
        else ugTh += hrs;
      }
    }
    const fyTotal = fyTh + fyPr;
    const totalLoad = fyTotal + ugTh + ugPr;
    return { fyTh, fyPr, fyTotal, ugTh, ugPr, totalLoad };
  }, [sessions, entity, view, masterData]);

  // Compute Subject–Faculty Legend without weekly hours, with FULL faculty names
  const legend = useMemo(() => {
    if (view === 'faculty') return [];
    const facultyById = new Map((masterData?.faculty ?? []).map((item) => [item.id, item]));
    const subjectById = new Map((masterData?.subjects ?? []).map((item) => [item.id, item]));
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
          const member = facultyById.get(batch.facultyId);
          const fullName = batch.facultyName || member?.name || batch.facultyShortCode || member?.shortCode;
          if (fullName) entry.faculty.set(batch.facultyId, fullName);
          if (batch.roomName) entry.rooms.add(batch.roomName);
        }
      } else {
        const member = facultyById.get(session.facultyId);
        const fullName = session.facultyName || member?.name || session.facultyShortCode || member?.shortCode;
        if (fullName) entry.faculty.set(session.facultyId, fullName);
        if (session.roomName) entry.rooms.add(session.roomName);
      }
    }

    return [...entries.values()]
      .map((entry) => {
        const subject = subjectById.get(
          (masterData?.subjects ?? []).find((item) => item.code === entry.code)?.id,
        );
        return {
          code: entry.code ?? '—',
          name: entry.name ?? subject?.name ?? '—',
          type: entry.type === 'Practical' ? 'PR' : 'TH',
          faculty: [...entry.faculty.values()].join(', ') || '—',
          rooms: [...entry.rooms].join(', ') || '—',
        };
      })
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));
  }, [entitySessions, masterData, view]);

  // Sub-column header labels based on view
  const subColLabels = useMemo(() => {
    if (view === 'faculty') return ['Class / Batch', 'Subject / Lab', 'Room / Lab'];
    if (view === 'division') return ['Subject / Lab', 'Faculty', 'Room / Lab'];
    return ['Class / Batch', 'Subject / Lab', 'Faculty'];
  }, [view]);

  // Check if a 2-hour practical started at slot 0, 2, or 4
  const isPracticalMerged = (dIdx, sIdx) => {
    const s = gridSessions[dIdx][sIdx];
    return s && s.type === 'Practical' && (s.slotIds?.length ?? 1) >= 2;
  };

  const renderSessionSubCols = (session, rowSpan) => {
    if (!session) {
      return (
        <Fragment>
          <td rowSpan={rowSpan} />
          <td rowSpan={rowSpan} />
          <td rowSpan={rowSpan} />
        </Fragment>
      );
    }

    const isFixed = session.type === 'Fixed';
    if (isFixed) {
      return (
        <td colSpan={3} rowSpan={rowSpan} className="print-cell-fixed">
          🔒 {session.label || session.subjectCode || 'Fixed Slot'}
        </td>
      );
    }

    const isPractical = session.type === 'Practical';
    const bgClass = isPractical ? 'print-cell-pr' : 'print-cell-th';

    if (view === 'faculty') {
      const myBatches = isPractical
        ? (session.batches ?? []).filter((b) => b.facultyId === entity?.id)
        : [];
      const batchLabels = myBatches.map(batchLabel).join(', ');
      const roomName = isPractical
        ? myBatches.map((b) => b.roomName).filter(Boolean).join(', ') || session.roomName || '—'
        : session.roomName || '—';

      return (
        <Fragment>
          <td rowSpan={rowSpan} className={bgClass}>
            {batchLabels ? `${session.divisionName} (${batchLabels})` : session.divisionName}
          </td>
          <td rowSpan={rowSpan} className={bgClass}>
            <strong>{session.subjectName}</strong>
            <br />
            <span className="text-[6.5px]">({session.subjectCode})</span>
          </td>
          <td rowSpan={rowSpan} className={bgClass}>
            {roomName}
          </td>
        </Fragment>
      );
    }

    if (view === 'division') {
      if (isPractical && (session.batches ?? []).length > 0) {
        return (
          <Fragment>
            <td rowSpan={rowSpan} className={`${bgClass} text-left px-1`}>
              {session.batches.map((b) => (
                <div key={b.batchId} className="truncate">
                  <strong>{batchLabel(b)}:</strong> {b.subjectName || session.subjectName}
                </div>
              ))}
            </td>
            <td rowSpan={rowSpan} className={bgClass}>
              {session.batches.map((b) => (
                <div key={b.batchId}>{b.facultyShortCode || b.facultyName || '—'}</div>
              ))}
            </td>
            <td rowSpan={rowSpan} className={bgClass}>
              {session.batches.map((b) => (
                <div key={b.batchId}>{b.roomName || '—'}</div>
              ))}
            </td>
          </Fragment>
        );
      }

      return (
        <Fragment>
          <td rowSpan={rowSpan} className={bgClass}>
            <strong>{session.subjectName}</strong>
            <br />
            <span className="text-[6.5px]">({session.subjectCode})</span>
          </td>
          <td rowSpan={rowSpan} className={bgClass}>
            {session.facultyShortCode || session.facultyName || '—'}
          </td>
          <td rowSpan={rowSpan} className={bgClass}>
            {session.roomName || '—'}
          </td>
        </Fragment>
      );
    }

    // Room view
    const myBatches = isPractical
      ? (session.batches ?? []).filter((b) => b.roomId === entity?.id)
      : [];
    const batchLabels = myBatches.map(batchLabel).join(', ');
    const facCode = isPractical
      ? myBatches.map((b) => b.facultyShortCode || b.facultyName).filter(Boolean).join(', ') || session.facultyShortCode || '—'
      : session.facultyShortCode || session.facultyName || '—';

    return (
      <Fragment>
        <td rowSpan={rowSpan} className={bgClass}>
          {batchLabels ? `${session.divisionName} (${batchLabels})` : session.divisionName}
        </td>
        <td rowSpan={rowSpan} className={bgClass}>
          <strong>{session.subjectName}</strong>
          <br />
          <span className="text-[6.5px]">({session.subjectCode})</span>
        </td>
        <td rowSpan={rowSpan} className={bgClass}>
          {facCode}
        </td>
      </Fragment>
    );
  };

  return (
    <section className="print-page" aria-label={`Printable timetable for ${entity?.name ?? '—'}`}>
      {/* 1. Official Institutional Header Block */}
      <header className="print-doc-header-rit">
        <div className="print-rit-rev">{settings.revisionInfo || 'Revision No. 01 / Date 27/06/2026'}</div>
        <div className="print-rit-society">{settings.societyName || "K.E. Society's"}</div>
        <h1 className="print-rit-institute">{settings.instituteName}</h1>
        <p className="print-rit-dept">{settings.departmentName}</p>
        <div className="print-rit-title">
          {view === 'faculty'
            ? 'Personal time Table'
            : view === 'division'
              ? `Class Time Table — ${entity?.name ?? '—'}`
              : `Room Time Table — ${entity?.name ?? '—'}`}
        </div>
        <div className="print-rit-term">
          {settings.termLabel || `${settings.academicYear || '2026–27'} ${settings.semester || 'PART-1'}`}
          {view === 'division'
            ? `   |   Classroom: ${entity?.defaultRoomId ? masterData?.rooms?.find(r => r.id === entity.defaultRoomId)?.name || 'CR 203' : 'CR 203'}   |   Class Coordinator: Dr. Anil Kulkarni`
            : view === 'room'
              ? `   |   Type: ${entity?.type || 'Classroom'}   |   Capacity: ${entity?.capacity || '—'} seats`
              : ''}
        </div>
        {view === 'faculty' ? (
          <div className="print-rit-staff">Staff Name: {entity?.name ?? '—'}</div>
        ) : null}
      </header>

      {/* 2. Workload Summary Strip (Faculty View Only) */}
      {facultyWorkloadBox ? (
        <div className="print-rit-workload">
          <table className="print-workload-table">
            <tbody>
              <tr>
                <td className="font-bold">FY</td>
                <td className="font-bold">Lectures:</td>
                <td>{facultyWorkloadBox.fyTh}</td>
                <td className="font-bold">Practicals:</td>
                <td>{facultyWorkloadBox.fyPr}</td>
                <td className="font-bold">EE:</td>
                <td>{facultyWorkloadBox.fyTotal}</td>
                <td colSpan={10} />
                <td className="font-bold bg-slate-100">Total:</td>
                <td className="font-bold bg-slate-100">{facultyWorkloadBox.totalLoad}</td>
              </tr>
              <tr>
                <td className="font-bold">UG</td>
                <td className="font-bold">Lectures:</td>
                <td>{facultyWorkloadBox.ugTh}</td>
                <td className="font-bold">Practicals:</td>
                <td>{facultyWorkloadBox.ugPr}</td>
                <td className="font-bold">Tutorials:</td>
                <td>0</td>
                <td className="font-bold">B Tech Project:</td>
                <td>0</td>
                <td className="font-bold">TY CAP Project:</td>
                <td>0</td>
                <td className="font-bold">PS:</td>
                <td>0</td>
                <td colSpan={6} />
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {/* 3. Unified 20-Column Grid */}
      <table className="print-table print-grid-20col">
        <thead>
          <tr>
            <th rowSpan={2} className="w-[4.5%]">Sr.No</th>
            <th rowSpan={2} className="w-[10.5%]">Time</th>
            {CANONICAL_DAYS.map((day) => (
              <th key={day.id} colSpan={3} className="w-[14.16%]">
                {day.label}
              </th>
            ))}
          </tr>
          <tr>
            {CANONICAL_DAYS.map((day) => (
              <Fragment key={day.id}>
                <th>{subColLabels[0]}</th>
                <th>{subColLabels[1]}</th>
                <th>{subColLabels[2]}</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Slot 1: 10:00 To 11:00 */}
          <tr>
            <td className="font-bold">1</td>
            <td className="font-bold">10:00 To 11:00</td>
            {CANONICAL_DAYS.map((_, dIdx) => {
              const isPr = isPracticalMerged(dIdx, 0);
              const session = gridSessions[dIdx][0];
              return renderSessionSubCols(session, isPr ? 2 : 1);
            })}
          </tr>

          {/* Slot 2: 11:00 To 12:00 */}
          <tr>
            <td className="font-bold">2</td>
            <td className="font-bold">11:00 To 12:00</td>
            {CANONICAL_DAYS.map((_, dIdx) => {
              if (isPracticalMerged(dIdx, 0)) return null; // covered by slot 1 rowSpan=2
              const session = gridSessions[dIdx][1];
              return renderSessionSubCols(session, 1);
            })}
          </tr>

          {/* Lunch Break: 12:00 To 12:45 */}
          <tr>
            <td />
            <td className="font-bold">12:00 To 12:45</td>
            <td colSpan={18} className="print-break-cell-rit">
              Lunch Break
            </td>
          </tr>

          {/* Slot 3: 12:45 To 01:45 */}
          <tr>
            <td className="font-bold">3</td>
            <td className="font-bold">12:45 To 01:45</td>
            {CANONICAL_DAYS.map((_, dIdx) => {
              const isPr = isPracticalMerged(dIdx, 2);
              const session = gridSessions[dIdx][2];
              return renderSessionSubCols(session, isPr ? 2 : 1);
            })}
          </tr>

          {/* Slot 4: 01:45 To 02:45 */}
          <tr>
            <td className="font-bold">4</td>
            <td className="font-bold">01:45 To 02:45</td>
            {CANONICAL_DAYS.map((_, dIdx) => {
              if (isPracticalMerged(dIdx, 2)) return null; // covered by slot 3 rowSpan=2
              const session = gridSessions[dIdx][3];
              return renderSessionSubCols(session, 1);
            })}
          </tr>

          {/* Recess: 02:45 To 03:00 */}
          <tr>
            <td />
            <td className="font-bold">02:45 To 03:00</td>
            <td colSpan={18} className="print-break-cell-rit">
              Recess
            </td>
          </tr>

          {/* Slot 5: 03:00 To 04:00 */}
          <tr>
            <td className="font-bold">5</td>
            <td className="font-bold">03:00 To 04:00</td>
            {CANONICAL_DAYS.map((_, dIdx) => {
              const isPr = isPracticalMerged(dIdx, 4);
              const session = gridSessions[dIdx][4];
              return renderSessionSubCols(session, isPr ? 2 : 1);
            })}
          </tr>

          {/* Slot 6: 04:00 To 05:00 */}
          <tr>
            <td className="font-bold">6</td>
            <td className="font-bold">04:00 To 05:00</td>
            {CANONICAL_DAYS.map((_, dIdx) => {
              if (isPracticalMerged(dIdx, 4)) return null; // covered by slot 5 rowSpan=2
              const session = gridSessions[dIdx][5];
              return renderSessionSubCols(session, 1);
            })}
          </tr>

          {/* Slot 7: 05:00 To 06:00 (Static Blank Buffer Row) */}
          <tr className="print-buffer-row">
            <td className="font-bold">7</td>
            <td className="font-bold">05:00 To 06:00</td>
            {Array.from({ length: 18 }).map((_, i) => (
              <td key={i} />
            ))}
          </tr>
        </tbody>
      </table>

      {/* 4. Subject–Faculty Legend (Division & Room Views Only) */}
      {legend.length > 0 ? (
        <section className="print-legend-rit">
          <div className="print-legend-title">Subject–Faculty Legend</div>
          <table className="print-table print-legend-table-rit">
            <thead>
              <tr>
                <th style={{ width: '12%' }}>Subject Code</th>
                <th style={{ width: '38%' }}>Subject Name</th>
                <th style={{ width: '8%' }}>TH/PR</th>
                <th style={{ width: '27%' }}>Faculty Name</th>
                <th style={{ width: '15%' }}>Room / Lab</th>
              </tr>
            </thead>
            <tbody>
              {legend.map((entry) => (
                <tr key={entry.code}>
                  <td className="text-center font-semibold">{entry.code}</td>
                  <td>{entry.name}</td>
                  <td className="text-center">{entry.type}</td>
                  <td>{entry.faculty}</td>
                  <td>{entry.rooms}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}

      {/* 5. Dual Signatures Footer */}
      <footer className="print-signatures-rit">
        <div className="print-sig-col">
          <div className="print-sig-rule" />
          <p className="print-sig-name">Timetable Incharge</p>
        </div>
        <div className="print-sig-col">
          <div className="print-sig-rule" />
          <p className="print-sig-name">HOD</p>
        </div>
      </footer>
    </section>
  );
}
