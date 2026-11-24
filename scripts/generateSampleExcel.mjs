import ExcelJS from 'exceljs';
import fs from 'fs';
import path from 'path';

async function generateSampleWorkbook() {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Timetable Studio';
  workbook.created = new Date();
  workbook.modified = new Date();

  const thinBorder = () => {
    const edge = { style: 'thin', color: { argb: 'FF000000' } };
    return { top: edge, left: edge, bottom: edge, right: edge };
  };

  const solidFill = (argb) => ({
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb },
  });

  // =========================================================================
  // TAB 1: INDIVIDUAL FACULTY (Personal Time Table - Exact RIT Format)
  // =========================================================================
  const ws1 = workbook.addWorksheet('Faculty - Prof. N. V. Sabnis', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0.15, footer: 0.15 },
    },
    properties: { defaultRowHeight: 18 },
  });

  // 20 Columns Definition:
  // Col 1: Sr.No (5.5)
  // Col 2: Time (13.5)
  // 6 Days x 3 Sub-columns = 18 cols (width 8.5 to 10.5 each)
  ws1.columns = [
    { width: 5.5 },  // 1: Sr.No
    { width: 13.5 }, // 2: Time
    // Monday
    { width: 10.5 }, { width: 9.5 }, { width: 8.5 },
    // Tuesday
    { width: 10.5 }, { width: 9.5 }, { width: 8.5 },
    // Wednesday
    { width: 10.5 }, { width: 9.5 }, { width: 8.5 },
    // Thursday
    { width: 10.5 }, { width: 9.5 }, { width: 8.5 },
    // Friday
    { width: 10.5 }, { width: 9.5 }, { width: 8.5 },
    // Saturday
    { width: 10.5 }, { width: 9.5 }, { width: 8.5 },
  ];

  // Row 1: Top-Right Revision Info
  const r1 = ws1.addRow(new Array(20).fill(''));
  r1.height = 14;
  ws1.getCell('T1').value = 'Revision No. 01 / Date 27/06/2026';
  ws1.getCell('T1').font = { bold: true, size: 8, color: { argb: 'FF000000' } };
  ws1.getCell('T1').alignment = { horizontal: 'right', vertical: 'middle' };

  // Row 2: Society Name
  const r2 = ws1.addRow(['K.E. Society\'s']);
  r2.height = 14;
  ws1.mergeCells('A2:T2');
  ws1.getCell('A2').font = { size: 9.5, color: { argb: 'FF000000' } };
  ws1.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 3: Institute Name
  const r3 = ws1.addRow(['Rajarambapu Institute of Technology, Rajaramnagar']);
  r3.height = 18;
  ws1.mergeCells('A3:T3');
  ws1.getCell('A3').font = { bold: true, size: 12, color: { argb: 'FF000000' } };
  ws1.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 4: Department Name
  const r4 = ws1.addRow(['Department of Automobile/Robotics and Automation Engg.']);
  r4.height = 15;
  ws1.mergeCells('A4:T4');
  ws1.getCell('A4').font = { bold: true, italic: true, size: 10, color: { argb: 'FF000000' } };
  ws1.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 5: Document Title
  const r5 = ws1.addRow(['Personal time Table']);
  r5.height = 16;
  ws1.mergeCells('A5:T5');
  ws1.getCell('A5').font = { bold: true, size: 11, color: { argb: 'FF000000' } };
  ws1.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 6: Term Label
  const r6 = ws1.addRow(['2026-27 PART - I']);
  r6.height = 14;
  ws1.mergeCells('A6:T6');
  ws1.getCell('A6').font = { bold: true, size: 9.5, color: { argb: 'FF000000' } };
  ws1.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 7: Staff Identifier
  const r7 = ws1.addRow(['Staff Name: Prof. N. V. Sabnis']);
  r7.height = 16;
  ws1.getCell('A7').font = { bold: true, size: 9.5, color: { argb: 'FF000000' } };
  ws1.getCell('A7').alignment = { horizontal: 'left', vertical: 'bottom' };

  // Rows 8 & 9: Workload Summary Strip (Exact RIT Box)
  const r8 = ws1.addRow([
    'FY', '', 'Lectures:', '2', 'Practicals:', '4', 'EE', '6',
    '', '', '', '', '', '', '', '', '', '', 'Total:', '17'
  ]);
  r8.height = 15;
  ws1.mergeCells('A8:B8');
  ws1.mergeCells('C8:D8');
  ws1.mergeCells('E8:F8');
  ws1.mergeCells('G8:H8');
  ws1.mergeCells('S8:T8');

  const r9 = ws1.addRow([
    'UG', '', 'Lectures:', '3', 'Practicals:', '2', 'Tutorials:', '0',
    'B Tech Project:', '0', 'TY CAP Project:', '0', 'PS:', '0',
    '', '', '', '', '', ''
  ]);
  r9.height = 15;
  ws1.mergeCells('A9:B9');
  ws1.mergeCells('C9:D9');
  ws1.mergeCells('E9:F9');
  ws1.mergeCells('G9:H9');
  ws1.mergeCells('I9:J9');
  ws1.mergeCells('K9:L9');
  ws1.mergeCells('M9:N9');

  for (let r = 8; r <= 9; r++) {
    for (let c = 1; c <= 20; c++) {
      const cell = ws1.getCell(r, c);
      cell.border = thinBorder();
      cell.font = { size: 8, bold: [1, 3, 5, 7, 9, 11, 13, 19].includes(c) };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }
  ws1.getCell('S8').fill = solidFill('FFF1F5F9');
  ws1.getCell('T8').fill = solidFill('FFF1F5F9');
  ws1.getCell('T8').font = { bold: true, size: 9 };

  // Row 10: Table Header 1 (Days)
  const daysHeader = [
    'Sr.No', 'Time',
    'Monday', '', '',
    'Tuesday', '', '',
    'Wednesday', '', '',
    'Thursday', '', '',
    'Friday', '', '',
    'Saturday', '', ''
  ];
  const r10 = ws1.addRow(daysHeader);
  r10.height = 16;
  ws1.mergeCells('A10:A11');
  ws1.mergeCells('B10:B11');
  ws1.mergeCells('C10:E10');
  ws1.mergeCells('F10:H10');
  ws1.mergeCells('I10:K10');
  ws1.mergeCells('L10:N10');
  ws1.mergeCells('O10:Q10');
  ws1.mergeCells('R10:T10');

  // Row 11: Table Header 2 (Sub-columns)
  const subCols = [
    '', '',
    'Class', 'Subject', 'Room',
    'Class', 'Subject', 'Room',
    'Class', 'Subject', 'Room',
    'Class', 'Subject', 'Room',
    'Class', 'Subject', 'Room',
    'Class', 'Subject', 'Room'
  ];
  const r11 = ws1.addRow(subCols);
  r11.height = 14;

  for (let r = 10; r <= 11; r++) {
    for (let c = 1; c <= 20; c++) {
      const cell = ws1.getCell(r, c);
      cell.border = thinBorder();
      cell.fill = solidFill('FF1E293B');
      cell.font = { bold: true, size: 8.5, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  // Helper to format 3-field day cell
  const set3FieldCell = (row, startCol, cls, sub, rm, fillArgb = null) => {
    ws1.getCell(row, startCol).value = cls;
    ws1.getCell(row, startCol + 1).value = sub;
    ws1.getCell(row, startCol + 2).value = rm;
    for (let i = 0; i < 3; i++) {
      const c = ws1.getCell(row, startCol + i);
      c.border = thinBorder();
      c.font = { size: 8, bold: i === 1 };
      c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      if (fillArgb) c.fill = solidFill(fillArgb);
    }
  };

  const setEmptyDay = (row, startCol) => {
    for (let i = 0; i < 3; i++) {
      const c = ws1.getCell(row, startCol + i);
      c.value = '';
      c.border = thinBorder();
      c.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  };

  // Slot 1: 10:00 To 11:00 (Row 12)
  const r12 = ws1.addRow(['1', '10:00 To 11:00']);
  r12.height = 24;
  set3FieldCell(12, 3, 'SY BTECH', 'MMTI', 'CR 203', 'FFDBEAFE'); // Mon: Blue
  set3FieldCell(12, 6, 'FY BTECH C', 'EEDP', 'LS', 'FFFEF08A');   // Tue: Yellow (PR part 1)
  setEmptyDay(12, 9);                                            // Wed
  setEmptyDay(12, 12);                                           // Thu
  set3FieldCell(12, 15, 'FY B TECH', 'N2 EGL', 'IL7', 'FFFEF08A'); // Fri: Yellow (PR part 1)
  setEmptyDay(12, 18);                                           // Sat

  // Slot 2: 11:00 To 12:00 (Row 13)
  const r13 = ws1.addRow(['2', '11:00 To 12:00']);
  r13.height = 24;
  set3FieldCell(13, 3, 'FY BTECH C', 'EG', 'CR 301', 'FFFEF08A'); // Mon: Yellow
  setEmptyDay(13, 6);  // Will merge with row 12 Tue
  setEmptyDay(13, 9);  // Wed
  setEmptyDay(13, 12); // Thu
  setEmptyDay(13, 15); // Will merge with row 12 Fri
  setEmptyDay(13, 18); // Sat

  // Vertically merge Tuesday Slot 1 & 2 for practical
  ws1.mergeCells('F12:F13');
  ws1.mergeCells('G12:G13');
  ws1.mergeCells('H12:H13');
  // Vertically merge Friday Slot 1 & 2 for practical
  ws1.mergeCells('O12:O13');
  ws1.mergeCells('P12:P13');
  ws1.mergeCells('Q12:Q13');

  // Break 1: Lunch Break (Row 14)
  const r14 = ws1.addRow(['', '12:00 To 12:45', 'Lunch Break']);
  r14.height = 16;
  ws1.mergeCells('C14:T14');
  for (let c = 1; c <= 20; c++) {
    const cell = ws1.getCell(14, c);
    cell.border = thinBorder();
    cell.fill = solidFill('FFFEF3C7');
    cell.font = { bold: true, size: 8.5, color: { argb: 'FF92400E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Slot 3: 12:45 To 01:45 (Row 15)
  const r15 = ws1.addRow(['3', '12:45 To 01:45']);
  r15.height = 24;
  set3FieldCell(15, 3, 'FY BTECH C', 'EEDP', 'Project', 'FFFEF08A'); // Mon PR part 1
  set3FieldCell(15, 6, 'TY BTECH', 'D3 IA', 'COELII', 'FFFBCFE8');   // Tue PR part 1 (Rose)
  set3FieldCell(15, 9, 'FY BTECH C', 'EEDP', 'LS', 'FFFEF08A');     // Wed PR part 1
  set3FieldCell(15, 12, 'FY B TECH', 'N1 EGL', 'CLL', 'FFFEF08A');   // Thu PR part 1
  set3FieldCell(15, 15, 'SY BTECH', 'MMTI', 'CR 203', 'FFDBEAFE');   // Fri Blue
  setEmptyDay(15, 18);                                               // Sat

  // Slot 4: 01:45 To 02:45 (Row 16)
  const r16 = ws1.addRow(['4', '01:45 To 02:45']);
  r16.height = 24;
  setEmptyDay(16, 3);
  setEmptyDay(16, 6);
  setEmptyDay(16, 9);
  setEmptyDay(16, 12);
  setEmptyDay(16, 15);
  setEmptyDay(16, 18);

  // Vertically merge 2-hour practicals across row 15 & 16
  ws1.mergeCells('C15:C16'); ws1.mergeCells('D15:D16'); ws1.mergeCells('E15:E16'); // Mon
  ws1.mergeCells('F15:F16'); ws1.mergeCells('G15:G16'); ws1.mergeCells('H15:H16'); // Tue
  ws1.mergeCells('I15:I16'); ws1.mergeCells('J15:J16'); ws1.mergeCells('K15:K16'); // Wed
  ws1.mergeCells('L15:L16'); ws1.mergeCells('M15:M16'); ws1.mergeCells('N15:N16'); // Thu

  // Break 2: Recess (Row 17)
  const r17 = ws1.addRow(['', '02:45 To 03:00', 'Recess']);
  r17.height = 16;
  ws1.mergeCells('C17:T17');
  for (let c = 1; c <= 20; c++) {
    const cell = ws1.getCell(17, c);
    cell.border = thinBorder();
    cell.fill = solidFill('FFFEF3C7');
    cell.font = { bold: true, size: 8.5, color: { argb: 'FF92400E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Slot 5: 03:00 To 04:00 (Row 18)
  const r18 = ws1.addRow(['5', '03:00 To 04:00']);
  r18.height = 24;
  setEmptyDay(18, 3);
  setEmptyDay(18, 6);
  set3FieldCell(18, 9, 'SY BTECH', 'MMTI', 'CR 203', 'FFDBEAFE'); // Wed Blue
  setEmptyDay(18, 12);
  setEmptyDay(18, 15);
  setEmptyDay(18, 18);

  // Slot 6: 04:00 To 05:00 (Row 19)
  const r19 = ws1.addRow(['6', '04:00 To 05:00']);
  r19.height = 24;
  setEmptyDay(19, 3);
  setEmptyDay(19, 6);
  setEmptyDay(19, 9);
  set3FieldCell(19, 12, 'FY BTECH C', 'EG', 'CR 301', 'FFFEF08A'); // Thu Yellow
  setEmptyDay(19, 15);
  setEmptyDay(19, 18);

  // Slot 7: 05:00 To 06:00 (Row 20 - Static Blank Buffer Row)
  const r20 = ws1.addRow(['7', '05:00 To 06:00']);
  r20.height = 20;
  for (let c = 3; c <= 20; c += 3) {
    setEmptyDay(20, c);
  }

  // Style Col 1 & 2 for all slot rows
  [12, 13, 15, 16, 18, 19, 20].forEach((r) => {
    const c1 = ws1.getCell(r, 1);
    c1.border = thinBorder();
    c1.font = { bold: true, size: 8.5 };
    c1.alignment = { horizontal: 'center', vertical: 'middle' };

    const c2 = ws1.getCell(r, 2);
    c2.border = thinBorder();
    c2.font = { bold: true, size: 8 };
    c2.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Footer: Signatures
  ws1.addRow([]); // Spacer Row 21
  const sigRow = ws1.addRow([]);
  sigRow.height = 30;
  ws1.mergeCells('C22:F22');
  ws1.mergeCells('P22:S22');

  const sigIncharge = ws1.getCell('C22');
  sigIncharge.value = 'Timetable Incharge';
  sigIncharge.font = { bold: true, size: 9.5 };
  sigIncharge.alignment = { horizontal: 'center', vertical: 'bottom' };
  sigIncharge.border = { top: { style: 'thin', color: { argb: 'FF000000' } } };

  const sigHod = ws1.getCell('P22');
  sigHod.value = 'HOD';
  sigHod.font = { bold: true, size: 9.5 };
  sigHod.alignment = { horizontal: 'center', vertical: 'bottom' };
  sigHod.border = { top: { style: 'thin', color: { argb: 'FF000000' } } };


  // =========================================================================
  // TAB 2: CLASSWISE TIMETABLE (Division View - SY B.Tech)
  // =========================================================================
  const ws2 = workbook.addWorksheet('Class - SY B.Tech', {
    pageSetup: {
      paperSize: 9, // A4
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0.15, footer: 0.15 },
    },
    properties: { defaultRowHeight: 18 },
  });

  ws2.columns = ws1.columns; // Same 20-column dimensions!

  // Row 1: Revision Info
  const cR1 = ws2.addRow(new Array(20).fill(''));
  cR1.height = 14;
  ws2.getCell('T1').value = 'Revision No. 01 / Date 27/06/2026';
  ws2.getCell('T1').font = { bold: true, size: 8, color: { argb: 'FF000000' } };
  ws2.getCell('T1').alignment = { horizontal: 'right', vertical: 'middle' };

  // Institutional Header
  const cR2 = ws2.addRow(['K.E. Society\'s']);
  ws2.mergeCells('A2:T2');
  ws2.getCell('A2').font = { size: 9.5 };
  ws2.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const cR3 = ws2.addRow(['Rajarambapu Institute of Technology, Rajaramnagar']);
  ws2.mergeCells('A3:T3');
  ws2.getCell('A3').font = { bold: true, size: 12 };
  ws2.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  const cR4 = ws2.addRow(['Department of Automobile/Robotics and Automation Engg.']);
  ws2.mergeCells('A4:T4');
  ws2.getCell('A4').font = { bold: true, italic: true, size: 10 };
  ws2.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };

  const cR5 = ws2.addRow(['Class Time Table — SY B.TECH (Robotics and Automation)']);
  ws2.mergeCells('A5:T5');
  ws2.getCell('A5').font = { bold: true, size: 11 };
  ws2.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };

  const cR6 = ws2.addRow(['2026-27 PART - I   |   Classroom: CR 203   |   Class Coordinator: Dr. Anil Kulkarni']);
  ws2.mergeCells('A6:T6');
  ws2.getCell('A6').font = { bold: true, size: 9.5 };
  ws2.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle' };

  // Row 7 & 8: Table Header (Days + Sub-columns: Subject | Faculty | Room)
  const cR7 = ws2.addRow(daysHeader);
  cR7.height = 16;
  ws2.mergeCells('A7:A8');
  ws2.mergeCells('B7:B8');
  ws2.mergeCells('C7:E7');
  ws2.mergeCells('F7:H7');
  ws2.mergeCells('I7:K7');
  ws2.mergeCells('L7:N7');
  ws2.mergeCells('O7:Q7');
  ws2.mergeCells('R7:T7');

  const classSubCols = [
    '', '',
    'Subject / Lab', 'Faculty', 'Room',
    'Subject / Lab', 'Faculty', 'Room',
    'Subject / Lab', 'Faculty', 'Room',
    'Subject / Lab', 'Faculty', 'Room',
    'Subject / Lab', 'Faculty', 'Room',
    'Subject / Lab', 'Faculty', 'Room'
  ];
  const cR8 = ws2.addRow(classSubCols);
  cR8.height = 14;

  for (let r = 7; r <= 8; r++) {
    for (let c = 1; c <= 20; c++) {
      const cell = ws2.getCell(r, c);
      cell.border = thinBorder();
      cell.fill = solidFill('FF1E293B');
      cell.font = { bold: true, size: 8.5, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  // Class Slot 1 (Row 9): 10:00 To 11:00
  // Mon has 4-batch practical block: B1, B2, B3, B4
  const cR9 = ws2.addRow(['1', '10:00 To 11:00']);
  cR9.height = 36;
  // Multi-batch practical in Mon
  ws2.getCell(9, 3).value = 'B1: DS Lab\nB2: DE Lab\nB3: OOP Lab\nB4: EC Lab';
  ws2.getCell(9, 4).value = 'AKP\nSMN\nMPJ\nPRS';
  ws2.getCell(9, 5).value = 'Lab 1\nLab 2\nLab 3\nLab 4';
  for (let i = 0; i < 3; i++) {
    const c = ws2.getCell(9, 3 + i);
    c.border = thinBorder();
    c.font = { size: 7.5 };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.fill = solidFill('FFFEF08A'); // Yellow for practical
  }

  // Tue Theory: DS
  set3FieldCell(9, 6, 'Data Structures & Algorithms', 'Dr. Anil Kulkarni', 'CR 203', 'FFDBEAFE');
  // Wed Theory: DS
  set3FieldCell(9, 9, 'Data Structures & Algorithms', 'Dr. Anil Kulkarni', 'CR 203', 'FFDBEAFE');
  // Thu Theory: DS
  set3FieldCell(9, 12, 'Data Structures & Algorithms', 'Dr. Anil Kulkarni', 'CR 203', 'FFDBEAFE');
  // Fri & Sat empty
  setEmptyDay(9, 15);
  setEmptyDay(9, 18);

  // Class Slot 2 (Row 10): 11:00 To 12:00
  const cR10 = ws2.addRow(['2', '11:00 To 12:00']);
  cR10.height = 36;
  setEmptyDay(10, 3); // Merges with row 9
  // Tue Theory: DE
  set3FieldCell(10, 6, 'Digital Electronics', 'Dr. Rajesh Iyer', 'CR 203', 'FFDBEAFE');
  // Wed Theory: DE
  set3FieldCell(10, 9, 'Digital Electronics', 'Dr. Rajesh Iyer', 'CR 203', 'FFDBEAFE');
  // Thu Theory: DE
  set3FieldCell(10, 12, 'Digital Electronics', 'Dr. Rajesh Iyer', 'CR 203', 'FFDBEAFE');
  setEmptyDay(10, 15);
  setEmptyDay(10, 18);

  // Vertically merge Monday Slot 1 & 2 for 4-batch practical
  ws2.mergeCells('C9:C10');
  ws2.mergeCells('D9:D10');
  ws2.mergeCells('E9:E10');

  // Lunch Break (Row 11)
  const cR11 = ws2.addRow(['', '12:00 To 12:45', 'Lunch Break']);
  cR11.height = 16;
  ws2.mergeCells('C11:T11');
  for (let c = 1; c <= 20; c++) {
    const cell = ws2.getCell(11, c);
    cell.border = thinBorder();
    cell.fill = solidFill('FFFEF3C7');
    cell.font = { bold: true, size: 8.5, color: { argb: 'FF92400E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Slot 3 (Row 12): 12:45 To 01:45
  const cR12 = ws2.addRow(['3', '12:45 To 01:45']);
  cR12.height = 24;
  set3FieldCell(12, 3, 'Object Oriented Programming', 'Prof. Meera Joshi', 'CR 203', 'FFDBEAFE');
  set3FieldCell(12, 6, 'Discrete Mathematics', 'Prof. Kavita Rao', 'CR 203', 'FFDBEAFE');
  set3FieldCell(12, 9, 'Discrete Mathematics', 'Prof. Kavita Rao', 'CR 203', 'FFDBEAFE');
  set3FieldCell(12, 12, 'Object Oriented Programming', 'Prof. Meera Joshi', 'CR 203', 'FFDBEAFE');
  setEmptyDay(12, 15);
  setEmptyDay(12, 18);

  // Slot 4 (Row 13): 01:45 To 02:45
  const cR13 = ws2.addRow(['4', '01:45 To 02:45']);
  cR13.height = 24;
  set3FieldCell(13, 3, 'Object Oriented Programming', 'Prof. Meera Joshi', 'CR 203', 'FFDBEAFE');
  setEmptyDay(13, 6);
  setEmptyDay(13, 9);
  setEmptyDay(13, 12);
  setEmptyDay(13, 15);
  setEmptyDay(13, 18);

  // Recess (Row 14)
  const cR14 = ws2.addRow(['', '02:45 To 03:00', 'Recess']);
  cR14.height = 16;
  ws2.mergeCells('C14:T14');
  for (let c = 1; c <= 20; c++) {
    const cell = ws2.getCell(14, c);
    cell.border = thinBorder();
    cell.fill = solidFill('FFFEF3C7');
    cell.font = { bold: true, size: 8.5, color: { argb: 'FF92400E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Slot 5 (Row 15): 03:00 To 04:00
  const cR15 = ws2.addRow(['5', '03:00 To 04:00']);
  cR15.height = 24;
  setEmptyDay(15, 3);
  setEmptyDay(15, 6);
  set3FieldCell(15, 9, 'Discrete Mathematics', 'Prof. Kavita Rao', 'CR 203', 'FFDBEAFE');
  setEmptyDay(15, 12);
  setEmptyDay(15, 15);
  setEmptyDay(15, 18);

  // Slot 6 (Row 16): 04:00 To 05:00
  const cR16 = ws2.addRow(['6', '04:00 To 05:00']);
  cR16.height = 24;
  for (let c = 3; c <= 20; c += 3) setEmptyDay(16, c);

  // Slot 7 (Row 17): 05:00 To 06:00 (Static Blank Buffer Row)
  const cR17 = ws2.addRow(['7', '05:00 To 06:00']);
  cR17.height = 20;
  for (let c = 3; c <= 20; c += 3) setEmptyDay(17, c);

  // Style Col 1 & 2 for class slots
  [9, 10, 12, 13, 15, 16, 17].forEach((r) => {
    const c1 = ws2.getCell(r, 1);
    c1.border = thinBorder(); c1.font = { bold: true, size: 8.5 }; c1.alignment = { horizontal: 'center', vertical: 'middle' };
    const c2 = ws2.getCell(r, 2);
    c2.border = thinBorder(); c2.font = { bold: true, size: 8 }; c2.alignment = { horizontal: 'center', vertical: 'middle' };
  });

  // Legend Section below Classwise grid (Row 19)
  ws2.addRow([]); // Spacer Row 18
  const legTitle = ws2.addRow(['Subject–Faculty Legend']);
  legTitle.height = 18;
  ws2.mergeCells('A19:T19');
  ws2.getCell('A19').font = { bold: true, size: 9.5, color: { argb: 'FF1E293B' } };
  ws2.getCell('A19').alignment = { horizontal: 'left', vertical: 'middle' };

  // Legend Header (Row 20): 5 Columns without Weekly Hours!
  // Col A: Code (1-2), Col C: Name (3-7), Col H: Type (8-9), Col J: Faculty (10-15), Col P: Room (16-20)
  const legHead = ws2.addRow(['Subject Code', '', 'Subject Name', '', '', '', '', 'TH/PR', '', 'Faculty Name', '', '', '', '', '', 'Room / Lab', '', '', '', '']);
  legHead.height = 16;
  ws2.mergeCells('A20:B20');
  ws2.mergeCells('C20:G20');
  ws2.mergeCells('H20:I20');
  ws2.mergeCells('J20:O20');
  ws2.mergeCells('P20:T20');
  for (let c = 1; c <= 20; c++) {
    const cell = ws2.getCell(20, c);
    cell.border = thinBorder();
    cell.fill = solidFill('FF1E293B');
    cell.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  const sampleLegend = [
    { code: 'CS301', name: 'Data Structures & Algorithms', type: 'TH', faculty: 'Dr. Anil Kulkarni', room: 'Classroom 102, Classroom 101' },
    { code: 'CS301L', name: 'Data Structures Lab', type: 'PR', faculty: 'Dr. Anil Kulkarni, Dr. Sameer Naik, Dr. Vikram Patil, Prof. Meera Joshi', room: 'Lab 1, Lab 2, Lab 3, Lab 4' },
    { code: 'CS302', name: 'Digital Electronics', type: 'TH', faculty: 'Dr. Rajesh Iyer', room: 'Classroom 102' },
    { code: 'CS303', name: 'Object Oriented Programming', type: 'TH', faculty: 'Prof. Meera Joshi', room: 'Classroom 101' },
    { code: 'MA301', name: 'Discrete Mathematics', type: 'TH', faculty: 'Prof. Kavita Rao', room: 'Classroom 101' },
  ];

  sampleLegend.forEach((entry, idx) => {
    const row = ws2.addRow([entry.code, '', entry.name, '', '', '', '', entry.type, '', entry.faculty, '', '', '', '', '', entry.room, '', '', '', '']);
    row.height = 16;
    const rNum = row.number;
    ws2.mergeCells(`A${rNum}:B${rNum}`);
    ws2.mergeCells(`C${rNum}:G${rNum}`);
    ws2.mergeCells(`H${rNum}:I${rNum}`);
    ws2.mergeCells(`J${rNum}:O${rNum}`);
    ws2.mergeCells(`P${rNum}:T${rNum}`);
    for (let c = 1; c <= 20; c++) {
      const cell = ws2.getCell(rNum, c);
      cell.border = thinBorder();
      cell.font = { size: 7.5 };
      cell.alignment = {
        horizontal: c === 1 || c === 8 ? 'center' : 'left',
        vertical: 'middle',
      };
      if (idx % 2 === 1) cell.fill = solidFill('FFF8FAFC');
    }
  });

  // Footer: Signatures
  ws2.addRow([]); // Spacer
  const cSigRow = ws2.addRow([]);
  cSigRow.height = 30;
  const cSigRNum = cSigRow.number;
  ws2.mergeCells(`C${cSigRNum}:F${cSigRNum}`);
  ws2.mergeCells(`P${cSigRNum}:S${cSigRNum}`);

  const cSigIncharge = ws2.getCell(`C${cSigRNum}`);
  cSigIncharge.value = 'Timetable Incharge';
  cSigIncharge.font = { bold: true, size: 9.5 };
  cSigIncharge.alignment = { horizontal: 'center', vertical: 'bottom' };
  cSigIncharge.border = { top: { style: 'thin', color: { argb: 'FF000000' } } };

  const cSigHod = ws2.getCell(`P${cSigRNum}`);
  cSigHod.value = 'HOD';
  cSigHod.font = { bold: true, size: 9.5 };
  cSigHod.alignment = { horizontal: 'center', vertical: 'bottom' };
  cSigHod.border = { top: { style: 'thin', color: { argb: 'FF000000' } } };


  // =========================================================================
  // TAB 3: MASTER TIMETABLE (A3 Landscape Wall Chart)
  // =========================================================================
  const ws3 = workbook.addWorksheet('Master Timetable (A3)', {
    pageSetup: {
      paperSize: 8, // A3
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 1,
      margins: { left: 0.25, right: 0.25, top: 0.25, bottom: 0.25, header: 0.15, footer: 0.15 },
    },
    properties: { defaultRowHeight: 20 },
  });

  ws3.columns = [
    { width: 14 }, // Day
    { width: 10 }, // Class
    { width: 22 }, // Slot 1
    { width: 22 }, // Slot 2
    { width: 12 }, // Lunch Break
    { width: 22 }, // Slot 3
    { width: 22 }, // Slot 4
    { width: 12 }, // Recess
    { width: 22 }, // Slot 5
    { width: 22 }, // Slot 6
    { width: 18 }, // Slot 7 (Static Buffer)
  ];

  // Title Row
  const mTitle = ws3.addRow(['K.E. Society\'s Rajarambapu Institute of Technology — Department of Robotics and Automation | Master Timetable (2026–27 · Even Semester)']);
  mTitle.height = 30;
  ws3.mergeCells('A1:K1');
  ws3.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FF0F172A' } };
  ws3.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws3.getCell('A1').fill = solidFill('FFF1F5F9');
  ws3.getCell('A1').border = thinBorder();

  // Header Row
  const mHead = ws3.addRow([
    'Day', 'Class',
    'Slot 1 (10:00–11:00)', 'Slot 2 (11:00–12:00)',
    'Lunch (12:00–12:45)',
    'Slot 3 (12:45–1:45)', 'Slot 4 (1:45–2:45)',
    'Recess (2:45–3:00)',
    'Slot 5 (3:00–4:00)', 'Slot 6 (4:00–5:00)',
    'Slot 7 (5:00–6:00)'
  ]);
  mHead.height = 30;
  for (let c = 1; c <= 11; c++) {
    const cell = mHead.getCell(c);
    cell.border = thinBorder();
    cell.fill = solidFill('FF1E293B');
    cell.font = { bold: true, size: 9.5, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  }

  const daysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const classesList = ['FY', 'SY', 'TY', 'Final Year'];

  daysList.forEach((day) => {
    const startRow = ws3.rowCount + 1;
    classesList.forEach((cls) => {
      const row = ws3.addRow([
        day,
        cls,
        cls === 'SY' && day === 'Monday' ? 'Data Structures Lab (CS301L)\n(2-Hour Practical Block)' : 'Theory Lecture\nProf. Name · CR 101',
        cls === 'SY' && day === 'Monday' ? '' : 'Theory Lecture\nProf. Name · CR 101',
        '', // Lunch
        'Theory Lecture\nProf. Name · CR 102',
        'Theory Lecture\nProf. Name · CR 102',
        '', // Recess
        'Theory Lecture\nProf. Name · CR 101',
        '',
        '' // Buffer slot 7
      ]);
      row.height = 36;
      const rNum = row.number;

      for (let c = 1; c <= 11; c++) {
        const cell = row.getCell(c);
        cell.border = thinBorder();
        cell.font = { size: 8.5 };
        cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      }

      // Horizontal merge practical on SY Monday Slot 1-2
      if (cls === 'SY' && day === 'Monday') {
        ws3.mergeCells(`C${rNum}:D${rNum}`);
        ws3.getCell(`C${rNum}`).fill = solidFill('FFEFF6FF');
        ws3.getCell(`D${rNum}`).fill = solidFill('FFEFF6FF');
      }
    });

    const endRow = ws3.rowCount;
    ws3.mergeCells(`A${startRow}:A${endRow}`);
    for (let r = startRow; r <= endRow; r++) {
      const dayCell = ws3.getCell(`A${r}`);
      dayCell.fill = solidFill('FFF8FAFC');
      dayCell.font = { bold: true, size: 10 };
      dayCell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  });

  // Vertical merges for Lunch (Col E) & Recess (Col H)
  const firstDataRow = 3;
  const lastDataRow = ws3.rowCount;
  ws3.mergeCells(`E${firstDataRow}:E${lastDataRow}`);
  ws3.mergeCells(`H${firstDataRow}:H${lastDataRow}`);

  ws3.getCell(`E${firstDataRow}`).value = 'L\nU\nN\nC\nH\n\nB\nR\nE\nA\nK';
  ws3.getCell(`H${firstDataRow}`).value = 'R\nE\nC\nE\nS\nS';

  for (let r = firstDataRow; r <= lastDataRow; r++) {
    const cLunch = ws3.getCell(`E${r}`);
    cLunch.fill = solidFill('FFFEF3C7');
    cLunch.font = { bold: true, size: 9.5, color: { argb: 'FF92400E' } };
    cLunch.alignment = { horizontal: 'center', vertical: 'middle' };

    const cRecess = ws3.getCell(`H${r}`);
    cRecess.fill = solidFill('FFFEF3C7');
    cRecess.font = { bold: true, size: 9.5, color: { argb: 'FF92400E' } };
    cRecess.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Footer Signatures on Master
  ws3.addRow([]);
  const mSigRow = ws3.addRow([]);
  mSigRow.height = 30;
  const mSigRNum = mSigRow.number;
  ws3.mergeCells(`B${mSigRNum}:D${mSigRNum}`);
  ws3.mergeCells(`I${mSigRNum}:K${mSigRNum}`);

  const mSigIncharge = ws3.getCell(`B${mSigRNum}`);
  mSigIncharge.value = 'Timetable Incharge';
  mSigIncharge.font = { bold: true, size: 10 };
  mSigIncharge.alignment = { horizontal: 'center', vertical: 'bottom' };
  mSigIncharge.border = { top: { style: 'thin', color: { argb: 'FF000000' } } };

  const mSigHod = ws3.getCell(`I${mSigRNum}`);
  mSigHod.value = 'HOD';
  mSigHod.font = { bold: true, size: 10 };
  mSigHod.alignment = { horizontal: 'center', vertical: 'bottom' };
  mSigHod.border = { top: { style: 'thin', color: { argb: 'FF000000' } } };

  // Write files
  const file1 = 'c:/Users/M B Tech/Downloads/Time Table new/sample-institutional-timetable.xlsx';
  const file2 = 'c:/Users/M B Tech/Downloads/Time Table/sample-institutional-timetable.xlsx';

  await workbook.xlsx.writeFile(file1);
  console.log(`Saved sample workbook 1: ${file1}`);

  try {
    await workbook.xlsx.writeFile(file2);
    console.log(`Saved sample workbook 2: ${file2}`);
  } catch (e) {
    console.warn(`Could not write to file2: ${e.message}`);
  }
}

generateSampleWorkbook().catch((err) => {
  console.error('Error generating workbook:', err);
  process.exit(1);
});
