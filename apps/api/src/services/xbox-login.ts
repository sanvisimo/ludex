import { randomUUID } from 'node:crypto';

import {
  openXboxSession,
  pollXboxDeviceCode,
  startXboxDeviceCode,
  XboxAccountError,
} from '../external/xbox';
import { enqueueImport } from '../queue/imports';
import {
  type LinkOptions,
  linkXboxLogin,
  StoreAccountMismatchError,
  type XboxSettings,
} from './store-accounts';

/**
 * Il login Xbox col device code (9e), dal lato del server.
 *
 * Ha la forma del QR di Steam (`steam-login.ts`): il server apre il login e
 * rende un codice, l'utente lo conferma su microsoft.com/link — anche dal
 * telefono —, la schermata chiede «a che punto sei», e a conferma la riga di
 * `store_accounts` la scrive il server da sé. Il `device_code` non esce mai dal
 * server: vale un login.
 *
 * Lo stato sta **in memoria nel processo dell'API**, con lo stesso limite
 * dichiarato del QR: con più repliche servirebbe Redis, e un riavvio costa un
 * codice da rifare.
 */

export type XboxLoginState =
  /** Il codice è mostrato, l'utente non l'ha ancora confermato. */
  | 'waiting'
  /** Confermato, e l'account è scritto. */
  | 'done'
  /** Scaduto, abbandonato, o mai esistito: da chiedere un codice nuovo. */
  | 'expired'
  | 'failed';

export type XboxLoginReason =
  /** Su un ricollegamento, il login era di un altro account. */
  | 'wrong_account'
  /** L'utente ha premuto «Nega». */
  | 'declined'
  /** L'account Microsoft non ha un profilo Xbox. */
  | 'no_profile'
  /** Xbox non è disponibile nel paese dell'account. */
  | 'country'
  /** Account di un minore: serve il consenso di un adulto. */
  | 'child';

export type XboxLoginStatus = {
  status: XboxLoginState;
  accountId: string | null;
  reason: XboxLoginReason | null;
};

type Pending = XboxLoginStatus & { userId: string; cancelled: boolean };

const logins = new Map<string, Pending>();

/** Abbastanza perché la schermata, che interroga ogni pochi secondi, legga l'esito. */
const REMEMBER_MS = 20 * 60_000;

const GONE: XboxLoginStatus = {
  status: 'expired',
  accountId: null,
  reason: null,
};

const pausa = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms).unref());

/**
 * Apre un login: rende il codice da mostrare e comincia a interrogare
 * Microsoft in sottofondo, al ritmo che chiede.
 *
 * **Una sola sessione attiva per utente**: aprirne una seconda ferma la prima,
 * che altrimenti continuerebbe a interrogare per un quarto d'ora un codice che
 * nessuno guarda più.
 */
export async function startXboxLogin(
  userId: string,
  settings: XboxSettings,
  options: LinkOptions = {},
) {
  for (const [id, pending] of logins) {
    if (pending.userId !== userId) continue;
    pending.cancelled = true;
    logins.delete(id);
  }

  const code = await startXboxDeviceCode();
  const loginId = randomUUID();
  const pending: Pending = {
    userId,
    status: 'waiting',
    accountId: null,
    reason: null,
    cancelled: false,
  };
  logins.set(loginId, pending);
  setTimeout(() => logins.delete(loginId), REMEMBER_MS).unref();

  void waitForConfirmation(pending, code.deviceCode, code, settings, options);

  return {
    loginId,
    userCode: code.userCode,
    verificationUri: code.verificationUri,
    expiresAt: new Date(code.expiresAt),
  };
}

async function waitForConfirmation(
  pending: Pending,
  deviceCode: string,
  timing: { expiresAt: number; intervalMs: number },
  settings: XboxSettings,
  options: LinkOptions,
) {
  let intervallo = timing.intervalMs;
  try {
    while (Date.now() < timing.expiresAt) {
      await pausa(intervallo);
      if (pending.cancelled) return;

      const poll = await pollXboxDeviceCode(deviceCode);
      if (pending.cancelled) return;
      if (poll.status === 'pending') continue;
      if (poll.status === 'slow_down') {
        intervallo += 5000;
        continue;
      }
      if (poll.status === 'expired') break;
      if (poll.status === 'declined') {
        pending.status = 'failed';
        pending.reason = 'declined';
        return;
      }

      const session = await openXboxSession(poll.credentials.accessToken);
      const account = await linkXboxLogin(
        pending.userId,
        { credentials: poll.credentials, session },
        settings,
        options,
      );
      pending.accountId = account.id;
      pending.status = 'done';

      // Collegare e importare sono la stessa azione per l'utente. Dopo `done`:
      // un accodamento che fallisce non deve rovesciare un login riuscito.
      await enqueueImport('xbox', { storeAccountId: account.id }).catch(
        (error: unknown) =>
          console.error(
            `[xbox-login] import non accodato per ${account.id}:`,
            error instanceof Error ? error.message : error,
          ),
      );
      return;
    }
    pending.status = 'expired';
  } catch (error) {
    if (pending.cancelled) return;
    pending.status = 'failed';
    if (error instanceof StoreAccountMismatchError) {
      pending.reason = 'wrong_account';
    } else if (error instanceof XboxAccountError && error.reason !== 'other') {
      pending.reason = error.reason;
    } else {
      console.error(
        '[xbox-login] login non riuscito:',
        error instanceof Error ? error.message : error,
      );
    }
  }
}

/**
 * A che punto è un login. Una sessione di un altro utente o mai esistita dicono
 * la stessa cosa, `expired`, come per il QR di Steam.
 */
export function xboxLoginStatus(
  userId: string,
  loginId: string,
): XboxLoginStatus {
  const pending = logins.get(loginId);
  if (!pending || pending.userId !== userId) return GONE;
  return {
    status: pending.status,
    accountId: pending.accountId,
    reason: pending.reason,
  };
}
