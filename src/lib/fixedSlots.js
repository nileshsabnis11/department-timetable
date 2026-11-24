/**
 * Fixed / locked institutional slots.
 *
 * Open Electives, Honours/Minor, Mentoring, Library, T&P and Project hours are
 * pre-assigned by the department, so the scheduler must treat them as occupied
 * before it places anything. Entries live in `masterData.fixedSlots` (default
 * `[]`), which keeps every earlier backup and saved payload compatible.
 *
 * Pure helpers only — no React, no DOM, no localStorage.
 */

/** Session type the engine emits for a locked block. */
export const FIXED_SLOT_TYPE = 'Fixed';

/** A fixed slot that applies to every division. */
export const FIXED_SLOT_ALL = 'ALL';

/** Quick picks offered by the Master Data form. */
export const FIXED_SLOT_PRESETS = [
  'Open Elective',
  'Honours / Minor',
  'Mentoring',
  'Library',
  'T&P',
  'Project Hours',
];

const text = (value) => String(value ?? '').trim();
const normalize = (value) => text(value).toLowerCase();

export function fixedSlotLabel(entry) {
  return text(entry?.label) || 'Fixed Slot';
}

/** Division id from an id or a name; `ALL` (or blank) means institute-wide. */
export function resolveFixedDivisionId(masterData, value) {
  const raw = text(value);
  if (!raw || raw.toUpperCase() === FIXED_SLOT_ALL) return FIXED_SLOT_ALL;
  const divisions = masterData?.divisions ?? [];
  const hit =
    divisions.find((division) => division.id === raw) ??
    divisions.find((division) => normalize(division.name) === normalize(raw));
  return hit?.id ?? raw;
}

/** Working-day id from an id, full label or short label ("MON", "Monday"). */
export function resolveFixedDayId(masterData, value) {
  const raw = text(value);
  if (!raw) return '';
  const days = masterData?.timeGrid?.workingDays ?? [];
  const hit =
    days.find((day) => day.id === raw) ??
    days.find((day) => normalize(day.label) === normalize(raw)) ??
    days.find((day) => normalize(day.short) === normalize(raw));
  return hit?.id ?? '';
}

function slotIndicesOfEntry(entry, slots) {
  let indices = Array.isArray(entry?.slotIndices)
    ? entry.slotIndices.map((value) => Number(value))
    : [];

  if (indices.length === 0 && Array.isArray(entry?.slotIds)) {
    const indexById = new Map(slots.map((slot, index) => [slot.id, index]));
    indices = entry.slotIds.map((slotId) => indexById.get(slotId));
  }

  return [...new Set(indices)]
    .filter((index) => Number.isInteger(index) && index >= 0 && index < slots.length)
    .sort((first, second) => first - second);
}

/**
 * Resolve stored entries against the current grid.
 *
 * Returned entries are always usable: the day exists, at least one slot exists
 * and the division (or ALL) resolves. Everything else is reported in
 * `problems` so the generator and auditor can explain it instead of silently
 * dropping a locked block.
 *
 * @returns {{ entries: object[], problems: { id: string, message: string }[] }}
 */
export function describeFixedSlots(masterData = {}) {
  const slots = masterData?.timeGrid?.slots ?? [];
  const days = masterData?.timeGrid?.workingDays ?? [];
  const divisions = Array.isArray(masterData?.divisions) ? masterData.divisions : [];
  const facultyIds = new Set((masterData?.faculty ?? []).map((member) => member.id));
  const roomIds = new Set((masterData?.rooms ?? []).map((room) => room.id));

  const entries = [];
  const problems = [];

  const stored = Array.isArray(masterData?.fixedSlots) ? masterData.fixedSlots : [];

  stored.forEach((raw, index) => {
    if (!raw || typeof raw !== 'object') return;

    const id = text(raw.id) || `FIX-ROW-${index + 1}`;
    const label = fixedSlotLabel(raw);
    const divisionId = resolveFixedDivisionId(masterData, raw.division);
    const dayId = resolveFixedDayId(masterData, raw.day);
    const slotIndices = slotIndicesOfEntry(raw, slots);
    const slotIds = slotIndices.map((slotIndex) => slots[slotIndex].id);

    if (divisionId !== FIXED_SLOT_ALL && !divisions.some((division) => division.id === divisionId)) {
      problems.push({
        id,
        message: `Fixed slot “${label}” points at a division that no longer exists (${text(raw.division) || '—'}).`,
      });
      return;
    }
    if (!dayId) {
      problems.push({
        id,
        message: `Fixed slot “${label}” uses a day that is not an enabled working day (${text(raw.day) || '—'}).`,
      });
      return;
    }
    if (slotIndices.length === 0) {
      problems.push({
        id,
        message: `Fixed slot “${label}” has no slot inside the current Time Grid.`,
      });
      return;
    }

    const day = days.find((item) => item.id === dayId);
    const facultyId = facultyIds.has(raw.facultyId) ? raw.facultyId : '';
    const roomId = roomIds.has(raw.roomId) ? raw.roomId : '';

    // A lock that names a deleted teacher or room still blocks the hour; say so
    // instead of silently dropping the reference.
    if (text(raw.facultyId) && !facultyId) {
      problems.push({
        id,
        message: `Fixed slot “${label}” points at a faculty member that no longer exists. Pick another member or clear the field.`,
      });
    }
    if (text(raw.roomId) && !roomId) {
      problems.push({
        id,
        message: `Fixed slot “${label}” points at a room that no longer exists. Pick another room or clear the field.`,
      });
    }

    entries.push({
      id,
      label,
      divisionId,
      dayId,
      dayLabel: day?.label ?? dayId,
      slotIndices,
      slotIds,
      slotLabels: slotIds.map(
        (slotId) => slots.find((slot) => slot.id === slotId)?.label ?? slotId,
      ),
      facultyId,
      roomId,
      hours: slotIds.length,
    });
  });

  return { entries, problems };
}

export function normalizeFixedSlots(masterData) {
  return describeFixedSlots(masterData).entries;
}

/** Locked entries that apply to one division (its own plus institute-wide). */
export function fixedSlotsForDivision(masterData, divisionId) {
  return normalizeFixedSlots(masterData).filter(
    (entry) => entry.divisionId === FIXED_SLOT_ALL || entry.divisionId === divisionId,
  );
}

/**
 * `divisionId|dayId|slotId` → locked entry, with ALL entries expanded to every
 * division so a grid can look up a single cell.
 */
export function fixedSlotIndex(masterData) {
  const map = new Map();
  const divisions = Array.isArray(masterData?.divisions) ? masterData.divisions : [];

  for (const entry of normalizeFixedSlots(masterData)) {
    const targets =
      entry.divisionId === FIXED_SLOT_ALL
        ? divisions.map((division) => division.id)
        : [entry.divisionId];
    for (const divisionId of targets) {
      for (const slotId of entry.slotIds) {
        map.set(`${divisionId}|${entry.dayId}|${slotId}`, entry);
      }
    }
  }

  return map;
}

/** One timetable session for a locked entry in one division. */
export function fixedSlotSession(masterData, entry, divisionId = entry.divisionId) {
  const slots = masterData?.timeGrid?.slots ?? [];
  const slotObjects = entry.slotIds
    .map((slotId) => slots.find((slot) => slot.id === slotId))
    .filter(Boolean);
  if (slotObjects.length === 0) return null;

  const day = (masterData?.timeGrid?.workingDays ?? []).find(
    (item) => item.id === entry.dayId,
  );
  const division = (masterData?.divisions ?? []).find(
    (item) => item.id === divisionId,
  );
  const faculty = (masterData?.faculty ?? []).find(
    (member) => member.id === entry.facultyId,
  );
  const room = (masterData?.rooms ?? []).find((item) => item.id === entry.roomId);
  const indexById = new Map(slots.map((slot, index) => [slot.id, index]));

  return {
    id: `FIX-${entry.id}-${divisionId}`,
    type: FIXED_SLOT_TYPE,
    fixedSlotId: entry.id,
    locked: true,
    label: entry.label,
    subjectCode: entry.label,
    subjectName: '',
    divisionId,
    divisionName: division?.name ?? divisionId,
    dayId: entry.dayId,
    dayLabel: day?.label ?? entry.dayId,
    slotIds: [...entry.slotIds],
    slotLabels: slotObjects.map((slot) => slot.label),
    slotIndices: entry.slotIds.map((slotId) => indexById.get(slotId)).filter(Number.isInteger),
    start: slotObjects[0].start,
    end: slotObjects[slotObjects.length - 1].end,
    hours: slotObjects.length,
    facultyId: faculty?.id ?? '',
    facultyName: faculty?.name ?? '',
    facultyShortCode: faculty?.shortCode ?? '',
    roomId: room?.id ?? '',
    roomName: room?.name ?? '',
    roomType: room?.type ?? '',
    batches: [],
  };
}

export function isFixedSession(session) {
  return session?.type === FIXED_SLOT_TYPE;
}

/** Every locked session, one per applicable division. */
export function buildFixedSlotSessions(masterData) {
  const divisions = Array.isArray(masterData?.divisions) ? masterData.divisions : [];
  const sessions = [];

  for (const entry of normalizeFixedSlots(masterData)) {
    const targets =
      entry.divisionId === FIXED_SLOT_ALL
        ? divisions
        : divisions.filter((division) => division.id === entry.divisionId);
    for (const division of targets) {
      const session = fixedSlotSession(masterData, entry, division.id);
      if (session) sessions.push(session);
    }
  }

  return sessions;
}
