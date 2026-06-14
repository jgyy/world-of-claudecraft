import * as http from 'node:http';

// Simple in-memory rate limiter (per client IP, sliding minute window).
//
// Client IP resolution must work behind the production stack: nginx on the
// host proxies to the game CONTAINER, so connections arrive from the docker
// bridge gateway (e.g. 172.18.0.1), not loopback. The compose file publishes
// the port on 127.0.0.1 only, so any connection from a loopback/private
// address IS our reverse proxy (or LAN dev) — trust its X-Forwarded-For.
// Direct internet clients have public addresses and are never trusted, so
// they can't spoof the header. Set TRUSTED_PROXY_IPS (comma-separated) to
// pin an explicit proxy list instead of the private-range default.
const WINDOW_MS = 60_000;
const MAX_TRACKED_IPS = 10_000;

const attempts = new Map<string, number[]>();

function normalizeIp(ip: string): string {
  if (ip.startsWith('::ffff:')) return ip.slice('::ffff:'.length);
  return ip;
}

// loopback, RFC1918, link-local, IPv6 ULA — the only sources our reverse
// proxy (or a dev setup) can connect from given the loopback-only publish
function isPrivateOrLoopback(ip: string): boolean {
  if (ip === '::1' || ip.startsWith('127.')) return true;
  if (ip.startsWith('10.') || ip.startsWith('192.168.') || ip.startsWith('169.254.')) return true;
  const oct172 = /^172\.(\d{1,3})\./.exec(ip);
  if (oct172) {
    const o = Number(oct172[1]);
    return o >= 16 && o <= 31;
  }
  const lower = ip.toLowerCase();
  return lower.startsWith('fc') || lower.startsWith('fd') || lower.startsWith('fe80:');
}

function isTrustedProxy(ip: string): boolean {
  const configured = process.env.TRUSTED_PROXY_IPS;
  if (configured) {
    return configured.split(',').map((s) => normalizeIp(s.trim())).filter(Boolean).includes(ip);
  }
  return isPrivateOrLoopback(ip);
}

export function requestIp(req: http.IncomingMessage): string {
  const remote = normalizeIp(String(req.socket?.remoteAddress ?? 'unknown').trim());
  if (!isTrustedProxy(remote)) return remote;

  // Walk X-Forwarded-For from the right (the end our own proxies append to),
  // past any trusted hops; the first address we don't control is the real
  // client. Everything left of it is client-supplied and spoofable.
  const chain = String(req.headers['x-forwarded-for'] ?? '')
    .split(',')
    .map((s) => normalizeIp(s.trim()))
    .filter(Boolean);
  for (let i = chain.length - 1; i >= 0; i--) {
    if (!isTrustedProxy(chain[i])) return chain[i];
  }
  return chain[0] ?? remote;
}

// Memory backstop: keep the tracking map bounded WITHOUT wiping every client's
// counters at once. A blanket `attempts.clear()` would let an attacker spraying
// from many IPs reset the limiter for everyone. Instead we first drop entries
// whose attempts have all aged out of the window (the common case — one-shot
// IPs that are never seen again), and only if that fails to get us back under
// the cap do we evict the oldest-tracked entries, bounded to the overflow.
function pruneTracked(windowStart: number): void {
  for (const [ip, list] of attempts) {
    const live = list.filter((t) => t > windowStart);
    if (live.length === 0) attempts.delete(ip);
    else if (live.length !== list.length) attempts.set(ip, live);
  }
  if (attempts.size <= MAX_TRACKED_IPS) return;
  // Still over budget (every tracked IP is currently active): evict the oldest
  // insertions — Map preserves insertion order — rather than nuking all state.
  let toEvict = attempts.size - MAX_TRACKED_IPS;
  for (const ip of attempts.keys()) {
    if (toEvict-- <= 0) break;
    attempts.delete(ip);
  }
}

export function rateLimited(req: http.IncomingMessage, maxPerMinute = 20): boolean {
  const ip = requestIp(req);
  const now = Date.now();
  const windowStart = now - WINDOW_MS;
  const list = (attempts.get(ip) ?? []).filter((t) => t > windowStart);
  const updated = [...list, now];
  attempts.set(ip, updated);
  if (attempts.size > MAX_TRACKED_IPS) pruneTracked(windowStart);
  return updated.length > maxPerMinute;
}
