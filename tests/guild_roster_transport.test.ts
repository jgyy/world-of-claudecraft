// The purse half of guild roster expansion as GameServer spreads it into its
// SocialTransport (server/guild_roster_transport.ts): the charge and refund
// move copper on the LIVE sim purse through the pure src/sim helpers, an
// offline character charges nothing, and the commit hook persists the purse
// and is loud when it cannot.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { guildRosterTransport } from '../server/guild_roster_transport';
import { Sim } from '../src/sim/sim';

const GOLD = 10_000;
const CHAR_ONLINE = 7;
const CHAR_OFFLINE = 8;

function harness(persist = vi.fn(async () => true)) {
  const sim = new Sim({ seed: 3, playerClass: 'warrior', autoEquip: true });
  const meta = sim.players.get(sim.playerId);
  if (!meta) throw new Error('missing meta');
  meta.copper = 50 * GOLD;
  const transport = guildRosterTransport({
    ctx: sim.ctx,
    pidOf: (characterId) => (characterId === CHAR_ONLINE ? sim.playerId : null),
    persistCharacter: persist,
  });
  return { sim, meta, transport, persist };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('guildRosterTransport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('charges the live purse up to the price and reports what it took', () => {
    const { meta, transport } = harness();
    expect(transport.chargePurse(CHAR_ONLINE, 20 * GOLD)).toBe(20 * GOLD);
    expect(meta.copper).toBe(30 * GOLD);
    // A short purse gives up what it has: the service refunds and refuses.
    expect(transport.chargePurse(CHAR_ONLINE, 80 * GOLD)).toBe(30 * GOLD);
    expect(meta.copper).toBe(0);
  });

  it('charges nothing for a character with no live session', () => {
    const { meta, transport } = harness();
    expect(transport.chargePurse(CHAR_OFFLINE, 20 * GOLD)).toBe(0);
    expect(meta.copper).toBe(50 * GOLD);
  });

  it('refunds a reservation back onto the live purse, silently when it lands whole', () => {
    const { meta, transport } = harness();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    transport.chargePurse(CHAR_ONLINE, 20 * GOLD);
    expect(transport.refundPurse(CHAR_ONLINE, 20 * GOLD)).toBe(20 * GOLD);
    expect(meta.copper).toBe(50 * GOLD);
    expect(error).not.toHaveBeenCalled();
  });

  it('is loud when a refund cannot be applied (the buyer logged out mid-refusal)', () => {
    const { transport } = harness();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(transport.refundPurse(CHAR_OFFLINE, 20 * GOLD)).toBe(0);
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('operator compensation needed');
    expect(String(error.mock.calls[0][0])).toContain(`character ${CHAR_OFFLINE}`);
  });

  it('persists the purse once the page committed and writes the audit line', async () => {
    const { transport, persist } = harness();
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    transport.onGuildRosterExpanded(CHAR_ONLINE, 42, 3, 180 * GOLD);
    await flush();
    expect(persist).toHaveBeenCalledWith(CHAR_ONLINE);
    expect(info).toHaveBeenCalledTimes(1);
    const line = String(info.mock.calls[0][0]);
    expect(line).toContain('guild 42');
    expect(line).toContain('page 3');
    expect(line).toContain(`character ${CHAR_ONLINE}`);
    expect(line).toContain(`${180 * GOLD} copper`);
    expect(error).not.toHaveBeenCalled();
  });

  it('is loud when the purse save does not become durable, and when it throws', async () => {
    const notDurable = harness(vi.fn(async () => false));
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    notDurable.transport.onGuildRosterExpanded(CHAR_ONLINE, 42, 1, 20 * GOLD);
    await flush();
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).toContain('did not become durable');

    const throwing = harness(
      vi.fn(async () => {
        throw new Error('pool closed');
      }),
    );
    throwing.transport.onGuildRosterExpanded(CHAR_ONLINE, 42, 1, 20 * GOLD);
    await flush();
    expect(error).toHaveBeenCalledTimes(2);
    expect(String(error.mock.calls[1][0])).toContain('purse save failed');
  });
});
