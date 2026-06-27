// Combo-point finishers (Rupture, Rip, Expose Armor) author their flat effect
// value as the FIVE-point maximum. A finisher cast with fewer points must deliver
// a proportional fraction of that value, so spending 1 point is not equal to 5.
//
// Builders and other non-finisher effects pass spentCombo <= 0 and keep their
// authored value unchanged: the dispatch computes
//   const spentCombo = ability.spendsCombo ? p.comboPoints : 0;
// so a Corruption/Moonfire DoT (spendsCombo false) is never scaled here.

/** Combo points cap at 5; the authored finisher value is the 5-point amount. */
export const MAX_COMBO = 5;

/**
 * Scale a finisher's authored flat effect (DoT total damage, sunder armor) by
 * the combo points actually spent, treating the authored value as the 5-point
 * maximum.
 *
 * Contract:
 * - spentCombo <= 0  -> return `value` unchanged (non-finisher path).
 * - 1 <= spentCombo <= 5 -> proportional fraction, rounded, floored at 1 so a
 *   1-point finisher still does something.
 * - spentCombo > 5 is clamped to 5 (never exceeds the authored maximum).
 *
 * Deterministic: pure arithmetic, no rng, no clock.
 *
 * @param value the authored 5-combo-point effect value (e.g. dot total, sunder armor)
 * @param spentCombo combo points spent on this cast (0 for non-finishers)
 */
export function comboScaledValue(value: number, spentCombo: number): number {
  if (spentCombo <= 0) return value;
  const cp = Math.min(spentCombo, MAX_COMBO);
  return Math.max(1, Math.round((value * cp) / MAX_COMBO));
}
