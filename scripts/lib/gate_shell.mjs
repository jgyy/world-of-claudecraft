// Shared quoting helper for every gate spawn site that resolves its OWN
// absolute binary path (resolveTurboBin in gate_task_cache.mjs, FFMPEG_PATH /
// FFPROBE_PATH in gate_preflight.mjs) rather than spawning a bare command name
// like `npm`, `npx`, or `git`.
//
// spawnSync with { shell: true } on win32 does NOT quote `cmd` for the caller:
// Node concatenates `cmd` and `args` with spaces before handing the line to
// the shell (the behavior Node's DEP0190 deprecation warning is about), so an
// absolute path containing a space (an everyday Windows path like
// `C:\Users\Jane Doe\project\node_modules\.bin\turbo.cmd`) gets tokenized as
// two separate words and the shell reports the first half as "not found".
// Before this repo resolved its own binaries, `cmd` was always a bare name
// with no spaces (`npx`, `npm`), so the hazard did not exist; every call site
// that now builds an absolute path must quote it here before it reaches
// spawnSync with shell: true.

/**
 * Quote a value for the shell spawnSync will hand it to when `shell` is true.
 * A no-op when `shell` is false or the value has no space to protect, so it
 * is safe to wrap every spawnSync `cmd` (or a standalone probed binary path)
 * unconditionally.
 * @param {string} value
 * @param {boolean} shell
 * @returns {string}
 */
export function quoteForShell(value, shell) {
  if (!shell || typeof value !== 'string' || !value.includes(' ')) return value;
  if (process.platform === 'win32') return `"${value}"`;
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
