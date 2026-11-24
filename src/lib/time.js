/**
 * Time-grid helpers shared by the UI and (later) the scheduler.
 * Pure functions — no React, no DOM.
 */

/** "HH:MM" → minutes since midnight, or null when malformed. */
export function parseTime(value) {
  if (typeof value !== 'string' || !/^\d{1,2}:\d{2}$/.test(value)) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** "13:45" → "1:45 PM". */
export function formatTime12h(value) {
  const total = parseTime(value);
  if (total == null) return value || '—';
  const hours24 = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12;
  return `${hours12}:${String(minutes).padStart(2, '0')} ${suffix}`;
}

export function formatSlotRange(slot) {
  return `${formatTime12h(slot.start)} – ${formatTime12h(slot.end)}`;
}

export function durationMinutes(start, end) {
  const from = parseTime(start);
  const to = parseTime(end);
  if (from == null || to == null) return 0;
  return to - from;
}

export function durationLabel(start, end) {
  const total = durationMinutes(start, end);
  if (total <= 0) return '—';
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return [hours ? `${hours} hr${hours > 1 ? 's' : ''}` : '', minutes ? `${minutes} min` : '']
    .filter(Boolean)
    .join(' ');
}

/** Key used for faculty availability maps ("MON:S1"). */
export function slotKey(dayId, slotId) {
  return `${dayId}:${slotId}`;
}

/**
 * Valid 2-hour practical blocks: consecutive slot pairs that share a boundary
 * and are not separated by a lunch or recess break.
 *
 * @returns {{ id: string, slotIds: string[], start: string, end: string, label: string }[]}
 */
export function computePracticalBlocks(slots = [], breaks = []) {
  const breakAfter = new Set(breaks.map((item) => item.afterSlotId));
  const blocks = [];

  for (let index = 0; index + 1 < slots.length; index += 2) {
    const first = slots[index];
    const second = slots[index + 1];
    const contiguous =
      parseTime(first.end) != null && parseTime(first.end) === parseTime(second.start);
    if (!contiguous || breakAfter.has(first.id)) continue;

    blocks.push({
      id: `${first.id}+${second.id}`,
      slotIds: [first.id, second.id],
      start: first.start,
      end: second.end,
      label: `${first.label} + ${second.label}`,
    });
  }

  return blocks;
}
