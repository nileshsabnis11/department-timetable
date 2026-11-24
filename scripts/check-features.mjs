/**
 * Feature checks for Multi-Semester Archive, Elective Groups, scheduler
 * weights, calendar export, storage health and one-click clash fixes.
 *
 * Run with `npm run check:features`. Uses a localStorage stub, so it needs no
 * browser and writes nothing outside this process.
 */
import assert from 'node:assert/strict';

class MemoryStorage {
  constructor() {
    this.map = new Map();
  }
  getItem(key) {
    return this.map.has(key) ? this.map.get(key) : null;
  }
  setItem(key, value) {
    this.map.set(key, String(value));
  }
  removeItem(key) {
    this.map.delete(key);
  }
  clear() {
    this.map.clear();
  }
  key(index) {
    return [...this.map.keys()][index] ?? null;
  }
  get length() {
    return this.map.size;
  }
}

const storage = new MemoryStorage();
globalThis.window = { localStorage: storage };

const {
  SEMESTERS_STORAGE_KEY,
  ACTIVE_SEMESTER_KEY,
  applySemesterHeader,
  createSemester,
  deleteSemester,
  duplicateSemester,
  importSemester,
  loadSemesterState,
  readSemesterArchive,
  renameSemester,
  setSemesterStatus,
} = await import('../src/utils/semesterStore.js');
const { generateTimetable } = await import('../src/engine/scheduler.js');
const { validateTimetable } = await import('../src/engine/validator.js');
const { parseSubjectRows, SUBJECT_CSV_HEADERS } = await import('../src/utils/csvImport.js');
const { buildCoverage, swapOrMove } = await import(
  '../src/components/timetable/timetableUtils.js'
);
const { normalizeWeights } = await import('../src/lib/schedulerWeights.js');
const { buildCalendar } = await import('../src/utils/calendarExport.js');
const { normalizeMasterDataShape } = await import('../src/utils/semesterStore.js');
const { measureStorage, formatBytes } = await import('../src/utils/storageHealth.js');
const { proposeClashFixes } = await import('../src/utils/conflictFixer.js');
const { enrollmentBySubject, electiveEnrollmentSummary } = await import(
  '../src/lib/electiveEnrollment.js'
);
const { parseStudentChoiceRows } = await import('../src/utils/studentImport.js');

const MASTER = 'timetable-studio.master-data.v1';
const TIMETABLE = 'timetable-studio.timetable.v1';
const PRINT = 'timetable-studio.print-settings.v1';
const PROXY = 'proxyHistory';
let checks = 0;
const ok = (condition, message) => {
  assert.ok(condition, message);
  checks += 1;
};

const grid = {
  workingDays: [
    { id: 'MON', label: 'Monday', short: 'Mon', enabled: true },
    { id: 'TUE', label: 'Tuesday', short: 'Tue', enabled: true },
  ],
  slots: [
    { id: 'S1', label: 'Slot 1', start: '10:00', end: '11:00' },
    { id: 'S2', label: 'Slot 2', start: '11:00', end: '12:00' },
    { id: 'S3', label: 'Slot 3', start: '12:45', end: '13:45' },
  ],
  breaks: [],
};

const master = {
  schemaVersion: 1,
  timeGrid: grid,
  divisions: [{ id: 'D1', name: 'SY', batches: [] }, { id: 'D2', name: 'TY', batches: [] }],
  rooms: [
    { id: 'R1', name: 'Room 1', type: 'Classroom', capacity: 60 },
    { id: 'R2', name: 'Room 2', type: 'Classroom', capacity: 60 },
    { id: 'R3', name: 'Room 3', type: 'Classroom', capacity: 60 },
  ],
  faculty: [
    { id: 'F1', name: 'Asha', shortCode: 'AKD', maxWeeklyLoad: 18, unavailableSlots: {} },
    { id: 'F2', name: 'Rohan', shortCode: 'RHM', maxWeeklyLoad: 18, unavailableSlots: {} },
    { id: 'F3', name: 'Neha', shortCode: 'NVS', maxWeeklyLoad: 18, unavailableSlots: {} },
  ],
  subjects: [
    { id: 'A', code: 'CS601A', name: 'Artificial Intelligence', divisionId: 'D1', type: 'Theory', weeklyHours: 3, facultyId: 'F1', requiredRoomType: 'Classroom', electiveGroup: 'PE-I' },
    { id: 'B', code: 'CS601B', name: 'Internet of Things', divisionId: 'D1', type: 'Theory', weeklyHours: 3, facultyId: 'F2', requiredRoomType: 'Classroom', electiveGroup: 'PE-I' },
    { id: 'C', code: 'CS601C', name: 'Programmable Logic Controllers', divisionId: 'D1', type: 'Theory', weeklyHours: 3, facultyId: 'F3', requiredRoomType: 'Classroom', electiveGroup: 'PE-I' },
  ],
  fixedSlots: [],
  electiveGroups: [],
};

// --- Parallel elective groups ---------------------------------------------
const generated = generateTimetable(master);
ok(generated.success, 'parallel elective timetable generates without conflicts');
const electiveSessions = generated.timetable.sessions.filter(
  (session) => session.electiveGroup === 'PE-I',
);
ok(electiveSessions.length === 9, 'every option runs for all three weekly hours');
const electiveSlots = new Map();
for (const session of electiveSessions) {
  const slotKey = `${session.dayId}|${session.slotIds[0]}`;
  if (!electiveSlots.has(slotKey)) electiveSlots.set(slotKey, []);
  electiveSlots.get(slotKey).push(session);
}
ok(electiveSlots.size === 3, 'three parallel slots are used');
ok(
  [...electiveSlots.values()].every(
    (group) =>
      group.length === 3 &&
      new Set(group.map((session) => session.roomId)).size === 3 &&
      new Set(group.map((session) => session.facultyId)).size === 3,
  ),
  'each slot has three distinct rooms and faculty',
);
const electiveValidation = validateTimetable(generated.timetable, master);
ok(electiveValidation.isValid, 'validator accepts the shared division slot');
ok(
  electiveValidation.divisionClashes.length === 0 &&
    electiveValidation.facultyClashes.length === 0 &&
    electiveValidation.roomClashes.length === 0,
  'zero division, faculty and room clashes',
);
ok(generated.stats.electiveSessions === 9, 'stats count elective sessions');

const forcedClash = [
  electiveSessions[0],
  { ...electiveSessions[1], electiveGroup: '' },
];
const forcedValidation = validateTimetable(
  { sessions: forcedClash },
  { ...master, subjects: master.subjects },
);
ok(
  forcedValidation.divisionClashes.length === 1,
  'a mixed-group division slot is still a clash',
);

// --- Subject CSV + backward compatibility ---------------------------------
const csvRows = [
  SUBJECT_CSV_HEADERS,
  ['CS601A', 'AI', 'SY', 'Theory', '3', 'AKD', 'Classroom', '', '', '', '', 'PE-I'],
];
const csvParsed = parseSubjectRows(csvRows, {
  faculty: master.faculty,
  divisions: master.divisions,
});
ok(csvParsed.validRows[0]?.electiveGroup === 'PE-I', 'CSV imports the electiveGroup column');
const legacyRows = [
  ['code', 'name', 'division', 'type', 'weeklyHours', 'facultyShortCode', 'requiredRoomType'],
  ['CS601A', 'AI', 'SY', 'Theory', '3', 'AKD', 'Classroom'],
];
const legacyParsed = parseSubjectRows(legacyRows, {
  faculty: master.faculty,
  divisions: master.divisions,
});
ok(legacyParsed.validRows[0]?.electiveGroup === '', 'older CSVs load with a blank group');
const legacyMaster = normalizeMasterDataShape({
  ...master,
  subjects: [{ ...master.subjects[0], electiveGroup: undefined }],
});
ok(legacyMaster.subjects[0].electiveGroup === '', 'older backups default to a blank group');

// --- Group move -----------------------------------------------------------
const coverage = buildCoverage(electiveSessions, master);
const representative = electiveSessions[0];
const groupAtStart = [...coverage.parallel.values()].find((group) =>
  group.some((session) => session.id === representative.id),
);
ok(groupAtStart?.length === 3, 'grid coverage groups the three options in one cell');
const moveTarget = { dayId: 'TUE', slotIds: ['S3'] };
const moved = swapOrMove(
  generated.timetable.sessions,
  representative.id,
  moveTarget,
  master,
);
ok(moved.ok, 'the parallel group can move as a whole');
const movedGroup = electiveSessions.filter(
  (session) =>
    session.dayId === representative.dayId &&
    session.slotIds[0] === representative.slotIds[0],
);
ok(
  moved.ok &&
    movedGroup.every((session) => {
      const next = moved.sessions.find((item) => item.id === session.id);
      return next?.dayId === 'TUE' && next.slotIds[0] === 'S3';
    }),
  'every option in the selected cell lands in the destination slot',
);
ok(
  moved.ok &&
    electiveSessions
      .filter((session) => !movedGroup.some((item) => item.id === session.id))
      .every((session) => {
        const next = moved.sessions.find((item) => item.id === session.id);
        return next?.dayId === session.dayId && next.slotIds[0] === session.slotIds[0];
      }),
  'the other elective slots stay untouched',
);
ok(
  validateTimetable({ sessions: moved.sessions }, master).isValid,
  'the moved group stays clash-free',
);
ok(
  !swapOrMove(
    generated.timetable.sessions,
    representative.id,
    { sessionId: electiveSessions[1].id },
    master,
  ).ok,
  'a group cannot be swapped into a filled slot',
);

// --- Separate elective groups ---------------------------------------------
// PE-I and PE-II are mutually exclusive baskets: no slot may carry both.
const separateMaster = {
  ...master,
  divisions: [{ id: 'D1', name: 'SY', batches: [], separateElectiveGroups: true }],
  rooms: ['R1', 'R2', 'R3', 'R4'].map((id) => ({
    id,
    name: `Room ${id}`,
    type: 'Classroom',
    capacity: 60,
  })),
  faculty: [
    { id: 'F1', name: 'Asha', shortCode: 'AKD', maxWeeklyLoad: 18, unavailableSlots: {} },
    { id: 'F2', name: 'Rohan', shortCode: 'RHM', maxWeeklyLoad: 18, unavailableSlots: {} },
    { id: 'F3', name: 'Neha', shortCode: 'NVS', maxWeeklyLoad: 18, unavailableSlots: {} },
    { id: 'F4', name: 'Ira', shortCode: 'IRA', maxWeeklyLoad: 18, unavailableSlots: {} },
  ],
  subjects: [
    ['A', 'CS601A', 'Artificial Intelligence', 'F1', 'PE-I'],
    ['B', 'CS601B', 'Internet of Things', 'F2', 'PE-I'],
    ['C', 'CS602A', 'Robotics', 'F3', 'PE-II'],
    ['D', 'CS602B', 'Data Science', 'F4', 'PE-II'],
  ].map(([id, code, name, facultyId, electiveGroup]) => ({
    id,
    code,
    name,
    divisionId: 'D1',
    type: 'Theory',
    weeklyHours: 3,
    facultyId,
    requiredRoomType: 'Classroom',
    electiveGroup,
  })),
};
const separateRun = generateTimetable(separateMaster);
const separateSessions = separateRun.timetable.sessions.filter(
  (session) => session.electiveGroup,
);
const labelsPerSlot = new Map();
for (const session of separateSessions) {
  const slotKey = `${session.dayId}|${session.slotIds[0]}`;
  if (!labelsPerSlot.has(slotKey)) labelsPerSlot.set(slotKey, new Set());
  labelsPerSlot.get(slotKey).add(session.electiveGroup);
}
ok(separateRun.success, 'two elective groups generate without conflicts');
ok(separateSessions.length === 12, 'both groups schedule every weekly hour');
ok(
  [...labelsPerSlot.values()].every((labels) => labels.size === 1),
  'different elective groups never share a slot',
);
ok(
  validateTimetable(separateRun.timetable, separateMaster).isValid,
  'the separated groups validate cleanly',
);

const forcedGroupSlot = [
  { ...separateSessions.find((session) => session.electiveGroup === 'PE-I') },
  (() => {
    const base = separateSessions.find((session) => session.electiveGroup === 'PE-II');
    const first = separateSessions.find((session) => session.electiveGroup === 'PE-I');
    return {
      ...base,
      dayId: first.dayId,
      dayLabel: first.dayLabel,
      slotIds: [...first.slotIds],
      slotLabels: [...first.slotLabels],
    };
  })(),
];
ok(
  validateTimetable({ sessions: forcedGroupSlot }, separateMaster).divisionClashes.length === 1,
  'two groups in one slot are rejected',
);
ok(
  validateTimetable(
    { sessions: forcedGroupSlot },
    {
      ...separateMaster,
      divisions: [
        { ...separateMaster.divisions[0], separateElectiveGroups: false },
      ],
    },
  ).divisionClashes.length === 0,
  'the division can opt out of group separation',
);

// --- Student elective choices ---------------------------------------------
const choiceMaster = {
  ...separateMaster,
  divisions: [
    {
      id: 'D1',
      name: 'SY',
      batches: [1, 2, 3, 4].map((number) => ({
        id: `CB${number}`,
        name: `SY-B${number}`,
        strength: 18,
      })),
    },
  ],
  rooms: ['R1', 'R2', 'R3'].map((id) => ({
    id,
    name: `Room ${id}`,
    type: 'Classroom',
    capacity: 20,
  })),
  subjects: [
    ['A', 'CS601A', 'Artificial Intelligence'],
    ['B', 'CS601B', 'Internet of Things'],
    ['C', 'CS601C', 'Programmable Logic Controllers'],
  ].map(([id, code, name], index) => ({
    id,
    code,
    name,
    divisionId: 'D1',
    type: 'Theory',
    weeklyHours: 3,
    facultyId: separateMaster.faculty[index].id,
    requiredRoomType: 'Classroom',
    electiveGroup: 'PE-I',
  })),
  students: [
    ...Array.from({ length: 18 }, (_, index) => ({
      id: `SA${index}`,
      rollNo: `A${index}`,
      name: `AI ${index}`,
      divisionId: 'D1',
      choices: { 'PE-I': 'A' },
    })),
    ...Array.from({ length: 12 }, (_, index) => ({
      id: `SB${index}`,
      rollNo: `B${index}`,
      name: `IoT ${index}`,
      divisionId: 'D1',
      choices: { 'PE-I': 'B' },
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      id: `SC${index}`,
      rollNo: `C${index}`,
      name: `PLC ${index}`,
      divisionId: 'D1',
      choices: { 'PE-I': 'C' },
    })),
    // Undecided students still count towards covering the 72-student division.
    ...Array.from({ length: 38 }, (_, index) => ({
      id: `SN${index}`,
      rollNo: `N${index}`,
      name: `No choice ${index}`,
      divisionId: 'D1',
      choices: {},
    })),
  ],
};
const enrollment = enrollmentBySubject(choiceMaster);
ok(
  enrollment.get('A') === 18 && enrollment.get('B') === 12 && enrollment.get('C') === 4,
  'choices count per option',
);
const choiceRun = generateTimetable(choiceMaster);
ok(choiceRun.success, '72-student division schedules in three 20-seat rooms');

// A roster that covers only part of the division must not shrink rooms.
const partialMaster = {
  ...choiceMaster,
  students: choiceMaster.students.filter(
    (student) => Object.keys(student.choices ?? {}).length > 0,
  ),
};
ok(
  enrollmentBySubject(partialMaster).size === 0,
  'an incomplete roster is not trusted for room sizing',
);
const partialSummary = electiveEnrollmentSummary(partialMaster);
ok(
  partialSummary.length === 1 &&
    partialSummary[0].roster.complete === false &&
    partialSummary[0].roster.students === 34 &&
    partialSummary[0].roster.strength === 72,
  'the summary flags an incomplete roster',
);
const fallbackMaster = {
  ...partialMaster,
  rooms: [
    ...partialMaster.rooms,
    ...[1, 2, 3].map((number) => ({
      id: `BIG${number}`,
      name: `Hall ${number}`,
      type: 'Classroom',
      capacity: 90,
    })),
  ],
};
const fallbackRun = generateTimetable(fallbackMaster);
const fallbackSessions = fallbackRun.timetable.sessions.filter(
  (session) => session.electiveGroup === 'PE-I',
);
ok(
  fallbackRun.success &&
    fallbackSessions.length === 9 &&
    fallbackSessions.every(
      (session) =>
        session.enrolledStudents === 0 && String(session.roomId).startsWith('BIG'),
    ),
  'an incomplete roster sizes rooms by the division strength',
);
ok(
  validateTimetable(choiceRun.timetable, choiceMaster).capacityViolations.length === 0,
  'each option room seats its own cohort',
);
const parsedStudents = parseStudentChoiceRows(
  [
    ['rollNo', 'name', 'division', 'PE-I'],
    ['26CS001', 'Aarav Sharma', 'SY', 'CS601A'],
  ],
  { divisions: choiceMaster.divisions, subjects: choiceMaster.subjects },
);
ok(
  parsedStudents.validRows.length === 1 &&
    parsedStudents.validRows[0].choices['PE-I'] === 'A',
  'pasted student choices map codes to options',
);

const defaultWeights = generateTimetable(master, { weights: normalizeWeights({}) });
ok(defaultWeights.stats.softScore === generated.stats.softScore, 'default weights preserve the score');
ok(normalizeWeights({ fatigue: 9 }).fatigue === 3, 'weights clamp to 3');

// --- Calendar export -------------------------------------------------------
const calendar = buildCalendar(master, generated.timetable.sessions, {
  settings: { wefDate: '2027-01-04', academicYear: '2026–27', semester: 'Even Semester' },
});
ok(calendar.content.startsWith('BEGIN:VCALENDAR'), 'calendar header');
ok(calendar.events === generated.timetable.sessions.length, 'one event per session');
ok(calendar.content.includes('RRULE:FREQ=WEEKLY'), 'weekly recurrence');
ok(calendar.content.trim().endsWith('END:VCALENDAR'), 'calendar footer');

// --- Clash fixes -----------------------------------------------------------
storage.clear();
storage.setItem(MASTER, JSON.stringify(master));
const clashing = [
  {
    id: 'X1', type: 'Theory', dayId: 'MON', slotIds: ['S1'], dayLabel: 'Monday',
    subjectId: 'A', subjectCode: 'EL1', subjectName: 'Elective A', divisionId: 'D1',
    divisionName: 'SY', facultyId: 'F1', facultyName: 'Asha', facultyShortCode: 'AKD',
    roomId: 'R1', roomName: 'Room 1',
  },
  {
    id: 'X2', type: 'Theory', dayId: 'MON', slotIds: ['S1'], dayLabel: 'Monday',
    subjectId: 'B', subjectCode: 'EL2', subjectName: 'Elective B', divisionId: 'D1',
    divisionName: 'SY', facultyId: 'F2', facultyName: 'Rohan', facultyShortCode: 'RHM',
    roomId: 'R2', roomName: 'Room 2',
  },
];
const fixes = proposeClashFixes(clashing, master, { maxSessions: 1, perSession: 1 });
ok(fixes.length === 1, 'a clash fix is proposed');
ok(fixes[0].reduction >= 1, 'the proposed fix reduces the clash count');

// --- Semester archive ------------------------------------------------------
storage.clear();
storage.setItem(MASTER, JSON.stringify(master));
storage.setItem(PRINT, JSON.stringify({
  academicYear: '2025–26', semester: 'Even Semester', signatures: ['A', 'B', 'C'],
  overrideSemesterHeader: false,
}));
storage.setItem(PROXY, JSON.stringify([{ id: 'P1', date: '2026-01-05', assignments: [] }]));
storage.setItem(TIMETABLE, JSON.stringify({ sessions: generated.timetable.sessions }));

let state = loadSemesterState();
ok(state.semesters.length === 1, 'legacy data migrates into one semester');
let current = state.semesters[0];
ok(current.name === '2025–26 Even Semester', 'migrated semester name');
ok(current.timetable?.sessions?.length > 0, 'migrated timetable is kept');
ok(current.proxyHistory.length === 1, 'proxy history is scoped into the semester');
ok(storage.getItem(ACTIVE_SEMESTER_KEY) === current.id, 'active pointer written');

const headerFollows = applySemesterHeader(
  { academicYear: '2025–26', semester: 'Even Semester', overrideSemesterHeader: false },
  { academicYear: '2027–28', termType: 'Odd' },
);
ok(headerFollows.academicYear === '2027–28' && headerFollows.semester === 'Odd Semester', 'header follows the semester');
const headerOverride = applySemesterHeader(
  { academicYear: '2025–26', semester: 'Even Semester', overrideSemesterHeader: true },
  { academicYear: '2027–28', termType: 'Odd' },
);
ok(headerOverride.academicYear === '2025–26', 'header override is preserved');

state = renameSemester(state, current.id, { academicYear: '2026–27', termType: 'Odd' });
current = state.semesters.find((semester) => semester.id === current.id);
ok(current.name === '2026–27 Odd Semester', 'rename updates the display name');
ok(
  JSON.parse(storage.getItem(PRINT)).academicYear === '2026–27',
  'rename updates the printed header',
);

state = createSemester(state, {
  academicYear: '2027–28',
  termType: 'Even',
  cloneFromId: current.id,
  clone: { timeGrid: true, divisions: true, rooms: true, faculty: true, subjects: true },
});
const cloned = state.semesters.find((semester) => semester.id === state.currentId);
ok(
  cloned.masterData.subjects.some((subject) => subject.electiveGroup === 'PE-I'),
  'elective groups clone with subjects',
);
ok(cloned.timetable === null, 'cloned semester starts without a timetable');

state = setSemesterStatus(state, cloned.id, 'Archived');
ok(
  state.semesters.find((semester) => semester.id === cloned.id).status === 'Archived',
  'archive toggles status',
);

state = duplicateSemester(state, cloned.id);
const copy = state.semesters.find((semester) => semester.id === state.currentId);
ok(copy.name.endsWith('(Copy)') && copy.id !== cloned.id, 'duplicate creates a new active copy');

state = importSemester(state, {
  masterData: master,
  timetable: { sessions: generated.timetable.sessions },
  academicYear: '2024–25',
  termType: 'Odd',
});
const imported = state.semesters.find((semester) => semester.id === state.currentId);
ok(imported.name === '2024–25 Odd Semester', 'backup imports as its own semester');
ok(imported.masterData.divisions.length === 2, 'imported backup keeps master data');
ok(
  imported.printSettings.academicYear === '2024–25',
  'imported semester header is its own term',
);

ok(readSemesterArchive().length === state.semesters.length, 'archive reader sees every semester');

const beforeDelete = state.semesters.length;
state = deleteSemester(state, imported.id);
ok(state.semesters.length === beforeDelete - 1, 'delete removes one semester');
const guard = deleteSemester({ semesters: [state.semesters[0]], currentId: state.semesters[0].id }, state.semesters[0].id);
ok(guard.semesters.length === 1, 'the last semester cannot be deleted');

// --- Storage health -------------------------------------------------------
storage.clear();
storage.setItem('timetable_semesters', 'x'.repeat(1024));
storage.setItem('unrelated-key', 'y'.repeat(2048));
const usage = measureStorage();
ok(usage.bytes >= 1024, 'storage usage counts app keys');
ok(!usage.keys.some((entry) => entry.key === 'unrelated-key'), 'unrelated keys are ignored');
ok(formatBytes(2048) === '2.0 KB', 'formatBytes renders kilobytes');
storage.setItem('timetable_semesters', 'x'.repeat(4.3 * 1024 * 1024));
ok(measureStorage().warning, 'storage warns near the budget');
ok(storage.getItem(SEMESTERS_STORAGE_KEY) !== null, 'season archive key still present');

console.log(`Feature checks passed — ${checks} assertions.`);
