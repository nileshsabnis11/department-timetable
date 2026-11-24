/**
 * Master-data integrity audit.
 *
 * The scheduler silently ignores dangling references (a subject pointing at a
 * deleted room, a batch override naming a removed faculty member). This module
 * surfaces those problems before generation, where they are cheap to fix.
 */

import { describeFixedSlots } from './fixedSlots.js';

const PRACTICAL = 'Practical';
const LAB = 'Lab';

function batchStrengthOf(batch) {
  const strength = Number(batch?.strength);
  return Number.isFinite(strength) && strength > 0 ? strength : 0;
}

function divisionStrengthOf(division) {
  const explicit = Number(division?.strength);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return (division?.batches ?? []).reduce(
    (total, batch) => total + batchStrengthOf(batch),
    0,
  );
}

function duplicates(items, keyOf, label) {
  const seen = new Map();
  const issues = [];
  for (const item of items) {
    const value = String(keyOf(item) ?? '').trim().toLowerCase();
    if (!value) continue;
    if (seen.has(value)) {
      issues.push({
        severity: 'warning',
        message: `${label} "${keyOf(item)}" appears more than once.`,
      });
    }
    seen.set(value, true);
  }
  return issues;
}

/**
 * @returns {{ severity: 'error' | 'warning', message: string }[]}
 */
export function auditMasterData(masterData = {}) {
  const issues = [];
  const add = (severity, message) => issues.push({ severity, message });

  const timeGrid = masterData.timeGrid ?? {};
  const divisions = Array.isArray(masterData.divisions) ? masterData.divisions : [];
  const rooms = Array.isArray(masterData.rooms) ? masterData.rooms : [];
  const faculty = Array.isArray(masterData.faculty) ? masterData.faculty : [];
  const subjects = Array.isArray(masterData.subjects) ? masterData.subjects : [];

  const enabledDays = (timeGrid.workingDays ?? []).filter((day) => day.enabled !== false);
  const slots = Array.isArray(timeGrid.slots) ? timeGrid.slots : [];
  const weeklyCapacity = enabledDays.length * slots.length;

  if (enabledDays.length === 0) {
    add('error', 'No working days are enabled, so nothing can be scheduled.');
  }
  if (slots.length === 0) {
    add('error', 'No teaching slots are configured in the Time Grid.');
  }
  if (divisions.length === 0) add('warning', 'No divisions are configured.');
  if (faculty.length === 0) add('warning', 'No faculty members are configured.');
  if (rooms.length === 0) add('warning', 'No rooms or labs are configured.');
  if (subjects.length === 0) add('warning', 'No subjects are configured.');

  // Fixed slots: unusable references and two locks fighting over one cell.
  const fixed = describeFixedSlots(masterData);
  for (const problem of fixed.problems) add('error', problem.message);

  const lockedCells = new Map();
  for (const entry of fixed.entries) {
    const scopes =
      entry.divisionId === 'ALL'
        ? divisions.map((division) => division.id)
        : [entry.divisionId];
    for (const divisionId of scopes) {
      for (const slotId of entry.slotIds) {
        const cellKey = `${divisionId}|${entry.dayId}|${slotId}`;
        const other = lockedCells.get(cellKey);
        if (other && other.id !== entry.id) {
          add(
            'warning',
            `Fixed slots “${other.label}” and “${entry.label}” both lock ${
              divisions.find((division) => division.id === divisionId)?.name ??
              divisionId
            } ${entry.dayLabel} ${entry.slotLabels.join(' + ')}.`,
          );
        }
        lockedCells.set(cellKey, entry);
      }
    }
  }

  issues.push(...duplicates(faculty, (member) => member.shortCode, 'Faculty short code'));
  issues.push(...duplicates(rooms, (room) => room.name, 'Room name'));
  issues.push(...duplicates(divisions, (division) => division.name, 'Division name'));
  issues.push(
    ...duplicates(
      subjects,
      (subject) => `${subject.divisionId}::${subject.code}`,
      'Subject code in the same division',
    ),
  );

  const facultyIds = new Set(faculty.map((member) => member.id));
  const roomById = new Map(rooms.map((room) => [room.id, room]));
  const divisionById = new Map(divisions.map((division) => [division.id, division]));

  const practicalDivisions = new Set();
  const theoryHoursByDivision = new Map();

  for (const division of divisions) {
    const batches = Array.isArray(division.batches) ? division.batches : [];
    issues.push(
      ...duplicates(batches, (batch) => batch.id, `Batch id in ${division.name || 'division'}`),
    );
    for (const batch of batches) {
      if (Number(batch.strength) < 0) {
        add('warning', `${division.name} ${batch.name}: batch strength cannot be negative.`);
      }
    }
  }

  for (const subject of subjects) {
    const label = `${subject.code || 'NO-CODE'} ${subject.name || ''}`.trim();
    const division = divisionById.get(subject.divisionId);
    if (!division) {
      add('error', `${label}: its division no longer exists. Reassign the subject.`);
    }

    if (!subject.facultyId || !facultyIds.has(subject.facultyId)) {
      add('error', `${label}: no valid faculty member is assigned.`);
    }

    if (subject.requiredRoomId) {
      const room = roomById.get(subject.requiredRoomId);
      if (!room) {
        add('error', `${label}: its specific room no longer exists. Pick another room.`);
      } else if (room.type !== subject.requiredRoomType) {
        add(
          'warning',
          `${label}: requires a ${subject.requiredRoomType} but the chosen room is a ${room.type}.`,
        );
      }
    }

    if (subject.type === PRACTICAL) {
      if (division) practicalDivisions.add(division.id);
      if (Number(subject.weeklyHours) !== 2) {
        add('warning', `${label}: practicals run as one 2-hour block, but ${subject.weeklyHours} hours are configured.`);
      }
      for (const [batchId, facultyId] of Object.entries(subject.batchFaculty ?? {})) {
        if (!facultyId) continue;
        if (!facultyIds.has(facultyId)) {
          add('warning', `${label}: a per-batch faculty lock points at a deleted faculty member.`);
        }
        if (division && !(division.batches ?? []).some((batch) => batch.id === batchId)) {
          add('warning', `${label}: a per-batch faculty lock points at a batch that no longer exists.`);
        }
      }
      continue;
    }

    if (division) {
      theoryHoursByDivision.set(
        division.id,
        (theoryHoursByDivision.get(division.id) ?? 0) + (Number(subject.weeklyHours) || 0),
      );
    }
    if (weeklyCapacity > 0 && Number(subject.weeklyHours) > weeklyCapacity) {
      add(
        'warning',
        `${label}: ${subject.weeklyHours} weekly hours exceed the ${weeklyCapacity} slots available in the week.`,
      );
    }
  }

  for (const divisionId of practicalDivisions) {
    const division = divisionById.get(divisionId);
    if (division && (division.batches ?? []).length === 0) {
      add(
        'error',
        `${division.name}: practical subjects need lab batches, but the division has none.`,
      );
    }
  }

  // Room capacity vs configured headcount.
  const classrooms = rooms.filter((room) => room.type !== LAB);
  for (const division of divisions) {
    const required = divisionStrengthOf(division);
    if (!required) continue;
    const largest = classrooms.reduce(
      (max, room) => Math.max(max, Number(room.capacity) || 0),
      0,
    );
    if (largest > 0 && largest < required) {
      add(
        'warning',
        `${division.name}: ${required} students need a classroom, but the largest classroom seats ${largest}.`,
      );
    }
    const theoryHours = theoryHoursByDivision.get(division.id) ?? 0;
    if (weeklyCapacity > 0 && theoryHours > weeklyCapacity) {
      add(
        'warning',
        `${division.name}: ${theoryHours} theory hours/week exceed its ${weeklyCapacity} slots.`,
      );
    }
  }

  const labs = rooms.filter((room) => room.type === LAB);
  for (const division of divisions) {
    const batches = division.batches ?? [];
    if (batches.length === 0) continue;
    if (labs.length < batches.length) {
      add(
        'warning',
        `${division.name}: ${batches.length} batches need ${batches.length} labs in parallel, but only ${labs.length} lab(s) exist.`,
      );
    }
    const largestBatch = batches.reduce(
      (max, batch) => Math.max(max, batchStrengthOf(batch)),
      0,
    );
    const seating = labs.filter((lab) => {
      const capacity = Number(lab.capacity);
      return !(Number.isFinite(capacity) && capacity > 0) || capacity >= largestBatch;
    });
    if (largestBatch > 0 && seating.length < batches.length) {
      add(
        'warning',
        `${division.name}: only ${seating.length} lab(s) seat a ${largestBatch}-student batch, but ${batches.length} batches run in parallel.`,
      );
    }
  }

  return issues;
}

export default auditMasterData;
