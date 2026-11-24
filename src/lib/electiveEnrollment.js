/**
 * Elective enrolment helpers — pure, UI-independent.
 *
 * A student picks at most one option per elective group. These helpers turn the
 * roster (`masterData.students[].choices`) into per-option head counts so the
 * scheduler can size the room to the cohort that actually attends the option,
 * instead of the whole division.
 *
 * Choices are stored as `{ [electiveGroupLabel]: subjectId }`, using the group
 * label exactly as it appears on the subjects.
 *
 * Coverage rule: a division's choices are only trusted once the roster lists at
 * least as many students as the division holds. A partially imported class list
 * would otherwise shrink every option's room to the few students imported, so
 * an incomplete division keeps falling back to the division strength.
 */

const normalize = (value) => String(value ?? '').trim();

/** Division headcount: explicit strength, else the sum of its batch strengths. */
export function divisionStrengthOf(division) {
  const explicit = Number(division?.strength);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const batches = Array.isArray(division?.batches) ? division.batches : [];
  return batches.reduce((total, batch) => {
    const strength = Number(batch?.strength);
    return total + (Number.isFinite(strength) && strength > 0 ? strength : 0);
  }, 0);
}

/**
 * Roster coverage per division.
 *
 * `complete` is true only when the division's headcount is known (strength > 0)
 * and the roster lists at least that many students. An unknown headcount cannot
 * be checked, so it is treated as incomplete and rooms fall back to the division
 * strength (which is 0/unknown and therefore unconstrained), never to partial
 * choice counts.
 *
 * @returns {Map<string, {divisionId:string, divisionName:string, strength:number, students:number, complete:boolean}>}
 */
export function rosterCoverage(masterData = {}) {
  const divisions = Array.isArray(masterData.divisions) ? masterData.divisions : [];
  const students = Array.isArray(masterData.students) ? masterData.students : [];

  const rosterCounts = new Map();
  for (const student of students) {
    const divisionId = normalize(student?.divisionId);
    if (!divisionId) continue;
    rosterCounts.set(divisionId, (rosterCounts.get(divisionId) ?? 0) + 1);
  }

  const coverage = new Map();
  for (const division of divisions) {
    const strength = divisionStrengthOf(division);
    const rosterStudents = rosterCounts.get(division.id) ?? 0;
    coverage.set(division.id, {
      divisionId: division.id,
      divisionName: division.name ?? division.id,
      strength,
      students: rosterStudents,
      complete: strength > 0 && rosterStudents >= strength,
    });
  }
  return coverage;
}

/** All parallel elective groups, optionally limited to one division. */
export function electiveGroups(masterData = {}, divisionId = '') {
  const groups = new Map();

  for (const subject of masterData.subjects ?? []) {
    if (subject.type !== 'Theory') continue;
    const label = normalize(subject.electiveGroup);
    if (!label) continue;
    if (divisionId && subject.divisionId !== divisionId) continue;

    const id = `${subject.divisionId}|${label.toUpperCase()}`;
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        divisionId: subject.divisionId,
        label,
        subjects: [],
      });
    }
    groups.get(id).subjects.push(subject);
  }

  return [...groups.values()].sort(
    (a, b) =>
      String(a.divisionId).localeCompare(String(b.divisionId)) ||
      a.label.localeCompare(b.label),
  );
}

/** Group labels available in a division, in display order. */
export function electiveGroupLabels(masterData = {}, divisionId = '') {
  return electiveGroups(masterData, divisionId).map((group) => group.label);
}

/** Raw choice counts, regardless of whether the roster covers the division. */
function countChoices(masterData = {}) {
  const counts = new Map();
  const subjects = new Map(
    (masterData.subjects ?? []).map((subject) => [subject.id, subject]),
  );

  for (const student of masterData.students ?? []) {
    const choices = student?.choices;
    if (!choices || typeof choices !== 'object') continue;

    for (const subjectId of Object.values(choices)) {
      const subject = subjects.get(subjectId);
      if (!subject) continue;
      if (subject.divisionId !== student.divisionId) continue;
      if (!normalize(subject.electiveGroup)) continue;
      counts.set(subject.id, (counts.get(subject.id) ?? 0) + 1);
    }
  }

  return counts;
}

/**
 * Students choosing each option, but only for divisions whose roster covers the
 * whole division. An incomplete division contributes nothing, so the scheduler
 * sizes its options by the division strength instead.
 *
 * @returns {Map<string, number>} subjectId → number of students
 */
export function enrollmentBySubject(masterData = {}) {
  const coverage = rosterCoverage(masterData);
  const counts = new Map();
  const subjects = new Map(
    (masterData.subjects ?? []).map((subject) => [subject.id, subject]),
  );

  for (const student of masterData.students ?? []) {
    if (coverage.get(student?.divisionId)?.complete !== true) continue;

    const choices = student?.choices;
    if (!choices || typeof choices !== 'object') continue;

    for (const subjectId of Object.values(choices)) {
      const subject = subjects.get(subjectId);
      if (!subject) continue;
      if (subject.divisionId !== student.divisionId) continue;
      if (!normalize(subject.electiveGroup)) continue;
      counts.set(subject.id, (counts.get(subject.id) ?? 0) + 1);
    }
  }

  return counts;
}

/** Largest suitable room for an option, or 0 when no capacity is configured. */
export function optionSeats(subject, masterData = {}) {
  const rooms = Array.isArray(masterData.rooms) ? masterData.rooms : [];
  const type = subject?.requiredRoomType === 'Lab' ? 'Lab' : 'Classroom';
  const preferred = subject?.requiredRoomId
    ? rooms.find((room) => room.id === subject.requiredRoomId)
    : null;
  const candidates = preferred ? [preferred] : rooms.filter((room) => room.type === type);
  const capacities = candidates
    .map((room) => Number(room.capacity) || 0)
    .filter((capacity) => capacity > 0);

  return capacities.length > 0 ? Math.max(...capacities) : 0;
}

/**
 * Per-group roster picture for the Elective Choices tab: chosen counts, seats,
 * students still without a choice, options that overflow their largest room and
 * whether the roster actually covers the division (only then are the counts
 * used for room sizing).
 */
export function electiveEnrollmentSummary(masterData = {}) {
  const coverage = rosterCoverage(masterData);
  const chosenCounts = countChoices(masterData);
  const students = Array.isArray(masterData.students) ? masterData.students : [];

  return electiveGroups(masterData).map((group) => {
    const groupStudents = students.filter(
      (student) => student.divisionId === group.divisionId,
    );

    const options = group.subjects.map((subject) => {
      const count = chosenCounts.get(subject.id) ?? 0;
      const seats = optionSeats(subject, masterData);
      return {
        subject,
        count,
        seats,
        overloaded: seats > 0 && count > seats,
      };
    });

    const missing = groupStudents.filter((student) => {
      const choice = student.choices?.[group.label];
      return !choice || !group.subjects.some((subject) => subject.id === choice);
    }).length;

    const roster = coverage.get(group.divisionId) ?? {
      divisionId: group.divisionId,
      divisionName: group.divisionId,
      strength: 0,
      students: groupStudents.length,
      complete: false,
    };

    return {
      ...group,
      options,
      students: groupStudents.length,
      chosen: options.reduce((sum, option) => sum + option.count, 0),
      missing,
      roster,
    };
  });
}
