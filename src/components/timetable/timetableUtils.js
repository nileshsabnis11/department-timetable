import { computePracticalBlocks } from '../../lib/time.js';
import { FIXED_SLOT_TYPE } from '../../lib/fixedSlots.js';
import { enrollmentBySubject } from '../../lib/electiveEnrollment.js';
import { validateTimetable } from '../../engine/validator.js';

export function enabledDays(masterData) {
  return (masterData?.timeGrid?.workingDays ?? []).filter((day) => day.enabled !== false);
}

export function timeSlots(masterData) {
  return masterData?.timeGrid?.slots ?? [];
}

export function practicalBlocks(masterData) {
  return computePracticalBlocks(
    timeSlots(masterData),
    masterData?.timeGrid?.breaks ?? [],
  );
}

/** Slot rows interleaved with full-width break rows, in display order. */
export function buildTimeRows(masterData) {
  const slots = timeSlots(masterData);
  const breaks = masterData?.timeGrid?.breaks ?? [];
  const rows = [];

  for (let index = 0; index < slots.length; index += 1) {
    const slot = slots[index];
    rows.push({ type: 'slot', slot, index });
    for (const item of breaks.filter((brk) => brk.afterSlotId === slot.id)) {
      rows.push({ type: 'break', break: item });
    }
  }

  return rows;
}

/** Stable key for a parallel elective option, or '' for a regular session. */
export function electiveGroupKey(session) {
  if (!session || session.type !== 'Theory') return '';
  const label = String(session.electiveGroup ?? '').trim();
  return label ? `${session.divisionId}|${label}` : '';
}

/**
 * Map a session list onto day/slot positions. `starts` is keyed by the first
 * slot index so a 2-hour practical renders once with rowSpan=2, `occupants`
 * lists every session that begins in a cell (so no option is silently hidden),
 * `coverage` marks every occupied slot, and `parallel` groups the options of
 * one elective unit that share a cell.
 */
export function buildCoverage(sessions, masterData) {
  const slots = timeSlots(masterData);
  const indexById = new Map(slots.map((slot, index) => [slot.id, index]));
  const starts = new Map();
  const occupants = new Map();
  const coverage = new Map();
  const parallel = new Map();

  for (const session of sessions) {
    const slotIds = session.slotIds ?? [];
    const firstIndex = indexById.get(slotIds[0]);
    if (firstIndex == null) continue;

    const positionKey = `${session.dayId}|${firstIndex}`;
    if (!occupants.has(positionKey)) occupants.set(positionKey, []);
    occupants.get(positionKey).push(session);

    const group = electiveGroupKey(session);
    if (group) {
      const parallelKey = `${positionKey}|${group}`;
      if (!parallel.has(parallelKey)) parallel.set(parallelKey, []);
      parallel.get(parallelKey).push(session);
      if (!starts.has(positionKey)) starts.set(positionKey, session);
    } else {
      starts.set(positionKey, session);
    }

    for (const slotId of slotIds) {
      coverage.set(`${session.dayId}|${slotId}`, session);
    }
  }

  for (const options of parallel.values()) {
    options.sort((a, b) => String(a.subjectCode).localeCompare(String(b.subjectCode)));
  }

  return { starts, occupants, coverage, parallel };
}

export function applyPlacement(session, dayId, slotIds, masterData) {
  const days = masterData?.timeGrid?.workingDays ?? [];
  const slots = timeSlots(masterData);
  const day = days.find((item) => item.id === dayId);
  const slotObjects = slotIds
    .map((slotId) => slots.find((slot) => slot.id === slotId))
    .filter(Boolean);

  if (!day || slotObjects.length !== slotIds.length || slotObjects.length === 0) {
    return null;
  }

  const first = slotObjects[0];
  const last = slotObjects[slotObjects.length - 1];

  return {
    ...session,
    dayId: day.id,
    dayLabel: day.label ?? day.id,
    slotIds: [...slotIds],
    slotLabels: slotObjects.map((slot) => slot.label),
    start: first.start,
    end: last.end,
    hours: slotIds.length,
  };
}

/**
 * A manual move must never make the plan worse. The caller gets the full
 * conflict list so a swap that would book a teacher or a room twice is refused
 * before it reaches the timetable (and the saved plan).
 */
function guardMove(before, after, masterData) {
  const beforeInfo = buildClashInfo(
    validateTimetable({ sessions: before }, masterData),
    before,
  );
  const afterInfo = buildClashInfo(
    validateTimetable({ sessions: after }, masterData),
    after,
  );
  if (afterInfo.count <= beforeInfo.count) return { ok: true, sessions: after };

  const introduced = afterInfo.messages.find(
    (message) => !beforeInfo.messages.includes(message),
  );
  return {
    ok: false,
    reason: `That move would create a clash — ${introduced ?? 'the faculty member or room is already booked in that slot.'}`,
  };
}

/**
 * Swap or move a session.
 *
 * `target` is `{ sessionId }` for a filled cell, or `{ dayId, slotIds }` for an
 * empty destination. Practicals may only land on a complete valid 2-hour block
 * and may only be swapped with another practical, so they can never split
 * across lunch or recess. Any move that would leave more clashes than it
 * started with is refused instead of being written to the timetable.
 */
export function swapOrMove(sessions, sourceId, target, masterData) {
  const source = sessions.find((session) => session.id === sourceId);
  if (!source) return { ok: false, reason: 'The selected session no longer exists.' };
  if (source.type === FIXED_SLOT_TYPE) {
    return {
      ok: false,
      reason: `“${source.label ?? 'Fixed Slot'}” is a locked Fixed Slot and cannot be moved.`,
    };
  }

  const targetSession = target.sessionId
    ? sessions.find((session) => session.id === target.sessionId)
    : null;
  if (targetSession?.type === FIXED_SLOT_TYPE) {
    return {
      ok: false,
      reason: `“${targetSession.label ?? 'Fixed Slot'}” is a locked Fixed Slot and cannot be overwritten.`,
    };
  }
  const targetDayId = targetSession ? targetSession.dayId : target.dayId;
  const targetSlotIds = targetSession ? targetSession.slotIds : target.slotIds ?? [];

  // A parallel elective is one unit: every option moves into the same slot.
  const groupKey = electiveGroupKey(source);
  if (groupKey) {
    const group = sessions.filter(
      (session) =>
        electiveGroupKey(session) === groupKey &&
        session.dayId === source.dayId &&
        session.slotIds.join('|') === source.slotIds.join('|'),
    );
    if (targetSession && group.some((session) => session.id === targetSession.id)) {
      return { ok: false, reason: 'That option is already part of this elective group.' };
    }
    if (targetSession) {
      return {
        ok: false,
        reason: 'A parallel elective group can only move into an empty slot.',
      };
    }
    if (targetSlotIds.length !== 1) {
      return { ok: false, reason: 'A parallel elective group occupies exactly one slot.' };
    }

    const moved = group.map((session) =>
      applyPlacement(session, targetDayId, targetSlotIds, masterData),
    );
    if (moved.some((session) => !session)) {
      return { ok: false, reason: 'That placement does not exist in the current Time Grid.' };
    }

    const movedById = new Map(moved.map((session) => [session.id, session]));
    return guardMove(
      sessions,
      sessions.map((session) => movedById.get(session.id) ?? session),
      masterData,
    );
  }

  if (source.type === 'Practical') {
    if (targetSlotIds.length !== 2) {
      return {
        ok: false,
        reason: 'A practical can only move to a complete 2-hour block.',
      };
    }
    const isBlock = practicalBlocks(masterData).some(
      (block) => block.slotIds.join('|') === targetSlotIds.join('|'),
    );
    if (!isBlock) {
      return {
        ok: false,
        reason:
          'Practicals must occupy Slots 1–2, 3–4 or 5–6 so they never split across a break.',
      };
    }
    if (targetSession && targetSession.type !== 'Practical') {
      return {
        ok: false,
        reason: 'A practical block cannot be swapped with a single theory lecture.',
      };
    }
  } else {
    if (targetSlotIds.length !== 1) {
      return { ok: false, reason: 'A theory lecture occupies exactly one slot.' };
    }
    if (targetSession && targetSession.type !== 'Theory') {
      return {
        ok: false,
        reason: 'A theory lecture cannot move into a practical block.',
      };
    }
  }

  const nextSource = applyPlacement(source, targetDayId, targetSlotIds, masterData);
  if (!nextSource) {
    return { ok: false, reason: 'That placement does not exist in the current Time Grid.' };
  }

  const updated = sessions.map((session) =>
    session.id === source.id ? nextSource : session,
  );
  if (!targetSession) return guardMove(sessions, updated, masterData);

  const nextTarget = applyPlacement(
    targetSession,
    source.dayId,
    source.slotIds,
    masterData,
  );
  if (!nextTarget) {
    return { ok: false, reason: 'That placement does not exist in the current Time Grid.' };
  }

  return guardMove(
    sessions,
    updated.map((session) =>
      session.id === targetSession.id ? nextTarget : session,
    ),
    masterData,
  );
}

/** Clash messages grouped by session id, plus a total and de-duplicated list. */
export function buildClashInfo(validation, sessions = []) {
  const bySession = new Map();
  const messages = [];
  let count = 0;

  const addMessage = (message) => {
    if (message && !messages.includes(message)) messages.push(message);
  };

  const addSessionMessage = (sessionIds, message) => {
    addMessage(message);
    for (const sessionId of sessionIds ?? []) {
      if (!bySession.has(sessionId)) bySession.set(sessionId, []);
      if (message && !bySession.get(sessionId).includes(message)) {
        bySession.get(sessionId).push(message);
      }
    }
  };

  for (const clash of validation?.facultyClashes ?? []) {
    count += 1;
    addSessionMessage(clash.sessionIds, clash.message);
  }
  for (const clash of validation?.roomClashes ?? []) {
    count += 1;
    addSessionMessage(clash.sessionIds, clash.message);
  }
  for (const clash of validation?.divisionClashes ?? []) {
    count += 1;
    addSessionMessage(clash.sessionIds, clash.message);
  }
  for (const item of validation?.brokenPracticals ?? []) {
    count += 1;
    addSessionMessage([item.sessionId], item.message);
  }
  for (const item of validation?.structureViolations ?? []) {
    count += 1;
    addSessionMessage([item.sessionId], item.message);
  }
  for (const item of validation?.facultyAvailabilityViolations ?? []) {
    count += 1;
    addSessionMessage([item.sessionId], item.message);
  }
  for (const item of validation?.capacityViolations ?? []) {
    count += 1;
    addSessionMessage([item.sessionId], item.message);
  }
  for (const item of validation?.loadViolations ?? []) {
    count += 1;
    addMessage(item.message);
    const affected = sessions.filter((session) =>
      session.type === 'Practical'
        ? (session.batches ?? []).some((batch) => batch.facultyId === item.facultyId)
        : session.facultyId === item.facultyId,
    );
    for (const session of affected) addSessionMessage([session.id], item.message);
  }
  for (const item of validation?.missingHours ?? []) {
    count += 1;
    addMessage(item.message);
  }

  return { count, messages, bySession };
}

function strengthOfDivision(division) {
  const explicit = Number(division?.strength);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return (division?.batches ?? []).reduce((total, batch) => {
    const strength = Number(batch?.strength);
    return total + (Number.isFinite(strength) && strength > 0 ? strength : 0);
  }, 0);
}

/**
 * Room-capacity warnings for one session.
 *
 * Theory lectures must seat the whole division; each parallel lab batch must
 * fit its own lab. Unknown strengths/capacities never warn.
 */
export function capacityWarnings(session, masterData) {
  const warnings = [];
  const rooms = new Map((masterData?.rooms ?? []).map((room) => [room.id, room]));
  const divisions = new Map(
    (masterData?.divisions ?? []).map((division) => [division.id, division]),
  );
  const subjects = new Map(
    (masterData?.subjects ?? []).map((subject) => [subject.id, subject]),
  );
  const enrollment = enrollmentBySubject(masterData ?? {});

  const check = (roomId, strength, audience) => {
    const room = rooms.get(roomId);
    const capacity = Number(room?.capacity);
    if (!room || !(strength > 0) || !(capacity > 0)) return;
    if (capacity < strength) {
      warnings.push(
        `${audience} has ${strength} students but ${room.name} seats ${capacity}.`,
      );
    }
  };

  if (session.type === 'Practical') {
    const divisionBatches = divisions.get(session.divisionId)?.batches ?? [];
    for (const batch of session.batches ?? []) {
      const configured = divisionBatches.find((item) => item.id === batch.batchId);
      const strength = Number(configured?.strength ?? batch?.strength) || 0;
      check(batch.roomId, strength, batch.batchName ?? batch.batchId ?? 'Batch');
    }
    return warnings;
  }

  const division = divisions.get(session.divisionId);
  const enrolled = enrollment.get(session.subjectId) ?? 0;
  const subject = subjects.get(session.subjectId);
  check(
    session.roomId,
    enrolled > 0 ? enrolled : strengthOfDivision(division),
    subject?.electiveGroup
      ? `${subject.code ?? 'Elective option'} (${subject.electiveGroup})`
      : division?.name ?? session.divisionName ?? 'Division',
  );
  return warnings;
}

export function facultyHours(sessions, facultyId) {
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
        const lockKey = `${session.fixedSlotId ?? session.id}|${session.dayId}`;
        if (countedFixed.has(lockKey)) continue;
        countedFixed.add(lockKey);
      }
      hours += session.slotIds?.length ?? 0;
    }
  }
  return hours;
}

export function roomHours(sessions, roomId) {
  let hours = 0;
  const countedFixed = new Set();
  for (const session of sessions) {
    if (session.type === 'Practical') {
      const bookings = (session.batches ?? []).filter(
        (batch) => batch.roomId === roomId,
      ).length;
      hours += bookings * (session.slotIds?.length ?? 0);
    } else if (session.roomId === roomId) {
      if (session.type === FIXED_SLOT_TYPE) {
        const lockKey = `${session.fixedSlotId ?? session.id}|${session.dayId}`;
        if (countedFixed.has(lockKey)) continue;
        countedFixed.add(lockKey);
      }
      hours += session.slotIds?.length ?? 0;
    }
  }
  return hours;
}
