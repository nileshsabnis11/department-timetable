import { createEmptyMasterData } from '../data/defaultConfig.js';
import { SCHEMA_VERSION, STORAGE_KEY } from '../data/types.js';

const SECTIONS = ['timeGrid', 'divisions', 'rooms', 'faculty', 'subjects'];

/** Copy of the last payload that could not be read with the current schema. */
export const MASTER_DATA_BACKUP_KEY = 'timetable-studio.master-data.backup.v1';

function hasStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

function preserveRaw(raw) {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(MASTER_DATA_BACKUP_KEY, raw);
    return true;
  } catch {
    return false;
  }
}

/** Keep only known sections and fill in anything a partial payload omits. */
function normalizeMasterData(parsed) {
  const fallback = createEmptyMasterData();
  const data = { ...fallback, ...parsed, schemaVersion: SCHEMA_VERSION };

  for (const section of SECTIONS) {
    if (!data[section] || typeof data[section] !== 'object') {
      data[section] = fallback[section];
    }
  }

  const timeGrid = data.timeGrid;
  if (!Array.isArray(timeGrid.workingDays)) timeGrid.workingDays = fallback.timeGrid.workingDays;
  if (!Array.isArray(timeGrid.slots)) timeGrid.slots = fallback.timeGrid.slots;
  if (!Array.isArray(timeGrid.breaks)) timeGrid.breaks = [];

  for (const section of ['divisions', 'rooms', 'faculty', 'subjects', 'students']) {
    if (!Array.isArray(data[section])) data[section] = [];
  }

  // Added after v1 shipped: older backups simply have no fixed slots.
  if (!Array.isArray(data.fixedSlots)) data.fixedSlots = [];
  // Added later: legacy parallel elective baskets (kept so old backups load).
  if (!Array.isArray(data.electiveGroups)) data.electiveGroups = [];

  // Added with student elective choices: older payloads have no roster.
  data.students = data.students
    .filter((student) => student && typeof student === 'object')
    .map((student) => ({
      ...student,
      choices:
        student.choices && typeof student.choices === 'object' && !Array.isArray(student.choices)
          ? { ...student.choices }
          : {},
    }));

  // Added with Parallel Elective Groups: older subjects have no group field.
  data.subjects = data.subjects.map((subject) =>
    subject && typeof subject === 'object'
      ? {
          ...subject,
          electiveGroup:
            typeof subject.electiveGroup === 'string' ? subject.electiveGroup : '',
        }
      : subject,
  );

  return data;
}

/**
 * Read persisted master data together with a notice explaining anything that
 * needed repair. Nothing is silently thrown away: an unreadable payload is
 * copied to MASTER_DATA_BACKUP_KEY first.
 */
export function loadMasterDataWithNotice() {
  const fallback = createEmptyMasterData();
  if (!hasStorage()) return { data: fallback, notice: null };

  let raw;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return { data: fallback, notice: null };
  }
  if (!raw) return { data: fallback, notice: null };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const preserved = preserveRaw(raw);
    return {
      data: fallback,
      notice: {
        type: 'corrupt',
        preserved,
        message: `Saved Master Data could not be read as JSON. ${
          preserved ? 'A copy was kept in this browser.' : 'No backup copy could be made.'
        } Starting from an empty dataset.`,
      },
    };
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    const preserved = preserveRaw(raw);
    return {
      data: fallback,
      notice: {
        type: 'corrupt',
        preserved,
        message: `Saved Master Data is not a valid dataset. ${
          preserved ? 'A copy was kept in this browser.' : 'No backup copy could be made.'
        } Starting from an empty dataset.`,
      },
    };
  }

  const savedVersion = Number(parsed.schemaVersion);

  if (Number.isFinite(savedVersion) && savedVersion > SCHEMA_VERSION) {
    const preserved = preserveRaw(raw);
    return {
      data: fallback,
      notice: {
        type: 'newer',
        preserved,
        message: `Saved Master Data uses schema v${savedVersion}, newer than this app (v${SCHEMA_VERSION}). ${
          preserved ? 'A copy was kept in this browser.' : ''
        } Update the app to keep using it, or clear the data to start fresh.`,
      },
    };
  }

  if (savedVersion !== SCHEMA_VERSION) {
    const preserved = preserveRaw(raw);
    const data = normalizeMasterData(parsed);
    saveMasterData(data);
    return {
      data,
      notice: {
        type: 'migrated',
        preserved,
        message: `Master Data was upgraded from schema v${
          Number.isFinite(savedVersion) ? savedVersion : 'unknown'
        } to v${SCHEMA_VERSION}. Missing sections were filled with defaults.`,
      },
    };
  }

  return { data: normalizeMasterData(parsed), notice: null };
}

/** Read persisted master data, falling back to a clean default dataset. */
export function loadMasterData() {
  return loadMasterDataWithNotice().data;
}

let lastStorageError = null;

/** Most recent failed Master Data write, so the UI can warn instead of losing edits. */
export function getLastStorageError() {
  return lastStorageError;
}

/**
 * Persist Master Data. Returns false when the browser refused the write (full
 * quota, private mode, blocked storage) so callers can warn the user: the
 * in-memory state stays usable, but the edit would be lost on reload.
 */
export function saveMasterData(data) {
  if (!hasStorage()) {
    lastStorageError = {
      key: STORAGE_KEY,
      message:
        'This browser cannot store data, so Master Data changes will be lost when the page closes. Export a JSON backup.',
    };
    return false;
  }
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    lastStorageError = null;
    return true;
  } catch {
    lastStorageError = {
      key: STORAGE_KEY,
      message:
        'Master Data could not be saved — browser storage is full or blocked. Export a JSON backup now, then archive or delete an old semester.',
    };
    return false;
  }
}

/** Recover the preserved copy of a payload that could not be loaded. */
export function restorePreservedMasterData() {
  if (!hasStorage()) return null;
  try {
    const raw = window.localStorage.getItem(MASTER_DATA_BACKUP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const data = normalizeMasterData(parsed);
    saveMasterData(data);
    return data;
  } catch {
    return null;
  }
}
