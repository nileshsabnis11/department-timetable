import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateTimetable } from '../engine/scheduler.js';
import { validateTimetable } from '../engine/validator.js';
import { FIXED_SLOT_TYPE } from '../lib/fixedSlots.js';
import { newId } from '../lib/id.js';

export const TIMETABLE_STORAGE_KEY = 'timetable-studio.timetable.v1';

/** At least 10 swaps must be undoable; keep a comfortable margin. */
const MAX_HISTORY = 20;

/** Saved plans are full session snapshots; cap them so storage stays sane. */
const MAX_VERSIONS = 15;

const cloneSessions = (sessions) => JSON.parse(JSON.stringify(sessions ?? []));

function loadStoredTimetable() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const raw = window.localStorage.getItem(TIMETABLE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.sessions) || parsed.sessions.length === 0) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/** Returns false when the browser refused the write, so the UI can warn. */
function persist(payload) {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return false;
    window.localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    // Private mode / full storage: keep the in-memory timetable usable.
    return false;
  }
}

function versionLabel(versions) {
  const stamp = new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
  return `Version ${versions.length + 1} · ${stamp}`;
}

/**
 * Generated-timetable store.
 *
 * The generator stays the only source of a baseline timetable; manual edits are
 * applied to a copy of that baseline, re-validated on every render, and stored
 * in localStorage together with the baseline so "Reset to Generated" survives
 * a page reload.
 *
 * Pinned sessions carry `pinned: true` and are handed back to the engine on the
 * next generation, which schedules the remaining hours around them. Saved
 * versions are full snapshots the coordinator can restore or publish.
 */
export function useTimetable(masterData) {
  const [initial] = useState(loadStoredTimetable);
  const [sessions, setSessions] = useState(() => initial?.sessions ?? []);
  const [baseline, setBaseline] = useState(
    () => initial?.baseline ?? initial?.sessions ?? [],
  );
  const [stats, setStats] = useState(() => initial?.stats ?? null);
  const [generatedAt, setGeneratedAt] = useState(() => initial?.generatedAt ?? null);
  const [versions, setVersions] = useState(() => initial?.versions ?? []);
  const [publishedVersionId, setPublishedVersionId] = useState(
    () => initial?.publishedVersionId ?? null,
  );
  const [history, setHistory] = useState([]);
  const [storageWarning, setStorageWarning] = useState('');

  useEffect(() => {
    if (sessions.length === 0 && !stats) return;
    const saved = persist({
      version: 2,
      sessions,
      baseline,
      stats,
      generatedAt,
      versions,
      publishedVersionId,
    });
    setStorageWarning(
      saved
        ? ''
        : 'This timetable could not be saved in this browser — storage is full or blocked. Export an Excel or JSON backup before closing the tab.',
    );
  }, [sessions, baseline, stats, generatedAt, versions, publishedVersionId]);

  const validation = useMemo(
    () => validateTimetable({ sessions }, masterData),
    [sessions, masterData],
  );

  const pinnedSessions = useMemo(
    () => sessions.filter((session) => session.pinned),
    [sessions],
  );

  const applyGeneration = useCallback((result) => {
    const nextSessions = result.timetable.sessions;

    setSessions(nextSessions);
    setBaseline(nextSessions);
    setStats({
      durationMs: result.stats.durationMs,
      attempts: result.stats.attempts,
      softScore: result.stats.softScore,
      success: result.success,
      conflicts: result.conflicts,
      suggestions: result.suggestions ?? [],
      pinnedSessions: result.stats.pinnedSessions ?? 0,
      fixedSlots: result.stats.fixedSlots ?? 0,
      electiveSessions: result.stats.electiveSessions ?? 0,
      weights: result.stats.weights ?? null,
    });
    setGeneratedAt(new Date().toISOString());
    setHistory([]);

    return result;
  }, []);

  const generate = useCallback(
    (options = {}) => {
      const result = generateTimetable(masterData, {
        lockedSessions: sessions.filter((session) => session.pinned),
        weights: options.weights,
      });
      return applyGeneration(result);
    },
    [masterData, sessions, applyGeneration],
  );

  /**
   * Regenerate only one division or one faculty member, keeping every other
   * session exactly where it is. Outside sessions are handed to the engine as
   * locked, so the remaining hours are scheduled around them.
   */
  const regenerateScope = useCallback(
    (scope = {}, options = {}) => {
      // Parallel elective groups span faculty: always rebuild every member of a
      // group so all options can claim the same slot again.
      const electiveSubjects = new Set();
      for (const subject of masterData?.subjects ?? []) {
        if (String(subject.electiveGroup ?? '').trim()) electiveSubjects.add(subject.id);
      }

      const lockedSessions = sessions.filter((session) => {
        if (session.type === FIXED_SLOT_TYPE) return false; // seeded from Master Data
        if (session.subjectId && electiveSubjects.has(session.subjectId)) return false;
        if (scope.divisionId) return session.divisionId !== scope.divisionId;
        if (scope.facultyId) {
          const teaches =
            session.type === 'Practical'
              ? (session.batches ?? []).some(
                  (batch) => batch.facultyId === scope.facultyId,
                )
              : session.facultyId === scope.facultyId;
          return !teaches;
        }
        return false;
      });

      const result = generateTimetable(masterData, {
        lockedSessions,
        weights: options.weights,
      });
      return applyGeneration(result);
    },
    [masterData, sessions, applyGeneration],
  );

  const applySessions = useCallback(
    (nextSessions) => {
      setHistory((previous) => [...previous.slice(-(MAX_HISTORY - 1)), sessions]);
      setSessions(nextSessions);
    },
    [sessions],
  );

  const undo = useCallback(() => {
    if (history.length === 0) return false;
    const previous = history[history.length - 1];
    setSessions(previous);
    setHistory(history.slice(0, -1));
    return true;
  }, [history]);

  const togglePin = useCallback((sessionId) => {
    setSessions((previous) =>
      previous.map((session) =>
        session.id === sessionId
          ? { ...session, pinned: !session.pinned }
          : session,
      ),
    );
  }, []);

  const clearPins = useCallback(() => {
    setSessions((previous) =>
      previous.map((session) => {
        if (!session.pinned) return session;
        const { pinned, ...rest } = session;
        return rest;
      }),
    );
  }, []);

  const resetToGenerated = useCallback(() => {
    if (baseline.length === 0) return false;
    setHistory((previous) => [...previous.slice(-(MAX_HISTORY - 1)), sessions]);
    setSessions(baseline);
    return true;
  }, [baseline, sessions]);

  const saveVersion = useCallback(
    (label) => {
      if (sessions.length === 0) return null;
      const version = {
        id: newId('VER'),
        label: (label ?? '').trim() || versionLabel(versions),
        createdAt: new Date().toISOString(),
        sessions: cloneSessions(sessions),
      };
      setVersions((previous) => [version, ...previous].slice(0, MAX_VERSIONS));
      return version;
    },
    [sessions, versions],
  );

  const restoreVersion = useCallback(
    (versionId) => {
      const version = versions.find((item) => item.id === versionId);
      if (!version) return false;
      const restored = cloneSessions(version.sessions);
      setHistory((previous) => [...previous.slice(-(MAX_HISTORY - 1)), sessions]);
      setSessions(restored);
      setBaseline(restored);
      return true;
    },
    [versions, sessions],
  );

  const deleteVersion = useCallback(
    (versionId) => {
      setVersions((previous) => previous.filter((item) => item.id !== versionId));
      setPublishedVersionId((previous) => (previous === versionId ? null : previous));
    },
    [],
  );

  const togglePublished = useCallback((versionId) => {
    setPublishedVersionId((previous) => (previous === versionId ? null : versionId));
  }, []);

  return {
    sessions,
    baseline,
    stats,
    generatedAt,
    validation,
    versions,
    publishedVersionId,
    pinnedSessions,
    generate,
    regenerateScope,
    applySessions,
    undo,
    togglePin,
    clearPins,
    resetToGenerated,
    saveVersion,
    restoreVersion,
    deleteVersion,
    togglePublished,
    canUndo: history.length > 0,
    canReset: baseline.length > 0,
    undoDepth: history.length,
    hasTimetable: sessions.length > 0,
    storageWarning,
  };
}
