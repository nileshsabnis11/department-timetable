import { ROOM_TYPES, SUBJECT_TYPES } from '../data/types.js';
import { newId } from '../lib/id.js';

/**
 * Bulk CSV import helpers for Faculty and Subjects.
 *
 * The parser is dependency-free for .csv files so it stays easy to test; the
 * already-installed SheetJS package is loaded on demand only for .xlsx/.xls.
 */

export const FACULTY_CSV_HEADERS = ['name', 'shortCode', 'maxWeeklyLoad'];

export const ROOM_CSV_HEADERS = ['name', 'type', 'capacity'];

export const SUBJECT_CSV_HEADERS = [
  'code',
  'name',
  'division',
  'type',
  'weeklyHours',
  'facultyShortCode',
  'requiredRoomType',
  'b1Faculty',
  'b2Faculty',
  'b3Faculty',
  'b4Faculty',
  'electiveGroup',
];

const SUBJECT_REQUIRED_HEADERS = [
  'code',
  'name',
  'division',
  'type',
  'weeklyHours',
  'facultyShortCode',
  'requiredRoomType',
];

function normalizeHeader(value) {
  return String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '');
}

function cell(row, indexByName, header) {
  const index = indexByName.get(normalizeHeader(header));
  if (index == null || !Array.isArray(row)) return '';
  const value = row[index];
  return value == null ? '' : String(value).trim();
}

function isBlankRow(row) {
  return (
    !Array.isArray(row) ||
    row.every((value) => String(value ?? '').trim() === '')
  );
}

function prepareTable(rows, requiredHeaders) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { error: 'The file is empty.' };
  }

  const headerRow = Array.isArray(rows[0]) ? rows[0] : [];
  const normalized = headerRow.map(normalizeHeader);
  const missing = requiredHeaders.filter(
    (header) => !normalized.includes(normalizeHeader(header)),
  );

  if (missing.length > 0) {
    return { error: `Missing required column(s): ${missing.join(', ')}.` };
  }

  const indexByName = new Map();
  normalized.forEach((name, index) => {
    if (name && !indexByName.has(name)) indexByName.set(name, index);
  });

  return { indexByName };
}

function createUniqueId(prefix, usedIds) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const id = newId(prefix);
    if (!usedIds.has(id)) {
      usedIds.add(id);
      return id;
    }
  }

  let suffix = 1;
  while (usedIds.has(`${prefix}-${suffix}`)) suffix += 1;
  const fallback = `${prefix}-${suffix}`;
  usedIds.add(fallback);
  return fallback;
}

/**
 * RFC-4180-style CSV parser.
 * Handles quoted commas, escaped double quotes, CRLF/LF and blank lines.
 */
export function parseCsv(text) {
  if (typeof text !== 'string') return [];

  const source = text.replace(/^\uFEFF/, '');
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"' && field.trim() === '') {
      field = '';
      quoted = true;
      continue;
    }

    if (char === ',') {
      row.push(field.trim());
      field = '';
      continue;
    }

    if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') index += 1;
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = '';
      continue;
    }

    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    rows.push(row);
  }

  // Trailing blank lines are common in hand-edited CSVs; drop them without
  // shifting the row numbers used in validation messages.
  while (
    rows.length > 0 &&
    rows[rows.length - 1].every((value) => String(value ?? '').trim() === '')
  ) {
    rows.pop();
  }

  return rows;
}

export function parseFacultyRows(rows, existingFaculty = []) {
  const table = prepareTable(rows, FACULTY_CSV_HEADERS);
  if (table.error) {
    return { validRows: [], errors: [{ rowNumber: 1, message: table.error }] };
  }

  const { indexByName } = table;
  const validRows = [];
  const errors = [];
  const usedIds = new Set(existingFaculty.map((member) => member.id));
  const seenCodes = new Set();

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (isBlankRow(row)) continue;

    const rowNumber = index + 1;
    const name = cell(row, indexByName, 'name');
    const shortCode = cell(row, indexByName, 'shortCode').toUpperCase();
    const loadRaw = cell(row, indexByName, 'maxWeeklyLoad');
    const rowErrors = [];

    if (!name) rowErrors.push('Faculty name is required.');
    if (!shortCode) {
      rowErrors.push('shortCode is required.');
    } else if (seenCodes.has(shortCode.toLowerCase())) {
      rowErrors.push(`Duplicate shortCode '${shortCode}' in this file.`);
    }
    if (shortCode) seenCodes.add(shortCode.toLowerCase());

    let maxWeeklyLoad = 16;
    if (loadRaw !== '') {
      const parsed = Number(loadRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        rowErrors.push('maxWeeklyLoad must be a positive number.');
      } else {
        maxWeeklyLoad = parsed;
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, message: rowErrors.join(' ') });
      continue;
    }

    validRows.push({
      id: createUniqueId('FAC', usedIds),
      name,
      shortCode,
      maxWeeklyLoad,
      unavailableSlots: {},
    });
  }

  return { validRows, errors };
}

export function parseFacultyCsv(text, existingFaculty = []) {
  return parseFacultyRows(parseCsv(text), existingFaculty);
}

function normalizeRoomEntityType(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (value === 'classroom') return ROOM_TYPES.CLASSROOM;
  if (value === 'lab') return ROOM_TYPES.LAB;
  return null;
}

export function parseRoomRows(rows, existingRooms = []) {
  const table = prepareTable(rows, ROOM_CSV_HEADERS);
  if (table.error) {
    return { validRows: [], errors: [{ rowNumber: 1, message: table.error }] };
  }

  const { indexByName } = table;
  const validRows = [];
  const errors = [];
  const usedIds = new Set(existingRooms.map((room) => room.id));
  const seenNames = new Set();

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (isBlankRow(row)) continue;

    const rowNumber = index + 1;
    const name = cell(row, indexByName, 'name');
    const typeRaw = cell(row, indexByName, 'type');
    const capacityRaw = cell(row, indexByName, 'capacity');
    const rowErrors = [];

    if (!name) {
      rowErrors.push('Room/lab name is required.');
    } else if (seenNames.has(name.toLowerCase())) {
      rowErrors.push(`Duplicate room name '${name}' in this file.`);
    }
    if (name) seenNames.add(name.toLowerCase());

    const type = normalizeRoomEntityType(typeRaw);
    if (!type) {
      rowErrors.push(
        typeRaw
          ? `Unknown type '${typeRaw}' — use Classroom or Lab.`
          : 'type is required (Classroom or Lab).',
      );
    }

    let capacity = type === ROOM_TYPES.LAB ? 20 : 60;
    if (capacityRaw !== '') {
      const parsed = Number(capacityRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        rowErrors.push('capacity must be a positive number.');
      } else {
        capacity = parsed;
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, message: rowErrors.join(' ') });
      continue;
    }

    validRows.push({
      id: createUniqueId('ROOM', usedIds),
      name,
      type,
      capacity,
    });
  }

  return { validRows, errors };
}

export function parseRoomCsv(text, existingRooms = []) {
  return parseRoomRows(parseCsv(text), existingRooms);
}

function normalizeSubjectType(raw) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (['theory', 'th', 'theoretical'].includes(value)) return SUBJECT_TYPES.THEORY;
  if (['practical', 'pr', 'prac', 'lab'].includes(value)) {
    return SUBJECT_TYPES.PRACTICAL;
  }
  return null;
}

function normalizeRoomType(raw, subjectType) {
  const value = String(raw ?? '').trim().toLowerCase();
  if (!value) {
    return subjectType === SUBJECT_TYPES.PRACTICAL
      ? ROOM_TYPES.LAB
      : ROOM_TYPES.CLASSROOM;
  }
  if (['classroom', 'class', 'room'].includes(value)) return ROOM_TYPES.CLASSROOM;
  if (['lab', 'laboratory'].includes(value)) return ROOM_TYPES.LAB;
  return null;
}

export function parseSubjectRows(
  rows,
  { faculty = [], divisions = [], existingSubjects = [] } = {},
) {
  const table = prepareTable(rows, SUBJECT_REQUIRED_HEADERS);
  if (table.error) {
    return { validRows: [], errors: [{ rowNumber: 1, message: table.error }] };
  }

  const { indexByName } = table;
  const validRows = [];
  const errors = [];
  const usedIds = new Set(existingSubjects.map((subject) => subject.id));

  const facultyByCode = new Map();
  for (const member of faculty) {
    const code = String(member.shortCode ?? '').trim().toLowerCase();
    if (code && !facultyByCode.has(code)) facultyByCode.set(code, member);
  }

  const divisionByName = new Map();
  for (const division of divisions) {
    const name = String(division.name ?? '').trim().toLowerCase();
    if (name) divisionByName.set(name, division);
    if (division.id) divisionByName.set(String(division.id).toLowerCase(), division);
  }

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    if (isBlankRow(row)) continue;

    const rowNumber = index + 1;
    const code = cell(row, indexByName, 'code').toUpperCase();
    const name = cell(row, indexByName, 'name');
    const divisionRaw = cell(row, indexByName, 'division');
    const typeRaw = cell(row, indexByName, 'type');
    const hoursRaw = cell(row, indexByName, 'weeklyHours');
    const facultyRaw = cell(row, indexByName, 'facultyShortCode');
    const roomRaw = cell(row, indexByName, 'requiredRoomType');
    const electiveGroup = cell(row, indexByName, 'electiveGroup');
    const rowErrors = [];

    if (!code) rowErrors.push('code is required.');
    if (!name) rowErrors.push('name is required.');

    let division = null;
    if (!divisionRaw) {
      rowErrors.push('division is required.');
    } else {
      division = divisionByName.get(divisionRaw.toLowerCase()) ?? null;
      if (!division) {
        rowErrors.push(`Division '${divisionRaw}' not found — add it in Divisions first.`);
      }
    }

    const type = normalizeSubjectType(typeRaw);
    if (!type) {
      rowErrors.push(
        typeRaw
          ? `Unknown type '${typeRaw}' — use Theory or Practical.`
          : 'type is required (Theory or Practical).',
      );
    }

    let facultyMember = null;
    if (!facultyRaw) {
      rowErrors.push('facultyShortCode is required.');
    } else {
      facultyMember = facultyByCode.get(facultyRaw.toLowerCase()) ?? null;
      if (!facultyMember) {
        rowErrors.push(
          `Faculty shortCode '${facultyRaw}' not found — please import Faculty first.`,
        );
      }
    }

    let weeklyHours = type === SUBJECT_TYPES.PRACTICAL ? 2 : 3;
    if (hoursRaw !== '') {
      const parsed = Number(hoursRaw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        rowErrors.push('weeklyHours must be a positive number.');
      } else if (type === SUBJECT_TYPES.PRACTICAL && parsed !== 2) {
        rowErrors.push('Practicals must use 2 weekly hours.');
      } else if (type === SUBJECT_TYPES.THEORY && !Number.isInteger(parsed)) {
        rowErrors.push('Theory weeklyHours must be a whole number.');
      } else {
        weeklyHours = parsed;
      }
    }

    const roomType = normalizeRoomType(roomRaw, type);
    if (!roomType) {
      rowErrors.push(
        `Unknown requiredRoomType '${roomRaw}' — use Classroom or Lab.`,
      );
    }

    const batchFaculty = {};
    if (type === SUBJECT_TYPES.PRACTICAL && division) {
      const batches = Array.isArray(division.batches) ? division.batches : [];
      if (batches.length === 0) {
        rowErrors.push(`Division '${division.name}' has no lab batches configured.`);
      }

      for (let batchIndex = 0; batchIndex < 4; batchIndex += 1) {
        const header = `b${batchIndex + 1}Faculty`;
        const raw = cell(row, indexByName, header);
        if (!raw || raw.toLowerCase() === 'auto') continue;

        const member = facultyByCode.get(raw.toLowerCase()) ?? null;
        if (!member) {
          rowErrors.push(
            `${header} shortCode '${raw}' not found — please import Faculty first.`,
          );
          continue;
        }

        const batch = batches[batchIndex];
        if (batch) batchFaculty[batch.id] = member.id;
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, message: rowErrors.join(' ') });
      continue;
    }

    validRows.push({
      id: createUniqueId('SUB', usedIds),
      code,
      name,
      divisionId: division.id,
      type,
      weeklyHours,
      facultyId: facultyMember.id,
      batchFaculty,
      requiredRoomType: roomType,
      requiredRoomId: '',
      electiveGroup,
    });
  }

  return { validRows, errors };
}

export function parseSubjectCsv(text, context = {}) {
  return parseSubjectRows(parseCsv(text), context);
}

function csvEscape(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function buildCsv(headers, rows) {
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function buildFacultyTemplateCsv() {
  return buildCsv(FACULTY_CSV_HEADERS, [
    ['Dr. Asha Kadam', 'AKD', '16'],
    ['Prof. Rohan Mehta', 'RHM', '14'],
  ]);
}

export function buildRoomsTemplateCsv() {
  return buildCsv(ROOM_CSV_HEADERS, [
    ['Classroom 101', 'Classroom', '60'],
    ['Lab 1 — Programming', 'Lab', '20'],
  ]);
}

export function buildSubjectTemplateCsv({ divisions = [], faculty = [] } = {}) {
  const divisionName = divisions[0]?.name?.trim() || 'SY';
  const teacher = faculty[0]?.shortCode?.trim() || 'AKP';

  return buildCsv(SUBJECT_CSV_HEADERS, [
    [
      'DEMO101',
      'Introduction to Engineering',
      divisionName,
      'Theory',
      '3',
      teacher,
      'Classroom',
      '',
      '',
      '',
      '',
      '',
    ],
    [
      'DEMO101L',
      'Engineering Practice Lab',
      divisionName,
      'Practical',
      '2',
      teacher,
      'Lab',
      'auto',
      'auto',
      'auto',
      'auto',
      '',
    ],
  ]);
}

export function downloadCsv(filename, content) {
  if (typeof document === 'undefined') {
    throw new Error('CSV downloads are only available in the browser.');
  }

  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Read a picked .csv (native parser) or .xlsx/.xls (SheetJS) file into rows.
 */
export async function readImportFile(file) {
  if (!file) throw new Error('No file selected.');

  const name = String(file.name ?? '').toLowerCase();

  if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
    const module = await import('xlsx');
    const XLSX = module.default ?? module;
    const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const sheetName = workbook.SheetNames?.[0];
    if (!sheetName) throw new Error('The workbook has no worksheets.');

    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: '',
      blankrows: true,
    });

    return rows.map((row) =>
      Array.isArray(row) ? row.map((value) => (value == null ? '' : String(value))) : [],
    );
  }

  if (!name.endsWith('.csv')) {
    throw new Error('Choose a .csv or .xlsx file.');
  }

  return parseCsv(await file.text());
}
