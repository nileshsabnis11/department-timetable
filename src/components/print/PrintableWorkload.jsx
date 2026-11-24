import { formatSlotRange } from '../../lib/time.js';

const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];

function hoursOf(session) {
  return (session.slotIds ?? []).length;
}

/** One A4 portrait workload statement per faculty member. */
export default function PrintableWorkload({
  masterData,
  sessions,
  faculty,
  settings,
  store,
}) {
  const days = new Map(
    (masterData?.timeGrid?.workingDays ?? []).map((day) => [day.id, day]),
  );

  const rows = [];
  let theory = 0;
  let practical = 0;
  let fixed = 0;
  // A lock scoped to every division is stored once per division; count it once.
  const countedFixed = new Set();

  for (const session of sessions) {
    const base = {
      dayId: session.dayId,
      slotIds: session.slotIds ?? [],
      subjectCode: session.subjectCode ?? '—',
      subjectName: session.subjectName ?? '',
      type: session.type,
      audience: session.divisionName ?? '',
      room: session.roomName ?? '',
    };

    if (session.type === 'Practical') {
      for (const batch of session.batches ?? []) {
        if (batch.facultyId !== faculty.id) continue;
        rows.push({
          ...base,
          audience: `${session.divisionName ?? ''} · ${batch.batchName ?? batch.batchId}`,
          room: batch.roomName ?? '',
          hours: hoursOf(session),
        });
        practical += hoursOf(session);
      }
      continue;
    }

    if (session.facultyId !== faculty.id) continue;
    if (session.type === 'Fixed') {
      const lockKey = `${session.fixedSlotId ?? session.id}|${session.dayId}`;
      if (countedFixed.has(lockKey)) continue;
      countedFixed.add(lockKey);
    }
    rows.push({ ...base, hours: hoursOf(session) });
    if (session.type === 'Fixed') fixed += hoursOf(session);
    else theory += hoursOf(session);
  }

  rows.sort((first, second) => {
    const dayDelta =
      DAY_ORDER.indexOf(first.dayId) - DAY_ORDER.indexOf(second.dayId);
    if (dayDelta !== 0) return dayDelta;
    return (first.slotIds[0] ?? '').localeCompare(second.slotIds[0] ?? '');
  });

  const total = theory + practical;
  const signatures = (settings?.signatures ?? []).slice(0, 3);
  const [first, second, third] = signatures;

  return (
    <section className="print-page print-page-portrait print-workload">
      <header className="print-doc-header">
        <h1 className="print-institute">{settings?.instituteName}</h1>
        <p className="print-department">{settings?.departmentName}</p>
        <div className="print-meta-bar">
          <span className="print-meta-item">
            <span className="print-meta-label">Document</span>
            <span className="print-meta-value">Faculty Workload Statement</span>
          </span>
          <span className="print-meta-item">
            <span className="print-meta-label">Academic Year &amp; Semester</span>
            <span className="print-meta-value">
              {settings?.academicYear} · {settings?.semester}
            </span>
          </span>
          <span className="print-meta-item">
            <span className="print-meta-label">Faculty</span>
            <span className="print-meta-value">
              {faculty.name} ({faculty.shortCode ?? '—'})
            </span>
          </span>
        </div>
      </header>

      <div className="print-workload-summary">
        <span>
          Theory <strong>{theory}</strong>
        </span>
        <span>
          Practical <strong>{practical}</strong>
        </span>
        <span>
          Fixed duties <strong>{fixed}</strong>
        </span>
        <span>
          Total <strong>{total}</strong> / {faculty.maxWeeklyLoad || '—'} max
        </span>
        <span>
          Store: <strong>{store?.name ?? '—'}</strong>
        </span>
      </div>

      {rows.length === 0 ? (
        <p className="print-empty">No teaching duty is currently scheduled for this faculty.</p>
      ) : (
        <table className="print-workload-table">
          <thead>
            <tr>
              <th>Day</th>
              <th>Time</th>
              <th>Class</th>
              <th>Subject</th>
              <th>Room / Lab</th>
              <th>Type</th>
              <th className="num">Hrs</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${row.dayId}-${row.slotIds.join('-')}-${index}`}>
                <td>{days.get(row.dayId)?.short ?? row.dayId}</td>
                <td className="num">
                  {formatSlotRange({
                    start: row.slotIds.length
                      ? masterData.timeGrid.slots.find(
                          (slot) => slot.id === row.slotIds[0],
                        )?.start
                      : '',
                    end: row.slotIds.length
                      ? masterData.timeGrid.slots.find(
                          (slot) => slot.id === row.slotIds[row.slotIds.length - 1],
                        )?.end
                      : '',
                  })}
                </td>
                <td>{row.audience}</td>
                <td>
                  <strong>{row.subjectCode}</strong> {row.subjectName}
                </td>
                <td>{row.room || '—'}</td>
                <td>{row.type}</td>
                <td className="num">{row.hours}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="print-workload-signatures">
        {[first, second, third].filter(Boolean).map((label) => (
          <div key={label} className="print-signature">
            <span className="print-signature-line" />
            <span className="print-signature-label">{label}</span>
          </div>
        ))}
      </div>
      <footer className="print-footer">
        {store?.name ?? ''} · Generated by Timetable Studio
      </footer>
    </section>
  );
}
