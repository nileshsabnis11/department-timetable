import {
  DEFAULT_WEIGHTS,
  normalizeWeights,
} from '../lib/schedulerWeights.js';

/**
 * Coordinator preferences for the soft constraints. Stored per browser (not per
 * semester) so a scheduling profile carries across terms.
 */

export const SCHEDULER_SETTINGS_KEY = 'timetable-studio.scheduler-settings.v1';

export function loadSchedulerSettings() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return { weights: { ...DEFAULT_WEIGHTS } };
    }
    const raw = window.localStorage.getItem(SCHEDULER_SETTINGS_KEY);
    if (!raw) return { weights: { ...DEFAULT_WEIGHTS } };
    const parsed = JSON.parse(raw);
    return { weights: normalizeWeights(parsed?.weights) };
  } catch {
    return { weights: { ...DEFAULT_WEIGHTS } };
  }
}

export function saveSchedulerSettings(settings) {
  const normalized = { weights: normalizeWeights(settings?.weights) };
  try {
    if (typeof window === 'undefined' || !window.localStorage) return normalized;
    window.localStorage.setItem(SCHEDULER_SETTINGS_KEY, JSON.stringify(normalized));
  } catch {
    // Storage unavailable: the current session still generates with these weights.
  }
  return normalized;
}
