import { useCallback, useState } from 'react';
import {
  DEFAULT_PRINT_SETTINGS,
  normalizePrintSettings,
} from '../../lib/printSettingsCore.js';

/** Phase 4B — print header and signatory settings. */

export { DEFAULT_PRINT_SETTINGS, normalizePrintSettings };

export const PRINT_SETTINGS_STORAGE_KEY = 'timetable-studio.print-settings.v1';

export function loadPrintSettings() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return normalizePrintSettings(DEFAULT_PRINT_SETTINGS);
    }
    const raw = window.localStorage.getItem(PRINT_SETTINGS_STORAGE_KEY);
    if (!raw) return normalizePrintSettings(DEFAULT_PRINT_SETTINGS);
    return normalizePrintSettings(JSON.parse(raw));
  } catch {
    return normalizePrintSettings(DEFAULT_PRINT_SETTINGS);
  }
}

export function persistPrintSettings(settings) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return;
    window.localStorage.setItem(PRINT_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage unavailable: the current session still prints with the new values.
  }
}

export function usePrintSettings() {
  const [settings, setSettings] = useState(loadPrintSettings);

  const saveSettings = useCallback((next) => {
    const normalized = normalizePrintSettings(next);
    setSettings(normalized);
    persistPrintSettings(normalized);
  }, []);

  const resetSettings = useCallback(() => {
    const defaults = normalizePrintSettings(DEFAULT_PRINT_SETTINGS);
    setSettings(defaults);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(PRINT_SETTINGS_STORAGE_KEY);
      }
    } catch {
      // ignore storage errors
    }
    return defaults;
  }, []);

  return { settings, saveSettings, resetSettings };
}
