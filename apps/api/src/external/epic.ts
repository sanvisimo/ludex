import { chunk } from '../lib/chunk';

// Client Epic Games Store. Come gli altri sta fuori da `services/`.
//
// Stesso modello di GOG per la credenziale — un refresh token dell'utente,
// cifrato in `store_accounts` — ma **l'identità dei giochi funziona in modo
// opposto**, e vale la pena scriverlo perché sembra il contrario:
//
// IGDB ha una sorgente Epic con diecimila righe, e gli uid hanno la stessa
// forma degli id che il launcher restituisce. Sono cose diverse. Su una
// libreria vera di 705 giochi:
//
//     catalogItemId → IGDB     0 / 788
//     namespace     → IGDB     0 / 705
//     productId     → IGDB     0 / 705
//
// Gli uid di IGDB sono gli **offer id del negozio** (`store.epicgames.com`),
// in due formati — `6470fe7e-87ec-4443-…` e `f301fd4611f240da…` — e le API del
// launcher non li espongono affatto. Civilization VI su Epic è
// `42ac1ee840304cb1807172a9b47dc8e3`; su IGDB è `f301fd4611f240da87cdc7baf1b67f44`.
//
// Quindi **Epic si risolve per nome**, come Amazon. Non aggiungere `epic` alle
// sorgenti IGDB: costerebbe una richiesta per non trovare mai niente.
//
// `client_id` e `client_secret` sono quelli del launcher, come per GOG. Non sono
// un segreto: stanno nel codice di legendary, che è ciò con cui Heroic parla a
// Epic, e non esiste un programma per sviluppatori terzi da cui averne di propri.

const CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a';
const CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';

const OAUTH_URL =
  'https://account-public-service-prod03.ol.epicgames.com/account/api/oauth/token';
const LIBRARY_URL =
  'https://library-service.live.use1a.on.epicgames.com/library/api/public/items';
const CATALOG_HOST = 'https://catalog-public-service-prod06.ol.epicgames.com';

// Il launcher si identifica così, e alcuni di questi endpoint rispondono male a
// uno User-Agent qualunque.
const USER_AGENT =
  'UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit';

/**
 * Dove mandare l'utente a fare il login.
 *
 * Composto da noi e non preso da `legendary.gl/epiclogin`, che è il servizio di
 * redirect di legendary: quello punta esattamente a questo indirizzo, e
 * dipendere dal dominio di un altro progetto per far entrare i nostri utenti
 * sarebbe fragile per niente.
 *
 * Al termine Epic mostra una **pagina JSON** con dentro `authorizationCode`.
 * Non è un redirect verso di noi e non può esserlo: come GOG e Amazon, la lista
 * dei redirect è legata al `client_id` del launcher.
 */
export function epicLoginUrl() {
  const redirect = new URL('https://www.epicgames.com/id/api/redirect');
  redirect.searchParams.set('clientId', CLIENT_ID);
  redirect.searchParams.set('responseType', 'code');

  const url = new URL('https://www.epicgames.com/id/login');
  url.searchParams.set('redirectUrl', redirect.toString());
  return url.toString();
}

/** Il credenziale è morto: solo un nuovo login lo rimette a posto. */
export class EpicAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EpicAuthError';
  }
}

export type EpicCredentials = {
  accessToken: string;
  refreshToken: string;
  /** Epoch in millisecondi. L'access token dura circa 36 ore. */
  expiresAt: number;
  /**
   * Quando muore il **refresh token**, come lo dichiara Epic. Zero se non lo
   * dichiara.
   *
   * Tenuto per misurarlo, non perché qualcosa lo legga già: da quanto dura
   * dipende se l'aggiornamento automatico settimanale basta a tenere vivo
   * l'account, come per PSN. Dentro il credenziale e non su una colonna per
   * la stessa ragione di PSN: `credentialsExpireAt` è dell'access token.
   */
  refreshExpiresAt: number;
  accountId: string;
  displayName: string | null;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_expires?: number;
  refresh_expires_at?: string;
  account_id?: string;
  displayName?: string;
  errorCode?: string;
  errorMessage?: string;
};

/** La scadenza del refresh token: la data se c'è, altrimenti la durata. */
function refreshExpiry(body: TokenResponse) {
  const at = body.refresh_expires_at
    ? Date.parse(body.refresh_expires_at)
    : NaN;
  if (Number.isFinite(at)) return at;
  return body.refresh_expires ? Date.now() + body.refresh_expires * 1000 : 0;
}

async function requestToken(
  params: Record<string, string>,
): Promise<EpicCredentials> {
  const response = await fetch(OAUTH_URL, {
    method: 'POST',
    headers: {
      // Basic con le credenziali del launcher: Epic non le accetta come campi
      // del corpo.
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': USER_AGENT,
    },
    // `token_type=eg1` chiede il token del launcher; senza, Epic ne rende uno
    // che la libreria non la vede.
    body: new URLSearchParams({ ...params, token_type: 'eg1' }),
  });

  const body = (await response
    .json()
    .catch(() => null)) as TokenResponse | null;

  // Epic segnala gli errori nel corpo con `errorCode`, e non sempre con uno
  // stato HTTP di errore: guardare solo `response.ok` lascerebbe passare un
  // rifiuto come se fosse un token. Verificato con un codice scaduto, che
  // risponde «authorization code not found» e non un 4xx.
  if (body?.errorCode) {
    throw new EpicAuthError(body.errorMessage ?? body.errorCode);
  }
  if (!response.ok) {
    throw new Error(`Epic oauth/token: ${response.status}`);
  }
  if (!body?.access_token || !body.refresh_token) {
    throw new Error('Epic oauth/token: risposta senza token');
  }

  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    // Un minuto di margine, come per gli altri: non si parte con un token che
    // scade a metà import.
    expiresAt: Date.now() + ((body.expires_in ?? 28_800) - 60) * 1000,
    refreshExpiresAt: refreshExpiry(body),
    accountId: body.account_id ?? '',
    displayName: body.displayName ?? null,
  };
}

/**
 * Da quello che l'utente incolla al codice di autorizzazione.
 *
 * Tre forme, e non è generosità: sono le tre cose che uno ha davvero sotto mano
 * davanti a quella pagina. Il JSON intero copiato di peso è la più probabile,
 * perché è letteralmente tutto ciò che si vede a schermo.
 */
export function parseEpicAuthCode(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { authorizationCode?: unknown };
      return typeof parsed.authorizationCode === 'string'
        ? parsed.authorizationCode
        : null;
    } catch {
      return null;
    }
  }

  // I codici Epic sono 32 caratteri esadecimali.
  const nudo = trimmed.replace(/^"|"$/g, '');
  return /^[0-9a-f]{32}$/i.test(nudo) ? nudo : null;
}

export function exchangeEpicCode(code: string) {
  return requestToken({ grant_type: 'authorization_code', code });
}

export function refreshEpicTokens(refreshToken: string) {
  return requestToken({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });
}

export type EpicLibraryEntry = {
  /**
   * Il `productId`, cioè il **prodotto** del negozio.
   *
   * Non il `catalogItemId`, che è la singola voce installabile: un gioco e i
   * suoi DLC hanno `catalogItemId` diversi e lo stesso `productId`, ed è quello
   * che li fa collassare in una riga sola. Su una libreria vera 836 voci
   * diventano 705 giochi.
   *
   * Nessuno dei due è l'uid di IGDB (vedi in cima), ma questo resta l'identità
   * giusta da scrivere in `external_ids`: al reimport è il nostro database a
   * riconoscerlo, e la ricerca per nome non si rispende.
   *
   * Le **voci in più** di un prodotto — Delores accanto a Thimbleweed Park —
   * hanno invece il loro `catalogItemId`: il `productId` è già della voce
   * principale. Vedi `sameProductAs`.
   */
  externalId: string;
  name: string;
  /**
   * Quando è entrato nella libreria: la più vecchia fra le `acquisitionDate`
   * dei record del prodotto, perché un DLC comprato dopo è un record in più
   * con la sua data.
   */
  acquiredAt: Date | null;
  /**
   * La copertina verticale (`DieselGameBoxTall`) dal catalogo, o in mancanza la
   * orizzontale. Il catalogo si chiama comunque per i titoli: l'immagine è
   * nella stessa risposta.
   */
  imageUrl: string | null;
  /**
   * Per una voce in più, il `productId` della voce principale del suo
   * prodotto; nullo per la principale. Vedi `LibraryEntry.sameProductAs`.
   */
  sameProductAs: string | null;
};

export type EpicLibraryRecord = {
  namespace?: string;
  catalogItemId?: string;
  appName?: string;
  productId?: string;
  sandboxName?: string;
  sandboxType?: string;
  /** ISO 8601. Misurato: c'è su tutti i record, 888 su 888. */
  acquisitionDate?: string;
};

type LibraryResponse = {
  records?: EpicLibraryRecord[];
  responseMetadata?: { nextCursor?: string };
};

type CatalogResponse = Record<
  string,
  {
    title?: string;
    categories?: { path?: string }[];
    keyImages?: { type?: string; url?: string }[];
    customAttributes?: Record<string, unknown>;
  }
>;

/** Titolo e copertina di un prodotto, come li dà il catalogo. */
export type CatalogEntry = {
  title: string;
  imageUrl: string | null;
  /**
   * Se il catalogo le dà un `PresenceId` (o `PresenceID`): la voce che il
   * launcher avvia e di cui mostra lo stato agli amici. Ce l'ha Tropico 5 e non
   * il suo Map Pack, che pure il catalogo chiama `games`. Serve solo a scegliere
   * il gioco del prodotto: vedi `pickEpicGames`.
   */
  presence: boolean;
};

/**
 * La copertina fra le `keyImages`: la verticale se c'è, altrimenti la
 * orizzontale. Gli URL di Epic portano **spazi veri** (`TheEscapists_PDP
 * Promo-…jpg`), e senza codificarli non si aprono.
 */
export function epicCoverUrl(
  keyImages: { type?: string; url?: string }[] | undefined,
): string | null {
  const url =
    keyImages?.find((image) => image.type === 'DieselGameBoxTall')?.url ??
    keyImages?.find((image) => image.type === 'DieselGameBox')?.url;
  return url ? url.replace(/ /g, '%20') : null;
}

/**
 * La libreria dell'utente, paginata a cursore.
 *
 * Quattro filtri. I primi tre vengono da legendary, il quarto da una libreria
 * vera — e i primi tre non bastavano:
 *
 * - **namespace `ue`**: sono gli asset dello Unreal Engine Marketplace. Su un
 *   account che ha mai toccato Unreal sono migliaia di voci che giochi non
 *   sono, e finirebbero tutte negli scarti da sistemare a mano.
 * - **`sandboxType` PRIVATE**: build interne e roba non pubblica.
 * - **senza `appName`**: voci incomplete che non si possono né riconoscere né
 *   lanciare.
 * Poi il raggruppamento per `productId`, che toglie di mezzo i DLC: «Kinglet» e
 * «KingletAztec» sono due voci, ma sono Civilization VI e un suo pacchetto, e
 * condividono prodotto. Quale delle voci sia il gioco lo dice il catalogo, non
 * l'ordine: vedi `pickEpicGames`.
 *
 * Infine **il catalogo, per tutte le voci**, che dà due cose:
 *
 * - **il titolo**. `sandboxName` sembra il titolo e non lo è: è il nome
 *   dell'ambiente, e coincide col titolo solo per caso. Su una libreria vera
 *   286 voci si chiamano `Live`, 38 «*qualcosa* Production», 24 «UE
 *   Marketplace» — e dietro ci sono *Insurmountable*, *Fallout 3 GOTY*,
 *   *Dishonored: Death of the Outsider*. Indovinare quali etichette siano
 *   generiche è una rincorsa che si perde: ogni forma riconosciuta ne scopre
 *   un'altra, e ogni buco o storpia il nome di un gioco o lo fa sparire.
 * - **la categoria**, che è l'unico modo onesto di dire cosa sia una voce. Si
 *   tiene ciò che il catalogo dichiara `games` e si buttano gli `addons`, gli
 *   asset dello Unreal Marketplace e il resto.
 *
 * Costa una richiesta per prodotto — su 705 giochi circa ottanta secondi — ed è
 * quello che fa legendary. È il prezzo per avere i titoli giusti, e senza si
 * perde un terzo della libreria.
 */
export async function fetchEpicLibrary(
  accessToken: string,
): Promise<EpicLibraryEntry[]> {
  const perProdotto = new Map<string, EpicLibraryRecord[]>();
  const acquisto = new Map<string, Date>();
  let cursor: string | undefined;

  do {
    const url = new URL(LIBRARY_URL);
    url.searchParams.set('includeMetadata', 'true');
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url, {
      headers: {
        Authorization: `bearer ${accessToken}`,
        'User-Agent': USER_AGENT,
      },
    });
    if (response.status === 401) {
      throw new EpicAuthError('Epic ha rifiutato il token di accesso');
    }
    if (!response.ok) {
      throw new Error(`Epic library/items: ${response.status}`);
    }

    const body = (await response.json()) as LibraryResponse;

    for (const record of body.records ?? []) {
      if (!record.productId || !record.appName) continue;
      if (record.namespace === 'ue') continue;
      if (record.sandboxType === 'PRIVATE') continue;

      const data = record.acquisitionDate
        ? new Date(record.acquisitionDate)
        : null;
      if (data && !Number.isNaN(data.getTime())) {
        const prima = acquisto.get(record.productId);
        if (!prima || data < prima) acquisto.set(record.productId, data);
      }

      // Tutte le voci del prodotto, non la prima: quale sia il gioco e quali i
      // DLC lo sa solo il catalogo.
      perProdotto.set(record.productId, [
        ...(perProdotto.get(record.productId) ?? []),
        record,
      ]);
    }

    cursor = body.responseMetadata?.nextCursor;
  } while (cursor);

  const titoli = await fetchCatalogTitles(
    accessToken,
    [...perProdotto.values()].flat(),
  );

  return pickEpicGames(perProdotto, titoli, acquisto);
}

/**
 * Per ogni prodotto, la voce che il catalogo dichiara gioco.
 *
 * **Non la prima che arriva**: Epic non garantisce l'ordine dei record, e un
 * prodotto con i DLC — Fallout: New Vegas Ultimate Edition ne ha sei — può
 * aprire con uno di loro. Tenere la prima voce voleva dire tenere il DLC,
 * scartarlo perché il catalogo lo chiama `addons`, e perdere il gioco senza
 * lasciarne traccia nemmeno negli scarti: su un'installazione c'era, sull'altra
 * no, con lo stesso account.
 *
 * E nemmeno la prima che il catalogo chiama gioco: su una libreria vera 23
 * prodotti su 717 ne hanno più d'una, perché il catalogo chiama `games` anche
 * beta, colonne sonore, sfondi, editor e DLC. Presa la prima, a un import da
 * zero TROY è entrato come «AMAZONS», e la ricerca per nome l'ha agganciato a
 * _Amazon_; Tropico 5 come «Map Pack», finito negli scarti. Quale sia il gioco
 * lo decide `mainCandidate`.
 *
 * **Le altre voci gioco del prodotto non si buttano**: Delores sta nel prodotto
 * di Thimbleweed Park, Telltale Batman Season 2 in quello della Season 1, e
 * nella libreria Epic hanno un posto loro. Escono come voci proprie, col loro
 * `catalogItemId` e `sameProductAs`, e l'import le mette negli scarti senza
 * cercarle per nome. Su quella libreria sono 37 voci in 23 prodotti, quasi
 * tutte beta, DLC ed extra: quali siano giochi lo decide l'utente.
 *
 * Un prodotto senza nessuna voce in `titoli` non si importa, per le ragioni
 * scritte su `fetchCatalogTitles`.
 */
export function pickEpicGames(
  perProdotto: Map<string, EpicLibraryRecord[]>,
  titoli: Map<string, CatalogEntry>,
  acquisto: Map<string, Date>,
): EpicLibraryEntry[] {
  const giochi: EpicLibraryEntry[] = [];

  for (const [productId, voci] of perProdotto) {
    const candidati = voci.flatMap((record) => {
      const entry = record.catalogItemId
        ? titoli.get(record.catalogItemId)
        : undefined;
      return entry ? [{ record, entry }] : [];
    });
    if (candidati.length === 0) continue;
    const principale = mainCandidate(candidati);

    giochi.push({
      externalId: productId,
      name: principale.entry.title,
      acquiredAt: acquisto.get(productId) ?? null,
      imageUrl: principale.entry.imageUrl,
      sameProductAs: null,
    });

    // Una voce per `catalogItemId`: la stessa voce acquisita due volte — la
    // regalano di nuovo, la si riscatta — è due record. Vale il più vecchio.
    const altre = new Map<string, Candidate>();
    for (const candidato of candidati) {
      const id = candidato.record.catalogItemId!;
      if (id === principale.record.catalogItemId) continue;
      const prima = altre.get(id);
      if (!prima || acquiredTime(candidato) < acquiredTime(prima)) {
        altre.set(id, candidato);
      }
    }
    for (const [id, altra] of altre) {
      const quando = acquiredTime(altra);
      giochi.push({
        externalId: id,
        name: altra.entry.title,
        acquiredAt: Number.isFinite(quando) ? new Date(quando) : null,
        imageUrl: altra.entry.imageUrl,
        sameProductAs: productId,
      });
    }
  }

  return giochi;
}

type Candidate = { record: EpicLibraryRecord; entry: CatalogEntry };

/** Quando la voce è entrata in libreria, in millisecondi; in fondo se manca. */
function acquiredTime(candidato: Candidate) {
  const data = Date.parse(candidato.record.acquisitionDate ?? '');
  return Number.isNaN(data) ? Infinity : data;
}

/**
 * Il gioco fra le voci `games` di un prodotto. Il catalogo non lo dice — una
 * colonna sonora ha le stesse categorie di Delores —, quindi lo si deduce, in
 * quest'ordine:
 *
 * 1. **la voce acquistata per prima**: il DLC si compra dopo il gioco
 *    (AMAZONS il 26/09/2020, TROY il 13/08/2020);
 * 2. a pari data, quella il cui **titolo è l'inizio degli altri**: «Chivalry 2»
 *    in «Chivalry 2 - Public Testing», «Football Manager 2024» in «… Resource
 *    archiver»;
 * 3. quella con il **`PresenceId`**: Tropico 5 contro Map Pack;
 * 4. il titolo più corto, poi il `catalogItemId`, perché la scelta non cambi da
 *    un import all'altro: l'id scritto in `external_ids` è il prodotto, e se la
 *    voce principale cambiasse il collegamento passerebbe a un altro gioco.
 *
 * Sui 23 prodotti di quella libreria li azzecca tutti. La data va confrontata
 * con l'ora: HITMAN 3 e il suo «HITMAN 1 GOTY Upgrade» sono dello stesso
 * giorno, e a guardare il solo giorno vinceva l'Upgrade.
 */
function mainCandidate(candidati: Candidate[]): Candidate {
  const compatto = (title: string) =>
    title.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  // Quanti altri titoli del prodotto cominciano con questo.
  const prefisso = (candidato: Candidate) => {
    const radice = compatto(candidato.entry.title);
    if (!radice) return 0;
    return candidati.filter(
      (altro) =>
        altro.record.catalogItemId !== candidato.record.catalogItemId &&
        compatto(altro.entry.title).startsWith(radice),
    ).length;
  };

  return [...candidati].sort(
    (a, b) =>
      acquiredTime(a) - acquiredTime(b) ||
      prefisso(b) - prefisso(a) ||
      Number(b.entry.presence) - Number(a.entry.presence) ||
      a.entry.title.length - b.entry.title.length ||
      (a.record.catalogItemId ?? '').localeCompare(
        b.record.catalogItemId ?? '',
      ),
  )[0]!;
}

/**
 * Titolo e copertina dal catalogo, per i soli `catalogItemId` che sono giochi.
 *
 * Chi non compare nella mappa **non va importato**: o il catalogo non l'ha
 * riconosciuto come gioco — DLC, asset Unreal, roba che gioco non è — o non ha
 * risposto affatto. I due casi si trattano uguale di proposito: senza un titolo
 * una voce non la si può né agganciare né mostrare negli scarti, e tenerla
 * vorrebbe dire una riga che dice solo «c'è qualcosa».
 *
 * Il catalogo si interroga **per namespace**, e su Epic quasi ogni prodotto ha
 * il suo: in pratica è una richiesta per gioco.
 */
async function fetchCatalogTitles(
  accessToken: string,
  records: EpicLibraryRecord[],
): Promise<Map<string, CatalogEntry>> {
  const titoli = new Map<string, CatalogEntry>();
  if (records.length === 0) return titoli;

  const perNamespace = new Map<string, string[]>();
  for (const record of records) {
    if (!record.namespace || !record.catalogItemId) continue;
    perNamespace.set(record.namespace, [
      ...(perNamespace.get(record.namespace) ?? []),
      record.catalogItemId,
    ]);
  }

  for (const [namespace, ids] of perNamespace) {
    for (const page of chunk(ids, 50)) {
      const url = new URL(
        `${CATALOG_HOST}/catalog/api/shared/namespace/${encodeURIComponent(namespace)}/bulk/items`,
      );
      for (const id of page) url.searchParams.append('id', id);
      // In inglese, e non nella lingua dell'utente, perché questi titoli vanno
      // confrontati con IGDB, che li tiene in inglese. Col locale italiano il
      // catalogo rende «Ogu e la Foresta Segreta» e «Il Detective del lato
      // Oscuro», che il matcher non aggancia a niente.
      url.searchParams.set('country', 'US');
      url.searchParams.set('locale', 'en');

      const response = await fetch(url, {
        headers: {
          Authorization: `bearer ${accessToken}`,
          'User-Agent': USER_AGENT,
        },
      });
      if (!response.ok) continue;

      const body = (await response.json()) as CatalogResponse;
      for (const [id, item] of Object.entries(body)) {
        // Solo ciò che il catalogo chiama gioco. Gli `addons` sono DLC con un
        // prodotto proprio, che la deduplica per `productId` non ha preso.
        const categorie = item.categories?.map((row) => row.path) ?? [];
        if (!categorie.includes('games')) continue;
        if (categorie.includes('addons')) continue;
        if (item.title) {
          titoli.set(id, {
            title: item.title.trim(),
            imageUrl: epicCoverUrl(item.keyImages),
            presence: Object.keys(item.customAttributes ?? {}).some(
              (key) => key.toLowerCase() === 'presenceid',
            ),
          });
        }
      }
    }
  }

  return titoli;
}
