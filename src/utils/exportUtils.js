import { SCHEMA_VERSION, STORAGE_KEY } from '../data/types.js';
import { formatTime12h, parseTime } from '../lib/time.js';
import { FIXED_SLOT_TYPE } from '../lib/fixedSlots.js';
import { loadPrintSettings } from '../components/print/printSettings.js';
import { validateTimetable } from '../engine/validator.js';

/**
 * Phase 4A export/backup utilities.
 *
 * Pure formatting + browser I/O helpers. No React. The only engine import is
 * the read-only validator, used for the "Schedule Health" tab.
 */

export const BACKUP_SCHEMA_VERSION = 1;

/**
 * Google Sheets export needs a Web App deployed by the user's own Google
 * account. No URL ships with the app: a hardcoded one would send the whole
 * timetable to a stranger's script.
 */
export const SHEETS_URL_STORAGE_KEY = 'timetable-studio.sheets-webapp-url';

/** Must match the key used by the timetable store (Phase 3). */
export const TIMETABLE_STORAGE_KEY = 'timetable-studio.timetable.v1';

const REQUIRED_MASTER_SECTIONS = [
  'timeGrid',
  'divisions',
  'faculty',
  'rooms',
  'subjects',
];

function hasStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

/** Local calendar date as YYYY-MM-DD (used in backup / workbook names). */
export function dateStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function timeRange(item) {
  return `${formatTime12h(item.start)} – ${formatTime12h(item.end)}`;
}

function enabledDays(masterData) {
  return (masterData?.timeGrid?.workingDays ?? []).filter((day) => day.enabled !== false);
}

function slotsOf(masterData) {
  return masterData?.timeGrid?.slots ?? [];
}

function breaksOf(masterData) {
  return masterData?.timeGrid?.breaks ?? [];
}

/** The saved Apps Script URL, or '' when this browser has none. */
export function getSheetsWebAppUrl() {
  if (!hasStorage()) return '';
  try {
    const saved = window.localStorage.getItem(SHEETS_URL_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  } catch {
    // storage unavailable: treat as not configured
  }
  return '';
}

/** Save the URL; blank clears it. */
export function saveSheetsWebAppUrl(url) {
  if (!hasStorage()) return;
  try {
    const trimmed = (url ?? '').trim();
    if (!trimmed) {
      window.localStorage.removeItem(SHEETS_URL_STORAGE_KEY);
    } else {
      window.localStorage.setItem(SHEETS_URL_STORAGE_KEY, trimmed);
    }
  } catch {
    // storage unavailable: URL still works for the current session
  }
}

/** Current generated timetable snapshot (includes the reset baseline). */
export function getTimetableSnapshot() {
  if (!hasStorage()) return { sessions: [] };
  try {
    const raw = window.localStorage.getItem(TIMETABLE_STORAGE_KEY);
    if (!raw) return { sessions: [] };
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.sessions)) return { sessions: [] };
    return {
      sessions: parsed.sessions,
      baseline: Array.isArray(parsed.baseline) ? parsed.baseline : parsed.sessions,
      stats: parsed.stats ?? null,
      generatedAt: parsed.generatedAt ?? null,
    };
  } catch {
    return { sessions: [] };
  }
}

export function buildBackup(masterData, timetable = getTimetableSnapshot()) {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    masterData,
    timetable,
  };
}

export function downloadJsonBackup(masterData, timetable = getTimetableSnapshot()) {
  if (typeof document === 'undefined') {
    throw new Error('Backup download is only available in the browser.');
  }
  const backup = buildBackup(masterData, timetable);
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `timetable-backup-${dateStamp()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return backup;
}

/**
 * Parse and validate a backup file.
 * Throws an Error with a human-readable message when the data is unusable.
 */
export function parseBackupJson(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Backup must be a JSON object.');
  }

  const masterData = data.masterData;
  if (!masterData || typeof masterData !== 'object' || Array.isArray(masterData)) {
    throw new Error('Backup is missing a valid "masterData" object.');
  }

  // A newer schema would be rejected on load, silently emptying the app; refuse
  // it here instead, while the user still has their current data.
  const savedVersion = Number(masterData.schemaVersion);
  if (Number.isFinite(savedVersion) && savedVersion > SCHEMA_VERSION) {
    throw new Error(
      `This backup was written by a newer version of Timetable Studio (schema v${savedVersion}); this app reads v${SCHEMA_VERSION}. Update the app before importing it.`,
    );
  }

  const missing = REQUIRED_MASTER_SECTIONS.filter(
    (section) => !masterData[section] || typeof masterData[section] !== 'object',
  );
  if (missing.length > 0) {
    throw new Error(`Backup masterData is missing: ${missing.join(', ')}.`);
  }

  if (
    !Array.isArray(masterData.divisions) ||
    !Array.isArray(masterData.faculty) ||
    !Array.isArray(masterData.rooms) ||
    !Array.isArray(masterData.subjects)
  ) {
    throw new Error('Backup divisions, faculty, rooms and subjects must be arrays.');
  }

  const timeGrid = masterData.timeGrid;
  if (
    !Array.isArray(timeGrid.workingDays) ||
    !Array.isArray(timeGrid.slots) ||
    (timeGrid.breaks != null && !Array.isArray(timeGrid.breaks))
  ) {
    throw new Error('Backup timeGrid must contain workingDays and slots arrays.');
  }

  if (data.timetable != null) {
    const sessions = Array.isArray(data.timetable)
      ? data.timetable
      : data.timetable.sessions;
    if (!Array.isArray(sessions)) {
      throw new Error('Backup timetable must contain a sessions array.');
    }
  }

  return data;
}

/** Replace stored master data (and timetable when present) with a backup. */
export function applyBackup(backup) {
  if (!hasStorage()) throw new Error('This browser cannot store the backup.');

  const masterData = {
    ...backup.masterData,
    // Always stamp the schema this build understands: a payload claiming a
    // newer version is discarded by loadMasterData, which would lose the very
    // data the user just imported.
    schemaVersion: SCHEMA_VERSION,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(masterData));

  const timetable = backup.timetable;
  const sessions = Array.isArray(timetable)
    ? timetable
    : Array.isArray(timetable?.sessions)
      ? timetable.sessions
      : [];

  if (sessions.length > 0) {
    const baseline = Array.isArray(timetable?.baseline)
      ? timetable.baseline
      : sessions;
    window.localStorage.setItem(
      TIMETABLE_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        sessions,
        baseline,
        stats: timetable?.stats ?? null,
        generatedAt: timetable?.generatedAt ?? new Date().toISOString(),
      }),
    );
  } else {
    window.localStorage.removeItem(TIMETABLE_STORAGE_KEY);
  }
}

// ---------------------------------------------------------------------------
// Google Sheets / Excel payloads
// ---------------------------------------------------------------------------

function theoryCell(session) {
  const facName = session.facultyName || session.facultyShortCode || '';
  return `${session.subjectName} (${session.subjectCode})\n${facName} · ${session.roomName ?? ''}`;
}

/**
 * Every session that shares one (division, day, starting slot) cell — every
 * option of every basket in that hour, not just one label, so a second group
 * sharing a slot is never dropped from the exported grid.
 */
function cellSessionsAt(sessions, session) {
  const firstSlot = session?.slotIds?.[0];
  return sessions.filter(
    (item) =>
      item.divisionId === session.divisionId &&
      item.dayId === session.dayId &&
      item.slotIds?.[0] === firstSlot,
  );
}

/** Options grouped by basket label, in a deterministic order. */
function electiveEntriesByLabel(entries) {
  const groups = new Map();
  for (const entry of entries) {
    const label = String(entry.electiveGroup ?? '').trim();
    if (!label) continue;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(entry);
  }
  return groups;
}

function electiveCell(entries) {
  const groups = electiveEntriesByLabel(entries);
  if (groups.size === 0) return '';
  return [...groups]
    .map(([label, options]) =>
      [
        `[${label}]`,
        ...options.map(
          (session) =>
            `${session.subjectCode} ${session.subjectName} (${
              session.facultyShortCode ?? '—'
            }) — ${session.roomName ?? '—'}`,
        ),
      ].join('\n'),
    )
    .join('\n');
}

/**
 * Append any session sharing a cell that the primary rendering left out (a
 * second elective group, or a genuine clash) so nothing is silently lost.
 */
function withOtherOccupants(text, occupants, primary) {
  // An elective cell already renders every option of every basket in that hour
  // (`electiveCell` / `excelElectiveCell`), so it needs no extra lines.
  if (String(primary?.electiveGroup ?? '').trim()) return text;

  const extras = (occupants ?? [])
    .filter((entry) => entry.session.id !== primary?.id)
    .map((entry) => {
      const label = String(entry.session.electiveGroup ?? '').trim();
      return `${label ? `[${label}] ` : ''}${entry.session.subjectCode} · ${
        entry.session.facultyShortCode ?? '—'
      }`;
    });
  if (extras.length === 0) return text;
  return [text, ...extras].filter(Boolean).join('\n');
}

function fixedSlotCell(session) {
  const label = session.label ?? session.subjectCode ?? 'Fixed Slot';
  const meta = [session.facultyShortCode, session.roomName].filter(Boolean).join(' · ');
  return meta ? `${label}\n${meta}` : label;
}

function practicalCell(session, slotIndex) {
  if (slotIndex > 0) return '(2-hour practical continues)';
  const batches = (session.batches ?? []).map(
    (batch) => {
      const facName = batch.facultyName || batch.facultyShortCode || '';
      return `${batch.batchName}: ${facName} · ${batch.roomName ?? ''}`;
    },
  );
  return [`${session.subjectName} (${session.subjectCode})`, ...batches].join('\n');
}

function buildDivisionRows(masterData, sessions, division) {
  const days = enabledDays(masterData);
  const slots = slotsOf(masterData);
  const breaks = breaksOf(masterData);
  const divisionSessions = sessions.filter(
    (session) => session.divisionId === division.id,
  );

  const coverage = new Map();
  const occupants = new Map();
  for (const session of divisionSessions) {
    (session.slotIds ?? []).forEach((slotId, index) => {
      const cellKey = `${session.dayId}|${slotId}`;
      coverage.set(cellKey, { session, index });
      if (!occupants.has(cellKey)) occupants.set(cellKey, []);
      occupants.get(cellKey).push({ session, index });
    });
  }

  const rows = [['Time Slot', ...days.map((day) => day.label)]];

  for (const slot of slots) {
    const cells = days.map((day) => {
      const hit = coverage.get(`${day.id}|${slot.id}`);
      if (!hit) return '';
      if (hit.session.type === FIXED_SLOT_TYPE) {
        return hit.index === 0 ? fixedSlotCell(hit.session) : '';
      }
      if (hit.session.type === 'Practical') return practicalCell(hit.session, hit.index);
      if (hit.session.electiveGroup) {
        return withOtherOccupants(
          electiveCell(cellSessionsAt(divisionSessions, hit.session)),
          occupants.get(`${day.id}|${slot.id}`),
          hit.session,
        );
      }
      return withOtherOccupants(
        theoryCell(hit.session),
        occupants.get(`${day.id}|${slot.id}`),
        hit.session,
      );
    });
    rows.push([`${slot.label} (${timeRange(slot)})`, ...cells]);

    for (const brk of breaks.filter((item) => item.afterSlotId === slot.id)) {
      rows.push([`${brk.label} (${timeRange(brk)})`, ...days.map(() => '')]);
    }
  }

  return rows;
}

export function facultyScheduledHours(sessions, facultyId) {
  let hours = 0;
  const countedFixed = new Set();
  for (const session of sessions) {
    if (session.type === 'Practical') {
      const batches = (session.batches ?? []).filter(
        (batch) => batch.facultyId === facultyId,
      ).length;
      hours += batches * (session.slotIds?.length ?? 0);
    } else if (session.facultyId === facultyId) {
      if (session.type === FIXED_SLOT_TYPE) {
        // A lock scoped to every division is stored once per division.
        const lockKey = `${session.fixedSlotId ?? session.id}|${session.dayId}`;
        if (countedFixed.has(lockKey)) continue;
        countedFixed.add(lockKey);
      }
      hours += session.slotIds?.length ?? 0;
    }
  }
  return hours;
}

function buildFacultyRows(masterData, sessions) {
  const rows = [
    ['Faculty Name', 'Short Code', 'Assigned Subjects', 'Scheduled Hours', 'Max Load'],
  ];

  for (const member of masterData?.faculty ?? []) {
    const subjectCodes = new Set();

    for (const subject of masterData?.subjects ?? []) {
      if (subject.facultyId === member.id && subject.code) {
        subjectCodes.add(subject.code);
      }
      const overrides = Object.values(subject.batchFaculty ?? {});
      if (overrides.includes(member.id) && subject.code) {
        subjectCodes.add(subject.code);
      }
    }

    for (const session of sessions) {
      const teaches =
        session.type === 'Practical'
          ? (session.batches ?? []).some((batch) => batch.facultyId === member.id)
          : session.facultyId === member.id;
      if (teaches && session.subjectCode) subjectCodes.add(session.subjectCode);
    }

    rows.push([
      member.name,
      member.shortCode,
      [...subjectCodes].join(', '),
      facultyScheduledHours(sessions, member.id),
      member.maxWeeklyLoad ?? '',
    ]);
  }

  return rows;
}

function buildRoomRows(masterData, sessions) {
  const days = enabledDays(masterData);
  const slots = slotsOf(masterData);
  const totalSlots = days.length * slots.length;
  const rows = [['Room/Lab Name', 'Type', 'Total Hours Booked', 'Free Slots']];

  for (const room of masterData?.rooms ?? []) {
    const booked = new Set();

    for (const session of sessions) {
      const usesRoom =
        session.type === 'Practical'
          ? (session.batches ?? []).some((batch) => batch.roomId === room.id)
          : session.roomId === room.id;
      if (!usesRoom) continue;
      for (const slotId of session.slotIds ?? []) {
        booked.add(`${session.dayId}|${slotId}`);
      }
    }

    rows.push([
      room.name,
      room.type,
      booked.size,
      Math.max(0, totalSlots - booked.size),
    ]);
  }

  return rows;
}

/**
 * Convert master data + a timetable into tab payloads shared by Google Sheets
 * and the local .xlsx export.
 *
 * @returns {{ name: string, rows: (string|number)[][] }[]}
 */
export function buildSheetPayloads(masterData, timetable) {
  const sessions = Array.isArray(timetable)
    ? timetable
    : Array.isArray(timetable?.sessions)
      ? timetable.sessions
      : [];

  const sheets = [];
  const usedNames = new Set();
  for (const division of masterData?.divisions ?? []) {
    sheets.push({
      name: uniqueSheetName(usedNames, `${division.name} Timetable`),
      rows: buildDivisionRows(masterData, sessions, division),
    });
  }
  sheets.push({
    name: uniqueSheetName(usedNames, 'Faculty Workload'),
    rows: buildFacultyRows(masterData, sessions),
  });
  sheets.push({
    name: uniqueSheetName(usedNames, 'Room Utilisation'),
    rows: buildRoomRows(masterData, sessions),
  });

  return sheets;
}

/** POST the payloads to the Apps Script Web App and resolve its sheet link. */
export async function sendToGoogleSheets(webAppUrl, sheets) {
  const url = (webAppUrl ?? '').trim();
  if (!url) {
    throw new Error(
      'No Google Apps Script Web App URL is configured. Deploy your own script and paste its /exec URL first.',
    );
  }
  if (!/^https?:\/\//i.test(url)) {
    throw new Error('The Apps Script Web App URL must start with https://.');
  }

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ sheets }),
      redirect: 'follow',
    });
  } catch {
    throw new Error(
      'Could not reach the Google Apps Script Web App. Check the URL and that the deployment is accessible to "Anyone".',
    );
  }

  const text = await response.text().catch(() => '');
  if (!response.ok) {
    throw new Error(
      `Google Sheets export failed (HTTP ${response.status}). Check the Web App deployment and try again.`,
    );
  }

  let payload = null;
  try {
    payload = JSON.parse(text);
  } catch {
    // Scripts sometimes reply with a bare URL instead of JSON.
  }

  if (payload?.error) throw new Error(String(payload.error));

  const linkCandidates = [
    payload?.url,
    payload?.sheetUrl,
    payload?.spreadsheetUrl,
    payload?.webViewLink,
    /^https?:\/\/\S+$/.test(text.trim()) ? text.trim() : null,
  ];
  const link = linkCandidates.find((candidate) => typeof candidate === 'string' && candidate);

  return { url: link ?? null, payload: payload ?? text };
}

// ---------------------------------------------------------------------------
// Styled Excel workbook
// ---------------------------------------------------------------------------

const EXCEL_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const EXCEL_COLORS = {
  headerFill: 'FF1E293B',
  headerText: 'FFFFFFFF',
  slotFill: 'FFF8FAFC',
  breakFill: 'FFFEF3C7',
  breakText: 'FF92400E',
  practicalFill: 'FFEFF6FF',
  practicalText: 'FF1E3A8A',
  fixedFill: 'FFF5F3FF',
  fixedText: 'FF5B21B6',
  border: 'FF94A3B8',
  zebra: 'FFF8FAFC',
  masterDayFill: 'FFF1F5F9',
  titleText: 'FF0F172A',
  bodyText: 'FF334155',
  mutedText: 'FF475569',
};

const TAB_COLORS = {
  master: 'FF1E293B',
  division: 'FF2563EB',
  faculty: 'FF0D9488',
  room: 'FF7C3AED',
  summary: 'FF64748B',
  health: 'FFB45309',
};

const PAGE_SETUP_A3_LANDSCAPE = {
  paperSize: 8,
  orientation: 'landscape',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 1,
  margins: {
    left: 0.25,
    right: 0.25,
    top: 0.3,
    bottom: 0.3,
    header: 0.15,
    footer: 0.15,
  },
};

const PAGE_SETUP_A4_LANDSCAPE = {
  paperSize: 9,
  orientation: 'landscape',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 1,
};

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
  if (!value) return '';
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !part)) return String(value);
  const [year, month, day] = parts;
  return `${pad2(day)} ${MONTHS[month - 1] ?? ''} ${year}`.trim();
}

function documentSubtitle(settings, prefix) {
  const wef = formatWefDate(settings.wefDate);
  const parts = [
    prefix,
    `Academic Year ${settings.academicYear}`,
    settings.semester,
  ];
  if (wef) parts.push(`W.E.F. ${wef}`);
  return parts.filter(Boolean).join(' · ');
}

function slotTimeLabel(slot, use24h) {
  if (!use24h) return timeRange(slot);
  const start = parseTime(slot.start);
  const end = parseTime(slot.end);
  if (start == null || end == null) return timeRange(slot);
  return `${slot.start}–${slot.end}`;
}

function solidFill(argb) {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

function thinBorder() {
  const edge = { style: 'thin', color: { argb: EXCEL_COLORS.border } };
  return { top: edge, left: edge, bottom: edge, right: edge };
}

function styleGridCell(cell, { horizontal = 'center' } = {}) {
  cell.border = thinBorder();
  cell.alignment = { vertical: 'middle', horizontal, wrapText: true };
}

/**
 * Detect faculty cover by comparing the current sessions with the generated
 * baseline. `applySubstitution` keeps the session id and only rewrites the
 * faculty fields, so the baseline is the audit trail.
 *
 * @returns {Map<string, string>} `${sessionId}` or `${sessionId}|${batchId}` to
 *   the previous faculty's short code.
 */
export function buildSubstitutionIndex(sessions, baseline) {
  const index = new Map();
  const previousById = new Map(
    (Array.isArray(baseline) ? baseline : []).map((session) => [session.id, session]),
  );

  for (const session of Array.isArray(sessions) ? sessions : []) {
    const before = previousById.get(session.id);
    if (!before) continue;

    if (session.type === 'Practical') {
      const beforeBatches = new Map(
        (before.batches ?? []).map((batch) => [batch.batchId, batch]),
      );
      for (const batch of session.batches ?? []) {
        const was = beforeBatches.get(batch.batchId);
        if (!was || !was.facultyId || !batch.facultyId) continue;
        if (was.facultyId === batch.facultyId) continue;
        index.set(
          `${session.id}|${batch.batchId}`,
          was.facultyShortCode || was.facultyName || 'previous faculty',
        );
      }
      continue;
    }

    if (!before.facultyId || !session.facultyId) continue;
    if (before.facultyId === session.facultyId) continue;
    index.set(
      session.id,
      before.facultyShortCode || before.facultyName || 'previous faculty',
    );
  }

  return index;
}

function substitutedFor(index, session, batchId) {
  if (!index || index.size === 0) return '';
  return index.get(batchId ? `${session.id}|${batchId}` : session.id) ?? '';
}

function substitutionNote(previous) {
  return previous ? ` (sub for ${previous})` : '';
}

/** Master-grid width / row-height helpers driven by real cell content. */
function linesOf(text) {
  return String(text ?? '').split('\n');
}

function widthForTexts(texts, { min = 14, max = 42 } = {}) {
  const longest = texts.reduce((best, text) => {
    const lineLength = linesOf(text).reduce(
      (lineBest, line) => Math.max(lineBest, line.length),
      0,
    );
    return Math.max(best, lineLength);
  }, 0);
  return Math.max(min, Math.min(max, Math.round(longest * 1.05) + 2));
}

function heightForTexts(texts, widths, { lineHeight = 12, min = 32, max = 108 } = {}) {
  let lines = 1;
  texts.forEach((text, index) => {
    const width = Math.max(6, Number(widths[index]) || 18);
    const cellLines = linesOf(text).reduce(
      (total, line) => total + Math.max(1, Math.ceil(line.length / (width - 2))),
      0,
    );
    lines = Math.max(lines, cellLines);
  });
  return Math.max(min, Math.min(max, lines * lineHeight + 8));
}

function applyPageSetup(sheet, setup, printArea) {
  sheet.pageSetup = { ...setup };
  if (printArea) sheet.printArea = printArea;
}

function applyTabColor(sheet, argb) {
  if (!argb) return;
  sheet.properties = { ...(sheet.properties ?? {}), tabColor: { argb } };
}

/**
 * ExcelJS throws "Cannot merge already merged cells" when a range is merged
 * twice. A fixed lock scoped to every division is stored once per division, so
 * the same cell can be reached more than once; merge each range exactly once.
 */
function mergeRangeOnce(sheet, range) {
  const merged = sheet.model?.merges ?? [];
  if (merged.includes(range)) return false;
  sheet.mergeCells(range);
  return true;
}

function safeFooterText(value) {
  return String(value ?? '').replace(/&/g, '&&');
}

/** Page footer: department left, page numbers centre, generation date right. */
function addSheetFooter(sheet, settings, generatedAt) {
  const left = safeFooterText(settings.departmentName);
  const right = safeFooterText(`Generated ${dateStamp(generatedAt ?? new Date())}`);
  const footer = `&L&8${left}&C&8Page &P of &N&R&8${right}`;
  sheet.headerFooter.oddFooter = footer;
  sheet.headerFooter.evenFooter = footer;
}

/**
 * Institutional title block shared by every timetable tab, using the saved
 * Print Settings (institute, department, academic year, semester, W.E.F.).
 */
function addWorkbookTitle(sheet, settings, columnCount, subtitle, { large = false } = {}) {
  const lastLetter = sheet.getColumn(Math.max(1, columnCount)).letter;

  const instituteRow = sheet.addRow([settings.instituteName]);
  instituteRow.height = large ? 32 : 26;
  sheet.mergeCells(`A${instituteRow.number}:${lastLetter}${instituteRow.number}`);
  const instituteCell = instituteRow.getCell(1);
  instituteCell.font = {
    bold: true,
    size: large ? 15 : 12,
    color: { argb: EXCEL_COLORS.titleText },
  };
  instituteCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  const departmentRow = sheet.addRow([settings.departmentName]);
  departmentRow.height = large ? 22 : 20;
  sheet.mergeCells(`A${departmentRow.number}:${lastLetter}${departmentRow.number}`);
  const departmentCell = departmentRow.getCell(1);
  departmentCell.font = {
    bold: true,
    size: large ? 11 : 10,
    color: { argb: EXCEL_COLORS.bodyText },
  };
  departmentCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };

  const metaRow = sheet.addRow([subtitle]);
  metaRow.height = large ? 24 : 20;
  sheet.mergeCells(`A${metaRow.number}:${lastLetter}${metaRow.number}`);
  const metaCell = metaRow.getCell(1);
  metaCell.font = {
    bold: true,
    size: large ? 12 : 10,
    color: { argb: EXCEL_COLORS.practicalText },
  };
  metaCell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  metaCell.fill = solidFill(EXCEL_COLORS.masterDayFill);
}

function excelTheoryCell(session, previousFaculty) {
  const facName = session.facultyName || session.facultyShortCode || '—';
  return `${session.subjectName}\n(${session.subjectCode}) · Faculty: ${facName} | Room: ${
    session.roomName ?? '—'
  }${substitutionNote(previousFaculty)}`;
}

function excelElectiveCell(entries) {
  const groups = electiveEntriesByLabel(entries);
  if (groups.size === 0) return '';
  return [...groups]
    .map(([label, options]) =>
      [
        `[${label}]`,
        ...options.map(
          (session) =>
            `${session.subjectName} (${session.subjectCode}) — ${
              session.facultyName || session.facultyShortCode || '—'
            } · ${session.roomName ?? '—'}`,
        ),
      ].join('\n'),
    )
    .join('\n');
}

function excelPracticalCell(session, substitutions) {
  const batchLines = (session.batches ?? [])
    .map((batch) => {
      const batchLabel = String(batch.batchName ?? '').split('-').pop() || 'Batch';
      const previous = substitutedFor(substitutions, session, batch.batchId);
      const facName = batch.facultyName || batch.facultyShortCode || '—';
      return `${batchLabel}: ${facName}${substitutionNote(previous)} — ${batch.roomName ?? '—'}`;
    });
  return [`${session.subjectName} (${session.subjectCode})`, ...batchLines].join('\n');
}

function uniqueSheetName(usedNames, desiredName) {
  const cleaned =
    String(desiredName ?? '')
      // Excel forbids : \ / ? * [ ] and control characters in a tab name.
      .replace(/[\\/*?:[\]]/g, ' ')
      .replace(/[\u0000-\u001F]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      // A tab name may not start or end with an apostrophe.
      .replace(/^'+|'+$/g, '')
      .trim()
      .slice(0, 31)
      .trim() || 'Sheet';
  // "History" is reserved for the version list in Excel and Google Sheets.
  const base = /^history$/i.test(cleaned) ? 'History Sheet' : cleaned;
  let name = base;
  let suffix = 2;
  while (usedNames.has(name.toLowerCase())) {
    const ending = ` ${suffix}`;
    name = `${base.slice(0, 31 - ending.length)}${ending}`;
    suffix += 1;
  }
  usedNames.add(name.toLowerCase());
  return name;
}

/** Subject–faculty legend rows for one view, mirroring the print document. */
function legendEntries(masterData, sessions) {
  const facultyById = new Map(
    (masterData?.faculty ?? []).map((member) => [member.id, member]),
  );
  const entries = new Map();

  for (const session of sessions) {
    // Locked institutional blocks are not subjects; keep them out of the legend.
    if (session.type === FIXED_SLOT_TYPE) continue;

    const key = session.subjectId ?? session.subjectCode ?? session.id;
    if (!entries.has(key)) {
      entries.set(key, {
        code: session.subjectCode ?? '—',
        name: session.subjectName ?? '—',
        type: session.type === 'Practical' ? 'PR' : 'TH',
        faculty: new Set(),
        rooms: new Set(),
      });
    }
    const entry = entries.get(key);
    if (session.type === 'Practical') {
      for (const batch of session.batches ?? []) {
        const member = facultyById.get(batch.facultyId);
        const fullName = batch.facultyName || member?.name || batch.facultyShortCode || member?.shortCode;
        if (fullName) entry.faculty.add(fullName);
        if (batch.roomName) entry.rooms.add(batch.roomName);
      }
    } else {
      const member = facultyById.get(session.facultyId);
      const fullName = session.facultyName || member?.name || session.facultyShortCode || member?.shortCode;
      if (fullName) entry.faculty.add(fullName);
      if (session.roomName) entry.rooms.add(session.roomName);
    }
  }

  return [...entries.values()]
    .map((entry) => ({
      code: entry.code,
      name: entry.name,
      type: entry.type,
      faculty: [...entry.faculty].join(', ') || '—',
      rooms: [...entry.rooms].join(', ') || '—',
    }))
    .sort((first, second) =>
      String(first.code).localeCompare(String(second.code)),
    );
}

function addLegendBlock(sheet, masterData, sessions, columnCount) {
  const entries = legendEntries(masterData, sessions);
  const spacer = sheet.addRow([]);
  spacer.height = 8;

  const titleRow = sheet.addRow(['Subject–Faculty Legend']);
  titleRow.height = 18;
  sheet.mergeCells(`A${titleRow.number}:${sheet.getColumn(columnCount).letter}${titleRow.number}`);
  const titleCell = titleRow.getCell(1);
  titleCell.font = { bold: true, size: 9, color: { argb: EXCEL_COLORS.practicalText } };
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' };
  titleCell.fill = solidFill(EXCEL_COLORS.masterDayFill);

  const isSeven = columnCount >= 7;
  const isSix = columnCount === 6;

  const headerVals = new Array(columnCount).fill('');
  if (isSeven) {
    headerVals[0] = 'Subject Code';
    headerVals[1] = 'Subject Name';
    headerVals[3] = 'TH/PR';
    headerVals[4] = 'Faculty Name';
    headerVals[6] = 'Room / Lab';
  } else if (isSix) {
    headerVals[0] = 'Subject Code';
    headerVals[1] = 'Subject Name';
    headerVals[2] = 'TH/PR';
    headerVals[3] = 'Faculty Name';
    headerVals[5] = 'Room / Lab';
  } else {
    headerVals[0] = 'Subject Code';
    headerVals[1] = 'Subject Name';
    headerVals[2] = 'TH/PR';
    headerVals[3] = 'Faculty Name';
    if (columnCount >= 5) headerVals[4] = 'Room / Lab';
  }

  const header = sheet.addRow(headerVals);
  header.height = 18;
  const hNum = header.number;
  if (isSeven) {
    sheet.mergeCells(hNum, 2, hNum, 3);
    sheet.mergeCells(hNum, 5, hNum, 6);
  } else if (isSix) {
    sheet.mergeCells(hNum, 4, hNum, 5);
  }

  for (let column = 1; column <= columnCount; column += 1) {
    const cell = header.getCell(column);
    cell.fill = solidFill(EXCEL_COLORS.headerFill);
    cell.font = { bold: true, size: 8, color: { argb: EXCEL_COLORS.headerText } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
  }

  if (entries.length === 0) {
    const emptyRow = sheet.addRow(['No scheduled subjects in this view.']);
    emptyRow.height = 18;
    sheet.mergeCells(`A${emptyRow.number}:${sheet.getColumn(columnCount).letter}${emptyRow.number}`);
    const cell = emptyRow.getCell(1);
    cell.font = { italic: true, size: 8, color: { argb: EXCEL_COLORS.mutedText } };
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = thinBorder();
    return;
  }

  for (const entry of entries) {
    const rowVals = new Array(columnCount).fill('');
    if (isSeven) {
      rowVals[0] = entry.code;
      rowVals[1] = entry.name;
      rowVals[3] = entry.type;
      rowVals[4] = entry.faculty;
      rowVals[6] = entry.rooms;
    } else if (isSix) {
      rowVals[0] = entry.code;
      rowVals[1] = entry.name;
      rowVals[2] = entry.type;
      rowVals[3] = entry.faculty;
      rowVals[5] = entry.rooms;
    } else {
      rowVals[0] = entry.code;
      rowVals[1] = entry.name;
      rowVals[2] = entry.type;
      rowVals[3] = entry.faculty;
      if (columnCount >= 5) rowVals[4] = entry.rooms;
    }

    const row = sheet.addRow(rowVals);
    row.height = 20;
    const rNum = row.number;
    if (isSeven) {
      sheet.mergeCells(rNum, 2, rNum, 3);
      sheet.mergeCells(rNum, 5, rNum, 6);
    } else if (isSix) {
      sheet.mergeCells(rNum, 4, rNum, 5);
    }

    for (let column = 1; column <= columnCount; column += 1) {
      const cell = row.getCell(column);
      cell.border = thinBorder();
      cell.font = { size: 8, color: { argb: EXCEL_COLORS.bodyText } };
      const isCode = column === 1;
      const isType = isSeven ? column === 4 : column === 3;
      cell.alignment = {
        vertical: 'middle',
        horizontal: isCode || isType ? 'center' : 'left',
        wrapText: true,
      };
    }
  }
}

/** Signature lines above the saved labels, split across the sheet width. */
function addSignatureBlock(sheet, settings, columnCount) {
  const labels = (settings.signatures ?? []).filter(Boolean);
  if (labels.length === 0) return;

  const spacer = sheet.addRow([]);
  spacer.height = 10;

  const lineRow = sheet.addRow([]);
  lineRow.height = 26;
  const labelRow = sheet.addRow(labels);
  labelRow.height = 18;

  const thirds = Math.max(1, Math.floor(columnCount / labels.length));
  labels.forEach((label, index) => {
    const startColumn = 1 + index * thirds;
    const endColumn =
      index === labels.length - 1 ? columnCount : Math.min(columnCount, startColumn + thirds - 1);
    const startLetter = sheet.getColumn(startColumn).letter;
    const endLetter = sheet.getColumn(Math.max(startColumn, endColumn)).letter;

    if (endColumn > startColumn) {
      sheet.mergeCells(`${startLetter}${lineRow.number}:${endLetter}${lineRow.number}`);
      sheet.mergeCells(`${startLetter}${labelRow.number}:${endLetter}${labelRow.number}`);
    }

    const lineCell = sheet.getCell(`${startLetter}${lineRow.number}`);
    lineCell.border = {
      ...thinBorder(),
      bottom: { style: 'medium', color: { argb: EXCEL_COLORS.titleText } },
    };

    const labelCell = sheet.getCell(`${startLetter}${labelRow.number}`);
    labelCell.value = label;
    labelCell.font = { bold: true, size: 8, color: { argb: EXCEL_COLORS.titleText } };
    labelCell.alignment = { vertical: 'top', horizontal: 'center', wrapText: true };
  });
}

/**
 * One timetable grid: division, faculty or room.
 *
 * Everything after the grid (legend, signatures, footer) is the same block the
 * printed A4 document carries, so the workbook can be signed and circulated.
 */
function addGridSheet(workbook, masterData, sessions, options) {
  const {
    sheetName,
    subtitle,
    infoFields = null,
    matches,
    cellFor,
    settings,
    substitutions,
    use24h = false,
    legend = true,
    tabColor,
  } = options;

  const days = enabledDays(masterData);
  const slots = slotsOf(masterData);
  const breaks = breaksOf(masterData);
  const sheet = workbook.addWorksheet(sheetName, {
    properties: { defaultRowHeight: 20 },
  });

  const viewSessions = sessions.filter(matches);
  const coverage = new Map();
  const occupants = new Map();
  for (const session of viewSessions) {
    (session.slotIds ?? []).forEach((slotId, index) => {
      const cellKey = `${session.dayId}|${slotId}`;
      coverage.set(cellKey, { session, index });
      if (!occupants.has(cellKey)) occupants.set(cellKey, []);
      occupants.get(cellKey).push({ session, index });
    });
  }

  // Pre-compute every cell so widths and heights fit the real content.
  const cellTexts = new Map();
  const dayTexts = days.map(() => []);
  for (const slot of slots) {
    days.forEach((day, dayIndex) => {
      const hit = coverage.get(`${day.id}|${slot.id}`);
      const continues =
        hit &&
        hit.index > 0 &&
        (hit.session.type === 'Practical' || hit.session.type === FIXED_SLOT_TYPE);
      const text =
        !hit || continues
          ? ''
          : withOtherOccupants(
              cellFor(hit.session, hit.index),
              occupants.get(`${day.id}|${slot.id}`),
              hit.session,
            );
      cellTexts.set(`${day.id}|${slot.id}`, text);
      dayTexts[dayIndex].push(text);
    });
  }

  const timeHeader = 'Time Slot';
  sheet.columns = [
    { width: 26 },
    ...days.map((day, index) => ({
      width: widthForTexts([timeHeader, ...dayTexts[index]], { min: 22, max: 40 }),
    })),
  ];

  const lastColumn = Math.max(1, 1 + days.length);
  const lastLetter = sheet.getColumn(lastColumn).letter;
  const widths = sheet.columns.map((column) => column.width);

  addWorkbookTitle(sheet, settings, lastColumn, subtitle);

  if (infoFields) {
    const infoRow = sheet.addRow(infoFields);
    infoRow.height = 24;
    if (lastColumn > 6) {
      mergeRangeOnce(sheet, `F${infoRow.number}:${lastLetter}${infoRow.number}`);
    }
    for (let column = 1; column <= lastColumn; column += 1) {
      const cell = infoRow.getCell(column);
      cell.border = thinBorder();
      cell.fill = solidFill(EXCEL_COLORS.slotFill);
      cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      cell.font =
        column % 2 === 1
          ? { bold: true, size: 9, color: { argb: EXCEL_COLORS.mutedText } }
          : { bold: column === 2, size: 11, color: { argb: EXCEL_COLORS.titleText } };
    }
  }

  const header = sheet.addRow([timeHeader, ...days.map((day) => day.label)]);
  header.height = 30;
  for (let column = 1; column <= lastColumn; column += 1) {
    const cell = header.getCell(column);
    cell.fill = solidFill(EXCEL_COLORS.headerFill);
    cell.font = { bold: true, color: { argb: EXCEL_COLORS.headerText }, size: 11 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
  }
  sheet.views = [{ state: 'frozen', ySplit: header.number, xSplit: 1 }];

  const slotRows = new Map();

  for (const slot of slots) {
    const timeText = `${slot.label}\n${slotTimeLabel(slot, use24h)}`;
    const values = [
      timeText,
      ...days.map((day) => cellTexts.get(`${day.id}|${slot.id}`) ?? ''),
    ];
    const row = sheet.addRow(values);
    slotRows.set(slot.id, row.number);
    row.height = heightForTexts(values, widths);

    const timeCell = row.getCell(1);
    styleGridCell(timeCell, { horizontal: 'left' });
    timeCell.font = { bold: true, size: 10, color: { argb: EXCEL_COLORS.bodyText } };
    timeCell.fill = solidFill(EXCEL_COLORS.slotFill);

    for (let column = 2; column <= lastColumn; column += 1) {
      const cell = row.getCell(column);
      styleGridCell(cell);
      cell.font = { size: 10, color: { argb: EXCEL_COLORS.bodyText } };
    }

    for (const brk of breaks.filter((item) => item.afterSlotId === slot.id)) {
      const breakRow = sheet.addRow([
        brk.label,
        days.length > 0 ? `${slotTimeLabel(brk, use24h)} · non-teaching` : '',
        ...days.slice(1).map(() => ''),
      ]);
      breakRow.height = 24;

      for (let column = 1; column <= lastColumn; column += 1) {
        const cell = breakRow.getCell(column);
        styleGridCell(cell);
        cell.fill = solidFill(EXCEL_COLORS.breakFill);
        cell.font = {
          bold: true,
          size: 10,
          color: { argb: EXCEL_COLORS.breakText },
        };
      }

      if (days.length > 0) {
        mergeRangeOnce(sheet, `B${breakRow.number}:${lastLetter}${breakRow.number}`);
      }
    }
  }

  // Merge consecutive 2-hour practicals; a break row makes the gap > 1.
  for (const session of viewSessions) {
    if (session.type !== 'Practical' || (session.slotIds ?? []).length !== 2) continue;

    const [firstSlotId, secondSlotId] = session.slotIds;
    const firstRow = slotRows.get(firstSlotId);
    const secondRow = slotRows.get(secondSlotId);
    const dayIndex = days.findIndex((day) => day.id === session.dayId);
    if (!firstRow || !secondRow || secondRow !== firstRow + 1 || dayIndex < 0) {
      continue;
    }

    const columnLetter = sheet.getColumn(2 + dayIndex).letter;
    mergeRangeOnce(sheet, `${columnLetter}${firstRow}:${columnLetter}${secondRow}`);

    for (let rowNumber = firstRow; rowNumber <= secondRow; rowNumber += 1) {
      const cell = sheet.getCell(`${columnLetter}${rowNumber}`);
      cell.fill = solidFill(EXCEL_COLORS.practicalFill);
      cell.font = { size: 10, color: { argb: EXCEL_COLORS.practicalText } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = thinBorder();
    }
  }

  // Locked institutional blocks: tint their cells and merge 2-hour blocks.
  for (const session of viewSessions) {
    if (session.type !== FIXED_SLOT_TYPE) continue;

    const dayIndex = days.findIndex((day) => day.id === session.dayId);
    if (dayIndex < 0) continue;

    const columnLetter = sheet.getColumn(2 + dayIndex).letter;
    const rowNumbers = (session.slotIds ?? [])
      .map((slotId) => slotRows.get(slotId))
      .filter(Boolean);
    if (rowNumbers.length === 0) continue;

    for (const rowNumber of rowNumbers) {
      const cell = sheet.getCell(`${columnLetter}${rowNumber}`);
      cell.fill = solidFill(EXCEL_COLORS.fixedFill);
      cell.font = { size: 10, bold: true, color: { argb: EXCEL_COLORS.fixedText } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = thinBorder();
    }

    if (rowNumbers.length === 2 && rowNumbers[1] === rowNumbers[0] + 1) {
      mergeRangeOnce(sheet, `${columnLetter}${rowNumbers[0]}:${columnLetter}${rowNumbers[1]}`);
    }
  }

  if (legend) {
    addLegendBlock(sheet, masterData, viewSessions, lastColumn);
  }
  addSignatureBlock(sheet, settings, lastColumn);
  addSheetFooter(sheet, settings);
  applyTabColor(sheet, tabColor);
  applyPageSetup(sheet, PAGE_SETUP_A4_LANDSCAPE, `A1:${lastLetter}${sheet.rowCount}`);
}

const CANONICAL_DAYS = [
  { id: 'MON', label: 'Monday' },
  { id: 'TUE', label: 'Tuesday' },
  { id: 'WED', label: 'Wednesday' },
  { id: 'THU', label: 'Thursday' },
  { id: 'FRI', label: 'Friday' },
  { id: 'SAT', label: 'Saturday' },
];

const INSTITUTIONAL_COLUMNS = [
  { width: 5.5 },  // 1: Sr.No
  { width: 13.5 }, // 2: Time
  // Monday (cols 3-5)
  { width: 10.5 }, { width: 9.5 }, { width: 8.5 },
  // Tuesday (cols 6-8)
  { width: 10.5 }, { width: 9.5 }, { width: 8.5 },
  // Wednesday (cols 9-11)
  { width: 10.5 }, { width: 9.5 }, { width: 8.5 },
  // Thursday (cols 12-14)
  { width: 10.5 }, { width: 9.5 }, { width: 8.5 },
  // Friday (cols 15-17)
  { width: 10.5 }, { width: 9.5 }, { width: 8.5 },
  // Saturday (cols 18-20)
  { width: 10.5 }, { width: 9.5 }, { width: 8.5 },
];

function addInstitutionalHeader(sheet, settings, title, termSubtitle, identifier) {
  const r1 = sheet.addRow(new Array(20).fill(''));
  r1.height = 14;
  sheet.getCell('T1').value = settings.revisionInfo || 'Revision No. 01 / Date 27/06/2026';
  sheet.getCell('T1').font = { bold: true, size: 8, color: { argb: 'FF000000' } };
  sheet.getCell('T1').alignment = { horizontal: 'right', vertical: 'middle' };

  const r2 = sheet.addRow([settings.societyName || "K.E. Society's"]);
  r2.height = 14;
  sheet.mergeCells('A2:T2');
  sheet.getCell('A2').font = { size: 9.5, color: { argb: 'FF000000' } };
  sheet.getCell('A2').alignment = { horizontal: 'center', vertical: 'middle' };

  const r3 = sheet.addRow([settings.instituteName || 'Rajarambapu Institute of Technology, Rajaramnagar']);
  r3.height = 18;
  sheet.mergeCells('A3:T3');
  sheet.getCell('A3').font = { bold: true, size: 12, color: { argb: 'FF000000' } };
  sheet.getCell('A3').alignment = { horizontal: 'center', vertical: 'middle' };

  const r4 = sheet.addRow([settings.departmentName || 'Department of Robotics and Automation']);
  r4.height = 15;
  sheet.mergeCells('A4:T4');
  sheet.getCell('A4').font = { bold: true, italic: true, size: 10, color: { argb: 'FF000000' } };
  sheet.getCell('A4').alignment = { horizontal: 'center', vertical: 'middle' };

  const r5 = sheet.addRow([title]);
  r5.height = 16;
  sheet.mergeCells('A5:T5');
  sheet.getCell('A5').font = { bold: true, size: 11, color: { argb: 'FF000000' } };
  sheet.getCell('A5').alignment = { horizontal: 'center', vertical: 'middle' };

  const r6 = sheet.addRow([
    termSubtitle || settings.termLabel || `${settings.academicYear || '2026-27'} ${settings.semester || 'PART-1'}`,
  ]);
  r6.height = 14;
  sheet.mergeCells('A6:T6');
  sheet.getCell('A6').font = { bold: true, size: 9.5, color: { argb: 'FF000000' } };
  sheet.getCell('A6').alignment = { horizontal: 'center', vertical: 'middle' };

  if (identifier) {
    const r7 = sheet.addRow([identifier]);
    r7.height = 16;
    sheet.getCell('A7').font = { bold: true, size: 9.5, color: { argb: 'FF000000' } };
    sheet.getCell('A7').alignment = { horizontal: 'left', vertical: 'bottom' };
  }
}

function addInstitutionalSignatures(sheet) {
  sheet.addRow([]);
  const sigRow = sheet.addRow([]);
  sigRow.height = 30;
  const rNum = sigRow.number;

  sheet.mergeCells(`C${rNum}:F${rNum}`);
  sheet.mergeCells(`P${rNum}:S${rNum}`);

  const sigIncharge = sheet.getCell(`C${rNum}`);
  sigIncharge.value = 'Timetable Incharge';
  sigIncharge.font = { bold: true, size: 9.5 };
  sigIncharge.alignment = { horizontal: 'center', vertical: 'bottom' };
  sigIncharge.border = { top: { style: 'thin', color: { argb: 'FF000000' } } };

  const sigHod = sheet.getCell(`P${rNum}`);
  sigHod.value = 'HOD';
  sigHod.font = { bold: true, size: 9.5 };
  sigHod.alignment = { horizontal: 'center', vertical: 'bottom' };
  sigHod.border = { top: { style: 'thin', color: { argb: 'FF000000' } } };
}

function addInstitutionalLegend(sheet, masterData, sessions) {
  const entries = legendEntries(masterData, sessions);
  sheet.addRow([]);
  const titleRow = sheet.addRow(['Subject–Faculty Legend']);
  titleRow.height = 18;
  const tNum = titleRow.number;
  sheet.mergeCells(`A${tNum}:T${tNum}`);
  sheet.getCell(`A${tNum}`).font = { bold: true, size: 9.5, color: { argb: 'FF1E293B' } };
  sheet.getCell(`A${tNum}`).alignment = { horizontal: 'left', vertical: 'middle' };

  const legHead = sheet.addRow([
    'Subject Code', '', 'Subject Name', '', '', '', '', 'TH/PR', '', 'Faculty Name', '', '', '', '', '', 'Room / Lab', '', '', '', '',
  ]);
  legHead.height = 16;
  const hNum = legHead.number;
  sheet.mergeCells(`A${hNum}:B${hNum}`);
  sheet.mergeCells(`C${hNum}:G${hNum}`);
  sheet.mergeCells(`H${hNum}:I${hNum}`);
  sheet.mergeCells(`J${hNum}:O${hNum}`);
  sheet.mergeCells(`P${hNum}:T${hNum}`);

  for (let c = 1; c <= 20; c++) {
    const cell = sheet.getCell(hNum, c);
    cell.border = thinBorder();
    cell.fill = solidFill('FF1E293B');
    cell.font = { bold: true, size: 8, color: { argb: 'FFFFFFFF' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  if (entries.length === 0) {
    const emptyRow = sheet.addRow(['No scheduled subjects in this view.']);
    emptyRow.height = 16;
    const eNum = emptyRow.number;
    sheet.mergeCells(`A${eNum}:T${eNum}`);
    const eCell = sheet.getCell(eNum, 1);
    eCell.border = thinBorder();
    eCell.font = { italic: true, size: 8, color: { argb: 'FF64748B' } };
    eCell.alignment = { horizontal: 'center', vertical: 'middle' };
    return;
  }

  entries.forEach((entry, idx) => {
    const row = sheet.addRow([
      entry.code, '', entry.name, '', '', '', '', entry.type, '', entry.faculty, '', '', '', '', '', entry.rooms, '', '', '', '',
    ]);
    row.height = 16;
    const rNum = row.number;
    sheet.mergeCells(`A${rNum}:B${rNum}`);
    sheet.mergeCells(`C${rNum}:G${rNum}`);
    sheet.mergeCells(`H${rNum}:I${rNum}`);
    sheet.mergeCells(`J${rNum}:O${rNum}`);
    sheet.mergeCells(`P${rNum}:T${rNum}`);
    for (let c = 1; c <= 20; c++) {
      const cell = sheet.getCell(rNum, c);
      cell.border = thinBorder();
      cell.font = { size: 7.5 };
      cell.alignment = {
        horizontal: c === 1 || c === 8 ? 'center' : 'left',
        vertical: 'middle',
      };
      if (idx % 2 === 1) cell.fill = solidFill('FFF8FAFC');
    }
  });
}

function buildDayAndSlotMaps(masterData) {
  const workingDays = enabledDays(masterData);
  const dayIndexMap = new Map();
  CANONICAL_DAYS.forEach((cDay, idx) => {
    dayIndexMap.set(cDay.id, idx);
    const matched = workingDays.find(
      (d) => d.id === cDay.id || d.label.toLowerCase() === cDay.label.toLowerCase(),
    );
    if (matched) dayIndexMap.set(matched.id, idx);
  });

  const slots = slotsOf(masterData);
  const slotIndexMap = new Map();
  slots.forEach((s, idx) => {
    slotIndexMap.set(s.id, idx);
  });

  return { dayIndexMap, slotIndexMap };
}

/** Division tab: every subject of one class in the unified 20-column institutional format. */
function addTimetableSheet(workbook, masterData, sessions, division, sheetName, options) {
  const { settings, substitutions } = options;
  const sheet = workbook.addWorksheet(sheetName, {
    pageSetup: PAGE_SETUP_A4_LANDSCAPE,
    properties: { defaultRowHeight: 18 },
  });
  sheet.columns = INSTITUTIONAL_COLUMNS;

  const defaultRoom = masterData?.rooms?.find((r) => r.id === division.defaultRoomId)?.name || 'CR 203';
  const subtitle = `${settings.termLabel || '2026-27 PART - I'}   |   Classroom: ${defaultRoom}   |   Class Coordinator: Dr. Anil Kulkarni`;
  addInstitutionalHeader(sheet, settings, `Class Time Table — ${division.name}`, subtitle, null);

  // Row 7 & 8: Days + Sub-columns Header
  const daysHeader = [
    'Sr.No', 'Time',
    'Monday', '', '',
    'Tuesday', '', '',
    'Wednesday', '', '',
    'Thursday', '', '',
    'Friday', '', '',
    'Saturday', '', '',
  ];
  const r7 = sheet.addRow(daysHeader);
  r7.height = 16;
  sheet.mergeCells('A7:A8');
  sheet.mergeCells('B7:B8');
  sheet.mergeCells('C7:E7');
  sheet.mergeCells('F7:H7');
  sheet.mergeCells('I7:K7');
  sheet.mergeCells('L7:N7');
  sheet.mergeCells('O7:Q7');
  sheet.mergeCells('R7:T7');

  const classSubCols = [
    '', '',
    'Subject / Lab', 'Faculty', 'Room',
    'Subject / Lab', 'Faculty', 'Room',
    'Subject / Lab', 'Faculty', 'Room',
    'Subject / Lab', 'Faculty', 'Room',
    'Subject / Lab', 'Faculty', 'Room',
    'Subject / Lab', 'Faculty', 'Room',
  ];
  const r8 = sheet.addRow(classSubCols);
  r8.height = 14;

  for (let r = 7; r <= 8; r++) {
    for (let c = 1; c <= 20; c++) {
      const cell = sheet.getCell(r, c);
      cell.border = thinBorder();
      cell.fill = solidFill('FF1E293B');
      cell.font = { bold: true, size: 8.5, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  // Row mapping for Division View:
  // Slot 0 (10-11): Row 9
  // Slot 1 (11-12): Row 10
  // Lunch (12-12:45): Row 11
  // Slot 2 (12:45-1:45): Row 12
  // Slot 3 (1:45-2:45): Row 13
  // Recess (2:45-3:00): Row 14
  // Slot 4 (3-4): Row 15
  // Slot 5 (4-5): Row 16
  // Slot 6 (5-6 buffer): Row 17
  const slotRowNumbers = [9, 10, 12, 13, 15, 16];
  const slotLabels = [
    { sr: '1', time: '10:00 To 11:00' },
    { sr: '2', time: '11:00 To 12:00' },
    { sr: '3', time: '12:45 To 01:45' },
    { sr: '4', time: '01:45 To 02:45' },
    { sr: '5', time: '03:00 To 04:00' },
    { sr: '6', time: '04:00 To 05:00' },
  ];

  // Initialize slot rows
  slotRowNumbers.forEach((rNum, idx) => {
    while (sheet.rowCount < rNum - 1) sheet.addRow([]);
    const row = sheet.addRow([slotLabels[idx].sr, slotLabels[idx].time]);
    row.height = 30;
    for (let c = 1; c <= 20; c++) {
      const cell = sheet.getCell(rNum, c);
      cell.border = thinBorder();
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      if (c === 1 || c === 2) cell.font = { bold: true, size: 8 };
    }
  });

  // Insert Breaks
  // Lunch Break: Row 11
  const r11 = sheet.getRow(11);
  r11.values = ['', '12:00 To 12:45', 'Lunch Break'];
  r11.height = 16;
  sheet.mergeCells('C11:T11');
  for (let c = 1; c <= 20; c++) {
    const cell = sheet.getCell(11, c);
    cell.border = thinBorder();
    cell.fill = solidFill('FFFEF3C7');
    cell.font = { bold: true, size: 8.5, color: { argb: 'FF92400E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Recess: Row 14
  const r14 = sheet.getRow(14);
  r14.values = ['', '02:45 To 03:00', 'Recess'];
  r14.height = 16;
  sheet.mergeCells('C14:T14');
  for (let c = 1; c <= 20; c++) {
    const cell = sheet.getCell(14, c);
    cell.border = thinBorder();
    cell.fill = solidFill('FFFEF3C7');
    cell.font = { bold: true, size: 8.5, color: { argb: 'FF92400E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Slot 7 Static Blank Buffer: Row 17
  const r17 = sheet.addRow(['7', '05:00 To 06:00']);
  r17.height = 20;
  for (let c = 1; c <= 20; c++) {
    const cell = sheet.getCell(17, c);
    cell.border = thinBorder();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (c === 1 || c === 2) cell.font = { bold: true, size: 8 };
  }

  const { dayIndexMap, slotIndexMap } = buildDayAndSlotMaps(masterData);
  const divSessions = sessions.filter((s) => s.divisionId === division.id);
  const mergedBlocks = new Set();

  for (const session of divSessions) {
    const dIdx = dayIndexMap.get(session.dayId);
    if (dIdx == null || dIdx < 0 || dIdx > 5) continue;
    const sIdx = slotIndexMap.get(session.slotIds?.[0]);
    if (sIdx == null || sIdx < 0 || sIdx >= slotRowNumbers.length) continue;

    const startRow = slotRowNumbers[sIdx];
    const c1 = 3 + dIdx * 3;
    const c2 = c1 + 1;
    const c3 = c1 + 2;

    const isPractical = session.type === 'Practical' && session.slotIds?.length === 2;
    const isFixed = session.type === FIXED_SLOT_TYPE;

    if (isFixed) {
      sheet.mergeCells(startRow, c1, startRow, c3);
      const cell = sheet.getCell(startRow, c1);
      cell.value = session.label || session.subjectCode || 'Fixed Slot';
      cell.fill = solidFill('FFF5F3FF');
      cell.font = { bold: true, size: 8, color: { argb: 'FF5B21B6' } };
      continue;
    }

    if (isPractical) {
      const nextRow = slotRowNumbers[sIdx + 1];
      const blockKey = `${startRow}-${c1}`;
      if (!mergedBlocks.has(blockKey) && nextRow) {
        mergedBlocks.add(blockKey);
        const batches = session.batches ?? [];
        if (batches.length > 0) {
          sheet.getCell(startRow, c1).value = batches
            .map((b) => `${String(b.batchName ?? '').split('-').pop() || 'B'}: ${session.subjectName || session.subjectCode}`)
            .join('\n');
          sheet.getCell(startRow, c2).value = batches
            .map((b) => b.facultyShortCode || b.facultyName || '—')
            .join('\n');
          sheet.getCell(startRow, c3).value = batches
            .map((b) => b.roomName || '—')
            .join('\n');
        } else {
          sheet.getCell(startRow, c1).value = `${session.subjectName}\n(${session.subjectCode})`;
          sheet.getCell(startRow, c2).value = session.facultyShortCode || session.facultyName || '—';
          sheet.getCell(startRow, c3).value = session.roomName || '—';
        }

        [c1, c2, c3].forEach((col) => {
          sheet.mergeCells(startRow, col, nextRow, col);
          const cTop = sheet.getCell(startRow, col);
          const cBot = sheet.getCell(nextRow, col);
          cTop.fill = solidFill('FFFEF08A');
          cBot.fill = solidFill('FFFEF08A');
          cTop.font = { size: 7.5 };
          cBot.font = { size: 7.5 };
          cTop.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cBot.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
      }
    } else {
      // 1-hour theory lecture
      sheet.getCell(startRow, c1).value = `${session.subjectName}\n(${session.subjectCode})`;
      sheet.getCell(startRow, c2).value = session.facultyShortCode || session.facultyName || '—';
      sheet.getCell(startRow, c3).value = session.roomName || '—';
      [c1, c2, c3].forEach((col) => {
        const c = sheet.getCell(startRow, col);
        c.fill = solidFill('FFDBEAFE');
        c.font = { size: 7.5 };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
    }
  }

  addInstitutionalLegend(sheet, masterData, divSessions);
  addInstitutionalSignatures(sheet);
  applyTabColor(sheet, TAB_COLORS.division);
  applyPageSetup(sheet, PAGE_SETUP_A4_LANDSCAPE, `A1:T${sheet.rowCount}`);
}

/** Faculty tab: one member's teaching in the unified 20-column institutional format. */
function addFacultySheet(workbook, masterData, sessions, member, sheetName, options) {
  const { settings, substitutions } = options;
  const sheet = workbook.addWorksheet(sheetName, {
    pageSetup: PAGE_SETUP_A4_LANDSCAPE,
    properties: { defaultRowHeight: 18 },
  });
  sheet.columns = INSTITUTIONAL_COLUMNS;

  addInstitutionalHeader(
    sheet,
    settings,
    'Personal time Table',
    settings.termLabel || `${settings.academicYear || '2026-27'} ${settings.semester || 'PART-1'}`,
    `Staff Name: ${member.name}`,
  );

  // Compute Workload for Member
  let fyTh = 0, fyPr = 0, ugTh = 0, ugPr = 0;
  const divisionsById = new Map((masterData?.divisions ?? []).map((d) => [d.id, d]));
  const teaches = (session) =>
    session.type === 'Practical'
      ? (session.batches ?? []).some((b) => b.facultyId === member.id)
      : session.facultyId === member.id;
  const memberSessions = sessions.filter(teaches);

  for (const s of memberSessions) {
    const div = divisionsById.get(s.divisionId);
    const divName = (div?.name || s.divisionName || '').toLowerCase();
    const isFy = divName.includes('fy') || divName.includes('first year');
    const hrs = s.slotIds?.length || 1;
    if (s.type === 'Practical') {
      const bCount = (s.batches ?? []).filter((b) => b.facultyId === member.id).length || 1;
      if (isFy) fyPr += hrs * bCount;
      else ugPr += hrs * bCount;
    } else {
      if (isFy) fyTh += hrs;
      else ugTh += hrs;
    }
  }
  const fyTotal = fyTh + fyPr;
  const totalLoad = fyTotal + ugTh + ugPr;

  // Rows 8 & 9: Workload Summary Strip
  const r8Vals = new Array(20).fill('');
  r8Vals[0] = 'FY';
  r8Vals[2] = 'Lectures:'; r8Vals[3] = String(fyTh);
  r8Vals[4] = 'Practicals:'; r8Vals[5] = String(fyPr);
  r8Vals[6] = 'EE'; r8Vals[7] = String(fyTotal);
  r8Vals[18] = 'Total:'; r8Vals[19] = String(totalLoad);
  const r8 = sheet.addRow(r8Vals);
  r8.height = 15;
  sheet.mergeCells('A8:B8');
  // S8 is 'Total:' and T8 is total load number

  const r9Vals = new Array(20).fill('');
  r9Vals[0] = 'UG';
  r9Vals[2] = 'Lectures:'; r9Vals[3] = String(ugTh);
  r9Vals[4] = 'Practicals:'; r9Vals[5] = String(ugPr);
  r9Vals[6] = 'Tutorials:'; r9Vals[7] = '0';
  r9Vals[8] = 'B Tech Project:'; r9Vals[9] = '0';
  r9Vals[10] = 'TY CAP Project:'; r9Vals[11] = '0';
  r9Vals[12] = 'PS:'; r9Vals[13] = '0';
  const r9 = sheet.addRow(r9Vals);
  r9.height = 15;
  sheet.mergeCells('A9:B9');

  for (let r = 8; r <= 9; r++) {
    for (let c = 1; c <= 20; c++) {
      const cell = sheet.getCell(r, c);
      cell.border = thinBorder();
      cell.font = { size: 8, bold: [1, 3, 5, 7, 9, 11, 13, 19].includes(c) };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }
  sheet.getCell('S8').fill = solidFill('FFF1F5F9');
  sheet.getCell('T8').fill = solidFill('FFF1F5F9');
  sheet.getCell('T8').font = { bold: true, size: 9 };

  // Row 10: Table Header (Days)
  const daysHeader = [
    'Sr.No', 'Time',
    'Monday', '', '',
    'Tuesday', '', '',
    'Wednesday', '', '',
    'Thursday', '', '',
    'Friday', '', '',
    'Saturday', '', '',
  ];
  const r10 = sheet.addRow(daysHeader);
  r10.height = 16;
  sheet.mergeCells('A10:A11');
  sheet.mergeCells('B10:B11');
  sheet.mergeCells('C10:E10');
  sheet.mergeCells('F10:H10');
  sheet.mergeCells('I10:K10');
  sheet.mergeCells('L10:N10');
  sheet.mergeCells('O10:Q10');
  sheet.mergeCells('R10:T10');

  // Row 11: Sub-columns (Class / Batch | Subject / Lab | Room / Lab)
  const subCols = [
    '', '',
    'Class / Batch', 'Subject / Lab', 'Room / Lab',
    'Class / Batch', 'Subject / Lab', 'Room / Lab',
    'Class / Batch', 'Subject / Lab', 'Room / Lab',
    'Class / Batch', 'Subject / Lab', 'Room / Lab',
    'Class / Batch', 'Subject / Lab', 'Room / Lab',
    'Class / Batch', 'Subject / Lab', 'Room / Lab',
  ];
  const r11 = sheet.addRow(subCols);
  r11.height = 14;

  for (let r = 10; r <= 11; r++) {
    for (let c = 1; c <= 20; c++) {
      const cell = sheet.getCell(r, c);
      cell.border = thinBorder();
      cell.fill = solidFill('FF1E293B');
      cell.font = { bold: true, size: 8.5, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  // Row mapping for Faculty View:
  // Slot 0 (10-11): Row 12
  // Slot 1 (11-12): Row 13
  // Lunch (12-12:45): Row 14
  // Slot 2 (12:45-1:45): Row 15
  // Slot 3 (1:45-2:45): Row 16
  // Recess (2:45-3:00): Row 17
  // Slot 4 (3-4): Row 18
  // Slot 5 (4-5): Row 19
  // Slot 6 (5-6 buffer): Row 20
  const slotRowNumbers = [12, 13, 15, 16, 18, 19];
  const slotLabels = [
    { sr: '1', time: '10:00 To 11:00' },
    { sr: '2', time: '11:00 To 12:00' },
    { sr: '3', time: '12:45 To 01:45' },
    { sr: '4', time: '01:45 To 02:45' },
    { sr: '5', time: '03:00 To 04:00' },
    { sr: '6', time: '04:00 To 05:00' },
  ];

  slotRowNumbers.forEach((rNum, idx) => {
    while (sheet.rowCount < rNum - 1) sheet.addRow([]);
    const row = sheet.addRow([slotLabels[idx].sr, slotLabels[idx].time]);
    row.height = 24;
    for (let c = 1; c <= 20; c++) {
      const cell = sheet.getCell(rNum, c);
      cell.border = thinBorder();
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      if (c === 1 || c === 2) cell.font = { bold: true, size: 8 };
    }
  });

  // Lunch Break: Row 14
  const r14 = sheet.getRow(14);
  r14.values = ['', '12:00 To 12:45', 'Lunch Break'];
  r14.height = 16;
  sheet.mergeCells('C14:T14');
  for (let c = 1; c <= 20; c++) {
    const cell = sheet.getCell(14, c);
    cell.border = thinBorder();
    cell.fill = solidFill('FFFEF3C7');
    cell.font = { bold: true, size: 8.5, color: { argb: 'FF92400E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Recess: Row 17
  const r17 = sheet.getRow(17);
  r17.values = ['', '02:45 To 03:00', 'Recess'];
  r17.height = 16;
  sheet.mergeCells('C17:T17');
  for (let c = 1; c <= 20; c++) {
    const cell = sheet.getCell(17, c);
    cell.border = thinBorder();
    cell.fill = solidFill('FFFEF3C7');
    cell.font = { bold: true, size: 8.5, color: { argb: 'FF92400E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Slot 7 Static Blank Buffer: Row 20
  const r20 = sheet.addRow(['7', '05:00 To 06:00']);
  r20.height = 20;
  for (let c = 1; c <= 20; c++) {
    const cell = sheet.getCell(20, c);
    cell.border = thinBorder();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (c === 1 || c === 2) cell.font = { bold: true, size: 8 };
  }

  const { dayIndexMap, slotIndexMap } = buildDayAndSlotMaps(masterData);
  const mergedBlocks = new Set();

  for (const session of memberSessions) {
    const dIdx = dayIndexMap.get(session.dayId);
    if (dIdx == null || dIdx < 0 || dIdx > 5) continue;
    const sIdx = slotIndexMap.get(session.slotIds?.[0]);
    if (sIdx == null || sIdx < 0 || sIdx >= slotRowNumbers.length) continue;

    const startRow = slotRowNumbers[sIdx];
    const c1 = 3 + dIdx * 3;
    const c2 = c1 + 1;
    const c3 = c1 + 2;

    const div = divisionsById.get(session.divisionId);
    const divName = div?.name || session.divisionName || '—';
    const isPractical = session.type === 'Practical' && session.slotIds?.length === 2;
    const isFixed = session.type === FIXED_SLOT_TYPE;

    if (isFixed) {
      sheet.mergeCells(startRow, c1, startRow, c3);
      const cell = sheet.getCell(startRow, c1);
      cell.value = session.label || session.subjectCode || 'Fixed Slot';
      cell.fill = solidFill('FFF5F3FF');
      cell.font = { bold: true, size: 8, color: { argb: 'FF5B21B6' } };
      continue;
    }

    if (isPractical) {
      const nextRow = slotRowNumbers[sIdx + 1];
      const blockKey = `${startRow}-${c1}`;
      if (!mergedBlocks.has(blockKey) && nextRow) {
        mergedBlocks.add(blockKey);
        const myBatches = (session.batches ?? []).filter((b) => b.facultyId === member.id);
        const batchLabels = myBatches.map((b) => String(b.batchName ?? '').split('-').pop() || 'Batch').join(', ');
        const roomName = myBatches.map((b) => b.roomName).filter(Boolean).join(', ') || session.roomName || '—';

        sheet.getCell(startRow, c1).value = batchLabels ? `${divName} (${batchLabels})` : divName;
        sheet.getCell(startRow, c2).value = `${session.subjectName}\n(${session.subjectCode})`;
        sheet.getCell(startRow, c3).value = roomName;

        [c1, c2, c3].forEach((col) => {
          sheet.mergeCells(startRow, col, nextRow, col);
          const cTop = sheet.getCell(startRow, col);
          const cBot = sheet.getCell(nextRow, col);
          cTop.fill = solidFill('FFFEF08A');
          cBot.fill = solidFill('FFFEF08A');
          cTop.font = { size: 7.5 };
          cBot.font = { size: 7.5 };
          cTop.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cBot.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
      }
    } else {
      // 1-hour theory lecture
      sheet.getCell(startRow, c1).value = divName;
      sheet.getCell(startRow, c2).value = `${session.subjectName}\n(${session.subjectCode})`;
      sheet.getCell(startRow, c3).value = session.roomName || '—';
      [c1, c2, c3].forEach((col) => {
        const c = sheet.getCell(startRow, col);
        c.fill = solidFill('FFDBEAFE');
        c.font = { size: 7.5 };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
    }
  }

  addInstitutionalSignatures(sheet);
  applyTabColor(sheet, TAB_COLORS.faculty);
  applyPageSetup(sheet, PAGE_SETUP_A4_LANDSCAPE, `A1:T${sheet.rowCount}`);
}

/** Room / lab tab: who occupies the room each hour in the unified 20-column institutional format. */
function addRoomSheet(workbook, masterData, sessions, room, sheetName, options) {
  const { settings, substitutions } = options;
  const sheet = workbook.addWorksheet(sheetName, {
    pageSetup: PAGE_SETUP_A4_LANDSCAPE,
    properties: { defaultRowHeight: 18 },
  });
  sheet.columns = INSTITUTIONAL_COLUMNS;

  const subtitle = `${settings.termLabel || '2026-27 PART - I'}   |   Type: ${room.type || 'Classroom'}   |   Capacity: ${room.capacity || '—'} seats`;
  addInstitutionalHeader(sheet, settings, `Room Time Table — ${room.name}`, subtitle, null);

  // Row 7 & 8: Days + Sub-columns Header
  const daysHeader = [
    'Sr.No', 'Time',
    'Monday', '', '',
    'Tuesday', '', '',
    'Wednesday', '', '',
    'Thursday', '', '',
    'Friday', '', '',
    'Saturday', '', '',
  ];
  const r7 = sheet.addRow(daysHeader);
  r7.height = 16;
  sheet.mergeCells('A7:A8');
  sheet.mergeCells('B7:B8');
  sheet.mergeCells('C7:E7');
  sheet.mergeCells('F7:H7');
  sheet.mergeCells('I7:K7');
  sheet.mergeCells('L7:N7');
  sheet.mergeCells('O7:Q7');
  sheet.mergeCells('R7:T7');

  const roomSubCols = [
    '', '',
    'Class / Batch', 'Subject / Lab', 'Faculty',
    'Class / Batch', 'Subject / Lab', 'Faculty',
    'Class / Batch', 'Subject / Lab', 'Faculty',
    'Class / Batch', 'Subject / Lab', 'Faculty',
    'Class / Batch', 'Subject / Lab', 'Faculty',
    'Class / Batch', 'Subject / Lab', 'Faculty',
  ];
  const r8 = sheet.addRow(roomSubCols);
  r8.height = 14;

  for (let r = 7; r <= 8; r++) {
    for (let c = 1; c <= 20; c++) {
      const cell = sheet.getCell(r, c);
      cell.border = thinBorder();
      cell.fill = solidFill('FF1E293B');
      cell.font = { bold: true, size: 8.5, color: { argb: 'FFFFFFFF' } };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
    }
  }

  const slotRowNumbers = [9, 10, 12, 13, 15, 16];
  const slotLabels = [
    { sr: '1', time: '10:00 To 11:00' },
    { sr: '2', time: '11:00 To 12:00' },
    { sr: '3', time: '12:45 To 01:45' },
    { sr: '4', time: '01:45 To 02:45' },
    { sr: '5', time: '03:00 To 04:00' },
    { sr: '6', time: '04:00 To 05:00' },
  ];

  slotRowNumbers.forEach((rNum, idx) => {
    while (sheet.rowCount < rNum - 1) sheet.addRow([]);
    const row = sheet.addRow([slotLabels[idx].sr, slotLabels[idx].time]);
    row.height = 24;
    for (let c = 1; c <= 20; c++) {
      const cell = sheet.getCell(rNum, c);
      cell.border = thinBorder();
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      if (c === 1 || c === 2) cell.font = { bold: true, size: 8 };
    }
  });

  // Lunch Break: Row 11
  const r11 = sheet.getRow(11);
  r11.values = ['', '12:00 To 12:45', 'Lunch Break'];
  r11.height = 16;
  sheet.mergeCells('C11:T11');
  for (let c = 1; c <= 20; c++) {
    const cell = sheet.getCell(11, c);
    cell.border = thinBorder();
    cell.fill = solidFill('FFFEF3C7');
    cell.font = { bold: true, size: 8.5, color: { argb: 'FF92400E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Recess: Row 14
  const r14 = sheet.getRow(14);
  r14.values = ['', '02:45 To 03:00', 'Recess'];
  r14.height = 16;
  sheet.mergeCells('C14:T14');
  for (let c = 1; c <= 20; c++) {
    const cell = sheet.getCell(14, c);
    cell.border = thinBorder();
    cell.fill = solidFill('FFFEF3C7');
    cell.font = { bold: true, size: 8.5, color: { argb: 'FF92400E' } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  // Slot 7 Static Blank Buffer: Row 17
  const r17 = sheet.addRow(['7', '05:00 To 06:00']);
  r17.height = 20;
  for (let c = 1; c <= 20; c++) {
    const cell = sheet.getCell(17, c);
    cell.border = thinBorder();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    if (c === 1 || c === 2) cell.font = { bold: true, size: 8 };
  }

  const { dayIndexMap, slotIndexMap } = buildDayAndSlotMaps(masterData);
  const divisionsById = new Map((masterData?.divisions ?? []).map((d) => [d.id, d]));
  const usesRoom = (session) =>
    session.type === 'Practical'
      ? (session.batches ?? []).some((b) => b.roomId === room.id)
      : session.roomId === room.id;
  const roomSessions = sessions.filter(usesRoom);
  const mergedBlocks = new Set();

  for (const session of roomSessions) {
    const dIdx = dayIndexMap.get(session.dayId);
    if (dIdx == null || dIdx < 0 || dIdx > 5) continue;
    const sIdx = slotIndexMap.get(session.slotIds?.[0]);
    if (sIdx == null || sIdx < 0 || sIdx >= slotRowNumbers.length) continue;

    const startRow = slotRowNumbers[sIdx];
    const c1 = 3 + dIdx * 3;
    const c2 = c1 + 1;
    const c3 = c1 + 2;

    const div = divisionsById.get(session.divisionId);
    const divName = div?.name || session.divisionName || '—';
    const isPractical = session.type === 'Practical' && session.slotIds?.length === 2;
    const isFixed = session.type === FIXED_SLOT_TYPE;

    if (isFixed) {
      sheet.mergeCells(startRow, c1, startRow, c3);
      const cell = sheet.getCell(startRow, c1);
      cell.value = session.label || session.subjectCode || 'Fixed Slot';
      cell.fill = solidFill('FFF5F3FF');
      cell.font = { bold: true, size: 8, color: { argb: 'FF5B21B6' } };
      continue;
    }

    if (isPractical) {
      const nextRow = slotRowNumbers[sIdx + 1];
      const blockKey = `${startRow}-${c1}`;
      if (!mergedBlocks.has(blockKey) && nextRow) {
        mergedBlocks.add(blockKey);
        const myBatches = (session.batches ?? []).filter((b) => b.roomId === room.id);
        const batchLabels = myBatches.map((b) => String(b.batchName ?? '').split('-').pop() || 'Batch').join(', ');
        const facName = myBatches.map((b) => b.facultyShortCode || b.facultyName).filter(Boolean).join(', ') || session.facultyShortCode || session.facultyName || '—';

        sheet.getCell(startRow, c1).value = batchLabels ? `${divName} (${batchLabels})` : divName;
        sheet.getCell(startRow, c2).value = `${session.subjectName}\n(${session.subjectCode})`;
        sheet.getCell(startRow, c3).value = facName;

        [c1, c2, c3].forEach((col) => {
          sheet.mergeCells(startRow, col, nextRow, col);
          const cTop = sheet.getCell(startRow, col);
          const cBot = sheet.getCell(nextRow, col);
          cTop.fill = solidFill('FFFEF08A');
          cBot.fill = solidFill('FFFEF08A');
          cTop.font = { size: 7.5 };
          cBot.font = { size: 7.5 };
          cTop.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
          cBot.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
        });
      }
    } else {
      sheet.getCell(startRow, c1).value = divName;
      sheet.getCell(startRow, c2).value = `${session.subjectName}\n(${session.subjectCode})`;
      sheet.getCell(startRow, c3).value = session.facultyShortCode || session.facultyName || '—';
      [c1, c2, c3].forEach((col) => {
        const c = sheet.getCell(startRow, col);
        c.fill = solidFill('FFDBEAFE');
        c.font = { size: 7.5 };
        c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      });
    }
  }

  addInstitutionalSignatures(sheet);
  applyTabColor(sheet, TAB_COLORS.room);
  applyPageSetup(sheet, PAGE_SETUP_A4_LANDSCAPE, `A1:T${sheet.rowCount}`);
}

/** Master A3 wall chart: every division on one landscape sheet. */
function addMasterTimetableSheet(workbook, masterData, sessions, sheetName, options) {
  const { settings, substitutions, use24h } = options;
  const days = enabledDays(masterData);
  const slots = slotsOf(masterData);
  const breaks = breaksOf(masterData);
  const divisions = masterData?.divisions ?? [];

  const columns = [
    { kind: 'day', label: 'Day' },
    { kind: 'class', label: 'Class' },
  ];
  for (const slot of slots) {
    columns.push({
      kind: 'slot',
      slot,
      label: `${slot.label} (${slotTimeLabel(slot, use24h)})`,
    });
    for (const brk of breaks.filter((item) => item.afterSlotId === slot.id)) {
      columns.push({ kind: 'break', brk, label: `${brk.label} (${slotTimeLabel(brk, use24h)})` });
    }
  }

  const columnCount = Math.max(1, columns.length);
  const sheet = workbook.addWorksheet(sheetName, {
    properties: { defaultRowHeight: 20 },
  });

  const coverage = new Map();
  const occupants = new Map();
  for (const session of sessions) {
    (session.slotIds ?? []).forEach((slotId, index) => {
      const cellKey = `${session.divisionId}|${session.dayId}|${slotId}`;
      coverage.set(cellKey, { session, index });
      if (!occupants.has(cellKey)) occupants.set(cellKey, []);
      occupants.get(cellKey).push({ session, index });
    });
  }

  const slotColumn = new Map();
  columns.forEach((column, index) => {
    if (column.kind === 'slot') slotColumn.set(column.slot.id, index + 1);
  });

  /** One cell of the wall chart: the primary session plus any cell mate. */
  const composeCell = (hit) => {
    const base =
      hit.session.type === FIXED_SLOT_TYPE
        ? fixedSlotCell(hit.session)
        : hit.session.type === 'Practical'
          ? excelPracticalCell(hit.session, substitutions)
          : hit.session.electiveGroup
            ? excelElectiveCell(cellSessionsAt(sessions, hit.session))
            : excelTheoryCell(
                hit.session,
                substitutedFor(substitutions, hit.session),
              );
    return withOtherOccupants(
      base,
      occupants.get(
        `${hit.session.divisionId}|${hit.session.dayId}|${hit.session.slotIds?.[0]}`,
      ),
      hit.session,
    );
  };

  // Pre-compute the text in every column so widths/heights fit real content.
  const columnTexts = columns.map((column) => {
    if (column.kind !== 'slot') return [column.label];
    const texts = [column.label];
    for (const division of divisions) {
      for (const day of days) {
        const hit = coverage.get(`${division.id}|${day.id}|${column.slot.id}`);
        if (!hit || hit.index !== 0) continue;
        texts.push(composeCell(hit));
      }
    }
    return texts;
  });

  sheet.columns = columns.map((column, index) => {
    if (column.kind === 'day') return { width: 12 };
    if (column.kind === 'class') return { width: 13 };
    if (column.kind === 'break') return { width: 11 };
    return { width: widthForTexts(columnTexts[index], { min: 16, max: 26 }) };
  });
  const widths = sheet.columns.map((column) => column.width);
  const lastLetter = sheet.getColumn(columnCount).letter;

  addWorkbookTitle(
    sheet,
    settings,
    columnCount,
    documentSubtitle(settings, 'Master Timetable — All Divisions'),
    { large: true },
  );

  const header = sheet.addRow(columns.map((column) => column.label));
  header.height = 36;
  for (let column = 1; column <= columnCount; column += 1) {
    const cell = header.getCell(column);
    cell.fill = solidFill(EXCEL_COLORS.headerFill);
    cell.font = { bold: true, color: { argb: EXCEL_COLORS.headerText }, size: 10 };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = thinBorder();
  }
  sheet.views = [{ state: 'frozen', ySplit: header.number, xSplit: 2 }];

  const rowByDivisionDay = new Map();
  const bodyStartRow = sheet.rowCount + 1;

  for (const day of days) {
    const dayStartRow = sheet.rowCount + 1;

    divisions.forEach((division, divisionIndex) => {
      const values = new Array(columnCount).fill('');
      if (divisionIndex === 0) values[0] = day.label;
      values[1] = division.name;

      for (const slot of slots) {
        const hit = coverage.get(`${division.id}|${day.id}|${slot.id}`);
        if (!hit || hit.index !== 0) continue;
        const columnIndex = slotColumn.get(slot.id);
        if (!columnIndex) continue;
        values[columnIndex - 1] = composeCell(hit);
      }

      const row = sheet.addRow(values);
      row.height = heightForTexts(values, widths, { lineHeight: 11, min: 42, max: 120 });
      rowByDivisionDay.set(`${division.id}|${day.id}`, row.number);

      for (let column = 1; column <= columnCount; column += 1) {
        const cell = row.getCell(column);
        styleGridCell(cell);
        cell.font = { size: 9, color: { argb: EXCEL_COLORS.bodyText } };
      }

      const classCell = row.getCell(2);
      classCell.font = { bold: true, size: 10, color: { argb: EXCEL_COLORS.titleText } };
    });

    const dayEndRow = sheet.rowCount;
    if (dayEndRow > dayStartRow) {
      mergeRangeOnce(sheet, `A${dayStartRow}:A${dayEndRow}`);
    }

    for (let rowNumber = dayStartRow; rowNumber <= dayEndRow; rowNumber += 1) {
      const dayCell = sheet.getCell(`A${rowNumber}`);
      dayCell.fill = solidFill(EXCEL_COLORS.masterDayFill);
      dayCell.border = thinBorder();
      dayCell.font = { bold: true, size: 12, color: { argb: EXCEL_COLORS.titleText } };
      dayCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    }
  }

  // Horizontally merge 2-hour practical and fixed blocks inside their row.
  for (const session of sessions) {
    const isFixed = session.type === FIXED_SLOT_TYPE;
    if (!isFixed && session.type !== 'Practical') continue;
    const slotIds = session.slotIds ?? [];
    if (slotIds.length < 2) continue;

    const rowNumber = rowByDivisionDay.get(`${session.divisionId}|${session.dayId}`);
    if (!rowNumber) continue;

    const firstColumn = slotColumn.get(slotIds[0]);
    const secondColumn = slotColumn.get(slotIds[1]);
    if (!firstColumn || !secondColumn || secondColumn !== firstColumn + 1) continue;

    const firstLetter = sheet.getColumn(firstColumn).letter;
    const secondLetter = sheet.getColumn(secondColumn).letter;
    mergeRangeOnce(sheet, `${firstLetter}${rowNumber}:${secondLetter}${rowNumber}`);

    for (const columnNumber of [firstColumn, secondColumn]) {
      const letter = sheet.getColumn(columnNumber).letter;
      const cell = sheet.getCell(`${letter}${rowNumber}`);
      cell.fill = solidFill(
        isFixed ? EXCEL_COLORS.fixedFill : EXCEL_COLORS.practicalFill,
      );
      cell.font = {
        size: 9,
        bold: isFixed,
        color: { argb: isFixed ? EXCEL_COLORS.fixedText : EXCEL_COLORS.practicalText },
      };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      cell.border = thinBorder();
    }

    if (isFixed) {
      const cell = sheet.getCell(`${firstLetter}${rowNumber}`);
      cell.font = {
        size: 9,
        bold: true,
        color: { argb: EXCEL_COLORS.fixedText },
      };
    }
  }

  // Lunch / Recess columns are one vertical block from top to bottom.
  const bodyEndRow = sheet.rowCount;
  columns.forEach((column, index) => {
    if (column.kind !== 'break' || bodyEndRow < bodyStartRow) return;
    const letter = sheet.getColumn(index + 1).letter;

    if (bodyEndRow > bodyStartRow) {
      mergeRangeOnce(sheet, `${letter}${bodyStartRow}:${letter}${bodyEndRow}`);
    }

    const firstCell = sheet.getCell(`${letter}${bodyStartRow}`);
    firstCell.value = `${column.brk.label}\n${slotTimeLabel(column.brk, use24h)}`;
    firstCell.font = {
      bold: true,
      size: 10,
      color: { argb: EXCEL_COLORS.breakText },
    };
    firstCell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

    for (let rowNumber = bodyStartRow; rowNumber <= bodyEndRow; rowNumber += 1) {
      const cell = sheet.getCell(`${letter}${rowNumber}`);
      cell.fill = solidFill(EXCEL_COLORS.breakFill);
      cell.border = thinBorder();
    }
  });

  addSignatureBlock(sheet, settings, columnCount);
  addSheetFooter(sheet, settings);
  applyTabColor(sheet, TAB_COLORS.master);
  applyPageSetup(
    sheet,
    PAGE_SETUP_A3_LANDSCAPE,
    `A1:${lastLetter}${Math.max(1, sheet.rowCount)}`,
  );
}

/** Summary tab (workload, utilisation) with the shared header/footer polish. */
function addSummarySheet(workbook, sheetName, rows, usedNames, settings, tabColor) {
  const name = uniqueSheetName(usedNames, sheetName);
  const sheet = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 20 },
  });

  const columnCount = Math.max(...rows.map((row) => row.length), 1);
  const widths = Array.from({ length: columnCount }, (_, columnIndex) => {
    const longest = Math.max(
      ...rows.map((row) => String(row[columnIndex] ?? '').length),
      10,
    );
    return Math.min(48, Math.max(12, longest + 2));
  });
  sheet.columns = widths.map((width) => ({ width }));

  rows.forEach((values, rowIndex) => {
    const row = sheet.addRow(values);
    const estimatedLines = Math.max(
      ...values.map((value, columnIndex) =>
        Math.ceil(String(value ?? '').length / Math.max(8, widths[columnIndex] - 2)),
      ),
      1,
    );
    const isHeader = rowIndex === 0;
    row.height = isHeader ? 30 : Math.max(22, Math.min(72, estimatedLines * 15));

    for (let column = 1; column <= columnCount; column += 1) {
      const cell = row.getCell(column);
      cell.border = thinBorder();
      cell.alignment = {
        vertical: isHeader ? 'middle' : 'top',
        horizontal: isHeader
          ? 'center'
          : typeof values[column - 1] === 'number'
            ? 'center'
            : 'left',
        wrapText: true,
      };

      if (isHeader) {
        cell.fill = solidFill(EXCEL_COLORS.headerFill);
        cell.font = {
          bold: true,
          color: { argb: EXCEL_COLORS.headerText },
          size: 11,
        };
      } else {
        cell.font = { size: 10, color: { argb: 'FF334155' } };
        if (rowIndex % 2 === 0) {
          cell.fill = solidFill(EXCEL_COLORS.zebra);
        }
      }
    }
  });

  addSheetFooter(sheet, settings);
  applyTabColor(sheet, tabColor);
  applyPageSetup(
    sheet,
    PAGE_SETUP_A4_LANDSCAPE,
    `A1:${sheet.getColumn(columnCount).letter}${sheet.rowCount}`,
  );
}

/**
 * "Schedule Health" tab: the numbers a coordinator checks before circulating a
 * timetable, derived from the independent validator so it can disagree with the
 * generator.
 */
function buildHealthRows(masterData, sessions, timetable) {
  const validation = validateTimetable({ sessions }, masterData);
  const counts = validation.counts ?? {};
  const days = enabledDays(masterData);
  const slots = slotsOf(masterData);
  const totalSlots = days.length * slots.length;
  const rooms = masterData?.rooms ?? [];

  const contactHours = sessions.reduce((total, session) => {
    const batches =
      session.type === 'Practical' ? Math.max(1, (session.batches ?? []).length) : 1;
    return total + (session.slotIds?.length ?? 0) * batches;
  }, 0);

  const scheduledBySubject = new Map();
  for (const session of sessions) {
    const key = session.subjectId ?? session.subjectCode;
    const batchCount = session.type === 'Practical' ? (session.batches ?? []).length : 1;
    scheduledBySubject.set(
      key,
      (scheduledBySubject.get(key) ?? 0) + (session.slotIds?.length ?? 0) * batchCount,
    );
  }

  const gaps = [];
  for (const subject of masterData?.subjects ?? []) {
    const batchCount =
      subject.type === 'Practical'
        ? Math.max(1, (masterData.divisions ?? []).find(
            (division) => division.id === subject.divisionId,
          )?.batches?.length ?? 1)
        : 1;
    const required = (Number(subject.weeklyHours) || 0) * batchCount;
    const scheduled = scheduledBySubject.get(subject.id ?? subject.code) ?? 0;
    if (required > scheduled) {
      gaps.push(`${subject.code}: ${scheduled}/${required} hrs`);
    }
  }

  const bookedSlots = new Set();
  for (const session of sessions) {
    for (const entrance of session.type === 'Practical' ? session.batches ?? [] : [session]) {
      const roomId = entrance.roomId ?? session.roomId;
      if (!roomId) continue;
      for (const slotId of session.slotIds ?? []) {
        bookedSlots.add(`${roomId}|${session.dayId}|${slotId}`);
      }
    }
  }
  const roomCapacitySlots = rooms.length * totalSlots;
  const utilisation =
    roomCapacitySlots > 0
      ? `${Math.round((bookedSlots.size / roomCapacitySlots) * 100)}%`
      : '—';

  const overloaded = (validation.loadViolations ?? [])
    .map((entry) => `${entry.shortCode ?? entry.facultyName} (${entry.hours}/${entry.maxWeeklyLoad})`)
    .join(', ');

  const issues = [
    ['Faculty clashes', validation.facultyClashes?.length ?? 0],
    ['Room clashes', validation.roomClashes?.length ?? 0],
    ['Division clashes', validation.divisionClashes?.length ?? 0],
    ['Missing weekly hours', validation.missingHours?.length ?? 0],
    ['Broken practical blocks', validation.brokenPracticals?.length ?? 0],
    ['Unavailable-slot assignments', validation.facultyAvailabilityViolations?.length ?? 0],
    ['Load-limit breaches', validation.loadViolations?.length ?? 0],
    ['Room capacity breaches', validation.capacityViolations?.length ?? 0],
    ['Structure problems', validation.structureViolations?.length ?? 0],
  ];

  const rows = [
    ['Schedule Health', 'Value'],
    ['Status', validation.isValid ? 'No hard-constraint violations' : 'Needs attention'],
    ['Sessions', counts.sessions ?? sessions.length],
    ['Theory / Practical sessions', `${counts.theorySessions ?? 0} / ${counts.practicalSessions ?? 0}`],
    ['Locked fixed slots', counts.fixedSessions ?? 0],
    ['Contact hours scheduled', contactHours],
    ['Pinned sessions', sessions.filter((session) => session.pinned).length],
    ['Room utilisation', utilisation],
    ['Above weekly load', overloaded || 'None'],
    ['Unscheduled subject hours', gaps.length > 0 ? gaps.join('; ') : 'None'],
    [],
    ['Validator check', 'Findings'],
    ...issues.map(([label, value]) => [label, value]),
  ];

  if (timetable?.generatedAt) {
    rows.splice(1, 0, ['Generated at', new Date(timetable.generatedAt).toLocaleString()]);
  }

  return rows;
}

function slugify(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Build the full styled multi-tab workbook with ExcelJS.
 */
export async function buildWorkbook(masterData, timetable, options = {}) {
  const settings = options.settings ?? loadPrintSettings();
  const config = {
    includeMaster: true,
    includeDivisions: true,
    includeFaculty: true,
    includeRooms: true,
    includeSummaries: true,
    includeHealth: true,
    use24h: false,
    fileName: '',
    ...options,
  };

  const sessions = Array.isArray(timetable)
    ? timetable
    : Array.isArray(timetable?.sessions)
      ? timetable.sessions
      : [];
  const baseline = Array.isArray(timetable)
    ? timetable
    : Array.isArray(timetable?.baseline)
      ? timetable.baseline
      : sessions;
  const substitutions = buildSubstitutionIndex(sessions, baseline);

  const sheets = buildSheetPayloads(masterData, timetable);
  const module = await import('exceljs');
  const ExcelJS = module.default?.Workbook ? module.default : module;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Timetable Studio';
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = `${settings.departmentName} timetable`;
  workbook.subject = `Academic Year ${settings.academicYear} · ${settings.semester}`;
  workbook.company = settings.instituteName;
  workbook.description = 'Generated by Timetable Studio';

  const usedNames = new Set();
  const gridOptions = { settings, substitutions, use24h: config.use24h };

  if (config.includeMaster) {
    const masterName = uniqueSheetName(usedNames, 'Master Timetable (A3)');
    addMasterTimetableSheet(workbook, masterData, sessions, masterName, gridOptions);
  }

  if (config.includeDivisions) {
    for (const division of masterData?.divisions ?? []) {
      const name = uniqueSheetName(usedNames, `${division.name} Timetable`);
      addTimetableSheet(workbook, masterData, sessions, division, name, gridOptions);
    }
  }

  if (config.includeFaculty) {
    for (const member of masterData?.faculty ?? []) {
      const name = uniqueSheetName(
        usedNames,
        `Fac - ${member.shortCode || member.name || 'Faculty'}`,
      );
      addFacultySheet(workbook, masterData, sessions, member, name, gridOptions);
    }
  }

  if (config.includeRooms) {
    for (const room of masterData?.rooms ?? []) {
      const name = uniqueSheetName(usedNames, `Room - ${room.name || room.id}`);
      addRoomSheet(workbook, masterData, sessions, room, name, gridOptions);
    }
  }

  if (config.includeHealth) {
    addSummarySheet(
      workbook,
      'Schedule Health',
      buildHealthRows(masterData, sessions, Array.isArray(timetable) ? null : timetable),
      usedNames,
      settings,
      TAB_COLORS.health,
    );
  }

  if (config.includeSummaries) {
    for (const summaryName of ['Faculty Workload', 'Room Utilisation']) {
      const payload = sheets.find((sheet) => sheet.name === summaryName);
      addSummarySheet(
        workbook,
        summaryName,
        payload?.rows ?? [[summaryName]],
        usedNames,
        settings,
        TAB_COLORS.summary,
      );
    }
  }

  return { workbook, sheets, settings, config };
}

/**
 * Generate and download a styled multi-tab workbook with ExcelJS.
 *
 * @param {object} masterData
 * @param {object|Array} timetable `{ sessions, baseline, generatedAt }`
 * @param {object} [options] tab selection, 24-hour labels and file name
 */
export async function exportWorkbook(masterData, timetable, options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('Excel download is only available in the browser.');
  }

  const { workbook, sheets, settings, config } = await buildWorkbook(masterData, timetable, options);

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: EXCEL_MIME });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  const customName = slugify(config.fileName);
  anchor.download = customName
    ? `${customName}.xlsx`
    : `timetable-${slugify(settings.departmentName) || 'department'}-${dateStamp()}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return sheets;
}
