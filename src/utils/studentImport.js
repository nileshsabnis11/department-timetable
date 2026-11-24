import { newId } from '../lib/id.js';

/**
 * Parse pasted or CSV student rows.
 *
 * Required columns (case/space-insensitive): rollNo, name, division. Every
 * other non-empty header is treated as an elective group label, and its cell
 * holds the option's subject code:
 *
 *   rollNo,name,division,PE-I,PE-II
 *   26CS001,Aarav Sharma,TY,CS601A,CS602B
 *
 * Blank option cells mean "no choice yet" rather than an error.
 */
const BASE_ALIASES = {
  rollNo: ['rollno', 'rollnumber', 'roll', 'id', 'studentid'],
  name: ['name', 'studentname', 'fullname'],
  division: ['division', 'class', 'year', 'divisionname'],
};

const normalizeHeader = (value) =>
  String(value ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');

const normalizeCell = (value) => String(value ?? '').trim();

function findColumn(headers, aliases) {
  return headers.findIndex((header) => aliases.includes(header));
}

function groupKey(label) {
  return String(label ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '');
}

function buildGroupIndex(divisions, subjects) {
  const index = new Map();
  const byDivision = new Map();

  for (const division of divisions) {
    byDivision.set(String(division.id).toLowerCase(), division);
    byDivision.set(String(division.name ?? '').trim().toLowerCase(), division);
  }

  for (const subject of subjects) {
    if (subject.type !== 'Theory') continue;
    const label = normalizeCell(subject.electiveGroup);
    if (!label) continue;
    const mapKey = `${subject.divisionId}|${groupKey(label)}`;
    if (!index.has(mapKey)) {
      index.set(mapKey, { label, options: new Map() });
    }
    const group = index.get(mapKey);
    const code = normalizeCell(subject.code).toLowerCase();
    if (code && !group.options.has(code)) group.options.set(code, subject);
  }

  return { index, byDivision };
}

export function parseStudentChoiceRows(
  rows,
  { divisions = [], subjects = [], existingStudents = [] } = {},
) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return {
      validRows: [],
      errors: [{ rowNumber: 1, message: 'Paste a header row and at least one student row.' }],
    };
  }

  const header = (Array.isArray(rows[0]) ? rows[0] : []).map(normalizeHeader);
  const rollIndex = findColumn(header, BASE_ALIASES.rollNo);
  const nameIndex = findColumn(header, BASE_ALIASES.name);
  const divisionIndex = findColumn(header, BASE_ALIASES.division);

  const missing = [
    rollIndex < 0 ? 'rollNo' : '',
    nameIndex < 0 ? 'name' : '',
    divisionIndex < 0 ? 'division' : '',
  ].filter(Boolean);

  if (missing.length > 0) {
    return {
      validRows: [],
      errors: [
        {
          rowNumber: 1,
          message: `Missing required column(s): ${missing.join(
            ', ',
          )}. Use rollNo, name, division, then one column per elective group.`,
        },
      ],
    };
  }

  const baseIndexes = new Set([rollIndex, nameIndex, divisionIndex]);
  const groupColumns = header
    .map((label, index) => ({ label, index }))
    .filter((column) => !baseIndexes.has(column.index) && column.label !== '');

  const { index: groupIndex, byDivision } = buildGroupIndex(divisions, subjects);
  const usedIds = new Set(existingStudents.map((student) => student.id));
  const existingKeys = new Set(
    existingStudents.map(
      (student) =>
        `${student.divisionId}|${normalizeCell(student.rollNo).toLowerCase()}`,
    ),
  );
  const seenKeys = new Set();
  const validRows = [];
  const errors = [];

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (!Array.isArray(row) || row.every((value) => normalizeCell(value) === '')) {
      continue;
    }

    const rowNumber = rowIndex + 1;
    const rollNo = normalizeCell(row[rollIndex]);
    const name = normalizeCell(row[nameIndex]);
    const divisionRaw = normalizeCell(row[divisionIndex]);
    const rowErrors = [];

    if (!rollNo) rowErrors.push('rollNo is required.');
    if (!name) rowErrors.push('name is required.');

    const division = divisionRaw
      ? byDivision.get(divisionRaw.toLowerCase()) ?? null
      : null;
    if (!divisionRaw) {
      rowErrors.push('division is required.');
    } else if (!division) {
      rowErrors.push(`Division '${divisionRaw}' not found — add it in Divisions first.`);
    }

    if (division && rollNo) {
      const key = `${division.id}|${rollNo.toLowerCase()}`;
      if (existingKeys.has(key)) {
        rowErrors.push(`Student '${rollNo}' already exists in ${division.name}.`);
      } else if (seenKeys.has(key)) {
        rowErrors.push(`Duplicate roll number '${rollNo}' in this file.`);
      }
      seenKeys.add(key);
    }

    const choices = {};
    if (division) {
      for (const column of groupColumns) {
        const raw = normalizeCell(row[column.index]);
        if (!raw) continue;

        // Match the header to the actual group label, so casing and stray
        // spaces in the pasted header still line up with the subjects.
        const group = groupIndex.get(`${division.id}|${column.label}`);
        if (!group) {
          rowErrors.push(
            `Column '${column.label}' is not an elective group in ${division.name}.`,
          );
          continue;
        }

        const subject = group.options.get(raw.toLowerCase());
        if (!subject) {
          rowErrors.push(
            `'${raw}' is not an option in ${group.label} (${division.name}).`,
          );
          continue;
        }
        choices[group.label] = subject.id;
      }
    }

    if (rowErrors.length > 0) {
      errors.push({ rowNumber, message: rowErrors.join(' ') });
      continue;
    }

    let id = newId('STU');
    while (usedIds.has(id)) id = newId('STU');
    usedIds.add(id);

    validRows.push({
      id,
      rollNo,
      name,
      divisionId: division.id,
      choices,
    });
  }

  if (validRows.length === 0 && errors.length === 0) {
    errors.push({ rowNumber: 2, message: 'No student rows found below the header.' });
  }

  return { validRows, errors };
}
