// Generic tooling helper: resolve a locally installed CLI binary from
// node_modules/.bin, so a caller can spawn the exact binary `npm test` (or
// any other npm script) already resolves, instead of paying npx's extra
// registry-aware resolution path for a binary this monorepo always has
// installed. win32-aware: pnpm links a .cmd shim there; every other platform
// ships the bare POSIX script npm/pnpm links. That arm does NOT make a leg
// built from the result Windows-runnable today: callers spawn shell-less on
// purpose, and a `.cmd` spawned without `shell: true` fails with EINVAL on a
// patched Node; no workflow in this repo runs on windows-latest. It is kept
// for convention and future-proofing, not as a working Windows path today.
//
// The repo root is an explicit parameter, not process.cwd(): callers that
// might run from a subdirectory (a script invoked directly, a test spawning
// a subprocess from a different cwd) must thread their own repo root through,
// the same way every other root-relative input in this tree is resolved by
// the caller rather than assumed from the process's working directory.

import path from 'node:path';

/**
 * @param {string} repoRoot
 * @param {string} name
 * @returns {string}
 */
export function resolveLocalBin(repoRoot, name) {
  const bin = process.platform === 'win32' ? `${name}.cmd` : name;
  return path.join(repoRoot, 'node_modules', '.bin', bin);
}
