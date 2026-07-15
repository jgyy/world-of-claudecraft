// Regression for the "opt-in does not survive reconnect" finding (PR #1826
// review, FernandoX7 #1): a fresh-join reconnect (past the linkdead grace, or
// a server restart) rebuilds the server session with voiceOptIn: false, but
// VoiceChatClient.enabled stays true on the client, so setEnabled(true) would
// short-circuit and voice would silently stop. ClientWorld must re-send
// voiceoptin on the post-reconnect `hello` whenever voice is enabled, and must
// NOT send it (there is nothing to resume) when voice was never turned on.
import { afterEach, describe, expect, it } from 'vitest';
import { ClientWorld } from '../../src/net/online';
import type { PlayerClass } from '../../src/sim/types';

const PROBE_CLASS: PlayerClass = 'warrior';

class StubWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  readyState = StubWebSocket.OPEN;
  sent: string[] = [];
  constructor(public readonly url: string) {
    StubWebSocket.instances.push(this);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.readyState = StubWebSocket.CLOSED;
  }
  static instances: StubWebSocket[] = [];
}

function withDomStubs<T>(fn: () => T): T {
  const g = globalThis as Record<string, unknown>;
  const prevWebSocket = g.WebSocket;
  const prevWindow = g.window;
  const prevDocument = g.document;
  g.WebSocket = StubWebSocket as unknown;
  g.document = {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  } as unknown;
  g.window = {
    setInterval: () => 0,
    clearInterval: () => undefined,
    setTimeout: () => 0,
    clearTimeout: () => undefined,
  };
  try {
    return fn();
  } finally {
    g.WebSocket = prevWebSocket;
    g.window = prevWindow;
    g.document = prevDocument;
  }
}

function hello(ws: StubWebSocket, pid = 1): void {
  ws.onmessage?.({ data: JSON.stringify({ t: 'hello', pid, seed: 1 }) });
}

function sentTypes(ws: StubWebSocket): string[] {
  return ws.sent.map((raw) => JSON.parse(raw).t);
}

describe('voice opt-in resend on reconnect', () => {
  afterEach(() => {
    StubWebSocket.instances = [];
  });

  it('re-sends voiceoptin on a reconnect hello when voice is enabled', () => {
    withDomStubs(() => {
      const world = new ClientWorld('t', 1, PROBE_CLASS, 'http://localhost');
      const ws = StubWebSocket.instances[0];

      // First hello: a fresh join, not a reconnect (reconnectAttempts starts 0).
      hello(ws);
      (world as unknown as { voice: { isEnabled: () => boolean } }).voice = {
        isEnabled: () => true,
      } as unknown as ClientWorld['voice'];

      ws.sent = [];
      (world as unknown as { reconnectAttempts: number }).reconnectAttempts = 1;
      hello(ws);

      expect(sentTypes(ws)).toContain('voiceoptin');
      const optIn = ws.sent.map((raw) => JSON.parse(raw)).find((m) => m.t === 'voiceoptin');
      expect(optIn.on).toBe(true);
    });
  });

  it('does not send voiceoptin on reconnect when voice was never enabled', () => {
    withDomStubs(() => {
      const world = new ClientWorld('t', 1, PROBE_CLASS, 'http://localhost');
      const ws = StubWebSocket.instances[0];
      hello(ws);

      ws.sent = [];
      (world as unknown as { reconnectAttempts: number }).reconnectAttempts = 1;
      hello(ws);

      expect(sentTypes(ws)).not.toContain('voiceoptin');
    });
  });

  it('does not send voiceoptin on the very first (non-reconnect) hello', () => {
    withDomStubs(() => {
      const world = new ClientWorld('t', 1, PROBE_CLASS, 'http://localhost');
      const ws = StubWebSocket.instances[0];
      (world as unknown as { voice: { isEnabled: () => boolean } }).voice = {
        isEnabled: () => true,
      } as unknown as ClientWorld['voice'];

      hello(ws);

      expect(sentTypes(ws)).not.toContain('voiceoptin');
    });
  });
});
