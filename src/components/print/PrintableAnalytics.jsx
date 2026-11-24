import { LOAD_STATUS } from '../analytics/analyticsUtils';

/**
 * Department Utilisation & Load Analytics — A4 portrait report.
 *
 * Rendered inside the print-only root, one page, for department records. It
 * mirrors the on-screen Analytics tab: KPI strip, faculty load balance and room
 * / lab occupancy with the free 2-hour blocks a coordinator can still use.
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

function percentText(value) {
  return Number.isFinite(value) ? `${Math.round(value)}%` : '—';
}

function PrintBar({ percent }) {
  const width = Math.max(0, Math.min(100, Math.round(percent ?? 0)));
  return (
    <div className="print-bar">
      <span className="print-bar-fill" style={{ width: `${width}%` }} />
    </div>
  );
}

export default function PrintableAnalytics({ analytics, settings, generatedAt }) {
  const { kpis } = analytics;

  return (
    <section
      className="print-page print-page-portrait"
      aria-label="Department utilisation and load analytics report"
    >
      <header className="print-doc-header">
        <h1 className="print-institute">{settings.instituteName}</h1>
        <p className="print-department">{settings.departmentName}</p>
        <div className="print-meta-bar">
          <span className="print-meta-item">
            <span className="print-meta-label">Document</span>
            <span className="print-meta-value">Utilisation &amp; Load Analytics</span>
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

      <div className="print-analytics-kpis">
        <div className="print-kpi">
          <span className="print-kpi-label">Weekly Sessions</span>
          <span className="print-kpi-value">{kpis.totalSessions}</span>
          <span className="print-kpi-caption">
            {kpis.theorySessions} theory · {kpis.practicalSessions} practical
          </span>
        </div>
        <div className="print-kpi">
          <span className="print-kpi-label">Average Faculty Load</span>
          <span className="print-kpi-value">{percentText(kpis.averageLoadPercent)}</span>
          <span className="print-kpi-caption">
            {kpis.cappedFacultyCount} faculty with a load cap
          </span>
        </div>
        <div className="print-kpi">
          <span className="print-kpi-label">Classroom Utilisation</span>
          <span className="print-kpi-value">{percentText(kpis.classroomPercent)}</span>
          <span className="print-kpi-caption">
            {analytics.classrooms.length} rooms × {analytics.weeklySlots} slots ·{' '}
            {kpis.classroomBooked}/{kpis.classroomCapacity}
          </span>
        </div>
        <div className="print-kpi">
          <span className="print-kpi-label">Lab Utilisation</span>
          <span className="print-kpi-value">{percentText(kpis.labPercent)}</span>
          <span className="print-kpi-caption">
            {analytics.labs.length} labs × {analytics.weeklyBlocks} blocks ·{' '}
            {kpis.labBooked}/{kpis.labCapacity}
          </span>
        </div>
      </div>

      <h2 className="print-section-title">Faculty Load Balance</h2>
      <table className="print-table print-analytics-table">
        <thead>
          <tr>
            <th style={{ width: '30%' }}>Faculty Name (Code)</th>
            <th style={{ width: '10%' }}>Theory Hrs</th>
            <th style={{ width: '11%' }}>Practical Hrs</th>
            <th style={{ width: '22%' }}>Total Hrs</th>
            <th style={{ width: '9%' }}>Max Load</th>
            <th style={{ width: '18%' }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {analytics.facultyRows.length === 0 ? (
            <tr>
              <td colSpan={6} className="print-legend-empty">
                No faculty configured.
              </td>
            </tr>
          ) : (
            analytics.facultyRows.map((row) => {
              const status = LOAD_STATUS[row.status] ?? LOAD_STATUS.unknown;
              return (
                <tr key={row.id}>
                  <td>
                    {row.name}
                    {row.shortCode ? ` (${row.shortCode})` : ''}
                  </td>
                  <td className="print-center">{row.theory}</td>
                  <td className="print-center">{row.practical}</td>
                  <td>
                    <span className="print-cell-strong">{row.total}</span>
                    <span className="print-cell-muted">
                      {row.max > 0 ? ` ${Math.round(row.percent)}%` : ' no cap'}
                    </span>
                    <PrintBar percent={row.percent ?? 0} />
                  </td>
                  <td className="print-center">{row.max > 0 ? row.max : '—'}</td>
                  <td>{status.label}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>

      <h2 className="print-section-title">Room &amp; Lab Occupancy</h2>
      <table className="print-table print-analytics-table">
        <thead>
          <tr>
            <th style={{ width: '20%' }}>Room / Lab Name</th>
            <th style={{ width: '8%' }}>Type</th>
            <th style={{ width: '13%' }}>Booked / Capacity</th>
            <th style={{ width: '8%' }}>Free</th>
            <th style={{ width: '16%' }}>Utilisation</th>
            <th style={{ width: '35%' }}>Free 2-Hour Blocks</th>
          </tr>
        </thead>
        <tbody>
          {analytics.roomRows.length === 0 ? (
            <tr>
              <td colSpan={6} className="print-legend-empty">
                No rooms or labs configured.
              </td>
            </tr>
          ) : (
            analytics.roomRows.map((room) => (
              <tr key={room.id}>
                <td>{room.name}</td>
                <td className="print-center">{room.type}</td>
                <td className="print-center">
                  {room.booked} / {room.capacity}{' '}
                  <span className="print-cell-muted">
                    {room.isLab ? 'blocks' : 'slots'}
                  </span>
                </td>
                <td className="print-center">{room.free}</td>
                <td>
                  <span className="print-cell-strong">{percentText(room.percent)}</span>
                  <PrintBar percent={room.percent} />
                </td>
                <td className="print-free-blocks">
                  {room.freeBlocks.length === 0
                    ? 'Fully booked'
                    : room.freeBlocks.map((block) => block.label).join(', ')}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <p className="print-analytics-note">
        Classrooms are measured against {analytics.weeklySlots} weekly slots (6 days ×
        6 slots); labs against {analytics.weeklyBlocks} weekly 2-hour blocks. A locked
        fixed slot assigned to a faculty member counts as contact hours.
        {generatedAt
          ? ` Snapshot generated ${new Date(generatedAt).toLocaleString()}.`
          : ''}
      </p>

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
