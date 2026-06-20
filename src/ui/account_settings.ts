// Player-facing account settings panel. Opened from the character-select screen
// and the in-game options menu. Talks to the account self-service REST endpoints
// (GET /api/account, POST /api/account/password, DELETE /api/account) via the
// injected Api, and renders into the static #account-settings-modal markup in
// index.html. All copy resolves through t(); server errors are localized by the
// injected localizeError (main.ts's userFacingApiError).
import type { Api } from '../net/online';
import { t, formatDateTime } from './i18n';

export interface AccountSettingsOptions {
  api: Api;
  // Localize a thrown API error into user-facing text (main.ts/userFacingApiError).
  localizeError: (err: unknown) => string;
  // Called after the account is permanently deleted (e.g. to reload to login).
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
  const created = $<HTMLElement>('account-info-created');
  const lastLogin = $<HTMLElement>('account-info-lastlogin');
  const characters = $<HTMLElement>('account-info-characters');

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
    delPw.value = '';
    delConfirm.value = '';
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
    created.textContent = '—';
    lastLogin.textContent = '—';
    characters.textContent = '—';
    modal.hidden = false;
    try {
      const info = await api.accountInfo();
      accountUsername = info.username;
      username.textContent = info.username;
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
      await api.deleteAccount(delPw.value, delConfirm.value);
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
