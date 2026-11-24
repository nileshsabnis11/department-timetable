import { createEmptyMasterData } from '../data/defaultConfig.js';
import { STORAGE_KEY } from '../data/types.js';
import { newId } from '../lib/id.js';
import {
  DEFAULT_PRINT_SETTINGS,
  normalizePrintSettings,
} from '../lib/printSettingsCore.js';

/**
 * Multi-semester archive & clone — storage layer.
 *
 * The running app keeps using its existing single-term keys
 * (`timetable-studio.master-data.v1`, `timetable-studio.timetable.v1`, print
 * settings and proxy history). A semester record is a snapshot of those keys,
 * so no export or UI feature needs to change.
 *
 * `timetable_semesters` holds the archive. `ACTIVE_SEMESTER_KEY` remembers which
 * record is currently loaded into the legacy keys; the active record is merged
 * from the live keys on load, while an archived record is never overwritten.
 * Pure storage helpers — no React, no DOM imports.
 */

export const SEMESTERS_STORAGE_KEY = 'timetable_semesters';
export const ACTIVE_SEMESTER_KEY = 'timetable-studio.semester.current.v1';

/** Kept in sync with `hooks/useTimetable` and `proxyManager`. */
const TIMETABLE_KEY = 'timetable-studio.timetable.v1';
const PRINT_SETTINGS_KEY = 'timetable-studio.print-settings.v1';
const PROXY_HISTORY_KEY = 'proxyHistory';

export const TERM_TYPES = Object.freeze(['Odd', 'Even']);
export const SEMESTER_STATUS = Object.freeze({ ACTIVE: 'Active', ARCHIVED: 'Archived' });

/** Used only when the browser has no saved term to migrate. */
export const DEFAULT_SEMESTER = Object.freeze({
  academicYear: '2026–27',
  termType: 'Even',
});

let lastStorageError = null;

/** Most recent failed write, so the UI can warn instead of failing silently. */
export function getLastStorageError() {
  return lastStorageError;
}

export function clearLastStorageError() {
  lastStorageError = null;
}

const clone = (value) => JSON.parse(JSON.stringify(value));

function hasStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

function readKey(key) {
  if (!hasStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeKey(key, value) {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(key, value);
    lastStorageError = null;
    return true;
  } catch (error) {
    lastStorageError = {
      key,
      message:
        'This browser could not save the semester archive — storage may be full. Export a JSON backup and remove an old semester.',
    };
    void error;
    return false;
  }
}

function removeKey(key) {
  if (!hasStorage()) return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

function parseJson(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Fill anything a partial/older master data payload omits. */
export function normalizeMasterDataShape(value) {
  const fallback = createEmptyMasterData();
  if (!isPlainObject(value)) return fallback;

  const data = { ...fallback, ...value };
  const grid = isPlainObject(data.timeGrid) ? data.timeGrid : fallback.timeGrid;
  data.timeGrid = {
    workingDays: Array.isArray(grid.workingDays)
      ? grid.workingDays
      : fallback.timeGrid.workingDays,
    slots: Array.isArray(grid.slots) ? grid.slots : fallback.timeGrid.slots,
    breaks: Array.isArray(grid.breaks) ? grid.breaks : [],
  };

  for (const section of [
    'divisions',
    'rooms',
    'faculty',
    'subjects',
    'students',
    'fixedSlots',
    'electiveGroups',
  ]) {
    if (!Array.isArray(data[section])) data[section] = [];
  }

  // Student elective choices were added with Parallel Elective Groups.
  data.students = data.students
    .filter((student) => isPlainObject(student))
    .map((student) => ({
      ...student,
      choices: isPlainObject(student.choices) ? { ...student.choices } : {},
    }));

  // Backups written before Parallel Elective Groups simply have no field.
  data.subjects = data.subjects.map((subject) =>
    isPlainObject(subject)
      ? {
          ...subject,
          electiveGroup:
            typeof subject.electiveGroup === 'string' ? subject.electiveGroup : '',
        }
      : subject,
  );

  return data;
}

/** A saved timetable snapshot; an empty/absent plan means "no timetable yet". */
function normalizeTimetable(value) {
  if (!isPlainObject(value)) return null;
  if (!Array.isArray(value.sessions) || value.sessions.length === 0) return null;
  return value;
}

function normalizeProxyHistory(value) {
  return Array.isArray(value) ? value.filter((record) => isPlainObject(record)) : [];
}

function normalizeYear(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function normalizeTerm(value) {
  const term = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (term.startsWith('odd')) return 'Odd';
  if (term.startsWith('even')) return 'Even';
  return '';
}

/** "2026–27" + "Even" → "2026–27 Even Semester". */
export function semesterName(academicYear, termType) {
  return `${academicYear} ${termType} Semester`;
}

/** Compact selector label: "2026–27 Even". */
export function semesterShortLabel(semester) {
  if (!semester) return '—';
  return `${semester.academicYear} ${semester.termType}`;
}

export function semesterSummary(semester) {
  const masterData = semester?.masterData ?? {};
  return {
    divisions: (masterData.divisions ?? []).length,
    faculty: (masterData.faculty ?? []).length,
    rooms: (masterData.rooms ?? []).length,
    subjects: (masterData.subjects ?? []).length,
    fixedSlots: (masterData.fixedSlots ?? []).length,
    electiveGroups: new Set(
      (masterData.subjects ?? [])
        .map((subject) => String(subject.electiveGroup ?? '').trim())
        .filter(Boolean),
    ).size,
    sessions: semester?.timetable?.sessions?.length ?? 0,
  };
}

/** Header fields follow the semester unless the coordinator overrode them. */
export function applySemesterHeader(settings, semester) {
  const normalized = normalizePrintSettings(settings);
  if (normalized.overrideSemesterHeader || !semester) return normalized;
  return {
    ...normalized,
    academicYear: semester.academicYear,
    semester: `${semester.termType} Semester`,
  };
}

function normalizeSemester(value) {
  if (!isPlainObject(value)) return null;

  const savedSettings = normalizePrintSettings(value.printSettings);
  const academicYear =
    normalizeYear(value.academicYear) ||
    normalizeYear(savedSettings.academicYear) ||
    DEFAULT_SEMESTER.academicYear;
  const termType =
    (TERM_TYPES.includes(value.termType) ? value.termType : '') ||
    normalizeTerm(savedSettings.semester) ||
    DEFAULT_SEMESTER.termType;
  const name =
    (typeof value.name === 'string' && value.name.trim()) ||
    semesterName(academicYear, termType);

  return {
    id: typeof value.id === 'string' && value.id ? value.id : newId('SEM'),
    name,
    academicYear,
    termType,
    status:
      value.status === SEMESTER_STATUS.ARCHIVED
        ? SEMESTER_STATUS.ARCHIVED
        : SEMESTER_STATUS.ACTIVE,
    createdAt:
      typeof value.createdAt === 'string' && value.createdAt
        ? value.createdAt
        : new Date().toISOString(),
    masterData: normalizeMasterDataShape(value.masterData),
    timetable: normalizeTimetable(value.timetable),
    printSettings: savedSettings,
    proxyHistory: normalizeProxyHistory(value.proxyHistory),
  };
}

/** Everything the running app currently has in its legacy storage keys. */
export function readAppSnapshot() {
  const masterData = parseJson(readKey(STORAGE_KEY));
  return {
    masterData: isPlainObject(masterData) ? normalizeMasterDataShape(masterData) : null,
    timetable: normalizeTimetable(parseJson(readKey(TIMETABLE_KEY))),
    printSettings: normalizePrintSettings(parseJson(readKey(PRINT_SETTINGS_KEY))),
    proxyHistory: normalizeProxyHistory(parseJson(readKey(PROXY_HISTORY_KEY))),
  };
}

/** Load a semester's snapshot into the keys the existing app already reads. */
export function writeAppSnapshot(semester) {
  if (!semester) return;
  writeKey(STORAGE_KEY, JSON.stringify(normalizeMasterDataShape(semester.masterData)));

  const timetable = normalizeTimetable(semester.timetable);
  if (timetable) writeKey(TIMETABLE_KEY, JSON.stringify(timetable));
  else removeKey(TIMETABLE_KEY);

  writeKey(
    PRINT_SETTINGS_KEY,
    JSON.stringify(applySemesterHeader(semester.printSettings, semester)),
  );

  const history = normalizeProxyHistory(semester.proxyHistory);
  if (history.length > 0) writeKey(PROXY_HISTORY_KEY, JSON.stringify(history));
  else removeKey(PROXY_HISTORY_KEY);
}

function persistSemesters(semesters) {
  return writeKey(SEMESTERS_STORAGE_KEY, JSON.stringify(semesters));
}

function persistCurrent(id) {
  if (id) writeKey(ACTIVE_SEMESTER_KEY, id);
  else removeKey(ACTIVE_SEMESTER_KEY);
}

function makeSemester(snapshot, { academicYear, termType, status = SEMESTER_STATUS.ACTIVE }) {
  const year = normalizeYear(academicYear) || DEFAULT_SEMESTER.academicYear;
  const term = TERM_TYPES.includes(termType) ? termType : DEFAULT_SEMESTER.termType;

  return {
    id: newId('SEM'),
    name: semesterName(year, term),
    academicYear: year,
    termType: term,
    status,
    createdAt: new Date().toISOString(),
    masterData: snapshot.masterData
      ? normalizeMasterDataShape(snapshot.masterData)
      : createEmptyMasterData(),
    timetable: normalizeTimetable(snapshot.timetable),
    printSettings: normalizePrintSettings({
      ...snapshot.printSettings,
      academicYear: year,
      semester: `${term} Semester`,
    }),
    proxyHistory: normalizeProxyHistory(snapshot.proxyHistory),
  };
}

/** Read the academic year/term the department was already using. */
function deriveExistingTerm(snapshot) {
  const settings = normalizePrintSettings(snapshot.printSettings);
  const yearMatch = String(settings.academicYear ?? '').match(/\d{4}\s*[–—−-]\s*\d{2,4}/);
  return {
    academicYear: yearMatch ? yearMatch[0] : DEFAULT_SEMESTER.academicYear,
    termType: normalizeTerm(settings.semester) || DEFAULT_SEMESTER.termType,
  };
}

/** First run: turn the current app data into one active semester. */
function migrateLegacyData() {
  const snapshot = readAppSnapshot();
  const existing = readKey(SEMESTERS_STORAGE_KEY);
  if (existing) writeKey(`${SEMESTERS_STORAGE_KEY}.backup`, existing);

  const semester = makeSemester(snapshot, deriveExistingTerm(snapshot));
  persistSemesters([semester]);
  persistCurrent(semester.id);
  return { semesters: [semester], currentId: semester.id };
}

/**
 * Read the archive, migrating current browser data on first use and merging
 * the live app keys into the active semester so edits are never lost.
 */
export function loadSemesterState() {
  if (!hasStorage()) {
    const semester = makeSemester(
      { masterData: createEmptyMasterData(), printSettings: DEFAULT_PRINT_SETTINGS },
      DEFAULT_SEMESTER,
    );
    return { semesters: [semester], currentId: semester.id };
  }

  const raw = readKey(SEMESTERS_STORAGE_KEY);
  if (!raw) return migrateLegacyData();

  const parsed = parseJson(raw);
  if (!Array.isArray(parsed) || parsed.length === 0) return migrateLegacyData();

  const seen = new Set();
  const semesters = [];
  for (const item of parsed) {
    const semester = normalizeSemester(item);
    if (!semester) continue;
    if (seen.has(semester.id)) semester.id = newId('SEM');
    seen.add(semester.id);
    semesters.push(semester);
  }
  if (semesters.length === 0) return migrateLegacyData();

  let currentId = readKey(ACTIVE_SEMESTER_KEY);
  const current =
    semesters.find((semester) => semester.id === currentId) ??
    semesters.find((semester) => semester.status === SEMESTER_STATUS.ACTIVE) ??
    semesters[0];
  currentId = current.id;

  persistCurrent(currentId);
  return syncActiveFromApp({ semesters, currentId });
}

/** Persisted archive without migrating or merging — used by analytics/reporting. */
export function readSemesterArchive() {
  const parsed = parseJson(readKey(SEMESTERS_STORAGE_KEY));
  if (!Array.isArray(parsed)) return [];
  return parsed.map(normalizeSemester).filter(Boolean);
}

/**
 * Copy the live app state into the loaded semester when it is still Active.
 * Archived semesters are read-only, so their stored record is left untouched.
 */
export function syncActiveFromApp(state) {
  const current = state.semesters.find((semester) => semester.id === state.currentId);
  if (!current || current.status !== SEMESTER_STATUS.ACTIVE) return state;

  const snapshot = readAppSnapshot();
  if (!snapshot.masterData) return state;

  const semesters = state.semesters.map((semester) =>
    semester.id === current.id
      ? {
          ...semester,
          masterData: snapshot.masterData,
          timetable: snapshot.timetable,
          printSettings: snapshot.printSettings,
          proxyHistory: snapshot.proxyHistory,
        }
      : semester,
  );

  persistSemesters(semesters);
  persistCurrent(state.currentId);
  return { ...state, semesters };
}

/** Load a saved semester (Active or Archived) into the app immediately. */
export function activateSemester(state, id) {
  const flushed = syncActiveFromApp(state);
  const target = flushed.semesters.find((semester) => semester.id === id);
  if (!target) return flushed;

  writeAppSnapshot(target);
  persistSemesters(flushed.semesters);
  persistCurrent(target.id);
  return { ...flushed, currentId: target.id };
}

/** Archive / unarchive a semester without deleting anything. */
export function setSemesterStatus(state, id, status) {
  if (status !== SEMESTER_STATUS.ACTIVE && status !== SEMESTER_STATUS.ARCHIVED) {
    return state;
  }
  const flushed = syncActiveFromApp(state);
  const semesters = flushed.semesters.map((semester) =>
    semester.id === id ? { ...semester, status } : semester,
  );
  persistSemesters(semesters);
  return { ...flushed, semesters };
}

/**
 * Rename a term by editing its academic year and Odd/Even type. The display
 * name and (unless overridden) the printed header follow automatically.
 */
export function renameSemester(state, id, { academicYear, termType }) {
  const flushed = syncActiveFromApp(state);
  const semesters = flushed.semesters.map((semester) => {
    if (semester.id !== id) return semester;
    const year = normalizeYear(academicYear) || semester.academicYear;
    const term = TERM_TYPES.includes(termType) ? termType : semester.termType;
    return {
      ...semester,
      academicYear: year,
      termType: term,
      name: semesterName(year, term),
      printSettings: normalizePrintSettings({
        ...semester.printSettings,
        academicYear: year,
        semester: `${term} Semester`,
      }),
    };
  });

  persistSemesters(semesters);
  const target = semesters.find((semester) => semester.id === id);
  if (target && flushed.currentId === id) {
    writeKey(
      PRINT_SETTINGS_KEY,
      JSON.stringify(applySemesterHeader(target.printSettings, target)),
    );
  }
  return { ...flushed, semesters };
}

/** Deep-copy a semester as a new active working copy. */
export function duplicateSemester(state, id) {
  const flushed = syncActiveFromApp(state);
  const source = flushed.semesters.find((semester) => semester.id === id);
  if (!source) return flushed;

  const copy = {
    ...clone(source),
    id: newId('SEM'),
    name: `${source.name} (Copy)`,
    status: SEMESTER_STATUS.ACTIVE,
    createdAt: new Date().toISOString(),
  };

  const semesters = [...flushed.semesters, copy];
  persistSemesters(semesters);
  writeAppSnapshot(copy);
  persistCurrent(copy.id);
  return { semesters, currentId: copy.id };
}

/**
 * Import a JSON backup as its own semester instead of overwriting current work.
 */
export function importSemester(
  state,
  { masterData, timetable, academicYear, termType, printSettings, proxyHistory },
) {
  const flushed = syncActiveFromApp(state);
  const record = makeSemester(
    {
      masterData,
      timetable,
      printSettings: printSettings ?? DEFAULT_PRINT_SETTINGS,
      proxyHistory: proxyHistory ?? [],
    },
    { academicYear, termType, status: SEMESTER_STATUS.ACTIVE },
  );

  const semesters = [...flushed.semesters, record];
  persistSemesters(semesters);
  writeAppSnapshot(record);
  persistCurrent(record.id);
  return { semesters, currentId: record.id };
}

/**
 * Clone wizard: build a new term from an existing semester.
 *
 * @param {object} state
 * @param {object} input
 * @param {string} input.academicYear  e.g. "2027–28"
 * @param {'Odd'|'Even'} input.termType
 * @param {string} [input.cloneFromId] source semester id; omit to start blank
 * @param {object} [input.clone] carry-forward flags
 * @param {boolean} [input.clone.timeGrid]   Time Grid & Print Settings
 * @param {boolean} [input.clone.divisions]  Divisions & Lab Batches
 * @param {boolean} [input.clone.rooms]      Rooms & Labs
 * @param {boolean} [input.clone.faculty]    Faculty List
 * @param {boolean} [input.clone.subjects]   Subjects, Fixed Slots & Elective Groups
 * @param {boolean} [input.clone.resetFacultyAvailability]
 */
export function createSemester(state, input = {}) {
  const flushed = syncActiveFromApp(state);
  const source = input.cloneFromId
    ? flushed.semesters.find((semester) => semester.id === input.cloneFromId) ?? null
    : null;
  const flags = input.clone ?? {};
  const empty = createEmptyMasterData();
  const sourceData = source?.masterData ?? empty;

  const masterData = source
    ? {
        ...empty,
        timeGrid: flags.timeGrid
          ? clone(sourceData.timeGrid ?? empty.timeGrid)
          : empty.timeGrid,
        divisions: flags.divisions ? clone(sourceData.divisions ?? []) : [],
        rooms: flags.rooms ? clone(sourceData.rooms ?? []) : [],
        faculty: flags.faculty
          ? clone(sourceData.faculty ?? []).map((member) =>
              flags.resetFacultyAvailability
                ? { ...member, unavailableSlots: {} }
                : member,
            )
          : [],
        subjects: flags.subjects ? clone(sourceData.subjects ?? []) : [],
        students: flags.subjects ? clone(sourceData.students ?? []) : [],
        fixedSlots: flags.subjects ? clone(sourceData.fixedSlots ?? []) : [],
        electiveGroups: flags.subjects
          ? clone(sourceData.electiveGroups ?? [])
          : [],
      }
    : empty;

  const baseSettings = flags.timeGrid && source ? source.printSettings : DEFAULT_PRINT_SETTINGS;
  const record = makeSemester(
    {
      masterData,
      timetable: null,
      printSettings: baseSettings,
      proxyHistory: [],
    },
    {
      academicYear: input.academicYear,
      termType: input.termType,
      status: SEMESTER_STATUS.ACTIVE,
    },
  );

  const semesters = [...flushed.semesters, record];
  persistSemesters(semesters);
  writeAppSnapshot(record);
  persistCurrent(record.id);
  return { semesters, currentId: record.id };
}

/**
 * Delete a semester. The last remaining semester is always kept so the app
 * never loses its only copy of the department's data.
 */
export function deleteSemester(state, id) {
  if (state.semesters.length <= 1) return state;

  const flushed = syncActiveFromApp(state);
  const semesters = flushed.semesters.filter((semester) => semester.id !== id);
  if (semesters.length === flushed.semesters.length) return flushed;

  const currentId = flushed.currentId === id ? semesters[0].id : flushed.currentId;
  persistSemesters(semesters);
  persistCurrent(currentId);

  if (flushed.currentId === id) {
    writeAppSnapshot(semesters.find((semester) => semester.id === currentId));
  }
  return { semesters, currentId };
}
