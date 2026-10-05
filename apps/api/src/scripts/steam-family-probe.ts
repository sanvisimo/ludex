import '../env';

import { tmpdir } from 'node:os';
import { join } from 'node:path';

import QRCode from 'qrcode';
import { EAuthTokenPlatformType, LoginSession } from 'steam-session';

import { fetchSteamFamilyLibrary, fetchSteamLibrary } from '../external/steam';
import { refreshSteamTokens } from '../external/steam-auth';

// Misure per il 9f (Steam con login e Family). **Non scrive niente**: né sul DB
// né su disco, a parte il file col QR.
//
// **ATTENZIONE: fa un login vero sull'account di chi lo lancia**, come un
// dispositivo nuovo, e poi chiama le API con quel token. Il 05/10/2026 Steam ha
// bloccato temporaneamente l'account dell'utente («dispositivo inatteso»; non un
// ban) dopo le prove di questo lotto, con diversi accessi ravvicinati e dei
// token falsi per misurare gli errori. La causa non è accertata. **Non lanciarlo
// senza averlo concordato, e non ripetere i login «per sicurezza»**: uno basta.
// Vedi «Il blocco dell'account» in docs/negozi.md.
//
//   pnpm --filter api steam:family-probe [--qr=percorso.svg] [--private-check[=secondi]]
//
// Fa il login col QR dell'app Steam (la scansione la fa l'utente) e poi
// risponde alle domande che il piano non può chiudere a tavolino:
//
//  1. quanto durano access e refresh token, e il rinnovo funziona?
//  2. quale token accetta `IFamilyGroupsService`: quello ricavato dal refresh
//     token o il `webapi_token` che Playnite legge dalla pagina dello store?
//  3. com'è fatta la famiglia, e cosa torna da `GetSharedLibraryApps` con
//     `include_own` a false e a true: totali, `exclude_reason`, `app_type`,
//     copertura di `rt_time_acquired`;
//  4. `GetOwnedGames` col token funziona anche coi dettagli dei giochi privati?
//  4b. il **nostro** client (`refreshSteamTokens`, `fetchSteamFamilyLibrary`,
//     `fetchSteamLibrary` col token) rende gli stessi numeri delle misure
//     grezze.
//  5. cosa risponde `GetSharedLibraryApps` alla sola chiave applicativa?
//
// **Non manda mai token falsi o inventati a Steam.** Una versione di questo probe lo
// faceva, per misurare gli errori, con dentro lo SteamID di chi lo lanciava; il
// 05/10/2026 l'account dell'utente è stato bloccato da Steam e quella è l'ipotesi
// principale. Gli errori sono già misurati (docs/negozi.md, «I rifiuti») e la
// sezione è stata tolta.
//
// **Nessun token si stampa mai**, nemmeno in parte: solo audience e scadenze,
// lette dal payload del JWT. I token vivono in memoria e muoiono col processo.
//
// `--private-check` aspetta N secondi (120 di default) dopo le misure normali,
// perché tu metta su privato il profilo **e i dettagli dei giochi**, e rifà
// `GetOwnedGames` con la chiave e col token. La prova vale solo se la riga
// «profilo da anonimo» dice `private`. La chiave non è un controllo: se è
// dell'account interrogato vede anche i dati privati, e a profilo privato
// risponde pieno comunque.
// Senza il flag si può solo dire che il token funziona sul profilo com'è.

const flag = (name: string) =>
  process.argv.find(
    (arg) => arg === `--${name}` || arg.startsWith(`--${name}=`),
  );
const flagValue = (name: string) => flag(name)?.split('=')[1];

const qrPath = flagValue('qr') ?? join(tmpdir(), 'ludex-steam-qr.svg');
const privateCheck = flag('private-check');
const privateWaitSeconds = Number(flagValue('private-check') ?? 120);

const apiKey = process.env.STEAM_API_KEY;
if (!apiKey) {
  console.error('STEAM_API_KEY non impostata nel .env');
  process.exit(1);
}

const percento = (parte: number, tutto: number) =>
  tutto === 0 ? '—' : `${Math.round((100 * parte) / tutto)}%`;

const conteggio = <T>(rows: T[], chiave: (row: T) => string) => {
  const mappa = new Map<string, number>();
  for (const row of rows) {
    mappa.set(chiave(row), (mappa.get(chiave(row)) ?? 0) + 1);
  }
  return [...mappa].sort((a, b) => b[1] - a[1]);
};

const comeTesto = (coppie: [string, number][]) =>
  coppie.map(([valore, n]) => `${valore} ${n}`).join(', ') || '—';

const giorni = (secondi: number) => Math.round(secondi / 86_400);
const data = (epochSecondi: number) =>
  new Date(epochSecondi * 1000).toISOString().slice(0, 10);

// --- JWT: solo il payload, mai il token ---

type JwtPayload = { aud?: string[]; iat?: number; exp?: number; sub?: string };

const decodeJwt = (token: string): JwtPayload =>
  JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8'));

/** Audience, emissione e scadenza di un token, senza mostrarne nessun pezzo. */
const descrivi = (token: string) => {
  const { aud, iat, exp } = decodeJwt(token);
  const durata =
    iat && exp ? `${giorni(exp - iat)} giorni (${exp - iat}s)` : '?';
  return (
    `aud [${(aud ?? []).join(', ')}], emesso ${iat ? data(iat) : '?'}, ` +
    `scade ${exp ? data(exp) : '?'}, durata ${durata}`
  );
};

// --- chiamate: l'URL porta il token e non si stampa ---

type ApiResult = {
  status: number;
  eresult: string | null;
  body: unknown;
  text: string;
};

async function call(
  path: string,
  params: Record<string, string>,
): Promise<ApiResult> {
  const url = new URL(`https://api.steampowered.com/${path}/`);
  for (const [chiave, valore] of Object.entries(params)) {
    url.searchParams.set(chiave, valore);
  }
  const response = await fetch(url);
  const text = await response.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    // non JSON: resta il testo
  }
  return {
    status: response.status,
    eresult: response.headers.get('x-eresult'),
    body,
    text,
  };
}

/** Lo stato di una risposta in una riga, con l'errore troncato se non è 200. */
const esito = (result: ApiResult) =>
  result.status === 200
    ? '200'
    : `${result.status}${result.eresult ? ` (x-eresult ${result.eresult})` : ''} ${result.text.slice(0, 160).replace(/\s+/g, ' ')}`;

/** La forma di un oggetto: chiavi, e per gli array quanti elementi. */
const forma = (valore: unknown): string => {
  if (valore === null || typeof valore !== 'object') return String(valore);
  return Object.entries(valore as Record<string, unknown>)
    .map(([chiave, v]) => {
      if (Array.isArray(v)) return `${chiave}[${v.length}]`;
      if (v !== null && typeof v === 'object') return `${chiave}{…}`;
      return `${chiave}=${String(v).slice(0, 40)}`;
    })
    .join(', ');
};

const sezione = async (titolo: string, fn: () => Promise<void>) => {
  console.log(`\n${titolo}`);
  try {
    await fn();
  } catch (error) {
    console.log(
      `  ERRORE: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

// --- 1. login col QR ---

const session = new LoginSession(EAuthTokenPlatformType.MobileApp);
// Cinque minuti: il tempo di prendere il telefono.
session.loginTimeout = 300_000;

const authenticated = new Promise<void>((resolve, reject) => {
  session.on('authenticated', () => resolve());
  session.on('timeout', () => reject(new Error('QR non confermato in tempo')));
  session.on('error', reject);
});
session.on('remoteInteraction', () =>
  console.log("  QR scansionato: conferma nell'app Steam…"),
);

const started = await session.startWithQR();
const challenge = started.qrChallengeUrl;
if (!challenge) throw new Error('Steam non ha restituito il QR');

await QRCode.toFile(qrPath, challenge, { type: 'svg', margin: 2, width: 360 });
console.log(
  await QRCode.toString(challenge, { type: 'terminal', small: true }),
);
console.log(`QR anche in: ${qrPath}`);
console.log(
  "Scansionalo dall'app Steam: Steam Guard → «Accedi con un codice QR».",
);

await authenticated;

const steamId = session.steamID.getSteamID64();
console.log(`\nlogin riuscito: ${session.accountName}`);

// --- 2. token e scadenze ---

await sezione('token', async () => {
  console.log(`  refresh token:  ${descrivi(session.refreshToken)}`);
  await session.refreshAccessToken();
  console.log(`  access token:   ${descrivi(session.accessToken)}`);
});

const accessToken = session.accessToken;

// --- 3. profilo, e GetOwnedGames con la chiave e col token ---

type OwnedGames = {
  response?: {
    game_count?: number;
    games?: { appid: number; playtime_forever?: number }[];
  };
};

const ownedGames = async (conChiave: boolean) => {
  const result = await call('IPlayerService/GetOwnedGames/v1', {
    ...(conChiave ? { key: apiKey } : { access_token: accessToken }),
    steamid: steamId,
    include_appinfo: '1',
    include_played_free_games: '1',
  });
  const response = (result.body as OwnedGames | null)?.response;
  return { result, games: response?.games ?? [], count: response?.game_count };
};

/**
 * Lo stato del profilo come lo vede **chiunque**, senza chiave e senza login:
 * `public`, `friendsonly` o `private`, dal profilo XML della Community.
 *
 * Non si legge da `communityvisibilitystate` di `GetPlayerSummaries`, che segue
 * i «dettagli di base» e resta 3 anche con «Il mio profilo» su Privato. E non si
 * deduce dalla chiave: se è dell'account che si interroga, Steam le mostra i
 * dati privati come al proprietario, e `GetOwnedGames` risponde pieno a profilo
 * privato (misurato il 05/10/2026: anonimo `private`, chiave 453 giochi).
 *
 * Il limite: dice il profilo, non i «dettagli dei giochi», che sono una voce a
 * parte. Una pagina della Community che li distingua non l'abbiamo trovata.
 */
const statoProfilo = async () => {
  const xml = await (
    await fetch(`https://steamcommunity.com/profiles/${steamId}/?xml=1`)
  ).text();
  return xml.match(/<privacyState>(.*?)<\/privacyState>/)?.[1] ?? '?';
};

const mieiGiochi = new Map<number, number>();

// I totali di `GetSharedLibraryApps` con `include_own=true`, letti a mano: il
// nostro client deve rendere gli stessi numeri.
const grezzo = { apps: 0, mie: 0, conMotivo: 0 };

await sezione('GetOwnedGames', async () => {
  const conChiave = await ownedGames(true);
  const conToken = await ownedGames(false);
  console.log(`  profilo da anonimo:    ${await statoProfilo()}`);
  console.log(
    `  con la chiave:         ${esito(conChiave.result)}, game_count ${conChiave.count ?? '(assente)'}, ${conChiave.games.length} giochi`,
  );
  console.log(
    `  col token:             ${esito(conToken.result)}, game_count ${conToken.count ?? '(assente)'}, ${conToken.games.length} giochi`,
  );

  const daChiave = new Set(conChiave.games.map((game) => game.appid));
  const soloToken = conToken.games.filter((game) => !daChiave.has(game.appid));
  console.log(
    `  solo col token:        ${soloToken.length}  (giochi che la chiave non vede)`,
  );

  // La base per «quelli che possiedo già»: preferisce la lista più ricca.
  const base =
    conToken.games.length >= conChiave.games.length ? conToken : conChiave;
  for (const game of base.games) {
    mieiGiochi.set(game.appid, game.playtime_forever ?? 0);
  }
});

// --- 4. la famiglia ---

let familyGroupId: string | null = null;
const nomeMembro = new Map<string, string>();

await sezione('famiglia', async () => {
  const gruppo = await call('IFamilyGroupsService/GetFamilyGroupForUser/v1', {
    access_token: accessToken,
    steamid: steamId,
  });
  console.log(`  GetFamilyGroupForUser: ${esito(gruppo)}`);
  const response = (
    gruppo.body as { response?: Record<string, unknown> } | null
  )?.response;
  console.log(`  forma:                 ${forma(response)}`);
  familyGroupId = (response?.family_groupid as string | undefined) ?? null;
  console.log(
    `  non è in nessun gruppo: ${String(response?.is_not_member_of_any_group)}`,
  );
  if (!familyGroupId) return;

  // I membri stanno su un'altra operazione. Si prova e si dice com'è andata: se
  // non risponde, il numero dei membri si ricava dai proprietari delle app.
  const dettaglio = await call('IFamilyGroupsService/GetFamilyGroup/v1', {
    access_token: accessToken,
    family_groupid: familyGroupId,
  });
  console.log(`  GetFamilyGroup:        ${esito(dettaglio)}`);
  const famiglia = (
    dettaglio.body as {
      response?: { members?: { steamid?: string; role?: number }[] };
    } | null
  )?.response;
  console.log(`  forma:                 ${forma(famiglia)}`);
  const membri = famiglia?.members ?? [];
  console.log(`  membri:                ${membri.length}`);
  membri.forEach((membro, indice) => {
    if (membro.steamid) {
      nomeMembro.set(
        membro.steamid,
        membro.steamid === steamId ? 'tu' : `membro ${indice + 1}`,
      );
    }
  });
});

// --- 5. GetSharedLibraryApps ---

type SharedApp = {
  appid: number;
  name?: string;
  owner_steamids?: string[];
  exclude_reason?: number;
  rt_time_acquired?: number;
  rt_last_played?: number;
  rt_playtime?: number;
  app_type?: number;
};

const sharedLibrary = async (extra: Record<string, string>) => {
  const result = await call('IFamilyGroupsService/GetSharedLibraryApps/v1', {
    access_token: accessToken,
    steamid: steamId,
    family_groupid: familyGroupId ?? '',
    language: 'english',
    ...extra,
  });
  const response = (result.body as { response?: { apps?: SharedApp[] } } | null)
    ?.response;
  return { result, response, apps: response?.apps ?? [] };
};

function analizza(etichetta: string, apps: SharedApp[]) {
  const mia = (app: SharedApp) =>
    app.owner_steamids?.includes(steamId) ?? false;
  const mie = apps.filter(mia);
  const ancheMie = apps.filter((app) => mieiGiochi.has(app.appid));
  const conMotivo = apps.filter((app) => app.exclude_reason);
  const conData = apps.filter((app) => (app.rt_time_acquired ?? 0) > 0);
  const mieConData = mie.filter((app) => (app.rt_time_acquired ?? 0) > 0);
  const date = conData
    .map((app) => app.rt_time_acquired!)
    .sort((a, b) => a - b);

  console.log(`\n  ${etichetta}`);
  console.log(
    `    app:                   ${apps.length}  (distinte ${new Set(apps.map((a) => a.appid)).size})`,
  );
  console.log(
    `    con exclude_reason:    ${conMotivo.length}  (${comeTesto(conteggio(conMotivo, (app) => String(app.exclude_reason)))})`,
  );
  console.log(
    `    exclude_reason, tutti: ${comeTesto(conteggio(apps, (app) => String(app.exclude_reason ?? '(assente)')))}`,
  );
  console.log(
    `    app_type:              ${comeTesto(conteggio(apps, (app) => String(app.app_type ?? '(assente)')))}`,
  );
  console.log(
    `    di cui mie (owner):    ${mie.length}  | in GetOwnedGames: ${ancheMie.length}  | altrui e basta: ${apps.length - mie.length}`,
  );
  console.log(
    `    proprietari per app:   ${comeTesto(conteggio(apps, (app) => String(app.owner_steamids?.length ?? 0)))}`,
  );
  console.log(
    `    per proprietario:      ${comeTesto(
      conteggio(
        apps.flatMap((app) => app.owner_steamids ?? []),
        (id) => nomeMembro.get(id) ?? `…${id.slice(-4)}`,
      ),
    )}`,
  );
  console.log(
    `    rt_time_acquired > 0:  ${conData.length} su ${apps.length}  (${percento(conData.length, apps.length)})` +
      (date.length > 0 ? `, da ${data(date[0]!)} a ${data(date.at(-1)!)}` : ''),
  );
  if (mie.length > 0) {
    console.log(
      `    …sulle mie:            ${mieConData.length} su ${mie.length}  (${percento(mieConData.length, mie.length)})`,
    );
  }

  // rt_playtime sta in minuti, come playtime_forever? Lo si vede sulle app che
  // ho davvero giocato, confrontando i due.
  const confrontabili = ancheMie.filter(
    (app) => (app.rt_playtime ?? 0) > 0 || (mieiGiochi.get(app.appid) ?? 0) > 0,
  );
  const uguali = confrontabili.filter(
    (app) => app.rt_playtime === mieiGiochi.get(app.appid),
  );
  if (confrontabili.length > 0) {
    console.log(
      `    rt_playtime = playtime_forever: ${uguali.length} su ${confrontabili.length}`,
    );
  }

  console.log('    un campione:');
  for (const app of apps.slice(0, 5)) {
    console.log(
      `      ${String(app.appid).padEnd(8)} tipo ${String(app.app_type ?? '?').padEnd(3)} motivo ${String(app.exclude_reason ?? '-').padEnd(3)} ` +
        `acq ${(app.rt_time_acquired ? data(app.rt_time_acquired) : '—').padEnd(10)} ${app.name ?? '(senza nome)'}`,
    );
  }
}

await sezione('GetSharedLibraryApps', async () => {
  if (!familyGroupId) {
    console.log('  nessuna famiglia: niente da misurare');
    return;
  }

  // Tre giri. I primi due sono quelli del piano; il terzo apre anche i filtri
  // che Steam applica di suo (esclusi, gratuiti, non-giochi), per vedere cosa
  // viene tolto prima che lo si possa contare.
  const senzaMie = await sharedLibrary({ include_own: 'false' });
  console.log(`  include_own=false:     ${esito(senzaMie.result)}`);
  console.log(`  forma della risposta:  ${forma(senzaMie.response)}`);
  analizza('include_own=false', senzaMie.apps);

  const conMie = await sharedLibrary({ include_own: 'true' });
  grezzo.apps = conMie.apps.length;
  grezzo.mie = conMie.apps.filter((app) =>
    app.owner_steamids?.includes(steamId),
  ).length;
  grezzo.conMotivo = conMie.apps.filter((app) => app.exclude_reason).length;
  console.log(`\n  include_own=true:      ${esito(conMie.result)}`);
  analizza('include_own=true', conMie.apps);

  const tutto = await sharedLibrary({
    include_own: 'true',
    include_excluded: 'true',
    include_free: 'true',
    include_non_games: 'true',
  });
  console.log(`\n  + excluded/free/non_games: ${esito(tutto.result)}`);
  analizza(
    'include_own + include_excluded + include_free + include_non_games',
    tutto.apps,
  );

  // La regola «si saltano quelli che possiedo già» ha senso solo se questi due
  // numeri non sono già zero.
  const idSenzaMie = new Set(senzaMie.apps.map((app) => app.appid));
  console.log(
    `\n  con include_own=false, già in GetOwnedGames: ${[...idSenzaMie].filter((id) => mieiGiochi.has(id)).length} su ${idSenzaMie.size}`,
  );
});

// --- 6. la sola chiave applicativa ---

await sezione('GetSharedLibraryApps con la sola chiave', async () => {
  const result = await call('IFamilyGroupsService/GetSharedLibraryApps/v1', {
    key: apiKey,
    steamid: steamId,
    family_groupid: familyGroupId ?? '0',
  });
  console.log(`  risposta:              ${esito(result)}`);
});

// --- 7. la strada di Playnite: cookie web → webapi_token ---

await sezione('webapi_token dai cookie web', async () => {
  const cookies = await session.getWebCookies();
  console.log(
    `  cookie:                ${cookies.length}  (${cookies.map((c) => c.split('=')[0]).join(', ')})`,
  );
  const secure =
    cookies.find(
      (c) => c.startsWith('steamLoginSecure=') && /steampowered/.test(c),
    ) ?? cookies.find((c) => c.startsWith('steamLoginSecure='));
  if (!secure) {
    console.log('  nessun steamLoginSecure');
    return;
  }
  const cookieHeader = secure.split(';')[0]!;
  const login = decodeURIComponent(cookieHeader.split('=').slice(1).join('='));
  console.log(
    `  steamLoginSecure:      ${descrivi(login.split('||')[1] ?? '')}`,
  );

  const response = await fetch(
    'https://store.steampowered.com/pointssummary/ajaxgetasyncconfig',
    { headers: { cookie: cookieHeader } },
  );
  const body = (await response.json().catch(() => null)) as {
    success?: number;
    data?: { webapi_token?: string };
  } | null;
  console.log(
    `  ajaxgetasyncconfig:    ${response.status}, success ${body?.success}`,
  );
  const webapiToken = body?.data?.webapi_token;
  if (!webapiToken) {
    console.log('  nessun webapi_token nella risposta');
    return;
  }
  console.log(`  webapi_token:          ${descrivi(webapiToken)}`);

  if (familyGroupId) {
    const prova = await call('IFamilyGroupsService/GetSharedLibraryApps/v1', {
      access_token: webapiToken,
      steamid: steamId,
      family_groupid: familyGroupId,
      include_own: 'false',
    });
    const apps =
      (prova.body as { response?: { apps?: unknown[] } } | null)?.response
        ?.apps ?? [];
    console.log(
      `  famiglia col webapi_token: ${esito(prova)}, ${apps.length} app`,
    );
  }
});

// --- 7b. il NOSTRO client, col login vero ---
//
// Le sezioni sopra misurano Steam; questa misura **noi**: le funzioni che
// l'import userà, con il token vero. I numeri devono coincidere con quelli
// grezzi, e dove non coincidono il difetto è nel nostro codice.

const uguale = (a: unknown, b: unknown) => (a === b ? '✓' : `✗ (grezzo ${b})`);

await sezione('il nostro client', async () => {
  const credenziali = await refreshSteamTokens(session.refreshToken);
  console.log(
    `  refreshSteamTokens:    access ${descrivi(credenziali.accessToken)}`,
  );
  console.log(
    `                         refresh token ${credenziali.refreshToken === session.refreshToken ? 'lo stesso' : 'NUOVO (il vecchio è morto)'}, scade ${data(credenziali.refreshExpiresAt / 1000)}`,
  );
  console.log(
    `                         expiresAt coerente col JWT: ${uguale(credenziali.expiresAt, (decodeJwt(credenziali.accessToken).exp ?? 0) * 1000)}`,
  );

  const famiglia = await fetchSteamFamilyLibrary(
    credenziali.accessToken,
    steamId,
  );
  const mie = famiglia.apps.filter((app) =>
    app.ownerSteamIds.includes(steamId),
  );
  const soloFamiglia = famiglia.apps.filter(
    (app) => !app.ownerSteamIds.includes(steamId),
  );
  const conMotivo = famiglia.apps.filter((app) => app.excludeReason !== null);
  console.log(`  fetchSteamFamilyLibrary: in un gruppo ${famiglia.inGroup}`);
  console.log(
    `    app:                 ${famiglia.apps.length}  ${uguale(famiglia.apps.length, grezzo.apps)}`,
  );
  console.log(
    `    con te proprietario: ${mie.length}  ${uguale(mie.length, grezzo.mie)}`,
  );
  console.log(
    `    solo della famiglia: ${soloFamiglia.length}  (le copie che l'import scriverebbe come steam_family)`,
  );
  console.log(
    `    con exclude_reason:  ${conMotivo.length}  ${uguale(conMotivo.length, grezzo.conMotivo)}  (di cui solo famiglia: ${soloFamiglia.filter((app) => app.excludeReason !== null).length})`,
  );
  console.log(
    `    con acquiredAt:      ${famiglia.apps.filter((app) => app.acquiredAt).length} su ${famiglia.apps.length}`,
  );
  console.log(
    `    ultima partita nulla: ${famiglia.apps.filter((app) => !app.lastPlayedAt).length}, ore > 0: ${famiglia.apps.filter((app) => app.playtimeMinutes > 0).length}`,
  );
  console.log(
    `    appid distinti:      ${new Set(famiglia.apps.map((app) => app.externalId)).size}  ${uguale(new Set(famiglia.apps.map((app) => app.externalId)).size, famiglia.apps.length)}`,
  );

  // La libreria propria col token, a qualunque stato abbia il profilo.
  const propria = await fetchSteamLibrary(steamId, credenziali.accessToken);
  const propriaIds = new Set(propria.map((entry) => Number(entry.externalId)));
  const mancanti = [...mieiGiochi.keys()].filter((id) => !propriaIds.has(id));
  console.log(
    `  fetchSteamLibrary(token): ${propria.length}  ${uguale(propria.length, mieiGiochi.size)}, mancanti rispetto a GetOwnedGames: ${mancanti.length}`,
  );
});

// --- 8. il rinnovo ---
//
// Per ultimo: se Steam emette un refresh token nuovo, il vecchio muore, e da qui
// in poi la sessione tiene in mano il nuovo.

await sezione('rinnovo', async () => {
  const vecchio = session.refreshToken;
  const prima = decodeJwt(vecchio).exp ?? 0;
  const rinnovato = await session.renewRefreshToken();
  console.log(
    `  nuovo refresh token:   ${rinnovato ? 'emesso' : 'non emesso (resta il vecchio)'}`,
  );
  console.log(`  access token nuovo:    ${descrivi(session.accessToken)}`);
  if (!rinnovato) return;

  const dopo = decodeJwt(session.refreshToken).exp ?? 0;
  console.log(`  refresh token nuovo:   ${descrivi(session.refreshToken)}`);
  console.log(`  scadenza spostata di:  ${giorni(dopo - prima)} giorni`);

  // Il vecchio è davvero morto? È ciò che decide se serve il lock sulla riga.
  const prova = new LoginSession(EAuthTokenPlatformType.MobileApp);
  prova.refreshToken = vecchio;
  try {
    await prova.refreshAccessToken();
    console.log('  il vecchio refresh token funziona ancora');
  } catch (error) {
    console.log(
      `  il vecchio refresh token è invalidato: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
});

// --- 9. profilo privato, se richiesto ---

if (privateCheck) {
  console.log(
    `\nprofilo privato: hai ${privateWaitSeconds}s per mettere su «Privato» il profilo **e i dettagli dei giochi** (Steam → Profilo → Modifica → Impostazioni privacy)`,
  );
  await new Promise((resolve) =>
    setTimeout(resolve, privateWaitSeconds * 1000),
  );

  await sezione('GetOwnedGames a profilo privato', async () => {
    const conChiave = await ownedGames(true);
    const conToken = await ownedGames(false);
    const stato = await statoProfilo();
    console.log(`  profilo da anonimo:    ${stato}`);
    console.log(
      `  con la chiave:         ${esito(conChiave.result)}, game_count ${conChiave.count ?? '(assente)'}, ${conChiave.games.length} giochi`,
    );
    console.log(
      `  col token:             ${esito(conToken.result)}, game_count ${conToken.count ?? '(assente)'}, ${conToken.games.length} giochi`,
    );
    if (stato !== 'private') {
      console.log(
        '  ← un anonimo non vede il profilo privato: la prova non vale. Controlla le impostazioni e rilancia',
      );
    } else if (conChiave.count !== undefined) {
      console.log(
        '  ← la chiave vede i giochi anche a profilo privato: è la chiave di questo account, e il confronto chiave/token non dice niente sugli altri utenti',
      );
    }
    console.log("  ← ricorda di rimettere il profilo com'era");
  });
}

console.log(
  '\nricordati di togliere la sessione «app mobile» da Steam Guard → Gestisci i dispositivi.\n',
);

process.exit(0);
