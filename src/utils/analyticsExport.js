/**
 * Analytics → Excel workbook (KPI, faculty load, room utilisation).
 * ExcelJS is loaded on demand so it stays out of the initial bundle.
 */

function dateStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function styleHeader(row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4338CA' },
  };
  row.alignment = { vertical: 'middle' };
}

function autoWidths(sheet, rows) {
  const widths = [];
  for (const row of rows) {
    row.forEach((cell, index) => {
      widths[index] = Math.min(48, Math.max(widths[index] ?? 10, String(cell ?? '').length + 2));
    });
  }
  sheet.columns.forEach((column, index) => {
    column.width = widths[index] ?? 14;
  });
}

/**
 * @param {object} analytics result of buildAnalytics()
 * @param {string} semesterLabel e.g. "2026–27 Even Semester"
 * @param {string} [departmentName]
 */
export async function exportAnalyticsWorkbook(analytics, semesterLabel, departmentName = '') {
  if (typeof document === 'undefined') {
    throw new Error('Excel export is only available in the browser.');
  }
  const ExcelJS = (await import('exceljs')).default ?? (await import('exceljs'));
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Timetable Studio';
  workbook.created = new Date();

  const kpi = workbook.addWorksheet('Summary');
  const kpiRows = [
    ['Department Analytics', departmentName],
    ['Semester', semesterLabel],
    ['Exported', new Date().toLocaleString()],
    [],
    ['Metric', 'Value'],
    ['Total weekly sessions', analytics.kpis.totalSessions],
    ['Theory sessions', analytics.kpis.theorySessions],
    ['Practical sessions', analytics.kpis.practicalSessions],
    ['Fixed-slot sessions', analytics.kpis.fixedSessions],
    ['Average faculty load %', Math.round(analytics.kpis.averageLoadPercent)],
    ['Classroom utilisation %', Math.round(analytics.kpis.classroomPercent)],
    ['Lab utilisation %', Math.round(analytics.kpis.labPercent)],
    ['Free lab blocks', analytics.kpis.freeLabBlocks],
    ['Weekly slots per room', analytics.weeklySlots],
    ['Weekly 2-hour blocks per lab', analytics.weeklyBlocks],
  ];
  kpiRows.forEach((values) => kpi.addRow(values));
  kpi.getRow(1).font = { bold: true, size: 14 };
  kpi.getRow(5).font = { bold: true };
  kpi.getColumn(1).width = 34;
  kpi.getColumn(2).width = 52;

  const faculty = workbook.addWorksheet('Faculty Load');
  const facultyRows = [
    ['Faculty Name', 'Code', 'Theory Hrs', 'Practical Hrs', 'Total Hrs', 'Max Load', 'Load %', 'Status'],
    ...analytics.facultyRows.map((row) => [
      row.name,
      row.shortCode,
      row.theory,
      row.practical,
      row.total,
      row.max || '',
      row.max > 0 ? Math.round(row.percent) : '',
      row.status,
    ]),
  ];
  facultyRows.forEach((values) => faculty.addRow(values));
  styleHeader(faculty.getRow(1));
  autoWidths(faculty, facultyRows);
  faculty.views = [{ state: 'frozen', ySplit: 1 }];

  const rooms = workbook.addWorksheet('Room Utilisation');
  const roomRows = [
    ['Room / Lab', 'Type', 'Booked', 'Capacity', 'Free', 'Utilisation %', 'Free 2-hour blocks'],
    ...analytics.roomRows.map((room) => [
      room.name,
      room.type,
      room.booked,
      room.capacity,
      room.free,
      Math.round(room.percent),
      room.freeBlocks.map((block) => block.label).join(', '),
    ]),
  ];
  roomRows.forEach((values) => rooms.addRow(values));
  styleHeader(rooms.getRow(1));
  autoWidths(rooms, roomRows);
  rooms.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `department-analytics-${dateStamp()}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
