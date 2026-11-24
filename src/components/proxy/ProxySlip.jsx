import { formatNoticeDate, SELF_STUDY_LABEL } from '../../utils/proxyManager';

/** Print-only A4 landscape substitution order. */
export default function ProxySlip({
  settings,
  date,
  dayLabel,
  absentFaculty,
  assignments,
}) {
  const signatures = (settings?.signatures ?? []).slice(0, 2);

  return (
    <section className="print-page" aria-label="Printable substitution order">
      <header className="print-doc-header">
        <h1 className="print-institute">{settings?.instituteName}</h1>
        <p className="print-department">{settings?.departmentName}</p>
        <div className="print-meta-bar">
          <span className="print-meta-item">
            <span className="print-meta-label">Document</span>
            <span className="print-meta-value">Daily Substitution Order</span>
          </span>
          <span className="print-meta-item">
            <span className="print-meta-label">Date &amp; Day</span>
            <span className="print-meta-value">
              {formatNoticeDate(date)} · {dayLabel}
            </span>
          </span>
          <span className="print-meta-item">
            <span className="print-meta-label">Academic Year &amp; Semester</span>
            <span className="print-meta-value">
              {settings?.academicYear} · {settings?.semester}
            </span>
          </span>
        </div>
      </header>

      <p className="print-doc-note" style={{ color: '#0f172a', fontStyle: 'normal' }}>
        <strong>Faculty on leave: </strong>
        {absentFaculty.length > 0
          ? absentFaculty
              .map((member) =>
                member.shortCode ? `${member.name} (${member.shortCode})` : member.name,
              )
              .join(', ')
          : '—'}
      </p>

      <section className="print-legend" style={{ marginTop: '3mm' }}>
        <h2 className="print-section-title">Table of Adjustments</h2>
        <table className="print-table print-grid">
          <thead>
            <tr>
              <th style={{ width: '18%' }}>Time Slot</th>
              <th style={{ width: '16%' }}>Division / Batch</th>
              <th style={{ width: '27%' }}>Subject</th>
              <th style={{ width: '13%' }}>Room / Lab</th>
              <th style={{ width: '13%' }}>Absent Faculty</th>
              <th style={{ width: '13%' }}>Proxy Faculty</th>
            </tr>
          </thead>
          <tbody>
            {assignments.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center' }}>
                  No adjustments recorded.
                </td>
              </tr>
            ) : (
              assignments.map((assignment) => (
                <tr key={assignment.key}>
                  <td>{assignment.timeLabel}</td>
                  <td>
                    {assignment.divisionName}
                    {assignment.batchName ? ` · ${assignment.batchName}` : ''}
                  </td>
                  <td>
                    {assignment.subjectCode} — {assignment.subjectName}
                  </td>
                  <td>{assignment.roomName}</td>
                  <td>
                    {assignment.facultyShortCode || assignment.facultyName}
                  </td>
                  <td>
                    {assignment.isSelfStudy
                      ? SELF_STUDY_LABEL
                      : assignment.proxyShortCode
                        ? `${assignment.proxyName} (${assignment.proxyShortCode})`
                        : assignment.proxyName}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <footer className="print-signatures">
        {signatures.map((label, index) => (
          <div key={index} className="print-signature">
            <div className="print-signature-line" />
            <p className="print-signature-label">{label}</p>
          </div>
        ))}
      </footer>
    </section>
  );
}
