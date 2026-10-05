import { randomUUID } from 'node:crypto';

import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import QRCode from 'qrcode';

import { beginSteamQrLogin, SteamQrTimeoutError } from '../external/steam-auth';
import { enqueueImport } from '../queue/imports';
import { pruneFamilyCopies } from './steam-import';
import {
  findStoreAccount,
  type LinkOptions,
  linkSteamLogin,
  StoreAccountMismatchError,
} from './store-accounts';

/**
 * Il login Steam col QR (9f), dal lato del server.
 *
 * **Non è una mutazione come `link`.** Gli altri negozi si collegano con un
 * valore che l'utente incolla: una richiesta, una risposta. Qui il QR è una
 * sessione che il server tiene aperta finché l'utente non inquadra e conferma
 * nell'app, e la schermata chiede «a che punto sei» a intervalli. Tre momenti:
 * `startSteamLogin` apre la sessione e rende il QR, `steamLoginStatus` dice a che
 * punto è, e quando l'utente conferma la riga di `store_accounts` la scrive il
 * server da sé.
 *
 * Lo stato sta **in memoria nel processo dell'API**, ed è un limite dichiarato:
 * con più repliche dietro un bilanciatore la richiesta di stato può arrivare a
 * una che non ha la sessione, e servirebbe Redis (o l'affinità di sessione).
 * Per un'installazione sola — il minipc — va bene, e un riavvio del processo
 * costa solo un QR da rifare: lo stato dice `expired` e la schermata ne chiede
 * uno nuovo. Il lavoro BullMQ non c'entra: è una richiesta dell'utente, non un
 * job.
 */

export type SteamLoginState =
  /** Il QR è mostrato, nessuno l'ha ancora inquadrato. */
  | 'waiting'
  /** Inquadrato: manca la conferma nell'app. */
  | 'scanned'
  /** Confermato, e l'account è scritto. */
  | 'done'
  /** Scaduto, abbandonato, o mai esistito: da chiedere un QR nuovo. */
  | 'expired'
  /** Steam o l'utente hanno rifiutato, o il login era di un altro account. */
  | 'failed';

export type SteamLoginStatus = {
  status: SteamLoginState;
  /** L'account scritto, a login confermato. */
  accountId: string | null;
  /** Perché è fallito, quando la schermata deve dire una cosa specifica. */
  reason: 'wrong_account' | null;
};

type Pending = SteamLoginStatus & {
  userId: string;
  cancel: () => void;
};

const logins = new Map<string, Pending>();

/**
 * Quanto si ricorda una sessione dopo la fine: abbastanza perché la schermata,
 * che interroga ogni due secondi, la legga almeno una volta. Passato questo,
 * `steamLoginStatus` dice `expired` come per una sessione mai esistita.
 */
const REMEMBER_MS = 10 * 60_000;

const GONE: SteamLoginStatus = {
  status: 'expired',
  accountId: null,
  reason: null,
};

/**
 * Apre un login col QR.
 *
 * **Una sola sessione attiva per utente**: aprirne una seconda annulla la prima.
 * Senza, chi apre il dialogo, lo chiude e lo riapre lascia un QR vivo per ogni
 * volta, ciascuno con la sua sessione aperta sui server di Steam.
 */
export async function startSteamLogin(
  userId: string,
  options: LinkOptions = {},
) {
  for (const [id, pending] of logins) {
    if (pending.userId !== userId) continue;
    pending.cancel();
    logins.delete(id);
  }

  const loginId = randomUUID();
  const pending: Pending = {
    userId,
    status: 'waiting',
    accountId: null,
    reason: null,
    cancel: () => {},
  };
  logins.set(loginId, pending);

  const session = await beginSteamQrLogin(() => {
    if (pending.status === 'waiting') pending.status = 'scanned';
  }).catch((error: unknown) => {
    // Non è mai partita: niente da ricordare.
    logins.delete(loginId);
    throw error;
  });
  pending.cancel = session.cancel;

  // Una sessione che qualcun altro ha annullato (una seconda `startSteamLogin`)
  // non si risolve né si rifiuta, ma per sicurezza ogni esito controlla di essere
  // ancora quella in tabella.
  const current = () => logins.get(loginId) === pending;

  session.result.then(
    async (login) => {
      if (!current()) return;
      try {
        const account = await linkSteamLogin(userId, login, options);
        pending.accountId = account.id;
        pending.status = 'done';

        // Collegare e importare sono la stessa azione per l'utente, come per
        // gli altri negozi. Dopo `done`: un accodamento che fallisce non deve
        // rovesciare un login riuscito.
        await enqueueImport('steam', { storeAccountId: account.id }).catch(
          (error: unknown) =>
            console.error(
              `[steam-login] import non accodato per ${account.id}:`,
              error instanceof Error ? error.message : error,
            ),
        );
      } catch (error) {
        if (!current()) return;
        pending.status = 'failed';
        if (error instanceof StoreAccountMismatchError) {
          pending.reason = 'wrong_account';
        } else {
          console.error(
            '[steam-login] login riuscito ma account non scritto:',
            error instanceof Error ? error.message : error,
          );
        }
      }
    },
    (error: unknown) => {
      if (!current()) return;
      if (error instanceof SteamQrTimeoutError) {
        pending.status = 'expired';
        return;
      }
      pending.status = 'failed';
      console.error(
        '[steam-login] login rifiutato:',
        error instanceof Error ? error.message : error,
      );
    },
  );

  setTimeout(() => logins.delete(loginId), REMEMBER_MS).unref();

  return {
    loginId,
    qrUrl: session.qrUrl,
    // Già disegnato: web e mobile lo mostrano come un'immagine, senza una
    // libreria di QR in più nel bundle.
    qrImage: await QRCode.toDataURL(session.qrUrl, {
      margin: 2,
      width: 320,
    }),
  };
}

/**
 * A che punto è un login.
 *
 * Una sessione di un altro utente o mai esistita dicono la stessa cosa,
 * `expired`: la risposta non deve distinguere «non è tua» da «non c'è», o un id
 * indovinato direbbe quali esistono.
 */
export function steamLoginStatus(
  userId: string,
  loginId: string,
): SteamLoginStatus {
  const pending = logins.get(loginId);
  if (!pending || pending.userId !== userId) return GONE;
  return {
    status: pending.status,
    accountId: pending.accountId,
    reason: pending.reason,
  };
}

/**
 * Toglie il solo login: l'account resta, e con lui il profilo e i giochi propri.
 *
 * La credenziale se ne va, lo stato torna `ok` (un account col solo profilo non
 * ha niente da ricollegare), e le copie della famiglia escono come se la
 * famiglia fosse vuota: senza login non la si legge più, e lasciarle vorrebbe
 * dire giochi «di un parente» che nessun import potrà mai più confermare né
 * togliere.
 *
 * **Prima la credenziale, poi la potatura.** Se la seconda fallisse a metà, con
 * la credenziale ancora lì il prossimo import riscriverebbe le copie appena
 * tolte; così resta un account senza login con qualche copia di troppo, e
 * richiamare questa funzione — è idempotente — finisce il lavoro.
 *
 * Null se l'account non c'è, non è dell'utente o non è Steam.
 */
export async function removeSteamLogin(userId: string, accountId: string) {
  const account = await findStoreAccount(userId, accountId);
  if (!account || account.store !== 'steam' || account.status === 'unlinked') {
    return null;
  }

  const [pulito] = await db
    .update(schema.storeAccounts)
    .set({
      credentials: null,
      credentialsExpireAt: null,
      status: 'ok',
      updatedAt: new Date(),
    })
    .where(eq(schema.storeAccounts.id, account.id))
    .returning();

  return pruneFamilyCopies(pulito!, new Set());
}
