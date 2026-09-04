// The Rift forge wire gate.
//
// The forge (upgrade / enchant / socket on Riftbound bands) shipped sim+wire
// first and its client UI later (the Rift Forge window, src/ui/hud/rift_forge/,
// opened at the Riftwright NPC). While no stock UI existed the wire stayed
// closed by default, because hiding a feature from the stock client never hid
// it from a crafted frame. Now that the forge intentionally ships, the default
// is OPEN and the variable is an ops kill switch: RIFT_FORGE_ENABLED=0 closes
// the three dispatch arms on a realm that needs the forge paused (an economy
// incident, a PTR comparison); anything else, including unset, keeps it open.
//
// The env var is read per verdict, never captured at import, so a supervised
// restart and the tests both see the live value. That per-verdict read is
// affordable ONLY because the dispatch call site sits behind the per-session
// command lane (~30/s) and short-circuits to forge tokens; never call these
// from the 20 Hz world loop or the per-viewer broadcast pass (capture the
// verdict once per pass there instead).
//
// Scope is deliberately the server boundary only. The player-facing rule (you
// must stand at the Riftwright) lives in the sim (src/sim/rift/forge_gate.ts)
// so the offline world, the headless env, and the server all enforce it; this
// gate only decides whether the wire reaches the sim at all.

import type { CommandName } from '../src/world_api';

/** The three forge wire tokens, pinned to the shared command vocabulary. */
export const RIFT_FORGE_WIRE_COMMANDS = [
  'rift_upgrade_item',
  'rift_enchant_item',
  'rift_socket_gem',
] as const satisfies readonly CommandName[];

const RIFT_FORGE_CMD_SET: ReadonlySet<string> = new Set(RIFT_FORGE_WIRE_COMMANDS);

/** True unless the realm has explicitly closed the forge wire (exactly '0'). */
export function riftForgeWireEnabled(
  env: Readonly<Record<string, string | undefined>> = process.env,
): boolean {
  return env.RIFT_FORGE_ENABLED !== '0';
}

/**
 * The dispatch-time verdict: true when `cmd` is a forge command and the wire
 * is closed, in which case the caller refuses without touching the sim. A
 * non-forge command (or a non-string) is never refused here and follows the
 * normal dispatch path.
 *
 * `env` is optional rather than defaulted so the hot dispatch call pays the
 * `process.env` object load only on forge tokens (the `??` sits behind the
 * short-circuit), not on every command frame.
 */
export function refusedRiftForgeCommand(
  cmd: unknown,
  env?: Readonly<Record<string, string | undefined>>,
): boolean {
  return (
    typeof cmd === 'string' &&
    RIFT_FORGE_CMD_SET.has(cmd) &&
    !riftForgeWireEnabled(env ?? process.env)
  );
}
