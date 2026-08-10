// The client-side reverse of the sim's plain-English money fragments
// (src/sim/format_money.ts), extracted out of hud.ts. Pins the pure function
// directly and in isolation: parity for the multi-denomination case, extraction
// from inside a longer sentence, and the no-match null path.

import { describe, expect, it } from 'vitest';
import { parseSimMoney } from '../src/ui/parse_sim_money';

describe('parseSimMoney', () => {
  it('sums a multi-denomination fragment into a copper total', () => {
    expect(parseSimMoney('3g 5s 7c')).toBe(30507);
  });

  it('extracts a single-denomination fragment embedded in a longer sentence', () => {
    expect(parseSimMoney('Sold Copper Ore for 4c.')).toBe(4);
  });

  it('returns null when no g/s/c fragment matches', () => {
    expect(parseSimMoney('no money here')).toBeNull();
  });
});
