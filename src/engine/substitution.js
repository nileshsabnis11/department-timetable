/**
 * Absence / substitution assistant.
 *
 * Pure functions: given the current timetable and master data, find every
 * session taught by an absent faculty member and rank the colleagues who could
 * cover it without creating a clash, breaking availability, or exceeding a
 * weekly load limit.
 */

const PRACTICAL = 'Practical';

const key = (...parts) => parts.join('|');

function teachingEntries(session) {
  const slotIds = Array.isArray(session.slotIds) ? session.slotIds : [];
  if (session.type === PRACTICAL) {
    const entries = [];
    for (const batch of session.batches ?? []) {
      if (!batch.facultyId) continue;
      entries.push({ facultyId: batch.facultyId, batchId: batch.batchId });
    }
    return entries;
  }
  return session.facultyId ? [{ facultyId: session.facultyId, batchId: null }] : [];
}

/** Weekly scheduled hours per faculty id, counting every parallel batch. */
export function facultyScheduledHours(sessions) {
  const hours = new Map();
  for (const session of sessions) {
    const slotCount = (session.slotIds ?? []).length;
    for (const entry of teachingEntries(session)) {
      hours.set(entry.facultyId, (hours.get(entry.facultyId) ?? 0) + slotCount);
    }
  }
  return hours;
}

function buildOccupancy(sessions) {
  const busy = new Set();
  for (const session of sessions) {
    for (const slotId of session.slotIds ?? []) {
      for (const entry of teachingEntries(session)) {
        busy.add(key(entry.facultyId, session.dayId, slotId));
      }
    }
  }
  return busy;
}

/** Faculty availability maps are keyed "DAY:SLOT" (see src/lib/time.js). */
function isAvailable(member, dayId, slotIds) {
  return slotIds.every(
    (slotId) => member?.unavailableSlots?.[`${dayId}:${slotId}`] !== true,
  );
}

function hasCapacity(member, currentHours, extraHours) {
  const max = Number(member?.maxWeeklyLoad);
  if (!Number.isFinite(max) || max <= 0) return true;
  return currentHours + extraHours <= max;
}

function sortCandidates(candidates) {
  return candidates.sort((first, second) => {
    const firstLoad = first.maxWeeklyLoad > 0 ? first.hours / first.maxWeeklyLoad : first.hours;
    const secondLoad =
      second.maxWeeklyLoad > 0 ? second.hours / second.maxWeeklyLoad : second.hours;
    return (
      firstLoad - secondLoad ||
      first.hours - second.hours ||
      String(first.shortCode).localeCompare(String(second.shortCode))
    );
  });
}

/**
 * @param {object[]} sessions current timetable sessions
 * @param {object} masterData master data (faculty, timeGrid)
 * @param {string[]} absentFacultyIds faculty members who are absent
 * @returns {{ entries: object[], absentFaculty: object[] }}
 */
export function suggestSubstitutions(sessions = [], masterData = {}, absentFacultyIds = []) {
  const faculty = Array.isArray(masterData.faculty) ? masterData.faculty : [];
  const facultyById = new Map(faculty.map((member) => [member.id, member]));
  const absent = new Set(absentFacultyIds.filter(Boolean));
  const hours = facultyScheduledHours(sessions);
  const entries = [];

  for (const session of sessions) {
    const slotIds = Array.isArray(session.slotIds) ? session.slotIds : [];
    if (slotIds.length === 0) continue;

    const affected = teachingEntries(session).filter((entry) => absent.has(entry.facultyId));
    if (affected.length === 0) continue;

    // The affected session itself must not block its own replacement, but every
    // other session does.
    const otherSessions = sessions.filter((item) => item.id !== session.id);
    const busy = buildOccupancy(otherSessions);

    for (const entry of affected) {
      const absentMember = facultyById.get(entry.facultyId);
      const usedInSession = new Set(
        teachingEntries(session)
          .map((item) => item.facultyId)
          .filter((facultyId) => facultyId !== entry.facultyId),
      );

      const candidates = [];
      for (const member of faculty) {
        if (absent.has(member.id)) continue;
        if (member.id === entry.facultyId) continue;
        if (usedInSession.has(member.id)) continue;

        const free = slotIds.every(
          (slotId) => !busy.has(key(member.id, session.dayId, slotId)),
        );
        if (!free) continue;
        if (!isAvailable(member, session.dayId, slotIds)) continue;

        const currentHours = hours.get(member.id) ?? 0;
        if (!hasCapacity(member, currentHours, slotIds.length)) continue;

        candidates.push({
          facultyId: member.id,
          name: member.name,
          shortCode: member.shortCode,
          hours: currentHours,
          maxWeeklyLoad: Number(member.maxWeeklyLoad) || 0,
        });
      }

      entries.push({
        key: key(session.id, entry.batchId ?? 'theory'),
        sessionId: session.id,
        batchId: entry.batchId,
        isPractical: session.type === PRACTICAL,
        subjectCode: session.subjectCode,
        subjectName: session.subjectName,
        divisionName: session.divisionName,
        dayId: session.dayId,
        dayLabel: session.dayLabel,
        slotIds: [...slotIds],
        slotLabels: (session.slotLabels ?? []).length
          ? [...session.slotLabels]
          : [...slotIds],
        absentFacultyId: entry.facultyId,
        absentFacultyName: absentMember?.name ?? entry.facultyId,
        absentFacultyShortCode: absentMember?.shortCode ?? '',
        candidates: sortCandidates(candidates),
      });
    }
  }

  return {
    entries,
    absentFaculty: [...absent]
      .map((facultyId) => facultyById.get(facultyId))
      .filter(Boolean),
  };
}

/**
 * Cover as many absences as possible in one pass.
 *
 * Candidates are recomputed after every assignment, so a substitute chosen for
 * one session can never make a later one clash or exceed a weekly load. Returns
 * the resulting sessions plus an honest count of what was covered.
 *
 * @param {Record<string, string>} [preferred] key → facultyId chosen in the UI
 */
export function planSubstitutions(
  sessions = [],
  masterData = {},
  absentFacultyIds = [],
  preferred = {},
) {
  let next = sessions;
  const handled = new Set();
  const uncovered = [];
  let applied = 0;

  for (let step = 0; step < 200; step += 1) {
    const { entries } = suggestSubstitutions(next, masterData, absentFacultyIds);
    const entry = entries.find((item) => !handled.has(item.key));
    if (!entry) break;
    handled.add(entry.key);

    const candidate =
      entry.candidates.find((item) => item.facultyId === preferred[entry.key]) ??
      entry.candidates[0];
    if (!candidate) {
      uncovered.push(entry);
      continue;
    }

    next = applySubstitution(
      next,
      {
        sessionId: entry.sessionId,
        batchId: entry.batchId,
        facultyId: candidate.facultyId,
      },
      masterData,
    );
    applied += 1;
  }

  return { sessions: next, applied, uncovered };
}

/**
 * Apply one substitution to a session list. Returns a new array; the session
 * keeps its id, slot and room, and only the faculty fields change.
 */
export function applySubstitution(sessions, substitution, masterData = {}) {
  const { sessionId, batchId = null, facultyId } = substitution ?? {};
  const member = (masterData.faculty ?? []).find((item) => item.id === facultyId);
  if (!sessionId || !member) return sessions;

  return sessions.map((session) => {
    if (session.id !== sessionId) return session;

    if (session.type === PRACTICAL) {
      return {
        ...session,
        batches: (session.batches ?? []).map((batch) =>
          batch.batchId === batchId
            ? {
                ...batch,
                facultyId: member.id,
                facultyName: member.name,
                facultyShortCode: member.shortCode,
              }
            : batch,
        ),
      };
    }

    return {
      ...session,
      facultyId: member.id,
      facultyName: member.name,
      facultyShortCode: member.shortCode,
    };
  });
}
