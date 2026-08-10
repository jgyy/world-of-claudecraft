import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const userData = readFileSync('deploy/user-data.sh', 'utf8');
const deployDoc = readFileSync('DEPLOY.md', 'utf8');

// Slices the body of an unquoted `<<CADDY ... CADDY` heredoc out of user-data.sh, the
// same indexOf-slicing style tests/deploy_game_ops.test.ts uses to scope the compose
// `game:` service: it isolates one Caddy site block so an assertion cannot be satisfied
// by the OTHER block instead.
function sliceHeredoc(source: string, openMarker: string): string {
  const start = source.indexOf(openMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = start + openMarker.length;
  const end = source.indexOf('\nCADDY\n', bodyStart);
  expect(end).toBeGreaterThan(bodyStart);
  return source.slice(bodyStart, end);
}

describe('Caddy reverse-proxy compression (zstd with gzip fallback)', () => {
  it('finds both distinct Caddy site block markers in user-data.sh', () => {
    const publicStart = userData.indexOf('cat > /etc/caddy/Caddyfile <<CADDY');
    const adminStart = userData.indexOf('cat >> /etc/caddy/Caddyfile <<CADDY');
    expect(publicStart).toBeGreaterThanOrEqual(0);
    expect(adminStart).toBeGreaterThan(publicStart);
  });

  const publicSite = sliceHeredoc(userData, 'cat > /etc/caddy/Caddyfile <<CADDY');
  const adminSite = sliceHeredoc(userData, 'cat >> /etc/caddy/Caddyfile <<CADDY');

  // Caddy negotiates against the client's Accept-Encoding q-values; when a client sends
  // no preference (or accepts both equally), the FIRST-listed encoder in the `encode`
  // directive wins the tie. zstd has to be listed before gzip for that tie-break to
  // actually prefer it, otherwise this reads as a no-op that merely widens the fallback.
  it('lists zstd before gzip on the public site block', () => {
    expect(publicSite).toContain('encode zstd gzip');
    expect(publicSite.indexOf('zstd')).toBeGreaterThan(0);
    expect(publicSite.indexOf('zstd')).toBeLessThan(publicSite.indexOf('gzip'));
  });

  it('lists zstd before gzip on the admin domain block', () => {
    expect(adminSite).toContain('encode zstd gzip');
    expect(adminSite.indexOf('zstd')).toBeGreaterThan(0);
    expect(adminSite.indexOf('zstd')).toBeLessThan(adminSite.indexOf('gzip'));
  });

  // Regression pin: the ops 404 matcher and the reverse_proxy target are untouched,
  // exactly the same contiguous shape as before, with only the encode line's formats
  // changed. If either handle block moved or lost a line, this fails.
  it('keeps the ops 404 handling and reverse_proxy wiring intact around the new directive', () => {
    const expectedShape = [
      '\t@ops path /livez /readyz /metrics /internal/*',
      '\thandle @ops {',
      '\t\trespond 404',
      '\t}',
      '\thandle {',
      '\t\treverse_proxy localhost:8787',
      '\t}',
      '\tencode zstd gzip',
      '}',
    ].join('\n');
    expect(`${publicSite}\n}`).toContain(expectedShape);
    expect(`${adminSite}\n}`).toContain(expectedShape);
  });

  it('never leaves a bare gzip-only directive behind in user-data.sh or DEPLOY.md', () => {
    expect(userData).not.toContain('encode gzip');
    expect(deployDoc).not.toContain('encode gzip');
  });

  it('applies the same zstd-with-gzip-fallback directive in the manual DEPLOY.md TLS snippet', () => {
    const snippetStart = deployDoc.indexOf("echo 'play.example.com {");
    expect(snippetStart).toBeGreaterThanOrEqual(0);
    const snippetEnd = deployDoc.indexOf("}' | sudo tee /etc/caddy/Caddyfile", snippetStart);
    expect(snippetEnd).toBeGreaterThan(snippetStart);
    const snippet = deployDoc.slice(snippetStart, snippetEnd);
    expect(snippet).toContain('reverse_proxy localhost:8787\n\tencode zstd gzip');
  });
});
