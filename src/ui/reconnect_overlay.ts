// Full-screen notice shown while the game socket is auto-retrying after an
// unexpected drop. The server holds the character in-world (linkdead) during
// the retry window, so this is a pause, not a logout: the overlay blocks
// input until the world resumes (hide) or the session ends for good (main.ts
// then swaps in its fatal disconnect overlay).
//
// Shows a live attempt count and retry countdown (ticked every second) rather
// than a static string: on a lossy/throttled connection a single retry cycle
// can run up to RECONNECT_MAX_DELAY_MS (src/net/online.ts), and a frozen
// message with no feedback is indistinguishable from a hung client.

import { secondsUntilRetry } from '../net/reconnect_status';
import { t } from './i18n';

const OVERLAY_ID = 'reconnect-overlay';
const TICK_MS = 1000;

let tickTimer: number | null = null;

export function showReconnectOverlay(
  attempt: number,
  maxAttempts: number,
  nextRetryAtMs: number,
): void {
  let el = document.getElementById(OVERLAY_ID);
  let messageEl: HTMLElement;
  if (el) {
    messageEl = el.firstElementChild as HTMLElement;
  } else {
    el = document.createElement('div');
    el.id = OVERLAY_ID;
    el.className = 'fatal-overlay';
    messageEl = document.createElement('div');
    el.appendChild(messageEl);
    document.body.appendChild(el);
  }

  const render = () => {
    messageEl.textContent = t('loading.reconnectingAttempt', {
      attempt,
      maxAttempts,
      seconds: secondsUntilRetry(nextRetryAtMs, Date.now()),
    });
  };
  render();

  if (tickTimer !== null) window.clearInterval(tickTimer);
  tickTimer = window.setInterval(render, TICK_MS);
}

export function hideReconnectOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
  if (tickTimer !== null) {
    window.clearInterval(tickTimer);
    tickTimer = null;
  }
}
