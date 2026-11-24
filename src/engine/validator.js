import { computePracticalBlocks } from '../lib/time.js';
import { FIXED_SLOT_TYPE } from '../lib/fixedSlots.js';
import { enrollmentBySubject as computeEnrollmentBySubject } from '../lib/electiveEnrollment.js';

/**
 * Independent timetable validator.
 *
 * It shares no state with the generator — it only reads a finished timetable
 * and the master data it came from, then re-derives every hard constraint.
 *
 * Canonical session shape produced by `generateTimetable`:
 *   Theory:    { id, type: 'Theory', dayId, slotIds: [slotId], facultyId, roomId, ... }
 *   Practical: { id, type: 'Practical', dayId, slotIds: [slotIdA, slotIdB],
 *                batches: [{ batchId, facultyId, roomId }], ... }
 *
 * Hours are measured in 60-minute slots (the PRD grid definition).
 */

const THEORY = 'Theory';
const PRACTICAL = 'Practical';
const LAB = 'Lab';

const key = (...parts) => parts.join('|');

function batchStrengthOf(batch) {
  const strength = Number(batch?.strength);
  return Number.isFinite(strength) && strength > 0 ? strength : 0;
}

function divisionStrengthOf(division) {
  const explicit = Number(division?.strength);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const batches = Array.isArray(division?.batches) ? division.batches : [];
  return batches.reduce((total, batch) => total + batchStrengthOf(batch), 0);
}

function roomCapacity(room) {
  const capacity = Number(room?.capacity);
  return Number.isFinite(capacity) && capacity > 0 ? capacity : 0;
}

function unique(values) {
  return [...new Set(values.filter((value) => value != null && value !== ''))];
}

/** Mirrors the scheduler: different elective groups must not share a slot. */
function separatesElectiveGroups(division) {
  return division?.separateElectiveGroups !== false;
}

function teachingEntries(session) {
  const slotIds = Array.isArray(session.slotIds) ? session.slotIds : [];
  if (session.type === PRACTICAL) {
    const batches = Array.isArray(session.batches) ? session.batches : [];
    const entries = [];
    for (const batch of batches) {
      for (const slotId of slotIds) {
        entries.push({
          slotId,
          facultyId: batch.facultyId,
          facultyName: batch.facultyName,
          roomId: batch.roomId,
          roomName: batch.roomName,
          batchId: batch.batchId,
        });
      }
    }
    return entries;
  }

  return slotIds.map((slotId) => ({
    slotId,
    facultyId: session.facultyId,
    facultyName: session.facultyName,
    roomId: session.roomId,
    roomName: session.roomName,
    batchId: null,
  }));
}

/**
 * @param {object|object[]} timetable `{ sessions: [...] }` or a session array.
 * @param {object} masterData Phase 1 master data.
 */
export function validateTimetable(timetable, masterData = {}) {
  const sessions = Array.isArray(timetable)
    ? timetable
    : Array.isArray(timetable?.sessions)
      ? timetable.sessions
      : [];

  const timeGrid = masterData?.timeGrid ?? {};
  const slots = Array.isArray(timeGrid.slots) ? timeGrid.slots : [];
  const slotById = new Map(slots.map((slot) => [slot.id, slot]));
  const days = new Map(
    (Array.isArray(timeGrid.workingDays) ? timeGrid.workingDays : []).map((day) => [
      day.id,
      day,
    ]),
  );
  const rooms = new Map(
    (Array.isArray(masterData.rooms) ? masterData.rooms : []).map((room) => [
      room.id,
      room,
    ]),
  );
  const faculty = new Map(
    (Array.isArray(masterData.faculty) ? masterData.faculty : []).map((member) => [
      member.id,
      member,
    ]),
  );
  const divisions = new Map(
    (Array.isArray(masterData.divisions) ? masterData.divisions : []).map(
      (division) => [division.id, division],
    ),
  );
  const subjects = new Map(
    (Array.isArray(masterData.subjects) ? masterData.subjects : []).map((subject) => [
      subject.id,
      subject,
    ]),
  );

  const blocks = computePracticalBlocks(slots, timeGrid.breaks ?? []);
  const validBlocks = new Map(blocks.map((block) => [block.slotIds.join('|'), block]));
  const enrollment = computeEnrollmentBySubject(masterData);

  const dayLabel = (dayId) => days.get(dayId)?.label ?? dayId;
  const slotLabel = (slotId) => slotById.get(slotId)?.label ?? slotId;
  const facultyName = (facultyId) =>
    faculty.get(facultyId)?.name ?? facultyId ?? 'Unknown faculty';
  const roomName = (roomId) => rooms.get(roomId)?.name ?? roomId ?? 'Unknown room';

  const structureViolations = [];
  const facultyClashes = [];
  const roomClashes = [];
  const divisionClashes = [];
  const missingHours = [];
  const brokenPracticals = [];
  const facultyAvailabilityViolations = [];
  const loadViolations = [];
  const capacityViolations = [];

  // ---- Structure & reference checks -------------------------------------
  // Fixed institutional blocks are valid occupied slots, not subject sessions:
  // they need a real day, slot and division, but no subject, faculty or room.
  for (const session of sessions) {
    const isFixed = session.type === FIXED_SLOT_TYPE;
    const label = `${session.subjectCode ?? session.subjectId ?? 'session'} (${session.id})`;
    if (!session.dayId || !days.has(session.dayId)) {
      structureViolations.push({ sessionId: session.id, message: `${label} uses an unknown day "${session.dayId}".` });
    }
    if (!Array.isArray(session.slotIds) || session.slotIds.length === 0) {
      structureViolations.push({ sessionId: session.id, message: `${label} has no slots.` });
    } else {
      for (const slotId of session.slotIds) {
        if (!slotById.has(slotId)) {
          structureViolations.push({ sessionId: session.id, message: `${label} uses an unknown slot "${slotId}".` });
        }
      }
    }
    if (!isFixed && (!session.subjectId || !subjects.has(session.subjectId))) {
      structureViolations.push({ sessionId: session.id, message: `${label} references an unknown subject.` });
    }
    if (!session.divisionId || !divisions.has(session.divisionId)) {
      structureViolations.push({ sessionId: session.id, message: `${label} references an unknown division.` });
    }

    if (session.type === THEORY) {
      if (!session.facultyId || !faculty.has(session.facultyId)) {
        structureViolations.push({ sessionId: session.id, message: `${label} has no valid faculty member.` });
      }
      if (!session.roomId || !rooms.has(session.roomId)) {
        structureViolations.push({ sessionId: session.id, message: `${label} has no valid room.` });
      }
    }

    if (session.type === PRACTICAL) {
      if (!Array.isArray(session.batches) || session.batches.length === 0) {
        structureViolations.push({ sessionId: session.id, message: `${label} has no batch assignments.` });
      }
      for (const batch of session.batches ?? []) {
        if (!batch.batchId) {
          structureViolations.push({ sessionId: session.id, message: `${label} has a batch without an id.` });
        }
        if (!batch.facultyId || !faculty.has(batch.facultyId)) {
          structureViolations.push({
            sessionId: session.id,
            message: `${label} batch ${batch.batchName ?? batch.batchId ?? '?'} has no valid faculty member.`,
          });
        }
        if (!batch.roomId || !rooms.has(batch.roomId)) {
          structureViolations.push({
            sessionId: session.id,
            message: `${label} batch ${batch.batchName ?? batch.batchId ?? '?'} has no valid room.`,
          });
        }
      }
    }
  }

  // ---- Faculty, room and division clashes -------------------------------
  const facultySlots = new Map();
  const roomSlots = new Map();
  const divisionSlots = new Map();
  const batchSlots = new Map();

  // A fixed lock scoped to every division is stored once per division, so the
  // same teacher or room legitimately repeats in the same hour. Each lock is a
  // single booking, not one booking per division.
  const fixedFacultyBooked = new Set();
  const fixedRoomBooked = new Set();

  for (const session of sessions) {
    for (const slotId of session.slotIds ?? []) {
      const divisionEntry = {
        sessionId: session.id,
        subjectCode: session.subjectCode,
        subjectName: session.subjectName,
        type: session.type,
        electiveGroup: String(session.electiveGroup ?? '').trim(),
        batchIds: (session.batches ?? []).map((batch) => batch.batchId),
      };
      const divisionKey = key(session.dayId, slotId, session.divisionId);
      if (!divisionSlots.has(divisionKey)) divisionSlots.set(divisionKey, []);
      divisionSlots.get(divisionKey).push(divisionEntry);

      for (const batch of session.type === PRACTICAL ? session.batches ?? [] : []) {
        const batchKey = key(session.dayId, slotId, batch.batchId);
        if (!batchSlots.has(batchKey)) batchSlots.set(batchKey, []);
        batchSlots.get(batchKey).push({
          ...divisionEntry,
          batchName: batch.batchName,
        });
      }
    }

    for (const entry of teachingEntries(session)) {
      let repeatedFixedFaculty = false;
      let repeatedFixedRoom = false;

      if (session.type === FIXED_SLOT_TYPE) {
        const lockId = session.fixedSlotId ?? session.id;
        const facultyLockKey = key(lockId, session.dayId, entry.slotId, entry.facultyId);
        const roomLockKey = key(lockId, session.dayId, entry.slotId, entry.roomId);
        repeatedFixedFaculty = fixedFacultyBooked.has(facultyLockKey);
        repeatedFixedRoom = fixedRoomBooked.has(roomLockKey);
        fixedFacultyBooked.add(facultyLockKey);
        fixedRoomBooked.add(roomLockKey);
      }

      if (entry.facultyId && !repeatedFixedFaculty) {
        const facultyKey = key(session.dayId, entry.slotId, entry.facultyId);
        if (!facultySlots.has(facultyKey)) facultySlots.set(facultyKey, []);
        facultySlots.get(facultyKey).push({
          sessionId: session.id,
          subjectCode: session.subjectCode,
          subjectName: session.subjectName,
          batchId: entry.batchId,
          divisionId: session.divisionId,
        });
      }
      if (entry.roomId && !repeatedFixedRoom) {
        const roomKey = key(session.dayId, entry.slotId, entry.roomId);
        if (!roomSlots.has(roomKey)) roomSlots.set(roomKey, []);
        roomSlots.get(roomKey).push({
          sessionId: session.id,
          subjectCode: session.subjectCode,
          batchId: entry.batchId,
          divisionId: session.divisionId,
        });
      }
    }
  }

  for (const [composite, entries] of facultySlots) {
    if (entries.length < 2) continue;
    const [dayId, slotId, facultyId] = composite.split('|');
    facultyClashes.push({
      dayId,
      dayLabel: dayLabel(dayId),
      slotId,
      slotLabel: slotLabel(slotId),
      facultyId,
      facultyName: facultyName(facultyId),
      sessionIds: unique(entries.map((entry) => entry.sessionId)),
      subjects: unique(entries.map((entry) => entry.subjectCode)),
      message: `${facultyName(facultyId)} is booked twice on ${dayLabel(dayId)} ${slotLabel(slotId)} (${unique(
        entries.map((entry) => entry.subjectCode),
      ).join(', ')}).`,
    });
  }

  for (const [composite, entries] of roomSlots) {
    if (entries.length < 2) continue;
    const [dayId, slotId, roomId] = composite.split('|');
    roomClashes.push({
      dayId,
      dayLabel: dayLabel(dayId),
      slotId,
      slotLabel: slotLabel(slotId),
      roomId,
      roomName: roomName(roomId),
      sessionIds: unique(entries.map((entry) => entry.sessionId)),
      message: `${roomName(roomId)} hosts two sessions on ${dayLabel(dayId)} ${slotLabel(slotId)}.`,
    });
  }

  for (const [composite, entries] of divisionSlots) {
    if (entries.length < 2) continue;

    // Parallel electives are the one legal way for a division to run several
    // theory options in the same hour. Two shapes are legal:
    //   • every entry shares the same non-empty elective group (one basket), or
    //   • every entry belongs to some elective group and the division opted out
    //     of separating groups (disjoint cohorts that may meet together).
    const [dayId, slotId, divisionId] = composite.split('|');
    const division = divisions.get(divisionId);
    const groupLabels = new Set(entries.map((entry) => entry.electiveGroup));
    const allTheory = entries.every((entry) => entry.type === THEORY);
    const allGrouped = entries.every((entry) => entry.electiveGroup !== '');
    const sameGroup = groupLabels.size === 1;
    const isParallelElective =
      allTheory &&
      allGrouped &&
      (sameGroup || !separatesElectiveGroups(division));
    if (isParallelElective) continue;

    const clashMessage = `${division?.name ?? divisionId} has two sessions on ${dayLabel(
      dayId,
    )} ${slotLabel(slotId)} (${unique(entries.map((entry) => entry.subjectCode)).join(', ')}).`;
    const groupMessage =
      allTheory &&
      allGrouped &&
      !sameGroup &&
      separatesElectiveGroups(division)
        ? `${division?.name ?? divisionId} runs elective groups ${[...groupLabels]
            .map((label) => `“${label}”`)
            .join(' and ')} in the same slot on ${dayLabel(dayId)} ${slotLabel(
            slotId,
          )}; a student cannot take an option from both. Move one group, or allow groups to share slots in Master Data → Divisions.`
        : clashMessage;

    divisionClashes.push({
      kind: 'division',
      dayId,
      dayLabel: dayLabel(dayId),
      slotId,
      slotLabel: slotLabel(slotId),
      divisionId,
      divisionName: division?.name ?? divisionId,
      sessionIds: unique(entries.map((entry) => entry.sessionId)),
      subjects: unique(entries.map((entry) => entry.subjectCode)),
      message: groupMessage,
    });
  }

  for (const [composite, entries] of batchSlots) {
    if (entries.length < 2) continue;
    const [dayId, slotId, batchId] = composite.split('|');
    divisionClashes.push({
      kind: 'batch',
      dayId,
      dayLabel: dayLabel(dayId),
      slotId,
      slotLabel: slotLabel(slotId),
      batchId,
      divisionId: entries[0]?.divisionId ?? '',
      sessionIds: unique(entries.map((entry) => entry.sessionId)),
      subjects: unique(entries.map((entry) => entry.subjectCode)),
      message: `${entries[0]?.batchName ?? batchId} has two sessions on ${dayLabel(dayId)} ${slotLabel(
        slotId,
      )}.`,
    });
  }

  // ---- Required weekly hours -------------------------------------------
  for (const subject of masterData.subjects ?? []) {
    const division = divisions.get(subject.divisionId);
    const expected = Number(subject.weeklyHours) || 0;

    if (subject.type === PRACTICAL) {
      const divisionBatches = Array.isArray(division?.batches) ? division.batches : [];
      for (const batch of divisionBatches) {
        const actual = sessions
          .filter(
            (session) =>
              session.type === PRACTICAL &&
              session.subjectId === subject.id &&
              (session.batches ?? []).some((item) => item.batchId === batch.id),
          )
          .reduce((sum, session) => sum + (session.slotIds?.length ?? 0), 0);

        if (actual !== expected) {
          missingHours.push({
            scope: 'batch',
            subjectId: subject.id,
            subjectCode: subject.code,
            subjectName: subject.name,
            divisionId: subject.divisionId,
            divisionName: division?.name ?? subject.divisionId,
            batchId: batch.id,
            batchName: batch.name,
            expectedHours: expected,
            actualHours: actual,
            message: `${division?.name ?? subject.divisionId} ${batch.name} ${subject.name}: ${actual} of ${expected} practical hours scheduled.`,
          });
        }
      }
      continue;
    }

    const actual = sessions
      .filter((session) => session.type === THEORY && session.subjectId === subject.id)
      .reduce((sum, session) => sum + (session.slotIds?.length ?? 0), 0);

    if (actual !== expected) {
      missingHours.push({
        scope: 'subject',
        subjectId: subject.id,
        subjectCode: subject.code,
        subjectName: subject.name,
        divisionId: subject.divisionId,
        divisionName: division?.name ?? subject.divisionId,
        expectedHours: expected,
        actualHours: actual,
        message: `${division?.name ?? subject.divisionId} ${subject.name} (theory): ${actual} of ${expected} hours scheduled.`,
      });
    }
  }

  // ---- Practical block integrity ---------------------------------------
  for (const session of sessions) {
    if (session.type !== PRACTICAL) continue;

    const reasons = [];
    const slotIds = Array.isArray(session.slotIds) ? session.slotIds : [];

    if (slotIds.length !== 2) {
      reasons.push(`occupies ${slotIds.length} slot(s) instead of a 2-hour block`);
    } else {
      const blockKey = slotIds.join('|');
      if (!validBlocks.has(blockKey)) {
        const [first, second] = slotIds;
        const firstSlot = slotById.get(first);
        const secondSlot = slotById.get(second);
        const contiguous =
          firstSlot && secondSlot && firstSlot.end && firstSlot.end === secondSlot.start;
        const breakAfterFirst = (timeGrid.breaks ?? []).some(
          (item) => item.afterSlotId === first,
        );
        if (!contiguous) reasons.push('its two slots are not consecutive');
        if (breakAfterFirst) reasons.push('it crosses a lunch/recess break');
        if (contiguous && !breakAfterFirst) reasons.push('it does not start on a valid practical block boundary');
      }
    }

    const division = divisions.get(session.divisionId);
    const requiredBatches = Array.isArray(division?.batches) ? division.batches : [];
    const assignedBatches = Array.isArray(session.batches) ? session.batches : [];
    const assignedIds = assignedBatches.map((batch) => batch.batchId);

    for (const batch of requiredBatches) {
      if (!assignedIds.includes(batch.id)) reasons.push(`batch ${batch.name} is missing`);
    }
    if (assignedIds.length !== unique(assignedIds).length) {
      reasons.push('a batch is assigned more than once');
    }

    const batchFaculty = assignedBatches.map((batch) => batch.facultyId).filter(Boolean);
    if (batchFaculty.length !== unique(batchFaculty).length) {
      reasons.push('the same faculty member covers more than one parallel batch');
    }

    const batchRooms = assignedBatches.map((batch) => batch.roomId).filter(Boolean);
    if (batchRooms.length !== unique(batchRooms).length) {
      reasons.push('the same lab is used by more than one parallel batch');
    }
    for (const batch of assignedBatches) {
      if (batch.roomId && rooms.get(batch.roomId)?.type !== LAB) {
        reasons.push(`batch ${batch.batchName ?? batch.batchId} uses ${roomName(batch.roomId)}, which is not a lab`);
      }
    }

    if (reasons.length > 0) {
      brokenPracticals.push({
        sessionId: session.id,
        subjectId: session.subjectId,
        subjectCode: session.subjectCode,
        divisionId: session.divisionId,
        slotIds,
        reasons,
        message: `${session.divisionName ?? session.divisionId} ${session.subjectName ?? session.subjectCode}: ${unique(
          reasons,
        ).join('; ')}.`,
      });
    }
  }

  // ---- Hard constraints the generator could silently miss ---------------
  for (const session of sessions) {
    for (const entry of teachingEntries(session)) {
      const member = faculty.get(entry.facultyId);
      if (!member) continue;
      const blocked =
        member.unavailableSlots?.[`${session.dayId}:${entry.slotId}`] === true;
      if (blocked) {
        facultyAvailabilityViolations.push({
          sessionId: session.id,
          facultyId: member.id,
          facultyName: member.name,
          dayId: session.dayId,
          slotId: entry.slotId,
          message: `${member.shortCode ?? member.name} is unavailable on ${dayLabel(
            session.dayId,
          )} ${slotLabel(entry.slotId)} but is scheduled for ${session.subjectCode}.`,
        });
      }
    }
  }

  const facultyHours = new Map();
  const fixedHoursCounted = new Set();
  for (const session of sessions) {
    for (const entry of teachingEntries(session)) {
      if (!entry.facultyId) continue;
      if (session.type === FIXED_SLOT_TYPE) {
        const lockKey = key(
          session.fixedSlotId ?? session.id,
          session.dayId,
          entry.slotId,
          entry.facultyId,
        );
        if (fixedHoursCounted.has(lockKey)) continue;
        fixedHoursCounted.add(lockKey);
      }
      facultyHours.set(entry.facultyId, (facultyHours.get(entry.facultyId) ?? 0) + 1);
    }
  }
  for (const [facultyId, hours] of facultyHours) {
    const member = faculty.get(facultyId);
    if (!member) continue;
    const max = Number(member.maxWeeklyLoad);
    if (Number.isFinite(max) && max > 0 && hours > max) {
      loadViolations.push({
        facultyId,
        facultyName: member.name,
        shortCode: member.shortCode,
        hours,
        maxWeeklyLoad: max,
        message: `${member.shortCode ?? member.name} is scheduled for ${hours} hours, above the ${max}-hour weekly limit.`,
      });
    }
  }

  // ---- Room capacity vs configured batch strength -----------------------
  for (const session of sessions) {
    // A locked institutional block is not a full-class lecture; its optional
    // room is a venue choice, not a capacity constraint.
    if (session.type === FIXED_SLOT_TYPE) continue;

    if (session.type === PRACTICAL) {
      const division = divisions.get(session.divisionId);
      const batches = Array.isArray(division?.batches) ? division.batches : [];
      for (const assigned of session.batches ?? []) {
        const batch = batches.find((item) => item.id === assigned.batchId);
        const required = batchStrengthOf(batch);
        const room = rooms.get(assigned.roomId);
        const capacity = roomCapacity(room);
        if (required > 0 && capacity > 0 && capacity < required) {
          capacityViolations.push({
            sessionId: session.id,
            roomId: assigned.roomId,
            roomName: roomName(assigned.roomId),
            scope: 'batch',
            batchId: assigned.batchId,
            batchName: assigned.batchName ?? batch?.name ?? assigned.batchId,
            required,
            capacity,
            message: `${roomName(assigned.roomId)} seats ${capacity} but batch ${
              assigned.batchName ?? assigned.batchId
            } has ${required} students.`,
          });
        }
      }
      continue;
    }

    const division = divisions.get(session.divisionId);
    const subject = subjects.get(session.subjectId);
    const enrolled = subject?.electiveGroup
      ? enrollment.get(subject.id) ?? 0
      : 0;
    const required = enrolled > 0 ? enrolled : divisionStrengthOf(division);
    const room = rooms.get(session.roomId);
    const capacity = roomCapacity(room);
    if (required > 0 && capacity > 0 && capacity < required) {
      capacityViolations.push({
        sessionId: session.id,
        roomId: session.roomId,
        roomName: roomName(session.roomId),
        scope: enrolled > 0 ? 'elective-option' : 'division',
        divisionId: session.divisionId,
        divisionName: division?.name ?? session.divisionId,
        required,
        capacity,
        message: enrolled > 0
          ? `${roomName(session.roomId)} seats ${capacity} but elective option ${session.subjectCode} has ${required} students.`
          : `${roomName(session.roomId)} seats ${capacity} but ${division?.name ?? session.divisionId} has ${required} students.`,
      });
    }
  }

  const isValid =
    facultyClashes.length === 0 &&
    roomClashes.length === 0 &&
    divisionClashes.length === 0 &&
    missingHours.length === 0 &&
    brokenPracticals.length === 0 &&
    facultyAvailabilityViolations.length === 0 &&
    loadViolations.length === 0 &&
    capacityViolations.length === 0 &&
    structureViolations.length === 0;

  return {
    isValid,
    facultyClashes,
    roomClashes,
    divisionClashes,
    missingHours,
    brokenPracticals,
    facultyAvailabilityViolations,
    loadViolations,
    capacityViolations,
    structureViolations,
    counts: {
      sessions: sessions.length,
      theorySessions: sessions.filter((session) => session.type === THEORY).length,
      practicalSessions: sessions.filter((session) => session.type === PRACTICAL).length,
      fixedSessions: sessions.filter((session) => session.type === FIXED_SLOT_TYPE).length,
      facultyClashes: facultyClashes.length,
      roomClashes: roomClashes.length,
      divisionClashes: divisionClashes.length,
      missingHours: missingHours.length,
      brokenPracticals: brokenPracticals.length,
      capacityViolations: capacityViolations.length,
    },
  };
}

export default validateTimetable;
