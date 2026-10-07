// L'autenticazione Steam, per l'utente che ha fatto il login (9f). Come `psn.ts`
// per i token: sta fuori da `services/` perché è l'accesso a un servizio esterno.
//
// Il login è quello dell'app Steam sul telefono, col QR, e la libreria è
// `steam-session` — `MobileApp` è l'unica piattaforma i cui token si rinnovano
// da un server (`WebBrowser` risponde `AccessDenied`, `SteamClient` vuole una
// sessione CM aperta). Misurato il 05/10/2026, in docs/negozi.md: il refresh
// token dura 211–212 giorni, l'access token 24 ore e mezza.
//
// Il credenziale ha la stessa forma di GOG, Epic e PSN, così `storeAccessToken`
// lo rinnova senza sapere di che negozio sia.

import { EAuthTokenPlatformType, EResult, LoginSession } from 'steam-session';

/**
 * Steam ha rifiutato il credenziale, o il credenziale non è più un token Steam.
 *
 * Il collegamento è morto e non si aggiusta da sé: solo un nuovo login col QR lo
 * rimette a posto. Distinto da un errore qualunque perché il chiamante ci fa una
 * cosa diversa — `needs_reauth` invece di un job che riprova a vuoto.
 */
export class SteamAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SteamAuthError';
  }
}

export type SteamCredentials = {
  accessToken: string;
  refreshToken: string;
  /** Epoch in millisecondi. L'access token dura 24 ore e mezza. */
  expiresAt: number;
  /**
   * Quando muore il **refresh token**: 211–212 giorni, misurati. Tenuto dentro il
   * credenziale e non nella colonna `credentialsExpireAt`, che è dell'access
   * token: serve a sapere, un giorno, che l'account sta per scadere *prima* che
   * smetta di funzionare.
   */
  refreshExpiresAt: number;
};

/**
 * Gli `EResult` con cui Steam dice «questo token non vale più». Gli altri —
 * `Timeout`, `ServiceUnavailable`, `Busy` e compagnia — sono la rete o Steam in
 * affanno, e lì il job deve riprovare invece di mandare l'utente a rifare il QR.
 *
 * Misurato il 05/10/2026: un refresh token ben formato ma **falso** (firma
 * sbagliata) dà `AccessDenied`, scaduto o no. Un refresh token **scaduto davvero**
 * o **revocato** non si può provare senza aspettare 211 giorni o togliere la
 * sessione da Steam Guard, e quale `EResult` diano è ancora aperto: `Expired` e
 * `Revoked` sono qui perché l'enum e il README li danno per rifiuti, e si
 * correggono alla prima revoca vera.
 */
const REFUSED = new Set<number>([
  EResult.AccessDenied,
  EResult.Expired,
  EResult.Revoked,
  EResult.InvalidPassword,
]);

/** Epoch in millisecondi della scadenza di un JWT Steam. Il token non si verifica: lo ha emesso Steam. */
export function jwtExpiresAt(token: string): number {
  const payload = JSON.parse(
    Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
  ) as { exp?: number };
  return (payload.exp ?? 0) * 1000;
}

/**
 * Un access token nuovo dal refresh token, e un refresh token nuovo **se Steam
 * lo emette**.
 *
 * Con un token appena emesso Steam non ne emette uno nuovo (misurato): quando
 * comincia a farlo non lo sappiamo. Se lo emette, **il vecchio muore subito**, e
 * il chiamante deve riscrivere il credenziale prima di fare altro — `storeAccessToken`
 * lo fa. Il refresh token che rende questa funzione è quello da tenere, sia che
 * sia nuovo sia che sia lo stesso.
 */
export async function refreshSteamTokens(
  refreshToken: string,
): Promise<SteamCredentials> {
  const session = new LoginSession(EAuthTokenPlatformType.MobileApp);

  try {
    // Il setter controlla che sia un refresh token, della piattaforma giusta: un
    // credenziale che non lo è non si recupera, e non è colpa della rete.
    session.refreshToken = refreshToken;
  } catch (error) {
    throw new SteamAuthError(
      `Il credenziale Steam salvato non è un refresh token valido: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  try {
    await session.renewRefreshToken();
  } catch (error) {
    const eresult = (error as { eresult?: number }).eresult;
    if (eresult !== undefined && REFUSED.has(eresult)) {
      throw new SteamAuthError(
        `Steam ha rifiutato il credenziale (${EResult[eresult] ?? eresult})`,
      );
    }
    throw error;
  }

  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: jwtExpiresAt(session.accessToken),
    refreshExpiresAt: jwtExpiresAt(session.refreshToken),
  };
}

// --- Il login col QR ---
//
// L'utente apre l'app Steam sul telefono (Steam Guard → «Accedi con un codice
// QR»), inquadra il QR e conferma. Il server tiene aperta la sessione mentre
// aspetta: è per questo che il login non è una mutazione che prende un valore
// incollato, come negli altri negozi, ma una sessione con un inizio e una fine.
//
// Per il mobile: `qrUrl` è un indirizzo `https://s.team/q/…` che l'app Steam
// sullo stesso telefono potrà aprire senza scansionarlo. Non provato.

/** Il QR non è stato confermato nel tempo concesso. */
export class SteamQrTimeoutError extends Error {
  constructor() {
    super('Il QR Steam non è stato confermato in tempo');
    this.name = 'SteamQrTimeoutError';
  }
}

/** Chi ha fatto il login, e il credenziale con cui rinnovarlo. */
export type SteamLogin = {
  /** Lo SteamID64: l'identità, la stessa che il profilo risolve. */
  steamId: string;
  credentials: SteamCredentials;
};

export type SteamQrSession = {
  /** L'indirizzo da codificare in un QR. */
  qrUrl: string;
  /**
   * Si risolve quando l'utente conferma nell'app, e si rifiuta se il tempo scade
   * (`SteamQrTimeoutError`) o se Steam o l'utente rifiutano. Va **sempre**
   * gestita: una sessione abbandonata la rifiuta da sola, e senza un gestore
   * sarebbe un errore non catturato.
   */
  result: Promise<SteamLogin>;
  /** Abbandona l'attesa. Dopo questo `result` non si risolve né si rifiuta. */
  cancel: () => void;
};

/** Cinque minuti: il tempo di prendere il telefono. */
const QR_TIMEOUT_MS = 300_000;

/**
 * Apre una sessione di login col QR.
 *
 * `onScanned` scatta quando l'utente ha inquadrato il QR ma non ha ancora
 * confermato: è ciò che permette alla schermata di dire «conferma nell'app».
 */
export async function beginSteamQrLogin(
  onScanned: () => void,
  timeoutMs = QR_TIMEOUT_MS,
): Promise<SteamQrSession> {
  const session = new LoginSession(EAuthTokenPlatformType.MobileApp);
  session.loginTimeout = timeoutMs;

  const result = new Promise<SteamLogin>((resolve, reject) => {
    session.on('remoteInteraction', onScanned);
    session.on('timeout', () => reject(new SteamQrTimeoutError()));
    session.on('error', reject);
    session.on('authenticated', () => {
      // L'access token non arriva con l'autenticazione: si chiede dal refresh
      // token, che è quello che si tiene.
      session
        .refreshAccessToken()
        .then(() =>
          resolve({
            steamId: session.steamID.getSteamID64(),
            credentials: {
              accessToken: session.accessToken,
              refreshToken: session.refreshToken,
              expiresAt: jwtExpiresAt(session.accessToken),
              refreshExpiresAt: jwtExpiresAt(session.refreshToken),
            },
          }),
        )
        .catch(reject);
    });
  });

  const started = await session.startWithQR();
  if (!started.qrChallengeUrl) {
    throw new Error('Steam non ha restituito il QR');
  }

  return {
    qrUrl: started.qrChallengeUrl,
    result,
    cancel: () => session.cancelLoginAttempt(),
  };
}

// --- Il token web incollato ---
//
// L'altro modo di avere la famiglia, senza che il server apra una sessione su
// Steam. L'utente è già dentro Steam nel suo browser: la pagina
// `store.steampowered.com/pointssummary/ajaxgetasyncconfig` gli rende un
// `webapi_token`, che per `GetOwnedGames` e per la famiglia vale come l'access
// token del QR (stessa audience, stessa durata: 24 ore, misurato il 05/10/2026).
// Lo incolla qui, come si fa per GOG o Nintendo.
//
// Il prezzo: **non si rinnova**. Non c'è un refresh token e il server non ne
// chiede uno, quindi non crea nessun dispositivo su Steam — è il motivo per cui
// esiste, dopo i due blocchi dell'account (docs/negozi.md). Scaduto, la famiglia
// aspetta un token nuovo; il profilo continua con la chiave.

/** Il credenziale del token web: un access token con la sua scadenza, e basta. */
export type SteamWebCredentials = {
  accessToken: string;
  /** Epoch in millisecondi. */
  expiresAt: number;
};

/**
 * Il credenziale di un account Steam: del QR (col refresh token) o del token web
 * (senza). Si distinguono dal refresh token, che sul secondo non c'è.
 */
export type SteamStoredCredentials = SteamCredentials | SteamWebCredentials;

export const hasRefreshToken = (
  credentials: SteamStoredCredentials,
): credentials is SteamCredentials =>
  'refreshToken' in credentials && typeof credentials.refreshToken === 'string';

export type SteamWebTokenReason =
  /** Non è un token: né il JSON della pagina né una stringa JWT. */
  | 'format'
  /** È un token di Steam ma non quello giusto: un refresh token, o senza account. */
  | 'wrong_kind'
  /** Scaduto: dura 24 ore. */
  | 'expired';

export class SteamWebTokenError extends Error {
  constructor(readonly reason: SteamWebTokenReason) {
    super(
      {
        format: 'Non trovo il token: incolla il testo intero della pagina',
        wrong_kind: 'Questo non è un token web di Steam',
        expired:
          'Il token è scaduto: la pagina ne dà uno nuovo a ogni apertura',
      }[reason],
    );
    this.name = 'SteamWebTokenError';
  }
}

/**
 * Il token web dentro ciò che l'utente ha incollato, e di chi è.
 *
 * Accetta le tre forme che uno ha davvero sotto mano: il JSON intero della pagina
 * (`{"data":{"webapi_token":"…"}}`), il solo valore, con o senza virgolette. Il
 * token **non si verifica**: lo ha emesso Steam e la firma non è nostra da
 * controllare — se è falso, la prima chiamata risponde 401. Di lui si legge solo
 * ciò che serve a collegare l'account, senza una richiesta: lo SteamID64 (`sub`)
 * e la scadenza (`exp`).
 */
export function parseSteamWebToken(
  input: string,
  now = Date.now(),
): { steamId: string; credentials: SteamWebCredentials } {
  const token = extractToken(input.trim());

  let claims: { sub?: unknown; exp?: unknown; aud?: unknown };
  try {
    claims = JSON.parse(
      Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'),
    );
  } catch {
    throw new SteamWebTokenError('format');
  }
  if (token.split('.').length !== 3 || typeof claims !== 'object' || !claims) {
    throw new SteamWebTokenError('format');
  }

  const audience = Array.isArray(claims.aud) ? claims.aud : [];
  // Un refresh token ha `renew` fra le audience: è un'altra cosa, vale mesi e
  // rinnova da solo. Qui non lo si vuole, perché è proprio ciò che il token web
  // evita di chiedere.
  if (
    typeof claims.sub !== 'string' ||
    !/^\d{17}$/.test(claims.sub) ||
    audience.includes('renew')
  ) {
    throw new SteamWebTokenError('wrong_kind');
  }

  const expiresAt = typeof claims.exp === 'number' ? claims.exp * 1000 : 0;
  if (expiresAt <= now) throw new SteamWebTokenError('expired');

  return {
    steamId: claims.sub,
    credentials: { accessToken: token, expiresAt },
  };
}

/** Il valore del token da ciò che è stato incollato: JSON della pagina o stringa nuda. */
function extractToken(text: string): string {
  if (text.startsWith('{')) {
    try {
      const json = JSON.parse(text) as {
        webapi_token?: unknown;
        data?: { webapi_token?: unknown };
      };
      const found = json.data?.webapi_token ?? json.webapi_token;
      if (typeof found === 'string') return found.trim();
    } catch {
      // Cade sotto: non è un JSON, e il controllo del formato lo dirà.
    }
    throw new SteamWebTokenError('format');
  }
  return text.replace(/^["']|["']$/g, '');
}
