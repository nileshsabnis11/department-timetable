/**
 * Shared domain types and constants for the timetable generator.
 *
 * The scheduling engine (Phase 2) and every UI module import these constants so
 * the stored master data keeps a single, stable shape.
 *
 * @typedef {'Theory' | 'Practical'} SubjectType
 * @typedef {'Classroom' | 'Lab'} RoomType
 *
 * @typedef {Object} WorkingDay
 * @property {string} id        Stable id, e.g. "MON"
 * @property {string} label     Full display name, e.g. "Monday"
 * @property {string} short     Short label, e.g. "Mon"
 * @property {boolean} enabled  Whether the day is part of the timetable
 *
 * @typedef {Object} Slot
 * @property {string} id     Stable id, e.g. "S1"
 * @property {string} label  Display label, e.g. "Slot 1"
 * @property {string} start  24h "HH:MM"
 * @property {string} end    24h "HH:MM"
 *
 * @typedef {Object} Break
 * @property {string} id           Stable id
 * @property {string} label        Display label
 * @property {'Lunch' | 'Recess'} kind
 * @property {string} afterSlotId  Slot the break immediately follows
 * @property {string} start        24h "HH:MM"
 * @property {string} end          24h "HH:MM"
 *
 * @typedef {Object} TimeGrid
 * @property {WorkingDay[]} workingDays
 * @property {Slot[]} slots
 * @property {Break[]} breaks
 *
 * @typedef {Object} Batch
 * @property {string} id        e.g. "SY-B1"
 * @property {string} name      e.g. "SY-B1"
 * @property {number} [strength] Students in the batch; 0/absent = ignore room capacity
 *
 * @typedef {Object} Division
 * @property {string} id
 * @property {string} name
 * @property {number} [strength] Optional explicit division headcount (else sum of batches)
 * @property {Batch[]} batches
 *
 * @typedef {Object} Room
 * @property {string} id
 * @property {string} name
 * @property {RoomType} type
 * @property {number} capacity
 *
 * @typedef {Object} Faculty
 * @property {string} id
 * @property {string} name
 * @property {string} shortCode
 * @property {number} maxWeeklyLoad
 * @property {Record<string, boolean>} unavailableSlots  Keyed by "DAY:SLOT"
 *
 * @typedef {Object} Subject
 * @property {string} id
 * @property {string} code
 * @property {string} name
 * @property {string} divisionId
 * @property {SubjectType} type
 * @property {number} weeklyHours      Theory: hours/week. Practical: hours per batch.
 * @property {string} facultyId
 * @property {Record<string, string>} batchFaculty  Practical-only faculty overrides
 * @property {RoomType} requiredRoomType
 * @property {string} requiredRoomId   Optional specific room/lab; empty = any of that type
 *
 * @typedef {Object} FixedSlot
 * @property {string} id
 * @property {string} division     Division id/name, or "ALL" for institute-wide
 * @property {string} day          Working day id ("MON") or label ("Monday")
 * @property {number[]} slotIndices Zero-based slot positions, e.g. [5] or [4, 5]
 * @property {string} label        e.g. "Open Elective", "Mentoring / Library"
 * @property {string} [facultyId] Optional locked faculty member
 * @property {string} [roomId]    Optional locked classroom/lab
 *
 * @typedef {Object} MasterData
 * @property {number} schemaVersion
 * @property {TimeGrid} timeGrid
 * @property {Division[]} divisions
 * @property {Room[]} rooms
 * @property {Faculty[]} faculty
 * @property {Subject[]} subjects
 * @property {FixedSlot[]} [fixedSlots] Pre-assigned institutional blocks (default [])
 */

export const SUBJECT_TYPES = Object.freeze({
  THEORY: 'Theory',
  PRACTICAL: 'Practical',
});

export const ROOM_TYPES = Object.freeze({
  CLASSROOM: 'Classroom',
  LAB: 'Lab',
});

export const BREAK_KINDS = Object.freeze({
  LUNCH: 'Lunch',
  RECESS: 'Recess',
});

/** Number of consecutive slots a practical occupies. */
export const PRACTICAL_BLOCK_SIZE = 2;

export const STORAGE_KEY = 'timetable-studio.master-data.v1';
export const SCHEMA_VERSION = 1;
