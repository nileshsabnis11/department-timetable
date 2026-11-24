import { computePracticalBlocks } from '../../lib/time.js';

/**
 * Department utilisation & load analytics — pure calculations.
 *
 * Reads a finished timetable plus master data; never mutates either. The
 * generator and validator are untouched: every number here is re-derived from
 * the sessions the app already stores.
 *
 * Weekly capacity follows the PRD grid: 6 teaching days × 6 slots = 36 weekly
 * slots per room, and 6 days × 3 practical blocks = 18 weekly 2-hour blocks per
 * lab.
 */

const THEORY = 'Theory';
const PRACTICAL = 'Practical';
const FIXED = 'Fixed';
const LAB = 'Lab';

export const LOAD_STATUS = Object.freeze({
  balanced: { label: 'Balanced', tone: 'emerald' },
  underloaded: { label: 'Underloaded < 60%', tone: 'amber' },
  atCapacity: { label: 'At Capacity 100%', tone: 'indigo' },
  overloaded: { label: 'Overloaded > 100%', tone: 'rose' },
  unknown: { label: 'No max load', tone: 'slate' },
});

const hoursOf = (session) => (session.slotIds ?? []).length;
const percentOf = (part, whole) => (whole > 0 ? (part / whole) * 100 : 0);
const round1 = (value) => Math.round(value * 10) / 10;

function loadStatus(total, max, percent) {
  if (!(max > 0)) return 'unknown';
  if (total > max) return 'overloaded';
  if (total === max) return 'atCapacity';
  if (percent != null && percent < 60) return 'underloaded';
  return 'balanced';
}

/**
 * Faculty load split into theory and practical hours.
 *
 * A parallel lab batch counts its own 2 hours, exactly like the generated
 * sessions do. Locked fixed blocks assigned to a faculty member count as
 * contact hours in the theory column, which keeps Theory + Practical = Total
 * and matches the Excel "Faculty Workload" tab. A lock scoped to every
 * division is stored once per division, so it is counted once per lock rather
 * than once per division.
 */
function facultyRow(member, sessions) {
  let theory = 0;
  let practical = 0;
  let fixedHours = 0;
  let theorySessions = 0;
  let practicalBatches = 0;
  const countedFixed = new Set();

  for (const session of sessions) {
    if (session.type === PRACTICAL) {
      const batches = (session.batches ?? []).filter(
        (batch) => batch.facultyId === member.id,
      ).length;
      if (batches > 0) {
        practical += batches * hoursOf(session);
        practicalBatches += batches;
      }
      continue;
    }

    if (session.facultyId !== member.id) continue;
    if (session.type === FIXED) {
      const lockKey = `${session.fixedSlotId ?? session.id}|${session.dayId}`;
      if (countedFixed.has(lockKey)) continue;
      countedFixed.add(lockKey);
    }
    theory += hoursOf(session);
    theorySessions += 1;
    if (session.type === FIXED) fixedHours += hoursOf(session);
  }

  const total = theory + practical;
  const max = Number(member.maxWeeklyLoad) || 0;
  const percent = max > 0 ? percentOf(total, max) : null;

  return {
    id: member.id,
    name: member.name ?? member.id,
    shortCode: member.shortCode ?? '',
    theory,
    practical,
    fixedHours,
    total,
    max,
    percent,
    status: loadStatus(total, max, percent),
    theorySessions,
    practicalBatches,
  };
}

/** One room's bookings, capacity and every entirely free 2-hour block. */
function roomRow(room, sessions, days, blocks, weeklySlots, weeklyBlocks) {
  const isLab = room.type === LAB;
  const bookedSlots = new Set();
  let bookedBlocks = 0;

  for (const session of sessions) {
    if (session.type === PRACTICAL) {
      const batches = (session.batches ?? []).filter(
        (batch) => batch.roomId === room.id,
      ).length;
      if (batches > 0) {
        bookedBlocks += batches;
        for (const slotId of session.slotIds ?? []) {
          bookedSlots.add(`${session.dayId}|${slotId}`);
        }
      }
      continue;
    }

    if (session.roomId !== room.id) continue;
    for (const slotId of session.slotIds ?? []) {
      bookedSlots.add(`${session.dayId}|${slotId}`);
    }
  }

  const capacity = isLab ? weeklyBlocks : weeklySlots;
  const booked = isLab ? bookedBlocks : bookedSlots.size;
  const free = Math.max(0, capacity - booked);

  const freeBlocks = [];
  for (const day of days) {
    for (const block of blocks) {
      const freeBlock = block.slotIds.every(
        (slotId) => !bookedSlots.has(`${day.id}|${slotId}`),
      );
      if (!freeBlock) continue;
      freeBlocks.push({
        dayId: day.id,
        dayLabel: day.label ?? day.id,
        slotIds: [...block.slotIds],
        label: `${day.short ?? day.label ?? day.id} ${block.start}–${block.end}`,
      });
    }
  }

  return {
    id: room.id,
    name: room.name ?? room.id,
    type: room.type ?? '—',
    isLab,
    booked,
    capacity,
    free,
    percent: percentOf(booked, capacity),
    bookedSlots: bookedSlots.size,
    freeBlocks,
  };
}

/**
 * @param {object} masterData
 * @param {object[]} sessions current timetable sessions
 * @returns {object} KPIs plus faculty and room rows
 */
export function buildAnalytics(masterData = {}, sessions = []) {
  const days = (masterData?.timeGrid?.workingDays ?? []).filter(
    (day) => day.enabled !== false,
  );
  const slots = masterData?.timeGrid?.slots ?? [];
  const blocks = computePracticalBlocks(slots, masterData?.timeGrid?.breaks ?? []);
  const weeklySlots = days.length * slots.length;
  const weeklyBlocks = days.length * blocks.length;

  const facultyRows = (masterData?.faculty ?? [])
    .map((member) => facultyRow(member, sessions))
    .sort(
      (first, second) =>
        second.total - first.total ||
        String(first.shortCode).localeCompare(String(second.shortCode)),
    );

  const roomRows = (masterData?.rooms ?? [])
    .map((room) => roomRow(room, sessions, days, blocks, weeklySlots, weeklyBlocks))
    .sort(
      (first, second) =>
        Number(first.isLab) - Number(second.isLab) ||
        second.percent - first.percent ||
        String(first.name).localeCompare(String(second.name)),
    );

  const theorySessions = sessions.filter((session) => session.type === THEORY).length;
  const practicalSessions = sessions.filter(
    (session) => session.type === PRACTICAL,
  ).length;
  const fixedSessions = sessions.filter((session) => session.type === FIXED).length;

  const classrooms = roomRows.filter((room) => !room.isLab);
  const labs = roomRows.filter((room) => room.isLab);

  const classroomBooked = classrooms.reduce((total, room) => total + room.booked, 0);
  const classroomCapacity = classrooms.reduce((total, room) => total + room.capacity, 0);
  const labBooked = labs.reduce((total, room) => total + room.booked, 0);
  const labCapacity = labs.reduce((total, room) => total + room.capacity, 0);

  const capped = facultyRows.filter((row) => row.max > 0);
  const averageLoadPercent =
    capped.length > 0
      ? capped.reduce((total, row) => total + row.percent, 0) / capped.length
      : 0;

  const freeLabBlocks = labs.reduce(
    (total, room) => total + room.freeBlocks.length,
    0,
  );

  return {
    weeklySlots,
    weeklyBlocks,
    days: days.length,
    divisionNames: (masterData?.divisions ?? []).map(
      (division) => division.name ?? division.id,
    ),
    facultyRows,
    roomRows,
    classrooms,
    labs,
    kpis: {
      theorySessions,
      practicalSessions,
      fixedSessions,
      totalSessions: theorySessions + practicalSessions,
      averageLoadPercent,
      cappedFacultyCount: capped.length,
      classroomPercent: percentOf(classroomBooked, classroomCapacity),
      classroomBooked,
      classroomCapacity,
      labPercent: percentOf(labBooked, labCapacity),
      labBooked,
      labCapacity,
      freeLabBlocks,
      totalFacultyHours: facultyRows.reduce((total, row) => total + row.total, 0),
    },
  };
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return '—';
  return `${Math.round(value)}%`;
}

export function roundAnalyticsValue(value) {
  return round1(value);
}
