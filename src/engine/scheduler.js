import { computePracticalBlocks } from '../lib/time.js';
import {
  FIXED_SLOT_ALL,
  describeFixedSlots,
  fixedSlotSession,
} from '../lib/fixedSlots.js';
import { normalizeWeights } from '../lib/schedulerWeights.js';
import { enrollmentBySubject as computeEnrollmentBySubject } from '../lib/electiveEnrollment.js';

/**
 * Standalone scheduling engine — pure and UI-independent.
 *
 * It never imports React, the DOM or localStorage. Input is the Phase 1 master
 * data object; output is a plain session list plus a conflict report.
 *
 * Two-stage, hardest-first search:
 *   Stage 1 — division-wide 2-hour practical blocks (all batches in parallel,
 *             distinct labs, distinct faculty).
 *   Stage 2 — 60-minute theory lectures into the remaining free slots.
 *
 * Practical staffing note: when a practical subject assigns a single faculty
 * member (the common case) but four batches must run in parallel with distinct
 * faculty, the engine keeps the assigned member for one batch and auto-staffs
 * the remaining batches from free, under-loaded faculty. Explicit per-batch
 * assignments in `subject.batchFaculty` are hard locks: a placement is rejected
 * unless the locked faculty member is free for the whole block. Only batches
 * left blank are auto-staffed. `requiredRoomId` is treated as a preferred lab,
 * because four parallel batches cannot share one lab.
 */

const THEORY = 'Theory';
const PRACTICAL = 'Practical';
const CLASSROOM = 'Classroom';
const LAB = 'Lab';

const DEFAULT_STEP_CAP = 50000;

const key = (...parts) => parts.join('|');

function clampHours(value, fallback = 1, max = 40) {
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours <= 0) return fallback;
  return Math.min(Math.floor(hours), max);
}

/** Optional lab-batch headcount; 0/unknown means "no capacity constraint". */
function batchStrengthOf(batch) {
  const strength = Number(batch?.strength);
  return Number.isFinite(strength) && strength > 0 ? strength : 0;
}

/** Students a division lecture must seat: explicit strength, else the batch sum. */
function divisionStrengthOf(division) {
  const explicit = Number(division?.strength);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const batches = Array.isArray(division?.batches) ? division.batches : [];
  return batches.reduce((total, batch) => total + batchStrengthOf(batch), 0);
}

function roomFitsCapacity(room, required) {
  if (!required || required <= 0) return true;
  const capacity = Number(room?.capacity);
  if (!Number.isFinite(capacity) || capacity <= 0) return true;
  return capacity >= required;
}

/**
 * Different elective groups in one division are normally mutually exclusive:
 * a student picks one option from each group, so two groups must not run in the
 * same slot. Divisions that use disjoint elective cohorts can opt out.
 */
function separatesElectiveGroups(division) {
  return division?.separateElectiveGroups !== false;
}

function buildContext(masterData = {}, stepCap = DEFAULT_STEP_CAP, weights = null) {
  const timeGrid = masterData.timeGrid ?? {};
  const slots = Array.isArray(timeGrid.slots) ? timeGrid.slots : [];
  const days = (Array.isArray(timeGrid.workingDays) ? timeGrid.workingDays : []).filter(
    (day) => day.enabled !== false,
  );
  const blocks = computePracticalBlocks(slots, timeGrid.breaks ?? []);
  const rooms = Array.isArray(masterData.rooms) ? masterData.rooms : [];
  const faculty = Array.isArray(masterData.faculty) ? masterData.faculty : [];
  const topLevelBatches = Array.isArray(masterData.batches) ? masterData.batches : [];

  const divisions = (Array.isArray(masterData.divisions) ? masterData.divisions : []).map(
    (division) => {
      const ownBatches = Array.isArray(division.batches) ? division.batches : [];
      const batches = ownBatches.length
        ? ownBatches
        : topLevelBatches.filter((batch) => batch.divisionId === division.id);
      return { ...division, batches };
    },
  );

  const subjects = Array.isArray(masterData.subjects) ? masterData.subjects : [];

  // Locked institutional blocks are resolved once, before any search starts.
  const fixed = describeFixedSlots(masterData);
  const enabledDayIds = new Set(days.map((day) => day.id));
  const fixedSlots = fixed.entries.filter((entry) => enabledDayIds.has(entry.dayId));
  const fixedSlotProblems = [
    ...fixed.problems,
    ...fixed.entries
      .filter((entry) => !enabledDayIds.has(entry.dayId))
      .map((entry) => ({
        id: entry.id,
        message: `Fixed slot “${entry.label}” is on ${entry.dayLabel}, which is not an enabled working day.`,
      })),
  ];

  const unavailable = new Set();
  for (const member of faculty) {
    for (const [pair, blocked] of Object.entries(member.unavailableSlots ?? {})) {
      if (!blocked) continue;
      const [dayId, slotId] = String(pair).split(':');
      if (dayId && slotId) unavailable.add(key(member.id, dayId, slotId));
    }
  }

  return {
    stepCap,
    masterData,
    days,
    slots,
    blocks,
    rooms,
    faculty,
    divisions,
    subjects,
    enrollmentBySubject: computeEnrollmentBySubject(masterData),
    fixedSlots,
    fixedSlotProblems,
    weights: normalizeWeights(weights),
    facultyById: new Map(faculty.map((member) => [member.id, member])),
    divisionById: new Map(divisions.map((division) => [division.id, division])),
    roomById: new Map(rooms.map((room) => [room.id, room])),
    subjectById: new Map(subjects.map((subject) => [subject.id, subject])),
    slotById: new Map(slots.map((slot) => [slot.id, slot])),
    slotIndexById: new Map(slots.map((slot, index) => [slot.id, index])),
    unavailable,
  };
}

function createState(ctx) {
  return {
    ctx,
    facultyBusy: new Set(),
    roomBusy: new Set(),
    divisionBusy: new Set(),
    batchBusy: new Set(),
    electiveGroupBusy: new Map(),
    facultyLoad: new Map(ctx.faculty.map((member) => [member.id, 0])),
    subjectDayCount: new Map(),
    sessions: [],
    nextSessionNumber: 1,
    attempts: 0,
  };
}

function isFacultyFree(state, facultyId, dayId, slotId) {
  if (state.ctx.unavailable.has(key(facultyId, dayId, slotId))) return false;
  return !state.facultyBusy.has(key(facultyId, dayId, slotId));
}

function facultyHasCapacity(state, member, hours) {
  const max = Number(member.maxWeeklyLoad);
  if (!Number.isFinite(max) || max <= 0) return true;
  return (state.facultyLoad.get(member.id) ?? 0) + hours <= max;
}

function countDivisionDay(state, divisionId, dayId) {
  let count = 0;
  for (const slot of state.ctx.slots) {
    if (state.divisionBusy.has(key(divisionId, dayId, slot.id))) count += 1;
  }
  return count;
}

/** Extra soft penalty for extending a faculty day into a 3rd+ consecutive hour. */
function consecutivePenaltyFor(state, facultyId, dayId, slot) {
  const slotIndex = state.ctx.slotIndexById.get(slot.id);
  if (slotIndex == null) return 0;

  const busy = (index) => {
    if (index < 0 || index >= state.ctx.slots.length) return false;
    const target = state.ctx.slots[index];
    return state.facultyBusy.has(key(facultyId, dayId, target.id));
  };

  let before = 0;
  for (let index = slotIndex - 1; busy(index); index -= 1) before += 1;
  let after = 0;
  for (let index = slotIndex + 1; busy(index); index += 1) after += 1;

  const run = before + 1 + after;
  return run >= 3 ? run - 2 : 0;
}

function pickRoom(state, subject, dayId, slotIds, fallbackType, requiredStrength = 0) {
  const { ctx } = state;
  const isFree = (room) =>
    slotIds.every((slotId) => !state.roomBusy.has(key(room.id, dayId, slotId)));
  const preferred = subject.requiredRoomId
    ? ctx.roomById.get(subject.requiredRoomId)
    : null;
  if (preferred && isFree(preferred) && roomFitsCapacity(preferred, requiredStrength)) {
    return preferred;
  }

  const type = subject.requiredRoomType === LAB ? LAB : fallbackType;
  return (
    ctx.rooms.find(
      (room) =>
        room.type === type &&
        isFree(room) &&
        roomFitsCapacity(room, requiredStrength),
    ) ?? null
  );
}

function facultyPreference(subject, member) {
  if (subject.facultyId === member.id) return 0;
  const overrides = subject.batchFaculty ? Object.values(subject.batchFaculty) : [];
  return overrides.includes(member.id) ? 1 : 2;
}

function assignBatches(state, req, labs, facultyList) {
  const { subject, batches } = req;
  if (labs.length < batches.length || facultyList.length < batches.length) return null;

  const usedFaculty = new Set();
  const facultyForBatch = new Map();

  // 1. Explicit per-batch faculty assignments win.
  for (const batch of batches) {
    const overrideId = subject.batchFaculty?.[batch.id];
    if (!overrideId || usedFaculty.has(overrideId)) continue;
    const member = facultyList.find((item) => item.id === overrideId);
    if (!member) continue;
    usedFaculty.add(member.id);
    facultyForBatch.set(batch.id, member);
  }

  // 2. The subject's primary faculty takes the first unstaffed batch.
  const primary = facultyList.find(
    (member) => member.id === subject.facultyId && !usedFaculty.has(member.id),
  );
  if (primary) {
    const batch = batches.find((item) => !facultyForBatch.has(item.id));
    if (batch) {
      usedFaculty.add(primary.id);
      facultyForBatch.set(batch.id, primary);
    }
  }

  // 3. Remaining batches take distinct, least-loaded faculty.
  const spare = facultyList
    .filter((member) => !usedFaculty.has(member.id))
    .sort(
      (a, b) =>
        (state.facultyLoad.get(a.id) ?? 0) - (state.facultyLoad.get(b.id) ?? 0) ||
        String(a.shortCode).localeCompare(String(b.shortCode)),
    );
  for (const batch of batches) {
    if (facultyForBatch.has(batch.id)) continue;
    const member = spare.shift();
    if (!member) return null;
    facultyForBatch.set(batch.id, member);
  }

  return batches.map((batch, index) => ({
    batch,
    faculty: facultyForBatch.get(batch.id),
    room: labs[index],
  }));
}

function enumeratePracticalPlacements(state, req) {
  const { ctx } = state;
  const { division, subject, batches } = req;
  if (batches.length === 0 || ctx.blocks.length === 0) return [];

  const labs = ctx.rooms.filter((room) => room.type === LAB);
  if (labs.length < batches.length) return [];

  // Every parallel batch occupies its own lab, so each lab must seat the
  // largest batch in the division.
  const requiredCapacity = batches.reduce(
    (largest, batch) => Math.max(largest, batchStrengthOf(batch)),
    0,
  );

  const placements = [];

  for (const day of ctx.days) {
    for (const block of ctx.blocks) {
      if (
        block.slotIds.some((slotId) =>
          state.divisionBusy.has(key(division.id, day.id, slotId)),
        )
      ) {
        continue;
      }

      const freeLabs = labs
        .filter(
          (room) =>
            roomFitsCapacity(room, requiredCapacity) &&
            block.slotIds.every(
              (slotId) => !state.roomBusy.has(key(room.id, day.id, slotId)),
            ),
        )
        .sort((a, b) => {
          const aPreferred = subject.requiredRoomId === a.id ? 0 : 1;
          const bPreferred = subject.requiredRoomId === b.id ? 0 : 1;
          return aPreferred - bPreferred || String(a.name).localeCompare(String(b.name));
        });
      if (freeLabs.length < batches.length) continue;

      const freeFaculty = ctx.faculty
        .filter(
          (member) =>
            block.slotIds.every((slotId) => isFacultyFree(state, member.id, day.id, slotId)) &&
            facultyHasCapacity(state, member, block.slotIds.length),
        )
        .sort(
          (a, b) =>
            facultyPreference(subject, a) - facultyPreference(subject, b) ||
            (state.facultyLoad.get(a.id) ?? 0) - (state.facultyLoad.get(b.id) ?? 0) ||
            String(a.shortCode).localeCompare(String(b.shortCode)),
        );
      if (freeFaculty.length < batches.length) continue;

      // Locked per-batch faculty are mandatory, not preferences.
      const lockedFacultyIds = batches
        .map((batch) => subject.batchFaculty?.[batch.id])
        .filter(Boolean);
      if (
        lockedFacultyIds.some(
          (facultyId) => !freeFaculty.some((member) => member.id === facultyId),
        )
      ) {
        continue;
      }

      const assignments = assignBatches(state, req, freeLabs, freeFaculty);
      if (!assignments) continue;

      const facultyPenalty = assignments.reduce(
        (total, item) =>
          total +
          block.slotIds.reduce(
            (sum, slotId) =>
              sum +
              consecutivePenaltyFor(
                state,
                item.faculty.id,
                day.id,
                ctx.slotById.get(slotId),
              ),
            0,
          ),
        0,
      );

      placements.push({
        day,
        block,
        assignments,
        score:
          countDivisionDay(state, division.id, day.id) * 2 +
          facultyPenalty * 3 +
          block.slotIds.length,
      });
    }
  }

  return placements.sort(
    (a, b) =>
      a.score - b.score ||
      String(a.day.id).localeCompare(String(b.day.id)) ||
      String(a.block.start).localeCompare(String(b.block.start)),
  );
}

function enumerateTheoryPlacements(state, occurrence) {
  const { ctx } = state;
  const { subject, division } = occurrence;
  const member = ctx.facultyById.get(subject.facultyId);
  if (!member) return [];

  const placements = [];

  for (const day of ctx.days) {
    for (let slotIndex = 0; slotIndex < ctx.slots.length; slotIndex += 1) {
      const slot = ctx.slots[slotIndex];
      if (state.divisionBusy.has(key(division.id, day.id, slot.id))) continue;
      if (!isFacultyFree(state, member.id, day.id, slot.id)) continue;
      if (!facultyHasCapacity(state, member, 1)) continue;

      const room = pickRoom(
        state,
        subject,
        day.id,
        [slot.id],
        CLASSROOM,
        divisionStrengthOf(division),
      );
      if (!room) continue;

      const sameDay = state.subjectDayCount.get(key(subject.id, day.id)) ?? 0;
      const divisionDayLoad = countDivisionDay(state, division.id, day.id);
      const penalty = consecutivePenaltyFor(state, member.id, day.id, slot);

      placements.push({
        day,
        slot,
        slotIndex,
        room,
        score:
          sameDay * 12 * ctx.weights.sameDay +
          divisionDayLoad * 3 * ctx.weights.balance +
          penalty * 4 * ctx.weights.fatigue,
      });
    }
  }

  return placements.sort(
    (a, b) =>
      a.score - b.score ||
      String(a.day.id).localeCompare(String(b.day.id)) ||
      a.slotIndex - b.slotIndex,
  );
}

function sessionBase(state, { day, slotIds }) {
  const { ctx } = state;
  const slotLabels = slotIds.map((slotId) => ctx.slotById.get(slotId)?.label ?? slotId);
  return {
    id: `SES-${state.nextSessionNumber++}`,
    dayId: day.id,
    dayLabel: day.label ?? day.id,
    slotIds: [...slotIds],
    slotLabels,
    start: ctx.slotById.get(slotIds[0])?.start ?? '',
    end: ctx.slotById.get(slotIds[slotIds.length - 1])?.end ?? '',
    hours: slotIds.length,
  };
}

function applyPractical(state, req, placement) {
  const { ctx } = state;
  const { division, subject, batches } = req;
  const { day, block, assignments } = placement;

  for (const slotId of block.slotIds) {
    state.divisionBusy.add(key(division.id, day.id, slotId));
    for (const item of assignments) {
      state.facultyBusy.add(key(item.faculty.id, day.id, slotId));
      state.roomBusy.add(key(item.room.id, day.id, slotId));
      state.batchBusy.add(key(item.batch.id, day.id, slotId));
    }
  }
  for (const item of assignments) {
    state.facultyLoad.set(
      item.faculty.id,
      (state.facultyLoad.get(item.faculty.id) ?? 0) + block.slotIds.length,
    );
  }

  const primary = {
    facultyId: subject.facultyId ?? assignments[0]?.faculty.id ?? '',
    facultyName: ctx.facultyById.get(subject.facultyId)?.name ?? '',
    facultyShortCode: ctx.facultyById.get(subject.facultyId)?.shortCode ?? '',
  };

  const session = {
    ...sessionBase(state, { day, slotIds: block.slotIds }),
    type: PRACTICAL,
    subjectId: subject.id,
    subjectCode: subject.code ?? '',
    subjectName: subject.name ?? '',
    divisionId: division.id,
    divisionName: division.name ?? '',
    facultyId: primary.facultyId,
    facultyName: primary.facultyName,
    facultyShortCode: primary.facultyShortCode,
    roomId: '',
    roomName: '',
    roomType: LAB,
    batches: assignments.map((item) => ({
      batchId: item.batch.id,
      batchName: item.batch.name,
      facultyId: item.faculty.id,
      facultyName: item.faculty.name,
      facultyShortCode: item.faculty.shortCode,
      roomId: item.room.id,
      roomName: item.room.name,
    })),
  };

  state.sessions.push(session);

  return () => {
    for (const slotId of block.slotIds) {
      state.divisionBusy.delete(key(division.id, day.id, slotId));
      for (const item of assignments) {
        state.facultyBusy.delete(key(item.faculty.id, day.id, slotId));
        state.roomBusy.delete(key(item.room.id, day.id, slotId));
        state.batchBusy.delete(key(item.batch.id, day.id, slotId));
      }
    }
    for (const item of assignments) {
      state.facultyLoad.set(
        item.faculty.id,
        Math.max(0, (state.facultyLoad.get(item.faculty.id) ?? 0) - block.slotIds.length),
      );
    }
    state.sessions.pop();
  };
}

function applyTheory(state, occurrence, placement) {
  const { ctx } = state;
  const { subject, division } = occurrence;
  const member = ctx.facultyById.get(subject.facultyId);
  const { day, slot, room } = placement;

  state.divisionBusy.add(key(division.id, day.id, slot.id));
  state.facultyBusy.add(key(member.id, day.id, slot.id));
  state.roomBusy.add(key(room.id, day.id, slot.id));
  state.facultyLoad.set(member.id, (state.facultyLoad.get(member.id) ?? 0) + 1);
  const dayKey = key(subject.id, day.id);
  state.subjectDayCount.set(dayKey, (state.subjectDayCount.get(dayKey) ?? 0) + 1);

  const session = {
    ...sessionBase(state, { day, slotIds: [slot.id] }),
    type: THEORY,
    subjectId: subject.id,
    subjectCode: subject.code ?? '',
    subjectName: subject.name ?? '',
    divisionId: division.id,
    divisionName: division.name ?? '',
    facultyId: member.id,
    facultyName: member.name ?? '',
    facultyShortCode: member.shortCode ?? '',
    roomId: room.id,
    roomName: room.name ?? '',
    roomType: room.type ?? CLASSROOM,
    batches: [],
  };
  state.sessions.push(session);

  return () => {
    state.divisionBusy.delete(key(division.id, day.id, slot.id));
    state.facultyBusy.delete(key(member.id, day.id, slot.id));
    state.roomBusy.delete(key(room.id, day.id, slot.id));
    state.facultyLoad.set(
      member.id,
      Math.max(0, (state.facultyLoad.get(member.id) ?? 0) - 1),
    );
    const current = state.subjectDayCount.get(dayKey) ?? 0;
    if (current <= 1) state.subjectDayCount.delete(dayKey);
    else state.subjectDayCount.set(dayKey, current - 1);
    state.sessions.pop();
  };
}

/**
 * Pre-populate coordinator-locked institutional blocks before Stage 1.
 *
 * A fixed slot always occupies its division slot(s); the optional faculty
 * member and room are marked busy too, so neither theory nor practical can be
 * placed on top of it. Nothing here cancels a lock: when two entries fight over
 * the same cell the later one is skipped and reported, and a faculty member or
 * room that another lock already booked is reported while the block stands.
 *
 * @returns {number} locked sessions added to the timetable
 */
function seedFixedSlots(state, report) {
  const { ctx } = state;
  let count = 0;

  for (const problem of ctx.fixedSlotProblems) {
    report(
      problem.message,
      'Edit or remove that entry in Master Data → Fixed Slots, then regenerate.',
    );
  }

  for (const entry of ctx.fixedSlots) {
    const targets =
      entry.divisionId === FIXED_SLOT_ALL
        ? ctx.divisions
        : ctx.divisions.filter((division) => division.id === entry.divisionId);

    for (const division of targets) {
      const overlaps = entry.slotIds.filter((slotId) =>
        state.divisionBusy.has(key(division.id, entry.dayId, slotId)),
      );
      if (overlaps.length > 0) {
        report(
          `Fixed slot “${entry.label}” for ${division.name} on ${entry.dayLabel} ${entry.slotLabels.join(
            ' + ',
          )} overlaps another fixed slot, so it was not applied.`,
          'Remove one of the overlapping Fixed Slots in Master Data → Fixed Slots.',
        );
        continue;
      }

      const faculty = entry.facultyId ? ctx.facultyById.get(entry.facultyId) : null;
      const room = entry.roomId ? ctx.roomById.get(entry.roomId) : null;

      if (
        faculty &&
        entry.slotIds.some((slotId) =>
          state.facultyBusy.has(key(faculty.id, entry.dayId, slotId)),
        )
      ) {
        report(
          `Fixed slot “${entry.label}” double-books ${
            faculty.shortCode ?? faculty.name
          } on ${entry.dayLabel} ${entry.slotLabels.join(' + ')}.`,
          'Move one of the two fixed slots, or leave one entry without a faculty member.',
        );
      }

      if (
        room &&
        entry.slotIds.some((slotId) =>
          state.roomBusy.has(key(room.id, entry.dayId, slotId)),
        )
      ) {
        report(
          `Fixed slot “${entry.label}” double-books ${room.name} on ${
            entry.dayLabel
          } ${entry.slotLabels.join(' + ')}.`,
          'Move one of the two fixed slots, or leave one entry without a room.',
        );
      }

      for (const slotId of entry.slotIds) {
        state.divisionBusy.add(key(division.id, entry.dayId, slotId));
        if (faculty) state.facultyBusy.add(key(faculty.id, entry.dayId, slotId));
        if (room) state.roomBusy.add(key(room.id, entry.dayId, slotId));
      }

      if (faculty) {
        state.facultyLoad.set(
          faculty.id,
          (state.facultyLoad.get(faculty.id) ?? 0) + entry.hours,
        );
      }

      const session = fixedSlotSession(ctx.masterData, entry, division.id);
      if (session) {
        state.sessions.push(session);
        count += 1;
      }
    }
  }

  return count;
}

/**
 * Pre-seed the search state with sessions the coordinator has pinned.
 *
 * A pin is a soft promise: the engine keeps it when the underlying day, slot,
 * division, subject, faculty and room still exist and nothing else is pinned to
 * the same slot. Anything that can no longer be honoured is reported instead of
 * silently dropped.
 *
 * @returns {Map<string, number>} hours already covered per subject id
 */
function seedLockedSessions(state, lockedSessions, report) {
  const { ctx } = state;
  const coveredHours = new Map();

  for (const session of Array.isArray(lockedSessions) ? lockedSessions : []) {
    if (!session || typeof session !== 'object') continue;

    const label = `${session.subjectCode || session.subjectName || 'Pinned session'} on ${
      session.dayLabel || session.dayId
    } ${(session.slotLabels ?? []).join(' + ')}`;
    const drop = (reason) =>
      report(
        `Pinned session ${label} could not be kept: ${reason}.`,
        'Unpin it, or restore the missing Time Grid/room/faculty data, then regenerate.',
      );

    const slotIds = Array.isArray(session.slotIds) ? session.slotIds : [];
    const day = ctx.days.find((item) => item.id === session.dayId);
    const division = ctx.divisionById.get(session.divisionId);

    if (!day) {
      drop('its day is no longer an enabled working day');
      continue;
    }
    if (slotIds.length === 0 || !slotIds.every((slotId) => ctx.slotById.has(slotId))) {
      drop('its slots are no longer in the Time Grid');
      continue;
    }
    if (!division) {
      drop('its division no longer exists');
      continue;
    }
    if (!session.subjectId || !ctx.subjectById.has(session.subjectId)) {
      drop('its subject no longer exists');
      continue;
    }
    if (
      slotIds.some((slotId) =>
        state.divisionBusy.has(key(division.id, day.id, slotId)),
      )
    ) {
      drop('another pinned session already occupies that division slot');
      continue;
    }

    if (session.type === PRACTICAL) {
      const batches = Array.isArray(session.batches) ? session.batches : [];
      if (
        slotIds.length !== 2 ||
        !ctx.blocks.some((block) => block.slotIds.join('|') === slotIds.join('|'))
      ) {
        drop('it is not a complete 2-hour practical block');
        continue;
      }
      if (batches.length === 0) {
        drop('it has no batch assignments');
        continue;
      }

      const blocked = batches.find(
        (batch) =>
          !ctx.facultyById.has(batch.facultyId) ||
          !ctx.roomById.has(batch.roomId) ||
          slotIds.some(
            (slotId) =>
              state.facultyBusy.has(key(batch.facultyId, day.id, slotId)) ||
              state.roomBusy.has(key(batch.roomId, day.id, slotId)),
          ),
      );
      if (blocked) {
        drop('a batch faculty member or lab is missing, deleted or already booked');
        continue;
      }

      for (const slotId of slotIds) {
        state.divisionBusy.add(key(division.id, day.id, slotId));
        for (const batch of batches) {
          state.facultyBusy.add(key(batch.facultyId, day.id, slotId));
          state.roomBusy.add(key(batch.roomId, day.id, slotId));
          state.batchBusy.add(key(batch.batchId, day.id, slotId));
        }
      }
      for (const batch of batches) {
        state.facultyLoad.set(
          batch.facultyId,
          (state.facultyLoad.get(batch.facultyId) ?? 0) + slotIds.length,
        );
      }
    } else {
      const member = ctx.facultyById.get(session.facultyId);
      const room = ctx.roomById.get(session.roomId);
      if (slotIds.length !== 1) {
        drop('a theory session must occupy exactly one slot');
        continue;
      }
      if (!member) {
        drop('its faculty member no longer exists');
        continue;
      }
      if (!room) {
        drop('its room no longer exists');
        continue;
      }

      const slotId = slotIds[0];
      if (
        state.facultyBusy.has(key(member.id, day.id, slotId)) ||
        state.roomBusy.has(key(room.id, day.id, slotId))
      ) {
        drop('its faculty member or room is already booked in that slot');
        continue;
      }

      state.divisionBusy.add(key(division.id, day.id, slotId));
      state.facultyBusy.add(key(member.id, day.id, slotId));
      state.roomBusy.add(key(room.id, day.id, slotId));
      if (session.electiveGroup) {
        state.electiveGroupBusy.set(
          key(division.id, day.id, slotId),
          String(session.electiveGroup).trim().toUpperCase(),
        );
      }
      state.facultyLoad.set(member.id, (state.facultyLoad.get(member.id) ?? 0) + 1);
      const subjectDayKey = key(session.subjectId, day.id);
      state.subjectDayCount.set(
        subjectDayKey,
        (state.subjectDayCount.get(subjectDayKey) ?? 0) + 1,
      );
    }

    // Session ids come from a counter; move it past every pinned id so new
    // sessions can never collide with a kept one.
    const numericId = Number(String(session.id ?? '').replace(/\D/g, ''));
    if (Number.isFinite(numericId)) {
      state.nextSessionNumber = Math.max(state.nextSessionNumber, numericId + 1);
    }

    state.sessions.push({ ...session, pinned: true });
    coveredHours.set(
      session.subjectId,
      (coveredHours.get(session.subjectId) ?? 0) + slotIds.length,
    );
  }

  return coveredHours;
}

/**
 * Group theory subjects that share a division and a non-empty `electiveGroup`
 * into a Parallel Elective Unit (for example PE-I: AI / IoT / PLC).
 *
 * Every unit member runs at the same time in its own classroom with its own
 * faculty member. Members must therefore have distinct faculty; a unit whose
 * subjects share a teacher cannot run in parallel and is reported instead of
 * being scheduled sequentially.
 *
 * @returns {{id:string,label:string,division:object,members:object[],hours:number}[]}
 */
function buildElectiveUnits(ctx, theory, report) {
  const units = new Map();

  for (const req of theory) {
    const label = String(req.subject.electiveGroup ?? '').trim();
    if (!label) continue;
    const groupKey = key(req.division.id, label.toUpperCase());
    if (!units.has(groupKey)) {
      units.set(groupKey, {
        id: groupKey,
        label,
        division: req.division,
        members: [],
        hours: 0,
      });
    }
    units.get(groupKey).members.push(req);
  }

  const ready = [];

  for (const unit of units.values()) {
    const facultyIds = new Set();
    let problem = '';

    for (const member of unit.members) {
      const faculty = ctx.facultyById.get(member.subject.facultyId);
      if (!faculty) {
        problem = `${member.subject.code || member.subject.name} has no valid faculty member`;
        break;
      }
      if (facultyIds.has(faculty.id)) {
        problem = `${faculty.shortCode ?? faculty.name} is assigned to more than one subject`;
        break;
      }
      facultyIds.add(faculty.id);
    }

    if (problem) {
      report(
        `Parallel elective group “${unit.label}” (${unit.division.name}) cannot run: ${problem}.`,
        'Assign a different faculty member to every subject in the group, then regenerate.',
      );
      continue;
    }

    unit.hours = unit.members.reduce(
      (smallest, member) =>
        Math.min(
          smallest,
          clampHours(
            member.subject.weeklyHours,
            1,
            ctx.days.length * ctx.slots.length,
          ),
        ),
      Number.POSITIVE_INFINITY,
    );

    if (!Number.isFinite(unit.hours)) continue;
    ready.push(unit);
  }

  return ready;
}

/**
 * One free room per unit member in the same slot; every room must be distinct.
 * An option only seats the students who chose it; without a roster the whole
 * division is assumed, which keeps older datasets working unchanged. Preferred
 * rooms win when they are free.
 */
function electiveRoomsFor(state, unit, dayId, slotId) {
  const { ctx } = state;
  const used = new Set();
  const rooms = [];

  for (const member of unit.members) {
    const subject = member.subject;
    const enrolled = ctx.enrollmentBySubject.get(subject.id) ?? 0;
    const requiredCapacity = enrolled > 0 ? enrolled : divisionStrengthOf(unit.division);
    const type = subject.requiredRoomType === LAB ? LAB : CLASSROOM;
    const options = ctx.rooms.filter(
      (room) =>
        room.type === type &&
        !used.has(room.id) &&
        roomFitsCapacity(room, requiredCapacity) &&
        !state.roomBusy.has(key(room.id, dayId, slotId)),
    );
    if (options.length === 0) return null;

    const preferred = subject.requiredRoomId
      ? options.find((room) => room.id === subject.requiredRoomId)
      : null;
    const room =
      preferred ??
      options
        .slice()
        .sort(
          (a, b) =>
            (Number(a.capacity) || 0) - (Number(b.capacity) || 0) ||
            String(a.name).localeCompare(String(b.name)),
        )[0];

    used.add(room.id);
    rooms.push(room);
  }

  return rooms;
}

function enumerateElectivePlacements(state, unit) {
  const { ctx } = state;
  const placements = [];

  for (const day of ctx.days) {
    for (let slotIndex = 0; slotIndex < ctx.slots.length; slotIndex += 1) {
      const slot = ctx.slots[slotIndex];
      if (state.divisionBusy.has(key(unit.division.id, day.id, slot.id))) continue;

      // Two different groups in the same slot would force every student to
      // choose between them, so reserve the slot for one group at a time.
      if (separatesElectiveGroups(unit.division)) {
        const occupying = state.electiveGroupBusy.get(
          key(unit.division.id, day.id, slot.id),
        );
        if (occupying && occupying !== unit.label.toUpperCase()) continue;
      }

      let blocked = false;
      let penalty = 0;

      for (const member of unit.members) {
        const faculty = ctx.facultyById.get(member.subject.facultyId);
        if (
          !faculty ||
          !isFacultyFree(state, faculty.id, day.id, slot.id) ||
          !facultyHasCapacity(state, faculty, 1)
        ) {
          blocked = true;
          break;
        }
        penalty += consecutivePenaltyFor(state, faculty.id, day.id, slot);
      }
      if (blocked) continue;

      const rooms = electiveRoomsFor(state, unit, day.id, slot.id);
      if (!rooms) continue;

      const sameDay = unit.members.reduce(
        (sum, member) =>
          sum + (state.subjectDayCount.get(key(member.subject.id, day.id)) ?? 0),
        0,
      );

      placements.push({
        day,
        slot,
        slotIndex,
        rooms,
        score:
          sameDay * 12 * ctx.weights.sameDay +
          countDivisionDay(state, unit.division.id, day.id) * 3 * ctx.weights.balance +
          penalty * 4 * ctx.weights.fatigue,
      });
    }
  }

  return placements.sort(
    (a, b) =>
      a.score - b.score ||
      String(a.day.id).localeCompare(String(b.day.id)) ||
      a.slotIndex - b.slotIndex,
  );
}

/** Record the whole unit in the slot; each member keeps its own faculty and room. */
function applyElectiveUnit(state, unit, placement) {
  const { ctx } = state;
  const { day, slot, rooms } = placement;
  const added = [];
  const groupSlotKey = key(unit.division.id, day.id, slot.id);

  state.divisionBusy.add(groupSlotKey);
  if (separatesElectiveGroups(unit.division)) {
    state.electiveGroupBusy.set(groupSlotKey, unit.label.toUpperCase());
  }

  unit.members.forEach((member, index) => {
    const faculty = ctx.facultyById.get(member.subject.facultyId);
    const room = rooms[index];

    state.facultyBusy.add(key(faculty.id, day.id, slot.id));
    state.roomBusy.add(key(room.id, day.id, slot.id));
    state.facultyLoad.set(faculty.id, (state.facultyLoad.get(faculty.id) ?? 0) + 1);

    const dayKey = key(member.subject.id, day.id);
    state.subjectDayCount.set(dayKey, (state.subjectDayCount.get(dayKey) ?? 0) + 1);

    state.sessions.push({
      ...sessionBase(state, { day, slotIds: [slot.id] }),
      type: THEORY,
      subjectId: member.subject.id,
      subjectCode: member.subject.code ?? '',
      subjectName: member.subject.name ?? '',
      divisionId: unit.division.id,
      divisionName: unit.division.name ?? '',
      facultyId: faculty.id,
      facultyName: faculty.name ?? '',
      facultyShortCode: faculty.shortCode ?? '',
      roomId: room.id,
      roomName: room.name ?? '',
      roomType: room.type ?? CLASSROOM,
      batches: [],
      elective: true,
      electiveGroup: unit.label,
      enrolledStudents: ctx.enrollmentBySubject.get(member.subject.id) ?? 0,
    });

    added.push({ facultyId: faculty.id, roomId: room.id, subjectId: member.subject.id });
  });

  return () => {
    for (const entry of added) {
      state.facultyBusy.delete(key(entry.facultyId, day.id, slot.id));
      state.roomBusy.delete(key(entry.roomId, day.id, slot.id));
      state.facultyLoad.set(
        entry.facultyId,
        Math.max(0, (state.facultyLoad.get(entry.facultyId) ?? 0) - 1),
      );
      const dayKey = key(entry.subjectId, day.id);
      const current = state.subjectDayCount.get(dayKey) ?? 0;
      if (current <= 1) state.subjectDayCount.delete(dayKey);
      else state.subjectDayCount.set(dayKey, current - 1);
      state.sessions.pop();
    }
    state.divisionBusy.delete(groupSlotKey);
    state.electiveGroupBusy.delete(groupSlotKey);
  };
}

function orderedElectiveOccurrences(state, units) {
  const ranked = units
    .map((unit) => ({
      unit,
      candidates: enumerateElectivePlacements(state, unit).length,
    }))
    .sort(
      (a, b) =>
        a.candidates - b.candidates ||
        b.unit.hours - a.unit.hours ||
        a.unit.label.localeCompare(b.unit.label),
    );

  const occurrences = [];
  for (const { unit } of ranked) {
    for (let index = 0; index < unit.hours; index += 1) occurrences.push(unit);
  }
  return occurrences;
}

function solveElectives(state, occurrences) {
  let steps = 0;
  let capHit = false;

  const search = (index) => {
    if (capHit) return false;
    steps += 1;
    state.attempts += 1;
    if (steps > state.ctx.stepCap) {
      capHit = true;
      return false;
    }
    if (index >= occurrences.length) return true;

    const candidates = enumerateElectivePlacements(state, occurrences[index]);
    for (const candidate of candidates) {
      const undo = applyElectiveUnit(state, occurrences[index], candidate);
      if (search(index + 1)) return true;
      undo();
      if (capHit) return false;
    }
    return false;
  };

  const success = search(0);
  return { success, capHit };
}

function bestEffortElectives(state, occurrences, report) {
  const missing = new Map();

  for (const unit of occurrences) {
    if (missing.has(unit.id)) continue;
    const candidates = enumerateElectivePlacements(state, unit);
    if (candidates.length > 0) {
      applyElectiveUnit(state, unit, candidates[0]);
    } else {
      missing.set(unit.id, unit);
    }
  }

  for (const unit of missing.values()) {
    report(
      `Parallel elective group “${unit.label}” (${unit.division.name}) could not be placed: no slot where the division, all ${unit.members.length} faculty members, ${unit.members.length} classrooms and no other elective group are free at the same time.`,
      'Free a slot for the group, add classrooms, or allow elective groups to share slots for this division in Master Data → Divisions.',
    );
  }
}

function buildRequirements(ctx, report) {
  const practicals = [];
  const theory = [];

  for (const division of ctx.divisions) {
    const batches = division.batches ?? [];
    for (const subject of ctx.subjects.filter((item) => item.divisionId === division.id)) {
      if (subject.type === PRACTICAL) {
        if (!subject.facultyId || !ctx.facultyById.has(subject.facultyId)) {
          report(
            `Cannot schedule ${division.name} ${subject.name}: no valid faculty member is assigned in Master Data.`,
            'Open Subjects and assign a faculty member to this subject.',
          );
          continue;
        }
        if (batches.length === 0) {
          report(
            `Cannot schedule ${division.name} ${subject.name}: the division has no lab batches.`,
            'Open Divisions and add at least one lab batch to this division.',
          );
          continue;
        }
        practicals.push({ subject, division, batches });
      } else if (subject.type === THEORY) {
        if (!subject.facultyId || !ctx.facultyById.has(subject.facultyId)) {
          report(
            `Cannot schedule ${division.name} ${subject.name}: no valid faculty member is assigned in Master Data.`,
            'Open Subjects and assign a faculty member to this subject.',
          );
          continue;
        }
        theory.push({ subject, division });
      }
    }
  }

  return { practicals, theory };
}

function solvePracticals(state, requirements) {
  let steps = 0;
  let capHit = false;

  const search = (pending) => {
    if (capHit) return false;
    steps += 1;
    state.attempts += 1;
    if (steps > state.ctx.stepCap) {
      capHit = true;
      return false;
    }
    if (pending.length === 0) return true;

    let chosen = pending[0];
    let candidates = null;
    for (const req of pending) {
      const options = enumeratePracticalPlacements(state, req);
      if (!candidates || options.length < candidates.length) {
        chosen = req;
        candidates = options;
      }
      if (candidates.length === 0) break;
    }
    if (!candidates || candidates.length === 0) return false;

    for (const candidate of candidates) {
      const undo = applyPractical(state, chosen, candidate);
      if (search(pending.filter((req) => req !== chosen))) return true;
      undo();
      if (capHit) return false;
    }
    return false;
  };

  const success = search(requirements);
  return { success, capHit };
}

function diagnosePractical(state, req) {
  const { ctx } = state;
  const { division, subject, batches } = req;

  if (ctx.blocks.length === 0) {
    return 'the configured grid has no valid 2-hour practical block (slots must be consecutive and not cross a break)';
  }
  const labs = ctx.rooms.filter((room) => room.type === LAB);
  if (labs.length < batches.length) {
    return `only ${labs.length} lab(s) are configured but ${batches.length} batches (${batches
      .map((batch) => batch.name)
      .join(', ')}) must run in parallel`;
  }

  const requiredCapacity = batches.reduce(
    (largest, batch) => Math.max(largest, batchStrengthOf(batch)),
    0,
  );
  const seatingLabs = labs.filter((room) => roomFitsCapacity(room, requiredCapacity));
  if (seatingLabs.length < batches.length) {
    return `only ${seatingLabs.length} lab(s) can seat the largest batch (${requiredCapacity} students) but ${batches.length} batches must run in parallel`;
  }

  let best = {
    labs: 0,
    faculty: 0,
    divisionFree: false,
    block: 'none',
    day: 'none',
  };

  for (const day of ctx.days) {
    for (const block of ctx.blocks) {
      const divisionFree = !block.slotIds.some((slotId) =>
        state.divisionBusy.has(key(division.id, day.id, slotId)),
      );
      const freeLabs = labs.filter((room) =>
        block.slotIds.every((slotId) => !state.roomBusy.has(key(room.id, day.id, slotId))),
      ).length;
      const freeFaculty = ctx.faculty.filter(
        (member) =>
          block.slotIds.every((slotId) => isFacultyFree(state, member.id, day.id, slotId)) &&
          facultyHasCapacity(state, member, block.slotIds.length),
      ).length;
      const quality = Math.min(freeLabs, freeFaculty) + (divisionFree ? 0.5 : 0);
      if (quality > Math.min(best.labs, best.faculty) + (best.divisionFree ? 0.5 : 0)) {
        best = {
          labs: freeLabs,
          faculty: freeFaculty,
          divisionFree,
          block: block.label,
          day: day.label ?? day.id,
        };
      }
    }
  }

  return `no free 2-hour block where ${batches.length} distinct labs and ${batches.length} distinct faculty are available (best case: ${best.day} ${best.block} with ${best.labs} labs and ${best.faculty} faculty, division ${
    best.divisionFree ? 'free' : 'already busy'
  })`;
}

function bestEffortPracticals(state, requirements, report) {
  const pending = requirements.filter((req) => req.batches.length > 0);
  const failed = [];

  while (pending.length > 0) {
    let chosenIndex = 0;
    let chosenCandidates = null;
    for (let index = 0; index < pending.length; index += 1) {
      const options = enumeratePracticalPlacements(state, pending[index]);
      if (!chosenCandidates || options.length < chosenCandidates.length) {
        chosenCandidates = options;
        chosenIndex = index;
      }
      if (chosenCandidates.length === 0) break;
    }
    const req = pending.splice(chosenIndex, 1)[0];
    if (chosenCandidates.length > 0) {
      applyPractical(state, req, chosenCandidates[0]);
    } else {
      failed.push(req);
    }
  }

  for (const req of failed) {
    const labCount = state.ctx.rooms.filter((room) => room.type === LAB).length;
    const labDeficit = req.batches.length - labCount;
    report(
      `Could not place ${req.division.name} ${req.subject.name} (${req.subject.code || 'no code'}) for ${req.batches
        .map((batch) => batch.name)
        .join(', ')}: ${diagnosePractical(state, req)}.`,
      labDeficit > 0
        ? `Add ${labDeficit} more lab${labDeficit === 1 ? '' : 's'} (${req.batches.length} batches need ${req.batches.length} labs), or reduce the number of parallel batches for ${req.division.name}.`
        : `Free a 2-hour block for ${req.division.name} by unpinning or moving another session, or add faculty/lab capacity.`,
    );
  }
}

function solveTheory(state, occurrences) {
  let steps = 0;
  let capHit = false;

  const search = (index) => {
    if (capHit) return false;
    steps += 1;
    state.attempts += 1;
    if (steps > state.ctx.stepCap) {
      capHit = true;
      return false;
    }
    if (index >= occurrences.length) return true;

    const candidates = enumerateTheoryPlacements(state, occurrences[index]);
    for (const candidate of candidates) {
      const undo = applyTheory(state, occurrences[index], candidate);
      if (search(index + 1)) return true;
      undo();
      if (capHit) return false;
    }
    return false;
  };

  const success = search(0);
  return { success, capHit };
}

function theoryConflictMessage(state, occurrence, missingHours) {
  const { subject, division } = occurrence;
  const member = state.ctx.facultyById.get(subject.facultyId);
  const load = member ? state.facultyLoad.get(member.id) ?? 0 : 0;
  const requiredRoom =
    subject.requiredRoomType === LAB ? 'lab' : 'classroom';
  return `Could not place ${division.name} ${subject.name} (theory): ${missingHours} of ${
    subject.weeklyHours
  } weekly hours unplaced — no free 60-minute slot where ${requiredRoom} space is free and faculty ${
    member?.shortCode ?? '??'
  } is available (current load ${load}/${member?.maxWeeklyLoad ?? '—'}).`;
}

function bestEffortTheory(state, occurrences, report) {
  const missing = new Map();
  for (const occurrence of occurrences) {
    const candidates = enumerateTheoryPlacements(state, occurrence);
    if (candidates.length > 0) applyTheory(state, occurrence, candidates[0]);
    else missing.set(occurrence.subject.id, (missing.get(occurrence.subject.id) ?? 0) + 1);
  }

  for (const [subjectId, count] of missing) {
    const occurrence = occurrences.find((item) => item.subject.id === subjectId);
    if (!occurrence) continue;

    const division = state.ctx.divisionById.get(occurrence.division.id);
    const required = divisionStrengthOf(division);
    const largestRoom = state.ctx.rooms
      .filter((room) => room.type !== LAB)
      .reduce((max, room) => Math.max(max, Number(room.capacity) || 0), 0);
    const capacityGap = required > 0 && required > largestRoom;

    report(
      theoryConflictMessage(state, occurrence, count),
      capacityGap
        ? `No classroom seats the division (${required} students vs largest room ${largestRoom}). Add a larger classroom or split the division.`
        : 'Add a teaching slot/day, raise the faculty weekly load, reassign the subject to another faculty member, or free a classroom.',
    );
  }
}

function computeSoftScore(sessions, ctx) {
  let score = 0;

  const facultyDaySlots = new Map();
  const theoryDayCount = new Map();
  const divisionDayHours = new Map();

  for (const session of sessions) {
    const indexes = (session.slotIds ?? [])
      .map((slotId) => ctx.slotIndexById.get(slotId))
      .filter((index) => index != null);
    if (indexes.length === 0) continue;

    const facultyIds =
      session.type === PRACTICAL
        ? (session.batches ?? []).map((batch) => batch.facultyId).filter(Boolean)
        : [session.facultyId].filter(Boolean);

    for (const facultyId of facultyIds) {
      const mapKey = key(facultyId, session.dayId);
      if (!facultyDaySlots.has(mapKey)) facultyDaySlots.set(mapKey, new Set());
      for (const index of indexes) facultyDaySlots.get(mapKey).add(index);
    }

    if (session.type === THEORY) {
      const dayKey = key(session.subjectId, session.dayId);
      theoryDayCount.set(dayKey, (theoryDayCount.get(dayKey) ?? 0) + 1);
      const divisionKey = key(session.divisionId, session.dayId);
      divisionDayHours.set(
        divisionKey,
        (divisionDayHours.get(divisionKey) ?? 0) + indexes.length,
      );
    }
  }

  const weights = ctx.weights ?? { fatigue: 1, sameDay: 1, balance: 1 };

  // Soft: 3+ consecutive teaching hours for a faculty member.
  for (const indexes of facultyDaySlots.values()) {
    const sorted = [...indexes].sort((a, b) => a - b);
    let run = 1;
    for (let index = 1; index < sorted.length; index += 1) {
      if (sorted[index] === sorted[index - 1] + 1) {
        run += 1;
        if (run >= 3) score += 1 * weights.fatigue;
      } else {
        run = 1;
      }
    }
  }

  // Soft: the same theory subject twice on one day for a division.
  for (const count of theoryDayCount.values()) {
    if (count > 1) score += (count - 1) * 4 * weights.sameDay;
  }

  // Soft: uneven distribution of division hours across the week.
  for (const division of ctx.divisions) {
    const counts = ctx.days.map(
      (day) => divisionDayHours.get(key(division.id, day.id)) ?? 0,
    );
    if (counts.length === 0) continue;
    const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length;
    score +=
      counts.reduce((sum, count) => sum + Math.abs(count - mean), 0) * weights.balance;
  }

  return Math.round(score * 100) / 100;
}

/**
 * Generate a weekly timetable.
 *
 * @param {object} masterData Phase 1 master data (timeGrid, divisions, rooms, faculty, subjects).
 * @param {{ stepCap?: number, lockedSessions?: object[] }} [options]
 *   lockedSessions are pinned sessions kept verbatim; the remaining weekly
 *   hours are then scheduled around them.
 * @returns {{
 *   success: boolean,
 *   timetable: { sessions: object[] },
 *   conflicts: string[],
 *   suggestions: string[],
 *   stats: { attempts: number, durationMs: number, softScore: number, steps: number, stepCap: number, capHit: boolean, pinnedSessions: number }
 * }}
 */
export function generateTimetable(masterData, options = {}) {
  const startedAt = Date.now();
  const stepCap =
    Number.isFinite(options.stepCap) && options.stepCap > 0
      ? Math.floor(options.stepCap)
      : DEFAULT_STEP_CAP;
  const weights = normalizeWeights(options.weights);

  const ctx = buildContext(masterData, stepCap, weights);
  const state = createState(ctx);
  const conflicts = [];
  const suggestions = [];
  const report = (message, suggestion = '') => {
    conflicts.push(message);
    suggestions.push(suggestion);
  };

  // Fixed institutional blocks occupy the grid before practicals or theory run.
  const fixedSlotCount = seedFixedSlots(state, report);
  const pinnedHours = seedLockedSessions(state, options.lockedSessions, report);

  const { practicals, theory } = buildRequirements(ctx, report);

  if (ctx.days.length === 0) {
    report(
      'No working days are enabled in the Time Grid.',
      'Enable at least one working day in the Time Grid tab.',
    );
  }
  if (ctx.slots.length === 0) {
    report(
      'No teaching slots are configured in the Time Grid.',
      'Add teaching slots to the Time Grid tab.',
    );
  }

  // Pinned practicals already cover their subject's weekly block.
  const remainingPracticals = practicals.filter(
    (req) => (pinnedHours.get(req.subject.id) ?? 0) < 2,
  );

  const practicalResult = solvePracticals(state, remainingPracticals);
  if (!practicalResult.success) {
    bestEffortPracticals(state, remainingPracticals, report);
  }

  // Parallel elective units run after practicals and before single lectures.
  // Each placed hour counts as covered for every member, so the theory stage
  // only schedules any remaining weekly hours.
  const electiveUnits = buildElectiveUnits(ctx, theory, report);
  const electiveOccurrences = orderedElectiveOccurrences(state, electiveUnits);
  const electiveResult = solveElectives(state, electiveOccurrences);
  if (!electiveResult.success) {
    bestEffortElectives(state, electiveOccurrences, report);
  }
  for (const unit of electiveUnits) {
    for (const member of unit.members) {
      const covered = state.sessions.filter(
        (session) =>
          session.elective &&
          session.electiveGroup === unit.label &&
          session.divisionId === unit.division.id &&
          session.subjectId === member.subject.id,
      ).length;
      if (covered > 0) {
        pinnedHours.set(
          member.subject.id,
          (pinnedHours.get(member.subject.id) ?? 0) + covered,
        );
      }
    }
  }

  // Order theory subjects by how constrained they are (fewest slots first),
  // then by weekly hours, so scarce subjects claim slots early.
  const theoryOrder = theory
    .map((req) => ({
      req,
      candidates: enumerateTheoryPlacements(state, {
        subject: req.subject,
        division: req.division,
      }).length,
    }))
    .sort(
      (a, b) =>
        a.candidates - b.candidates ||
        Number(b.req.subject.weeklyHours) - Number(a.req.subject.weeklyHours) ||
        String(a.req.subject.code).localeCompare(String(b.req.subject.code)),
    )
    .map((item) => item.req);

  const orderedOccurrences = [];
  for (const req of theoryOrder) {
    const covered = pinnedHours.get(req.subject.id) ?? 0;
    const hours = Math.max(
      0,
      clampHours(req.subject.weeklyHours, 1, ctx.days.length * ctx.slots.length) - covered,
    );
    for (let index = 0; index < hours; index += 1) {
      orderedOccurrences.push({ ...req, occurrence: index + 1 });
    }
  }

  const theoryResult = solveTheory(state, orderedOccurrences);
  if (!theoryResult.success) {
    bestEffortTheory(state, orderedOccurrences, report);
  }

  if (electiveResult.capHit || practicalResult.capHit || theoryResult.capHit) {
    report(
      `Scheduling stopped after reaching the ${stepCap.toLocaleString()}-step safety limit; the remaining sessions could not be placed.`,
      'Reduce the number of concurrent divisions/subjects, or rerun with fewer pinned sessions.',
    );
  }

  const softScore = computeSoftScore(state.sessions, ctx);

  return {
    success: conflicts.length === 0,
    timetable: { sessions: state.sessions },
    conflicts,
    suggestions,
    stats: {
      attempts: state.attempts,
      durationMs: Date.now() - startedAt,
      softScore,
      steps:
        electiveResult.capHit || practicalResult.capHit || theoryResult.capHit
          ? stepCap
          : state.attempts,
      stepCap,
      capHit: electiveResult.capHit || practicalResult.capHit || theoryResult.capHit,
      pinnedSessions: state.sessions.filter((session) => session.pinned).length,
      fixedSlots: fixedSlotCount,
      electiveSessions: state.sessions.filter((session) => session.elective).length,
      weights,
    },
  };
}

export const ENGINE_VERSION = '2.0.0';
export { DEFAULT_STEP_CAP, THEORY, PRACTICAL };
