import { BREAK_KINDS, SCHEMA_VERSION } from './types.js';

/** 10:00 AM – 5:00 PM college day, Monday to Saturday. */
export const DEFAULT_WORKING_DAYS = [
  { id: 'MON', label: 'Monday', short: 'Mon', enabled: true },
  { id: 'TUE', label: 'Tuesday', short: 'Tue', enabled: true },
  { id: 'WED', label: 'Wednesday', short: 'Wed', enabled: true },
  { id: 'THU', label: 'Thursday', short: 'Thu', enabled: true },
  { id: 'FRI', label: 'Friday', short: 'Fri', enabled: true },
  { id: 'SAT', label: 'Saturday', short: 'Sat', enabled: true },
];

/** Six 60-minute teaching slots, grouped into three 2-hour practical blocks. */
export const DEFAULT_SLOTS = [
  { id: 'S1', label: 'Slot 1', start: '10:00', end: '11:00' },
  { id: 'S2', label: 'Slot 2', start: '11:00', end: '12:00' },
  { id: 'S3', label: 'Slot 3', start: '12:45', end: '13:45' },
  { id: 'S4', label: 'Slot 4', start: '13:45', end: '14:45' },
  { id: 'S5', label: 'Slot 5', start: '15:00', end: '16:00' },
  { id: 'S6', label: 'Slot 6', start: '16:00', end: '17:00' },
];

export const DEFAULT_BREAKS = [
  {
    id: 'BRK-LUNCH',
    label: 'Lunch Break',
    kind: BREAK_KINDS.LUNCH,
    afterSlotId: 'S2',
    start: '12:00',
    end: '12:45',
  },
  {
    id: 'BRK-RECESS',
    label: 'Short Recess',
    kind: BREAK_KINDS.RECESS,
    afterSlotId: 'S4',
    start: '14:45',
    end: '15:00',
  },
];

const clone = (value) => JSON.parse(JSON.stringify(value));

/** Fresh, empty master data using the PRD default time grid. */
export function createEmptyMasterData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    timeGrid: {
      workingDays: clone(DEFAULT_WORKING_DAYS),
      slots: clone(DEFAULT_SLOTS),
      breaks: clone(DEFAULT_BREAKS),
    },
    divisions: [],
    rooms: [],
    faculty: [],
    subjects: [],
    students: [],
    fixedSlots: [],
    electiveGroups: [],
  };
}
