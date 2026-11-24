import { ROOM_TYPES, SCHEMA_VERSION, SUBJECT_TYPES } from './types.js';
import { DEFAULT_BREAKS, DEFAULT_SLOTS, DEFAULT_WORKING_DAYS } from './defaultConfig.js';

const clone = (value) => JSON.parse(JSON.stringify(value));

const SAMPLE_FACULTY = [
  {
    id: 'FAC-1',
    name: 'Dr. Anil Kulkarni',
    shortCode: 'AKP',
    maxWeeklyLoad: 18,
    unavailableSlots: {},
  },
  {
    id: 'FAC-2',
    name: 'Prof. Sunita Deshmukh',
    shortCode: 'SVD',
    maxWeeklyLoad: 16,
    unavailableSlots: { 'MON:S1': true, 'MON:S2': true },
  },
  {
    id: 'FAC-3',
    name: 'Dr. Rajesh Iyer',
    shortCode: 'RMI',
    maxWeeklyLoad: 18,
    unavailableSlots: {},
  },
  {
    id: 'FAC-4',
    name: 'Prof. Meera Joshi',
    shortCode: 'MPJ',
    maxWeeklyLoad: 16,
    unavailableSlots: { 'FRI:S5': true, 'FRI:S6': true },
  },
  {
    id: 'FAC-5',
    name: 'Dr. Vikram Patil',
    shortCode: 'VNP',
    maxWeeklyLoad: 18,
    unavailableSlots: { 'SAT:S5': true, 'SAT:S6': true },
  },
  {
    id: 'FAC-6',
    name: 'Prof. Kavita Rao',
    shortCode: 'KVR',
    maxWeeklyLoad: 16,
    unavailableSlots: { 'WED:S1': true },
  },
  {
    id: 'FAC-7',
    name: 'Dr. Sameer Naik',
    shortCode: 'SMN',
    maxWeeklyLoad: 18,
    unavailableSlots: {},
  },
  {
    id: 'FAC-8',
    name: 'Prof. Priya Shah',
    shortCode: 'PRS',
    maxWeeklyLoad: 14,
    unavailableSlots: { 'THU:S3': true, 'THU:S4': true },
  },
];

const SAMPLE_ROOMS = [
  { id: 'ROOM-1', name: 'Classroom 101', type: ROOM_TYPES.CLASSROOM, capacity: 70 },
  { id: 'ROOM-2', name: 'Classroom 102', type: ROOM_TYPES.CLASSROOM, capacity: 70 },
  { id: 'LAB-1', name: 'Lab 1 — Programming', type: ROOM_TYPES.LAB, capacity: 32 },
  { id: 'LAB-2', name: 'Lab 2 — Networks', type: ROOM_TYPES.LAB, capacity: 32 },
  { id: 'LAB-3', name: 'Lab 3 — Database', type: ROOM_TYPES.LAB, capacity: 32 },
  { id: 'LAB-4', name: 'Lab 4 — Electronics', type: ROOM_TYPES.LAB, capacity: 32 },
];

const batches = (division) =>
  [1, 2, 3, 4].map((number) => ({
    id: `${division}-B${number}`,
    name: `${division}-B${number}`,
    strength: 16,
  }));

const SAMPLE_DIVISIONS = [
  { id: 'DIV-SY', name: 'SY', batches: batches('SY') },
  { id: 'DIV-TY', name: 'TY', batches: batches('TY') },
];

const theory = (id, code, name, divisionId, weeklyHours, facultyId) => ({
  id,
  code,
  name,
  divisionId,
  type: SUBJECT_TYPES.THEORY,
  weeklyHours,
  facultyId,
  batchFaculty: {},
  requiredRoomType: ROOM_TYPES.CLASSROOM,
  requiredRoomId: '',
  electiveGroup: '',
});

const practical = (id, code, name, divisionId, facultyId, requiredRoomId) => ({
  id,
  code,
  name,
  divisionId,
  type: SUBJECT_TYPES.PRACTICAL,
  weeklyHours: 2,
  facultyId,
  batchFaculty: {},
  requiredRoomType: ROOM_TYPES.LAB,
  requiredRoomId,
  electiveGroup: '',
});

const SAMPLE_SUBJECTS = [
  // SY — Semester III
  theory('SUB-1', 'CS301', 'Data Structures & Algorithms', 'DIV-SY', 4, 'FAC-1'),
  practical('SUB-2', 'CS301L', 'Data Structures Lab', 'DIV-SY', 'FAC-1', 'LAB-1'),
  theory('SUB-3', 'CS302', 'Digital Electronics', 'DIV-SY', 3, 'FAC-3'),
  practical('SUB-4', 'CS302L', 'Digital Electronics Lab', 'DIV-SY', 'FAC-3', 'LAB-4'),
  theory('SUB-5', 'MA301', 'Discrete Mathematics', 'DIV-SY', 3, 'FAC-6'),
  theory('SUB-6', 'CS303', 'Object Oriented Programming', 'DIV-SY', 3, 'FAC-4'),
  practical('SUB-7', 'CS303L', 'OOP Lab', 'DIV-SY', 'FAC-4', 'LAB-1'),

  // TY — Semester V
  theory('SUB-8', 'CS501', 'Database Management Systems', 'DIV-TY', 4, 'FAC-2'),
  practical('SUB-9', 'CS501L', 'DBMS Lab', 'DIV-TY', 'FAC-2', 'LAB-3'),
  theory('SUB-10', 'CS502', 'Operating Systems', 'DIV-TY', 4, 'FAC-7'),
  practical('SUB-11', 'CS502L', 'Operating Systems Lab', 'DIV-TY', 'FAC-7', 'LAB-1'),
  theory('SUB-12', 'CS503', 'Computer Networks', 'DIV-TY', 3, 'FAC-5'),
  practical('SUB-13', 'CS503L', 'Networks Lab', 'DIV-TY', 'FAC-5', 'LAB-2'),
  theory('SUB-14', 'CS504', 'Software Engineering', 'DIV-TY', 3, 'FAC-8'),
];

/**
 * Realistic two-division engineering department used to exercise Phase 1:
 * SY + TY, four lab batches each, two classrooms, four labs, eight faculty.
 */
export function createSampleMasterData() {
  return {
    schemaVersion: SCHEMA_VERSION,
    timeGrid: {
      workingDays: clone(DEFAULT_WORKING_DAYS),
      slots: clone(DEFAULT_SLOTS),
      breaks: clone(DEFAULT_BREAKS),
    },
    divisions: clone(SAMPLE_DIVISIONS),
    rooms: clone(SAMPLE_ROOMS),
    faculty: clone(SAMPLE_FACULTY),
    subjects: clone(SAMPLE_SUBJECTS),
    students: [],
    fixedSlots: [],
    electiveGroups: [],
  };
}
