# Task cache (Turborepo) for the local gate

Phase 8 of the local gate performance packet. Pure artifact steps skip work when
their declared inputs are unchanged. Tests never use a "passed" cache.

## Tool choice: turbo (not wireit)

| Option | Why chosen / not |
|---|---|
| **turbo** (kept) | Precise `inputs` / `outputs` per task, local disk cache, one CLI multi-task run for independent pure steps (`check:types` // `build:env` // `build:server`). Gate steps resolve the pnpm-hoisted `node_modules/.bin/turbo` binary directly (`resolveTurboBin`) instead of dispatching through `npx turbo`, skipping npx's own package-resolution and version-check overhead; the spawn site quotes that resolved path when `shell` is true (win32), since Node's `shell: true` concatenates `cmd` and `args` verbatim and an absolute path containing a space (an everyday Windows path) would otherwise be split into two words. Future remote cache is optional and not required. |
| wireit | Lighter per-script incremental, but would rewrite many `package.json` scripts to `"wireit"` with a large config block and weaker multi-task parallel UX for the gate orchestrator. Dropped for this phase. |

Config: root `turbo.json`. Cache dir: `.turbo/` (gitignored). Install: `turbo` is a
devDependency (pnpm).

## Cacheable vs always-run

### Cacheable (turbo tasks)

| Task | Inputs (summary) | Outputs |
|---|---|---|
| `i18n:gen` | `src/ui/i18n.catalog/**`, locales, admin en/locales, `scripts/i18n_*.mjs` | resolved tables, `translation_keys.generated.ts`, status JSON |
| `wiki:content` | `src/sim/**`, deed/visual inputs, `scripts/wiki/**` | `src/guide/content.generated.ts` |
| `sfx:check` | `public/audio/sfx/**`, `scripts/sfx/**` | (pass/fail only) |
| `check:types` | `src/**`, `server/**`, `headless/**`, `tests/**`, tsconfigs | `node_modules/.cache/tsc/**` |
| `build:env` | `headless/**`, `src/sim/**` | `dist-env/**` |
| `build:server` | `server/**`, `src/**`, build script | `dist-server/**` |
| `build:bundle` | `src/**`, `public/**`, HTML entries, vite + manifest scripts | `dist/**` |

Inventory is also exported from `scripts/lib/gate_task_cache.mjs` and pinned by
`tests/gate_task_cache.test.ts` against `turbo.json`.

### Never cached as "green forever"

| Step | How gate runs it | Why |
|---|---|---|
| Full vitest | `npm test` (not turbo) | Source/test changes must re-run the suite |
| Browser regressions | `npm run test:browser` | Same |
| Malware scan | `npm run security:gate` | Cheap enough; always-run security bar |
| Biome changed files | `npm run ci:changed` | Depends on git changed set, not file hash alone |
| i18n freshness | `git diff --exit-code` on artifacts | Cache restore cannot hide committed drift |

`turbo.json` also sets `"cache": false` on `test`, `test:browser`, `security:gate`,
and `ci:changed` so an accidental `turbo run test` never stores a pass.

## How `pnpm run gate` uses it

`scripts/gate.mjs` builds steps from `scripts/lib/gate_steps.mjs`:

1. Preflights: dependency sync, ffmpeg/ffprobe, turbo binary present (unchanged in
   spirit; the turbo-binary check is new since the direct-resolution switch).
2. `<repoRoot>/node_modules/.bin/turbo run i18n:gen` then **always** i18n freshness
   `git diff`.
3. `<repoRoot>/node_modules/.bin/turbo run wiki:content`.
4. Malware + biome via npm (always).
5. `<repoRoot>/node_modules/.bin/turbo run sfx:check`.
6. Full vitest with `WOC_SKIP_PRETEST=1` (Phase 2 generate-once; not turbo-cached).
7. Browser suite via npm.
8. `<repoRoot>/node_modules/.bin/turbo run check:types build:env build:server`
   (parallel when independent).
9. `<repoRoot>/node_modules/.bin/turbo run build:bundle`.

`i18n:gen`, `wiki:content`, and `sfx:check` actually run as one combined multi-task
turbo step (`turbo run i18n:gen wiki:content sfx:check`) for wall-clock overlap on a
cold cache; they are numbered separately above only to show where the i18n freshness
check sits relative to `i18n:gen`.

Phase 2 rules still hold: standalone `pnpm test` / `pnpm run build` regenerate i18n
and wiki; the gate does not triple-generate.

## Warm re-run evidence

On an unchanged tree, pure artifact multi-task:

```text
node_modules/.bin/turbo run i18n:gen wiki:content sfx:check check:types build:env build:server build:bundle
# second run: Cached: 7 cached, 7 total  Time: ~87ms >>> FULL TURBO
```

A catalog edit (any file under `src/ui/i18n.catalog/**`) forces `i18n:gen` cache miss.

## Contributor notes

- Clear local cache: `rm -rf .turbo` (or `npx turbo run <task> --force`).
- Cache hits print in the gate log (`cache hit, replaying logs` / `FULL TURBO`).
- Windows: gate still sets `shell = true` for `npm`/`git`; the resolved turbo binary
  (`turbo.cmd` on win32) is spawned through the same shell, and the spawn site quotes
  its path when it contains a space (`quoteForShell` in `scripts/lib/gate_shell.mjs`).
- Missing/stale `node_modules/.bin/turbo` (e.g. a checkout skipped `pnpm install`)
  fails fast with a `pnpm install --frozen-lockfile` pointer rather than a bare
  ENOENT: `resolveTurboBin` stays a pure path resolver (safe to call with any
  `repoRoot`, including in tests), and `checkTurboBinExists` is the separate,
  existence-checking preflight `runGatePreflights` and `gate_profile.mjs` call before
  spawning.
- Do not add vitest to a cacheable turbo task. If a new pure step is added, declare
  precise `inputs`/`outputs` in `turbo.json` and extend `GATE_CACHE_TASK_INVENTORY`.
