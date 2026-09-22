// The honing record's load-bound shape (progression/honing.ts HoningRecord):
// a pure predicate the drop-only load sanitizer (item_instance_load.ts) and
// the tests share. Kept apart from honing.ts so the sanitizer never imports
// the SimContext module (entity.ts, data.ts) just to validate a shape.
import { HONING_MAX_RANK, isHoningStat } from './honing_policy';

/** True only for the exact legal shape: a plain object with an integer rank
 *  in [1, HONING_MAX_RANK] and a `stats` map whose every key is a honing stat
 *  and every value a positive integer, the values summing to the rank. */
export function isValidHoningRecord(value: unknown): boolean {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const record = value as { rank?: unknown; stats?: unknown };
  const rank = record.rank;
  if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1 || rank > HONING_MAX_RANK) {
    return false;
  }
  const stats = record.stats;
  if (stats === null || typeof stats !== 'object' || Array.isArray(stats)) return false;
  let sum = 0;
  for (const [stat, count] of Object.entries(stats as Record<string, unknown>)) {
    if (!isHoningStat(stat)) return false;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) return false;
    sum += count;
  }
  return sum === rank && Object.keys(record).every((k) => k === 'rank' || k === 'stats');
}
