/**
 * One-click clash fixes.
 *
 * Tries moving each clashing session into an empty destination and keeps the
 * moves that reduce the live clash count. Uses the existing validated swap
 * helper and validator — it never writes or schedules anything itself.
 */
import { validateTimetable } from '../engine/validator.js';
import { FIXED_SLOT_TYPE } from '../lib/fixedSlots.js';
import {
  buildClashInfo,
  enabledDays,
  practicalBlocks,
  swapOrMove,
  timeSlots,
} from '../components/timetable/timetableUtils.js';

function clueCount(validation, sessions) {
  return buildClashInfo(validation, sessions).count;
}

function targetLabel(masterData, dayId, slotIds) {
  const day = (masterData?.timeGrid?.workingDays ?? []).find((item) => item.id === dayId);
  const slots = timeSlots(masterData);
  const picked = slotIds
    .map((slotId) => slots.find((slot) => slot.id === slotId))
    .filter(Boolean);
  if (picked.length === 0) return 'that slot';
  const slotLabel =
    picked.length === 1
      ? picked[0].label
      : `${picked[0].label} + ${picked[picked.length - 1].label}`;
  return `${day?.short ?? day?.label ?? dayId} ${slotLabel}`;
}

/**
 * @param {object[]} sessions
 * @param {object} masterData
 * @param {{ maxSessions?: number, perSession?: number, maxCandidates?: number }} [options]
 * @returns {{ sessionId: string, label: string, dayId: string, slotIds: string[],
 *   target: string, clashCount: number, reduction: number, sessions: object[] }[]}
 */
export function proposeClashFixes(sessions, masterData, options = {}) {
  const maxSessions = Math.max(1, options.maxSessions ?? 2);
  const perSession = Math.max(1, options.perSession ?? 2);
  const maxCandidates = Math.max(5, options.maxCandidates ?? 24);

  if (!Array.isArray(sessions) || sessions.length === 0) return [];

  const baseValidation = validateTimetable({ sessions }, masterData);
  const baseInfo = buildClashInfo(baseValidation, sessions);
  if (baseInfo.count === 0) return [];

  const days = enabledDays(masterData);
  const slots = timeSlots(masterData);
  const blocks = practicalBlocks(masterData);

  const clashingIds = [];
  for (const [sessionId, messages] of baseInfo.bySession) {
    if (messages.length === 0) continue;
    const session = sessions.find((item) => item.id === sessionId);
    if (!session || session.type === FIXED_SLOT_TYPE) continue;
    clashingIds.push(session.id);
  }

  const proposals = [];

  for (const sessionId of clashingIds.slice(0, maxSessions)) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) continue;

    const candidates = [];
    if (session.type === 'Practical') {
      for (const day of days) {
        for (const block of blocks) {
          candidates.push({ dayId: day.id, slotIds: [...block.slotIds] });
        }
      }
    } else {
      for (const day of days) {
        for (const slot of slots) {
          candidates.push({ dayId: day.id, slotIds: [slot.id] });
        }
      }
    }

    let tried = 0;
    let best = null;
    for (const candidate of candidates) {
      if (tried >= maxCandidates) break;
      if (
        candidate.dayId === session.dayId &&
        candidate.slotIds.join('|') === (session.slotIds ?? []).join('|')
      ) {
        continue;
      }
      const outcome = swapOrMove(sessions, sessionId, candidate, masterData);
      if (!outcome.ok) continue;
      tried += 1;
      const count = clueCount(validateTimetable(outcome, masterData), sessions);
      if (count >= baseInfo.count) continue;
      const reduction = baseInfo.count - count;
      if (!best || count < best.clashCount) {
        best = {
          sessionId,
          label: `${session.subjectCode ?? session.subjectName ?? 'Session'}${
            session.type === 'Practical' ? ` (${session.divisionName ?? ''})` : ''
          }`,
          dayId: candidate.dayId,
          slotIds: candidate.slotIds,
          target: targetLabel(masterData, candidate.dayId, candidate.slotIds),
          clashCount: count,
          reduction,
          sessions: outcome.sessions,
        };
      }
    }

    if (best) proposals.push(best);
    if (proposals.length >= perSession) break;
  }

  return proposals
    .sort((first, second) => first.clashCount - second.clashCount)
    .slice(0, perSession);
}
