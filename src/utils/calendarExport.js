/**
 * Faculty/division weekly timetable → iCalendar (.ics).
 *
 * Events recur weekly from the timetable's W.E.F. date so the file can be
 * imported into Google Calendar, Outlook or Apple Calendar.
 */
import { formatSlotRange } from '../lib/time.js';

const WEEKS = 16;

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

function pad(value) {
  return String(value).padStart(2, '0');
}

function parseDateKey(value) {
  if (!value) return null;
  const parts = String(value).split('-').map(Number);
  if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Monday-based next occurrence of a working day from the W.E.F. date. */
function occurrenceDate(start, dayId) {
  const map = { SUN: 0, MON: 1, TUE: 2, WED: 3, THU: 4, FRI: 5, SAT: 6 };
  const target = map[String(dayId).slice(0, 3).toUpperCase()];
  if (target == null) return null;
  const date = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const delta = (target - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + delta);
  return date;
}

function stamp(date, time) {
  const [hours, minutes] = String(time || '09:00').split(':').map(Number);
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}T${pad(
    hours || 0,
  )}${pad(minutes || 0)}00`;
}

function escapeText(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldLine(line) {
  if (line.length <= 73) return line;
  const chunks = [];
  let rest = line;
  while (rest.length > 73) {
    chunks.push(rest.slice(0, 73));
    rest = rest.slice(73);
  }
  chunks.push(rest);
  return chunks.join('\r\n ');
}

/**
 * @param {object} masterData
 * @param {object[]} sessions
 * @param {{ facultyId?: string, divisionId?: string, settings?: object }} [options]
 */
export function buildCalendar(masterData = {}, sessions = [], options = {}) {
  const settings = options.settings ?? {};
  const start = parseDateKey(settings.wefDate) ?? new Date();
  const slots = masterData?.timeGrid?.slots ?? [];
  const slotsById = new Map(slots.map((slot) => [slot.id, slot]));
  const days = new Map(
    (masterData?.timeGrid?.workingDays ?? []).map((day) => [day.id, day]),
  );
  const rooms = new Map((masterData?.rooms ?? []).map((room) => [room.id, room]));

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Timetable Studio//Weekly Timetable//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(
      `${settings.departmentName ?? 'Department'} — ${settings.academicYear ?? ''} ${
        settings.semester ?? ''
      }`.trim(),
    )}`,
  ];

  let count = 0;

  for (const session of sessions) {
    if (options.divisionId && session.divisionId !== options.divisionId) continue;
    const slotIds = session.slotIds ?? [];
    const first = slotsById.get(slotIds[0]);
    const last = slotsById.get(slotIds[slotIds.length - 1]);
    if (!first || !last) continue;

    const day = days.get(session.dayId);
    const date = occurrenceDate(start, session.dayId);
    if (!date || !day) continue;

    const batches = session.type === 'Practical' ? session.batches ?? [] : [];
    const facultyId = options.facultyId;
    const audience = session.divisionName ?? '';
    const roomName = batchRoomOrSession(session, rooms);

    const candidates =
      session.type === 'Practical'
        ? batches
            .filter((batch) => !facultyId || batch.facultyId === facultyId)
            .map((batch) => ({
              facultyName: batch.facultyName,
              facultyShortCode: batch.facultyShortCode,
              batchName: batch.batchName,
              roomName: batch.roomName,
            }))
        : [
            {
              facultyName: session.facultyName,
              facultyShortCode: session.facultyShortCode,
              batchName: '',
              roomName,
            },
          ];

    for (const candidate of candidates) {
      if (facultyId && session.type !== 'Practical' && session.facultyId !== facultyId) {
        continue;
      }
      if (!facultyId && session.type !== 'Practical' && !session.facultyId) continue;

      const audienceLabel = candidate.batchName
        ? `${audience} · ${candidate.batchName}`
        : audience;
      const summary = `${session.subjectCode ?? session.subjectName ?? 'Class'} — ${audienceLabel}`;
      const descriptionParts = [
        candidate.facultyName ? `Faculty: ${candidate.facultyName}` : '',
        candidate.roomName ? `Room: ${candidate.roomName}` : '',
        session.type ? `Type: ${session.type}` : '',
        `${formatSlotRange({ start: first.start, end: last.end })}`,
      ].filter(Boolean);

      const uid = `${session.id}-${candidate.batchName || 'all'}@timetable-studio`;
      lines.push(
        'BEGIN:VEVENT',
        `UID:${escapeText(uid)}`,
        `DTSTAMP:${stamp(new Date(), '00:00')}`,
        `DTSTART:${stamp(date, first.start)}`,
        `DTEND:${stamp(date, last.end)}`,
        `SUMMARY:${escapeText(summary)}`,
        `LOCATION:${escapeText(candidate.roomName || '')}`,
        `DESCRIPTION:${escapeText(descriptionParts.join('\\n'))}`,
        `RRULE:FREQ=WEEKLY;COUNT=${WEEKS};BYDAY=${DAY_CODES[date.getDay()]}`,
        'END:VEVENT',
      );
      count += 1;
    }
  }

  lines.push('END:VCALENDAR');
  return { content: lines.map(foldLine).join('\r\n') + '\r\n', events: count };
}

function batchRoomOrSession(session, rooms) {
  if (session.roomName) return session.roomName;
  const room = rooms.get(session.roomId);
  return room?.name ?? '';
}

/** Browser download; throws outside a browser. */
export function downloadCalendar(masterData, sessions, options = {}) {
  if (typeof document === 'undefined') {
    throw new Error('Calendar export is only available in the browser.');
  }
  const { content, events } = buildCalendar(masterData, sessions, options);
  if (events === 0) throw new Error('There are no sessions to export for that selection.');

  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const label = options.facultyId
    ? String(options.facultyName ?? 'faculty').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    : 'department';
  anchor.href = url;
  anchor.download = `timetable-${label}.ics`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return events;
}
