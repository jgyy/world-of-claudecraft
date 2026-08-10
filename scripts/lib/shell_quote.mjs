// Shared quoting for spawnSync(cmd, args, { shell: true }) call sites.
//
// Node's spawnSync does NOT quote `cmd` for you when `shell: true`: on both
// win32 (cmd.exe) and POSIX (/bin/sh) it concatenates `cmd` and `args` into
// one command-line string with plain spaces. An absolute path containing a
// space (a resolved turbo/ffmpeg/ffprobe binary under a repo checked out at
// e.g. `C:\Users\Jane Doe\...`) then splits into two shell tokens and the
// spawn fails, typically as a bare ENOENT / "not found" with no hint that a
// space in the path was the cause. `npx`/`npm` never hit this because those
// commands themselves contain no spaces; a resolved absolute path can.
//
// quoteForShell only wraps a value that actually needs it, so callers can
// apply it unconditionally to every `cmd` (and any arg that may itself be an
// absolute path) passed to a `shell: true` spawn without changing behavior
// for the common no-space case.

/**
 * Quote a value for safe inclusion in a `shell: true` spawnSync command line.
 * No-op when the value has no whitespace. Platform-aware: cmd.exe accepts
 * double-quoting with `""` escaping for embedded quotes; POSIX shells use
 * single-quoting with the standard `'\''` escape for embedded single quotes.
 * @param {string} value
 * @param {NodeJS.Platform} [platform]
 * @returns {string}
 */
export function quoteForShell(value, platform = process.platform) {
  if (typeof value !== 'string' || !/\s/.test(value)) return value;
  if (platform === 'win32') {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
