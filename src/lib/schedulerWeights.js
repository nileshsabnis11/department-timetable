/**
 * Soft-constraint weights for the scheduling engine.
 *
 * Each weight is a multiplier over the engine's built-in penalty. 1 keeps the
 * historical behaviour, 0 disables the preference, 2–3 makes it stronger.
 */

export const DEFAULT_WEIGHTS = Object.freeze({
  fatigue: 1,
  sameDay: 1,
  balance: 1,
});

export const WEIGHT_FIELDS = Object.freeze([
  {
    key: 'fatigue',
    label: 'Avoid faculty fatigue',
    hint: 'Penalise a 3rd+ consecutive teaching hour for one faculty member.',
  },
  {
    key: 'sameDay',
    label: 'Spread subjects across days',
    hint: 'Penalise the same theory subject twice on one day for a division.',
  },
  {
    key: 'balance',
    label: 'Balance division days',
    hint: 'Penalise uneven teaching hours across the working week.',
  },
]);

function clampWeight(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.min(3, Math.max(0, Math.round(number * 10) / 10));
}

export function normalizeWeights(value) {
  const source = value && typeof value === 'object' ? value : {};
  return {
    fatigue: clampWeight(source.fatigue ?? DEFAULT_WEIGHTS.fatigue),
    sameDay: clampWeight(source.sameDay ?? DEFAULT_WEIGHTS.sameDay),
    balance: clampWeight(source.balance ?? DEFAULT_WEIGHTS.balance),
  };
}

export function weightsAreDefault(value) {
  const weights = normalizeWeights(value);
  return WEIGHT_FIELDS.every((field) => weights[field.key] === DEFAULT_WEIGHTS[field.key]);
}
