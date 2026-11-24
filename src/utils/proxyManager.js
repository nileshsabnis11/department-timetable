import { formatTime12h } from '../lib/time.js';

/**
 * Daily leave & proxy manager — pure helpers.
 *
 * Reads a saved timetable snapshot and master data; writes nothing except the
 * proxy history log in localStorage. No engine imports, no React.
 */

export const PROXY_HISTORY_KEY = 'proxyHistory';
export const SELF_STUDY_VALUE = '__self_study__';
export const SELF_STUDY_LABEL = 'Self-Study / Library';

/** Index matches `Date#getDay()` (Sunday = 0). */
export const WEEKDAY_IDS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

const THEORY = 'Theory';
const PRACTICAL = 'Practical';

function sessionsOf(timetable) {
  if (Array.isArray(timetable)) return timetable;
  if (Array.isArray(timetable?.sessions)) return timetable.sessions;
  return [];
}

/** "Monday" | "MON" | "mon" → "MON"; anything unknown is upper-cased. */
export function normalizeDayId(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const upper = raw.toUpperCase();
  return WEEKDAY_IDS.includes(upper.slice(0, 3)) ? upper.slice(0, 3) : upper;
}

/** Local "YYYY-MM-DD" for a Date. */
export function dateKey(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Parse "YYYY-MM-DD" as a local date (avoids UTC drift). */
export function parseDateKey(value) {
  if (!value) return null;
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dayIdForDate(date) {
  return WEEKDAY_IDS[date?.getDay?.() ?? 0] ?? '';
}

export function isSunday(date) {
  return date?.getDay?.() === 0;
}

export function dayLabelFor(masterData, dayId) {
  const day = (masterData?.timeGrid?.workingDays ?? []).find(
    (item) => normalizeDayId(item.id) === normalizeDayId(dayId),
  );
  if (day?.label) return day.label;
  const fallback = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const index = WEEKDAY_IDS.indexOf(normalizeDayId(dayId));
  return index >= 0 ? fallback[index] : dayId;
}

/** Slot indices occupied by a session, using the master time grid. */
export function slotIndicesOf(session, masterData) {
  const slots = masterData?.timeGrid?.slots ?? [];
  const indexById = new Map(slots.map((slot, index) => [slot.id, index]));
  return (session?.slotIds ?? [])
    .map((slotId) => indexById.get(slotId))
    .filter((index) => Number.isInteger(index));
}

function timeLabelFor(slotIndices, masterData) {
  const slots = masterData?.timeGrid?.slots ?? [];
  const picked = slotIndices.map((index) => slots[index]).filter(Boolean);
  if (picked.length === 0) return '—';
  if (picked.length === 1) {
    return `${picked[0].label} (${formatTime12h(picked[0].start)} – ${formatTime12h(
      picked[0].end,
    )})`;
  }
  const first = picked[0];
  const last = picked[picked.length - 1];
  return `${first.label}–${last.label} (${formatTime12h(first.start)} – ${formatTime12h(
    last.end,
  )})`;
}

function facultyNameOf(masterData, facultyId) {
  const member = (masterData?.faculty ?? []).find((item) => item.id === facultyId);
  return member?.name ?? '—';
}

function subjectNameOf(session) {
  return session.subjectName ?? session.subjectCode ?? '—';
}

/**
 * Every theory lecture and practical batch taught by an absent faculty member
 * on one working day.
 *
 * @param {object|Array} timetable saved snapshot (`{ sessions }`) or sessions
 * @param {string} day "Monday" or "MON"
 * @param {string[]} absentFacultyIds
 * @param {object} [masterData] used for slot labels and division names
 * @returns {object[]} one row per affected theory session or practical batch
 */
export function getAffectedSessions(
  timetable,
  day,
  absentFacultyIds = [],
  masterData = null,
) {
  const dayId = normalizeDayId(day);
  if (!dayId) return [];

  const absent = new Set(absentFacultyIds ?? []);
  if (absent.size === 0) return [];

  const divisionsById = new Map(
    (masterData?.divisions ?? []).map((division) => [division.id, division]),
  );
  const rows = [];

  for (const session of sessionsOf(timetable)) {
    if (normalizeDayId(session.dayId) !== dayId) continue;

    const divisionName =
      divisionsById.get(session.divisionId)?.name ??
      session.divisionName ??
      session.divisionId ??
      '—';
    const slotIndices = slotIndicesOf(session, masterData);

    if (session.type === PRACTICAL) {
      for (const batch of session.batches ?? []) {
        if (!absent.has(batch.facultyId)) continue;
        rows.push({
          key: `${session.id}|${batch.batchId}`,
          sessionId: session.id,
          type: PRACTICAL,
          dayId,
          slotIds: [...(session.slotIds ?? [])],
          slotIndices,
          timeLabel: timeLabelFor(slotIndices, masterData),
          divisionId: session.divisionId,
          divisionName,
          batchId: batch.batchId,
          batchName: batch.batchName ?? batch.batchId,
          audience: `${divisionName} · ${batch.batchName ?? batch.batchId}`,
          subjectId: session.subjectId,
          subjectCode: session.subjectCode ?? '—',
          subjectName: subjectNameOf(session),
          roomId: batch.roomId ?? session.roomId,
          roomName: batch.roomName ?? session.roomName ?? '—',
          facultyId: batch.facultyId,
          facultyName:
            batch.facultyName ?? facultyNameOf(masterData, batch.facultyId),
          facultyShortCode: batch.facultyShortCode ?? '—',
          session,
        });
      }
      continue;
    }

    if (!absent.has(session.facultyId)) continue;
    rows.push({
      key: `${session.id}|`,
      sessionId: session.id,
      type: THEORY,
      dayId,
      slotIds: [...(session.slotIds ?? [])],
      slotIndices,
      timeLabel: timeLabelFor(slotIndices, masterData),
      divisionId: session.divisionId,
      divisionName,
      batchId: null,
      batchName: null,
      audience: divisionName,
      subjectId: session.subjectId,
      subjectCode: session.subjectCode ?? '—',
      subjectName: subjectNameOf(session),
      roomId: session.roomId,
      roomName: session.roomName ?? '—',
      facultyId: session.facultyId,
      facultyName: session.facultyName ?? facultyNameOf(masterData, session.facultyId),
      facultyShortCode: session.facultyShortCode ?? '—',
      session,
    });
  }

  return rows.sort((first, second) => {
    const firstSlot = first.slotIndices[0] ?? 99;
    const secondSlot = second.slotIndices[0] ?? 99;
    if (firstSlot !== secondSlot) return firstSlot - secondSlot;
    if (first.divisionName !== second.divisionName) {
      return String(first.divisionName).localeCompare(String(second.divisionName));
    }
    return String(first.batchName ?? '').localeCompare(String(second.batchName ?? ''));
  });
}

/** Every slot index where a faculty member is already teaching on that day. */
export function busySlotIndices(timetable, masterData, day, facultyId) {
  const dayId = normalizeDayId(day);
  const busy = new Set();

  for (const session of sessionsOf(timetable)) {
    if (normalizeDayId(session.dayId) !== dayId) continue;
    const indexList = slotIndicesOf(session, masterData);
    if (session.type === PRACTICAL) {
      if (!(session.batches ?? []).some((batch) => batch.facultyId === facultyId)) {
        continue;
      }
    } else if (session.facultyId !== facultyId) {
      continue;
    }
    for (const index of indexList) busy.add(index);
  }

  return [...busy].sort((first, second) => first - second);
}

/** Teaching load in slots on one day. */
export function dayTeachingHours(timetable, masterData, day, facultyId) {
  return busySlotIndices(timetable, masterData, day, facultyId).length;
}

function assignedKey(facultyId, slotIndex) {
  return `${facultyId}|${slotIndex}`;
}

function toAssignedList(alreadyAssignedProxies) {
  if (!alreadyAssignedProxies) return [];
  if (Array.isArray(alreadyAssignedProxies)) return alreadyAssignedProxies.filter(Boolean);
  return Object.entries(alreadyAssignedProxies).map(([facultyId, value]) => ({
    facultyId,
    slotIndices: Array.isArray(value) ? value : [],
  }));
}

/**
 * Faculty who are completely free during the requested slots.
 *
 * @param {object|Array} timetable
 * @param {object} masterData
 * @param {string} day
 * @param {number[]} slotIndices zero-based indexes into the saved time grid
 * @param {string[]} absentFacultyIds faculty already on leave that day
 * @param {{facultyId: string, slotIndices: number[]}[]} alreadyAssignedProxies
 *   proxies already given another session in the same slots
 * @param {{divisionId?: string}} [options] adds the "teaches this division" badge
 * @returns {{faculty: object, dayHours: number, teachesDivision: boolean}[]}
 */
export function getAvailableProxies(
  timetable,
  masterData,
  day,
  slotIndices = [],
  absentFacultyIds = [],
  alreadyAssignedProxies = [],
  options = {},
) {
  const dayId = normalizeDayId(day);
  const wanted = [...new Set(slotIndices)].filter((index) => Number.isInteger(index));
  if (!dayId || wanted.length === 0) return [];

  const absent = new Set(absentFacultyIds ?? []);
  const assigned = new Set();
  for (const entry of toAssignedList(alreadyAssignedProxies)) {
    for (const index of entry.slotIndices ?? []) {
      if (!wanted.includes(index)) continue;
      if (entry.facultyId) assigned.add(assignedKey(entry.facultyId, index));
    }
  }

  const slots = masterData?.timeGrid?.slots ?? [];
  const divisionsById = new Map(
    (masterData?.divisions ?? []).map((division) => [division.id, division]),
  );

  const candidates = [];
  for (const member of masterData?.faculty ?? []) {
    if (!member?.id || absent.has(member.id)) continue;

    const busy = new Set(busySlotIndices(timetable, masterData, dayId, member.id));
    if (wanted.some((index) => busy.has(index))) continue;

    const unavailable = member.unavailableSlots ?? {};
    const blocked = wanted.some((index) => {
      const slotId = slots[index]?.id;
      return slotId ? unavailable[`${dayId}:${slotId}`] === true : false;
    });
    if (blocked) continue;

    if (wanted.some((index) => assigned.has(assignedKey(member.id, index)))) continue;

    const teachesDivision = Boolean(
      options.divisionId &&
        sessionsOf(timetable).some((session) => {
          if (normalizeDayId(session.dayId) !== dayId) return false;
          if (session.divisionId !== options.divisionId) return false;
          return session.type === PRACTICAL
            ? (session.batches ?? []).some((batch) => batch.facultyId === member.id)
            : session.facultyId === member.id;
        }),
    );

    candidates.push({
      faculty: member,
      dayHours: busy.size,
      teachesDivision,
      teachesDivisionName: options.divisionId
        ? divisionsById.get(options.divisionId)?.name ?? ''
        : '',
    });
  }

  return candidates.sort((first, second) => {
    if (first.dayHours !== second.dayHours) return first.dayHours - second.dayHours;
    if (first.teachesDivision !== second.teachesDivision) {
      return first.teachesDivision ? -1 : 1;
    }
    return String(first.faculty.name ?? '').localeCompare(
      String(second.faculty.name ?? ''),
    );
  });
}

/** Proxy option label, e.g. "Prof. R. M. Inamdar (RMI) — 2 hrs today [Teaches SY]". */
export function proxyOptionLabel(candidate) {
  const member = candidate.faculty ?? {};
  const code = member.shortCode ? ` (${member.shortCode})` : '';
  const hours = `${candidate.dayHours} ${candidate.dayHours === 1 ? 'hr' : 'hrs'} today`;
  const badge =
    candidate.teachesDivision && candidate.teachesDivisionName
      ? ` [Teaches ${candidate.teachesDivisionName}]`
      : '';
  return `${member.name ?? 'Faculty'}${code} — ${hours}${badge}`;
}

/** Format a "YYYY-MM-DD" date as "24 Nov 2026" (or "—"). */
export function formatNoticeDate(value) {
  const date = parseDateKey(value);
  if (!date) return value || '—';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${String(date.getDate()).padStart(2, '0')} ${
    months[date.getMonth()]
  } ${date.getFullYear()}`;
}

/**
 * WhatsApp-ready substitution notice.
 *
 * @param {{date: string, dayLabel: string, absentFaculty: {name: string, shortCode?: string}[],
 *   assignments: object[], settings?: object}} input
 */
export function buildWhatsAppNotice({ date, dayLabel, absentFaculty, assignments, settings }) {
  const lines = [];
  lines.push(`*Substitution Notice — ${dayLabel}, ${formatNoticeDate(date)}*`);
  if (settings?.departmentName) lines.push(settings.departmentName);

  const absent = (absentFaculty ?? [])
    .map((member) =>
      member.shortCode ? `${member.name} (${member.shortCode})` : member.name,
    )
    .filter(Boolean);
  lines.push('');
  lines.push(`*On leave:* ${absent.length > 0 ? absent.join(', ') : '—'}`);
  lines.push('');

  for (const assignment of assignments ?? []) {
    const proxy = assignment.isSelfStudy
      ? SELF_STUDY_LABEL
      : assignment.proxyShortCode
        ? `${assignment.proxyName} (${assignment.proxyShortCode})`
        : assignment.proxyName;
    lines.push(`• *${assignment.timeLabel}* · ${assignment.audience}`);
    lines.push(
      `   ${assignment.subjectCode} ${assignment.subjectName} — ${assignment.roomName}`,
    );
    lines.push(
      `   ${assignment.facultyShortCode || assignment.facultyName} → ${proxy}`,
    );
  }

  lines.push('');
  if ((assignments ?? []).some((assignment) => assignment.isSelfStudy)) {
    lines.push('Self-study batches report to the library.');
  }
  lines.push('— Timetable Coordinator');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Proxy history (localStorage)
// ---------------------------------------------------------------------------

function hasStorage() {
  try {
    return typeof window !== 'undefined' && !!window.localStorage;
  } catch {
    return false;
  }
}

/** Saved substitution records, newest first. Never throws. */
export function loadProxyHistory() {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(PROXY_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((record) => record && record.date) : [];
  } catch {
    return [];
  }
}

/**
 * Append a confirmed record and persist it. Returns the new history.
 * A record with the same date + absent faculty set replaces the older one, so
 * re-confirming a day does not double-count proxies.
 */
export function saveProxyRecord(record, history = loadProxyHistory()) {
  if (!record?.date) return history;
  const signature = [
    record.date,
    ...(record.absentFaculty ?? []).map((member) => member.id).sort(),
  ].join('|');
  const cleaned = (history ?? []).filter((item) => {
    const other = [
      item.date,
      ...(item.absentFaculty ?? []).map((member) => member.id).sort(),
    ].join('|');
    return other !== signature;
  });
  const next = [record, ...cleaned].slice(0, 250);

  if (hasStorage()) {
    try {
      window.localStorage.setItem(PROXY_HISTORY_KEY, JSON.stringify(next));
    } catch {
      // Storage full / private mode: keep the in-memory list for this session.
    }
  }

  return next;
}

/** Proxy cover counts per faculty across every saved record. */
export function proxyCounts(history = []) {
  const counts = new Map();

  for (const record of history) {
    for (const assignment of record.assignments ?? []) {
      if (assignment.isSelfStudy || !assignment.proxyId) continue;
      const current = counts.get(assignment.proxyId) ?? {
        facultyId: assignment.proxyId,
        name: assignment.proxyName ?? '—',
        shortCode: assignment.proxyShortCode ?? '',
        count: 0,
      };
      current.count += 1;
      counts.set(assignment.proxyId, current);
    }
  }

  return [...counts.values()].sort(
    (first, second) => second.count - first.count || first.name.localeCompare(second.name),
  );
}
