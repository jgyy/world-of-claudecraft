// Player-facing account settings panel. Opened from the character-select screen
// and the in-game options menu. Talks to the account self-service REST endpoints
// (GET /api/account, POST /api/account/email, POST /api/account/password,
// DELETE /api/account [soft-deactivate]) via the
// injected Api, and renders into the static #account-settings-modal markup in
// index.html. All copy resolves through t(); server errors are localized by the
// injected localizeError (main.ts's userFacingApiError).
import type { Api } from '../net/online';
import { t, formatDateTime } from './i18n';

export interface AccountSettingsOptions {
  api: Api;
  // Localize a thrown API error into user-facing text (main.ts/userFacingApiError).
  localizeError: (err: unknown) => string;
  // Called after the account is deactivated (e.g. to reload to login).
  onDeleted: () => void;
}

export interface AccountSettingsController {
  open: () => void;
  close: () => void;
}

// Mirror the server's normalizeDeleteConfirmation: trim + lowercase, so the
// confirm gate matches exactly what the server will accept.
function normalizeConfirm(value: string): string {
  return value.trim().toLowerCase();
}

function setMessage(el: HTMLElement, text: string, ok: boolean): void {
  el.textContent = text;
  el.classList.toggle('is-ok', ok);
}

export function initAccountSettings(opts: AccountSettingsOptions): AccountSettingsController {
  const { api, localizeError, onDeleted } = opts;
  const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

  const modal = $<HTMLDivElement>('account-settings-modal');
  const username = $<HTMLElement>('account-info-username');
  const emailInfo = $<HTMLElement>('account-info-email');
  const created = $<HTMLElement>('account-info-created');
  const lastLogin = $<HTMLElement>('account-info-lastlogin');
  const characters = $<HTMLElement>('account-info-characters');

  const emailForm = $<HTMLFormElement>('account-email-form');
  const emailInput = $<HTMLInputElement>('account-email');
  const emailMsg = $<HTMLElement>('account-email-msg');
  const emailBtn = $<HTMLButtonElement>('btn-account-save-email');

  const pwForm = $<HTMLFormElement>('account-password-form');
  const curPw = $<HTMLInputElement>('account-current-password');
  const newPw = $<HTMLInputElement>('account-new-password');
  const confirmPw = $<HTMLInputElement>('account-confirm-password');
  const pwMsg = $<HTMLElement>('account-password-msg');
  const pwBtn = $<HTMLButtonElement>('btn-account-change-password');

  const delPw = $<HTMLInputElement>('account-delete-password');
  const delConfirm = $<HTMLInputElement>('account-delete-confirm');
  const delMsg = $<HTMLElement>('account-delete-msg');
  const delBtn = $<HTMLButtonElement>('btn-account-delete');

  const closeBtn = $<HTMLButtonElement>('btn-account-close');

  // The account username drives the delete-confirm gate; captured on open.
  let accountUsername = '';

  function resetForms(): void {
    pwForm.reset();
    emailForm.reset();
    delPw.value = '';
    delConfirm.value = '';
    setMessage(emailMsg, '', false);
    setMessage(pwMsg, '', false);
    setMessage(delMsg, '', false);
    delBtn.disabled = true;
  }

  function close(): void {
    modal.hidden = true;
  }

  async function open(): Promise<void> {
    resetForms();
    username.textContent = '—';
    emailInfo.textContent = '—';
    created.textContent = '—';
    lastLogin.textContent = '—';
    characters.textContent = '—';
    modal.hidden = false;
    try {
      const info = await api.accountInfo();
      accountUsername = info.username;
      username.textContent = info.username;
      emailInfo.textContent = info.email ?? t('hudChrome.account.emailNone');
      emailInput.value = info.email ?? '';
      created.textContent = info.createdAt
        ? formatDateTime(new Date(info.createdAt), { dateStyle: 'medium' })
        : '—';
      lastLogin.textContent = info.lastLogin
        ? formatDateTime(new Date(info.lastLogin), { dateStyle: 'medium', timeStyle: 'short' })
        : t('hudChrome.account.lastLoginNever');
      characters.textContent = String(info.characterCount);
    } catch (err) {
      setMessage(pwMsg, localizeError(err), false);
    }
  }

  emailForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    emailBtn.disabled = true;
    setMessage(emailMsg, t('hudChrome.account.working'), false);
    try {
      const saved = await api.updateEmail(emailInput.value.trim());
      emailInput.value = saved ?? '';
      emailInfo.textContent = saved ?? t('hudChrome.account.emailNone');
      setMessage(emailMsg, saved ? t('hudChrome.account.emailSaved') : t('hudChrome.account.emailCleared'), true);
    } catch (err) {
      setMessage(emailMsg, localizeError(err), false);
    } finally {
      emailBtn.disabled = false;
    }
  });

  pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (newPw.value !== confirmPw.value) {
      setMessage(pwMsg, t('hudChrome.account.passwordMismatch'), false);
      return;
    }
    pwBtn.disabled = true;
    setMessage(pwMsg, t('hudChrome.account.working'), false);
    try {
      await api.changePassword(curPw.value, newPw.value);
      pwForm.reset();
      setMessage(pwMsg, t('hudChrome.account.passwordChanged'), true);
    } catch (err) {
      setMessage(pwMsg, localizeError(err), false);
    } finally {
      pwBtn.disabled = false;
    }
  });

  function syncDeleteGate(): void {
    delBtn.disabled =
      delPw.value.length === 0 ||
      normalizeConfirm(delConfirm.value) !== normalizeConfirm(accountUsername);
  }
  delPw.addEventListener('input', syncDeleteGate);
  delConfirm.addEventListener('input', syncDeleteGate);

  delBtn.addEventListener('click', async () => {
    delBtn.disabled = true;
    setMessage(delMsg, t('hudChrome.account.working'), false);
    try {
      await api.deactivateAccount(delPw.value, delConfirm.value);
      setMessage(delMsg, t('hudChrome.account.deleted'), true);
      onDeleted();
    } catch (err) {
      setMessage(delMsg, localizeError(err), false);
      syncDeleteGate();
    }
  });

  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) close();
  });

  return { open, close };
}
