// Unsupported-browser advisory (issue #2266). Players on a browser outside the
// officially supported set (Chrome, Firefox, Safari) can hit degraded
// performance with no signal that the browser is the cause. This module is
// pure detection + dismissal-persistence logic; `initBrowserSupportNotice`
// is the thin DOM consumer main.ts calls once at boot. The desktop shell
// (Electron) and native mobile shells (Capacitor) are excluded entirely: they
// either bundle Chromium themselves or are not a "browser" choice at all.

const DISMISS_KEY = 'woc_unsupported_browser_dismissed';

/**
 * Best-effort classification of whether the current engine is one of the
 * three officially supported browsers. Pure: pass any UA string in.
 *
 * Two UA fossils would otherwise misclassify as supported, called out in the
 * issue: Brave reports a plain Chrome UA (caught via `hasBraveApi`, the
 * `navigator.brave` object Brave alone exposes), and Chromium-based Edge
 * carries a `Edg/` token alongside the Chrome one. Both must be checked
 * BEFORE the generic Chromium match. Anything else ambiguous defaults to
 * supported: a false "unsupported" nag on a real Chrome user is worse than a
 * missed notice on some other Chromium fork.
 */
export function isSupportedBrowser(userAgent: string, hasBraveApi: boolean): boolean {
  const ua = userAgent || '';
  if (hasBraveApi) return false;
  if (/\bEdg(?:A|iOS)?\/\d/.test(ua)) return false;
  if (/\bOPR\/\d/.test(ua)) return false;
  if (/Gecko\/\d/.test(ua) && /Firefox\/\d/.test(ua)) return true;
  if (/(?:Chrome|CriOS|Chromium)\/\d/.test(ua)) return true;
  if (/AppleWebKit/.test(ua) && /Version\/\d/.test(ua) && !/Chrome|Chromium|CriOS/.test(ua)) {
    return true;
  }
  return true;
}

/** Read the browser's own "am I Brave" signal. False everywhere but Brave. */
export function readHasBraveApi(nav: { brave?: unknown } = navigator): boolean {
  return typeof nav.brave === 'object' && nav.brave !== null;
}

export interface BrowserSupportNoticeInput {
  readonly isSupportedBrowser: boolean;
  readonly isDesktopApp: boolean;
  readonly isNativeShell: boolean;
  readonly dismissed: boolean;
}

/** Decide whether the notice should render. Pure so every case is table-tested. */
export function shouldShowBrowserSupportNotice(input: BrowserSupportNoticeInput): boolean {
  if (input.isSupportedBrowser) return false;
  if (input.isDesktopApp) return false;
  if (input.isNativeShell) return false;
  if (input.dismissed) return false;
  return true;
}

/** Read the persisted dismissal flag. Never throws (private mode / corrupt storage). */
export function readBrowserSupportNoticeDismissed(storage: Storage = localStorage): boolean {
  try {
    return storage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the dismissal so the notice does not nag every future load. */
export function persistBrowserSupportNoticeDismissed(storage: Storage = localStorage): void {
  try {
    storage.setItem(DISMISS_KEY, '1');
  } catch {
    // Private mode / storage full: the notice simply reappears next load.
  }
}

// ---------------------------------------------------------------------------
// DOM wiring. main.ts calls initBrowserSupportNotice() once at boot; every
// input above is impure-but-injectable so the decision itself stays testable.
// ---------------------------------------------------------------------------

import { isDesktopAppRuntime } from '../runtime';
import { t } from '../ui/i18n';
import { isNativeAppShell } from './mobile_controls';

/** Builds the dismissible banner element. Exported for a future visual test. */
export function buildBrowserSupportNoticeElement(
  doc: Document,
  onDismiss: () => void,
): HTMLElement {
  const el = doc.createElement('div');
  el.id = 'browser-support-notice';
  el.className = 'browser-support-notice';
  el.setAttribute('role', 'status');

  const title = doc.createElement('div');
  title.className = 'browser-support-notice-title';
  title.textContent = t('hudChrome.landing.browserSupport.title');
  el.appendChild(title);

  const body = doc.createElement('div');
  body.className = 'browser-support-notice-body';
  body.textContent = t('hudChrome.landing.browserSupport.body');
  el.appendChild(body);

  const actions = doc.createElement('div');
  actions.className = 'browser-support-notice-actions';

  const desktopBtn = doc.createElement('button');
  desktopBtn.type = 'button';
  desktopBtn.className = 'browser-support-notice-desktop';
  desktopBtn.textContent = t('hudChrome.landing.browserSupport.getDesktopApp');
  desktopBtn.addEventListener('click', () => {
    doc.getElementById('nav-btn-download')?.dispatchEvent(new Event('click', { bubbles: true }));
  });
  actions.appendChild(desktopBtn);

  const continueBtn = doc.createElement('button');
  continueBtn.type = 'button';
  continueBtn.className = 'browser-support-notice-continue';
  continueBtn.textContent = t('hudChrome.landing.browserSupport.continueInBrowser');
  continueBtn.setAttribute('aria-label', t('hudChrome.landing.browserSupport.dismissAria'));
  continueBtn.addEventListener('click', onDismiss);
  actions.appendChild(continueBtn);

  el.appendChild(actions);
  return el;
}

/**
 * Show the notice, once, when this load's browser is genuinely unsupported and
 * the dismissal was not already persisted. No-op in the desktop app, in a
 * native mobile shell, or on an already-supported browser.
 */
export function initBrowserSupportNotice(doc: Document = document): void {
  const show = shouldShowBrowserSupportNotice({
    isSupportedBrowser: isSupportedBrowser(navigator.userAgent || '', readHasBraveApi()),
    isDesktopApp: isDesktopAppRuntime(),
    isNativeShell: isNativeAppShell(),
    dismissed: readBrowserSupportNoticeDismissed(),
  });
  if (!show) return;
  const dismiss = (): void => {
    persistBrowserSupportNoticeDismissed();
    el.remove();
  };
  const el = buildBrowserSupportNoticeElement(doc, dismiss);
  doc.body.appendChild(el);
}
