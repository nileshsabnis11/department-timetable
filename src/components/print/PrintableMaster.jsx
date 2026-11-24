import { Fragment, useMemo } from 'react';
import { formatSlotRange } from '../../lib/time';
import { buildSubstitutionIndex } from '../../utils/exportUtils';

/**
 * A3 master wall chart for print: every division on one landscape sheet.
 *
 * Mirrors the "Master Timetable (A3)" workbook tab so the browser printout and
 * the Excel export carry the same document.
 */

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatWefDate(value) {
  if (!value) return '—';
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !part)) return value;
  const [year, month, day] = parts;
  return `${String(day).padStart(2, '0')} ${MONTHS[month - 1] ?? ''} ${year}`.trim();
}

function batchLabel(batch) {
  const name = batch?.batchName ?? batch?.batchId ?? '';
  return name.split('-').pop() || name || 'Batch';
}

/**
 * One division/day row's cells. A 2-hour fixed block borrows the next slot
 * column and that column renders nothing, so the row keeps its width.
 */
function buildRowPlan(columns, coverage, divisionId, dayId, electiveGroups) {
  const plan = new Map();

  for (let index = 0; index < columns.length; index += 1) {
    const column = columns[index];
    if (column.kind !== 'slot') {
      plan.set(index, { kind: 'break' });
      continue;
    }

    const hit = coverage.get(`${divisionId}|${dayId}|${column.slot.id}`);
    if (!hit) {
      plan.set(index, { kind: 'empty' });
      continue;
    }
    if (hit.index !== 0) {
      plan.set(index, { kind: 'continuation' });
      continue;
    }

    const session = hit.session;
    const next = columns[index + 1];
    const spans =
      session.type === 'Fixed' &&
      (session.slotIds ?? []).length === 2 &&
      next?.kind === 'slot' &&
      next.slot.id === session.slotIds[1];

    const group = session.electiveGroup
      ? electiveGroups.get(
          `${divisionId}|${dayId}|${column.slot.id}|${String(session.electiveGroup).trim()}`,
        )
      : null;
    plan.set(index, { kind: 'cell', session, span: spans ? 2 : 1, group });
    if (spans) {
      index += 1;
      plan.set(index, { kind: 'merged' });
    }
  }

  return plan;
}

export default function PrintableMaster({ masterData, sessions, settings, baseline }) {
  const days = useMemo(
    () => (masterData?.timeGrid?.workingDays ?? []).filter((day) => day.enabled !== false),
    [masterData],
  );
  const slots = masterData?.timeGrid?.slots ?? [];
  const breaks = masterData?.timeGrid?.breaks ?? [];
  const divisions = masterData?.divisions ?? [];

  const substitutions = useMemo(
    () => buildSubstitutionIndex(sessions ?? [], baseline ?? []),
    [sessions, baseline],
  );

  const { coverage, electiveGroups } = useMemo(() => {
    const map = new Map();
    const groups = new Map();

    for (const session of sessions ?? []) {
      const electiveKey = session.electiveGroup
        ? `${session.divisionId}|${session.dayId}|${session.slotIds?.[0]}|${String(
            session.electiveGroup,
          ).trim()}`
        : '';
      if (electiveKey) {
        if (!groups.has(electiveKey)) groups.set(electiveKey, []);
        groups.get(electiveKey).push(session);
      }

      (session.slotIds ?? []).forEach((slotId, index) => {
        map.set(`${session.divisionId}|${session.dayId}|${slotId}`, { session, index });
      });
    }

    for (const group of groups.values()) {
      group.sort((a, b) => String(a.subjectCode).localeCompare(String(b.subjectCode)));
    }

    return { coverage: map, electiveGroups: groups };
  }, [sessions]);

  const columns = useMemo(() => {
    const result = [];
    for (const slot of slots) {
      result.push({ kind: 'slot', slot });
      for (const brk of breaks.filter((item) => item.afterSlotId === slot.id)) {
        result.push({ kind: 'break', brk });
      }
    }
    return result;
  }, [slots, breaks]);

  const hasSubstitutions = substitutions.size > 0;

  return (
    <section
      className="print-page print-page-master"
      aria-label="Printable master timetable, all divisions"
    >
      <header className="print-doc-header">
        <h1 className="print-institute">{settings.instituteName}</h1>
        <p className="print-department">{settings.departmentName}</p>
        <div className="print-meta-bar">
          <span className="print-meta-item">
            <span className="print-meta-label">Document</span>
            <span className="print-meta-value">Master Timetable — All Divisions</span>
          </span>
          <span className="print-meta-item">
            <span className="print-meta-label">Academic Year &amp; Semester</span>
            <span className="print-meta-value">
              {settings.academicYear} · {settings.semester}
            </span>
          </span>
          <span className="print-meta-item">
            <span className="print-meta-label">W.E.F. Date</span>
            <span className="print-meta-value">{formatWefDate(settings.wefDate)}</span>
          </span>
        </div>
      </header>

      <table className="print-table print-grid print-master-table">
        <thead>
          <tr>
            <th className="print-master-day-head">Day</th>
            <th className="print-master-class-head">Class</th>
            {columns.map((column) =>
              column.kind === 'slot' ? (
                <th key={column.slot.id}>
                  {column.slot.label}
                  <span className="print-master-time">{formatSlotRange(column.slot)}</span>
                </th>
              ) : (
                <th key={column.brk.id} className="print-master-break-head">
                  {column.brk.label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {days.map((day) => (
            <Fragment key={day.id}>
              {divisions.map((division, divisionIndex) => {
                const rowPlan = buildRowPlan(
                  columns,
                  coverage,
                  division.id,
                  day.id,
                  electiveGroups,
                );

                return (
                <tr key={`${day.id}-${division.id}`}>
                  {divisionIndex === 0 ? (
                    <th
                      rowSpan={Math.max(1, divisions.length)}
                      scope="rowgroup"
                      className="print-master-day-cell"
                    >
                      {day.label}
                    </th>
                  ) : null}
                  <td className="print-master-class-cell">{division.name}</td>
                  {columns.map((column, columnIndex) => {
                    const plan = rowPlan.get(columnIndex);

                    if (column.kind === 'break') {
                      return <td key={column.brk.id} className="print-master-break-cell" />;
                    }
                    if (plan?.kind === 'merged') return null;
                    if (!plan || plan.kind !== 'cell') {
                      return <td key={column.slot.id} />;
                    }

                    const { session, span, group } = plan;
                    const isPractical = session.type === 'Practical';

                    if (group && group.length > 1) {
                      return (
                        <td
                          key={column.slot.id}
                          colSpan={span}
                          className="print-cell-elective"
                        >
                          <div className="print-electives">
                            <div className="print-elective-label">
                              [{group[0]?.electiveGroup ?? 'PE'}]
                            </div>
                            {group.map((option) => (
                              <div key={option.id} className="print-elective-line">
                                {option.subjectCode} {option.subjectName} (
                                {option.facultyShortCode}) — {option.roomName}
                              </div>
                            ))}
                          </div>
                        </td>
                      );
                    }

                    if (session.type === 'Fixed') {
                      const meta = [session.facultyShortCode, session.roomName]
                        .filter(Boolean)
                        .join(' · ');
                      return (
                        <td
                          key={column.slot.id}
                          colSpan={span}
                          className="print-cell-fixed"
                        >
                          <div className="print-fixed-cell">
                            <div className="print-fixed-label">
                              <span aria-hidden="true">🔒 </span>
                              {session.label ?? 'Fixed Slot'}
                            </div>
                            {meta ? <div className="print-cell-meta">{meta}</div> : null}
                          </div>
                        </td>
                      );
                    }

                    return (
                      <td
                        key={column.slot.id}
                        colSpan={span}
                        className={isPractical ? 'print-cell-practical' : undefined}
                      >
                        <div className="print-subject-code">{session.subjectCode}</div>
                        <div className="print-subject-name">{session.subjectName}</div>
                        {isPractical ? (
                          (session.batches ?? []).map((batch) => {
                            const previous = substitutions.get(
                              `${session.id}|${batch.batchId}`,
                            );
                            return (
                              <div key={batch.batchId} className="print-batch-line">
                                <strong>{batchLabel(batch)}</strong>
                                {` · ${batch.facultyShortCode ?? '—'} · ${
                                  batch.roomName ?? '—'
                                }`}
                                {previous ? ` (sub for ${previous})` : null}
                              </div>
                            );
                          })
                        ) : (
                          <>
                            <div className="print-cell-meta">
                              {session.facultyShortCode ?? '—'} · {session.roomName ?? '—'}
                            </div>
                            {substitutions.get(session.id) ? (
                              <div className="print-sub-note">
                                Sub for {substitutions.get(session.id)}
                              </div>
                            ) : null}
                          </>
                        )}
                      </td>
                    );
                  })}
                </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>

      {hasSubstitutions ? (
        <p className="print-doc-note">
          “Sub for …” marks a session covered by a substitute faculty member; the named
          colleague was absent when this document was printed.
        </p>
      ) : null}

      <footer className="print-signatures">
        {settings.signatures.map((label, index) => (
          <div key={index} className="print-signature">
            <div className="print-signature-line" />
            <p className="print-signature-label">{label}</p>
          </div>
        ))}
      </footer>
    </section>
  );
}
