/**
 * Local-storage usage estimate for the semester archive.
 *
 * Browsers expose no exact localStorage quota, so this reports the bytes this
 * app has written and compares them against the common 5 MB allowance. It is a
 * warning aid, not a guarantee.
 */

export const STORAGE_BUDGET_BYTES = 5 * 1024 * 1024;

const KEY_PREFIXES = [
  'timetable-studio.',
  'timetable_semesters',
  'proxyHistory',
];

function hasStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

function byteLength(value) {
  if (typeof TextEncoder !== 'undefined') {
    return new TextEncoder().encode(value).length;
  }
  return unescape(encodeURIComponent(value)).length;
}

/** @returns {{ bytes: number, budget: number, percent: number, warning: boolean, keys: {key: string, bytes: number}[] }} */
export function measureStorage() {
  const empty = {
    bytes: 0,
    budget: STORAGE_BUDGET_BYTES,
    percent: 0,
    warning: false,
    critical: false,
    keys: [],
  };
  if (!hasStorage()) return empty;

  const keys = [];
  let bytes = 0;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (!key) continue;
      if (!KEY_PREFIXES.some((prefix) => key.startsWith(prefix))) continue;
      const value = window.localStorage.getItem(key) ?? '';
      const size = byteLength(key) + byteLength(value);
      keys.push({ key, bytes: size });
      bytes += size;
    }
  } catch {
    return empty;
  }

  keys.sort((first, second) => second.bytes - first.bytes);
  const percent = (bytes / STORAGE_BUDGET_BYTES) * 100;

  return {
    bytes,
    budget: STORAGE_BUDGET_BYTES,
    percent,
    warning: percent >= 80,
    critical: percent >= 95,
    keys,
  };
}

export function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(2)} MB`;
}

/** Human-readable key name for the storage table. */
export function describeStorageKey(key) {
  if (key === 'timetable_semesters') return 'Semester archive';
  if (key.startsWith('timetable-studio.timetable')) return 'Saved timetable';
  if (key.startsWith('timetable-studio.master-data')) return 'Master data & backup';
  if (key.startsWith('timetable-studio.print-settings')) return 'Print settings';
  if (key.startsWith('timetable-studio.semester.current')) return 'Active semester pointer';
  if (key === 'proxyHistory') return 'Proxy history';
  return key;
}
