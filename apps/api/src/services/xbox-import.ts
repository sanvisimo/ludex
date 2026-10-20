import type { XboxPlatform } from '@repo/contracts/vocabulary';

import {
  fetchXboxCatalog,
  fetchXboxCollections,
  fetchXboxMinutes,
  fetchXboxTitleHistory,
  findXboxBackcompatOwned,
  openXboxSession,
  XboxAccountError,
  XboxAuthError,
  type XboxOwnedProduct,
  type XboxPlayedTitle,
  type XboxProduct,
} from '../external/xbox';
import {
  type ImportReport,
  importLibrary,
  type LibraryEntry,
} from './library-import';
import {
  requireReauth,
  type StoreAccountRow,
  type XboxSettings,
  xboxCredentials,
} from './store-accounts';

/**
 * Import della libreria Xbox (9e). Le regole e le misure sono in
 * plans/9e-xbox.md; in breve:
 *
 * - **posseduto** è ciò che sta in Collections: comprato, o Games with Gold
 *   (`games_with_gold`, giocabile solo con l'abbonamento). Più gli **Xbox 360**
 *   comprati, che Collections non elenca e si trovano da ordini e storico;
 * - **tutto il resto giocato è Game Pass** (`game_pass`), anche ciò che è uscito
 *   dal catalogo. Tranne i titoli solo `Win32`: sono giochi di altri negozi che
 *   l'app Xbox per PC ha visto, e non entrano. Il catalogo del Game Pass non
 *   entra mai: solo ciò che si è giocato;
 * - **una copia per ogni piattaforma spuntata su cui il gioco gira**. Le
 *   piattaforme le sceglie l'utente al collegamento, perché Collections e lo
 *   storico non dicono su che console si gioca e il catalogo dice «One e
 *   Series» per quasi tutto;
 * - le **ore** sono per titolo e non per dispositivo: vanno su una copia sola,
 *   la console più recente fra quelle del gioco;
 * - **«Ho il Game Pass attivo»** decide lo stato alla nascita dei giochi del
 *   Game Pass: senza, nascono `played`.
 *
 * L'id esterno è il `productId` in maiuscolo, l'uid della sorgente IGDB 11 (75%
 * agganciati per id nel probe; il resto per nome).
 */

/** Su cosa gira un gioco Xbox One (Gen8): la One, e la Series che lo emula. */
const GEN8: XboxPlatform[] = ['xbox_one', 'xbox_series'];
/** Un 360 retrocompatibile gira sul 360 e sulle due console dopo. */
const X360: XboxPlatform[] = ['xbox360', 'xbox_one', 'xbox_series'];

/** Dalla più recente: le ore vanno sulla prima che il gioco ha. */
const RECENTI: XboxPlatform[] = [
  'xbox_series',
  'xbox_one',
  'xbox360',
  'xbox',
  'pc_windows',
];

/** Su cosa gira un prodotto del catalogo. */
function platformsOfProduct(product: XboxProduct): Set<XboxPlatform> {
  const out = new Set<XboxPlatform>();
  if (product.pc) out.add('pc_windows');
  if (product.gen8) for (const p of GEN8) out.add(p);
  if (product.gen9) out.add('xbox_series');
  return out;
}

/**
 * Su cosa gira un titolo dello storico, dai suoi `devices` (che sono le
 * piattaforme del titolo, non quelle su cui l'utente l'ha avviato: un 360
 * retrocompatibile dice `Xbox360+XboxOne+XboxSeries`). `Win32` non conta: è un
 * gioco di un altro negozio.
 */
function platformsOfTitle(title: XboxPlayedTitle): Set<XboxPlatform> {
  const out = new Set<XboxPlatform>();
  for (const device of title.devices) {
    if (device === 'PC') out.add('pc_windows');
    if (device === 'XboxOne') for (const p of GEN8) out.add(p);
    if (device === 'XboxSeries') out.add('xbox_series');
    if (device === 'Xbox360') out.add('xbox360');
  }
  return out;
}

export type XboxSources = {
  owned: XboxOwnedProduct[];
  catalog: Map<string, XboxProduct>;
  /** productId → titolo: i 360 comprati, fuori da Collections. */
  backcompat: Map<string, string>;
  history: XboxPlayedTitle[];
  /** titleId → minuti. */
  minutes: Map<string, number>;
};

/**
 * Dalle fonti alle voci di libreria. Funzione pura: qui si decide cosa diventa
 * una copia, e provarlo non deve voler dire parlare con Microsoft.
 */
export function buildXboxEntries(
  sources: XboxSources,
  settings: XboxSettings,
): {
  entries: LibraryEntry[];
  conteggi: {
    posseduti: number;
    gold: number;
    x360: number;
    gamePass: number;
    altriNegozi: number;
    senzaProdotto: number;
    senzaCatalogo: number;
    demo: number;
    fuoriDallePiattaforme: number;
  };
} {
  const spuntate = new Set(settings.platforms);
  const conteggi = {
    posseduti: 0,
    gold: 0,
    x360: 0,
    gamePass: 0,
    altriNegozi: 0,
    senzaProdotto: 0,
    senzaCatalogo: 0,
    demo: 0,
    fuoriDallePiattaforme: 0,
  };

  // Le ore e l'ultima partita stanno sul titolo dello storico: da productId a
  // titolo, per darle anche ai posseduti.
  const titoloDi = new Map<string, XboxPlayedTitle>();
  for (const title of sources.history) {
    for (const pid of title.productIds) {
      if (!titoloDi.has(pid)) titoloDi.set(pid, title);
    }
  }

  const entries: LibraryEntry[] = [];
  const coperti = new Set<string>();

  /** Le copie di un prodotto, le ore sulla più recente. */
  const copie = (
    productId: string,
    name: string,
    runs: Set<XboxPlatform>,
    title: XboxPlayedTitle | undefined,
    extra: Partial<LibraryEntry>,
  ) => {
    const dove = RECENTI.filter((p) => runs.has(p) && spuntate.has(p));
    if (dove.length === 0) {
      conteggi.fuoriDallePiattaforme += 1;
      return false;
    }
    dove.forEach((platformSlug, i) => {
      entries.push({
        externalId: productId,
        name,
        platformSlug,
        storePage: productId,
        ...(i === 0 && title
          ? {
              playtimeMinutes: sources.minutes.get(title.titleId) ?? null,
              lastPlayedAt: title.lastPlayedAt,
            }
          : {}),
        ...extra,
      });
    });
    return true;
  };

  for (const product of sources.owned) {
    coperti.add(product.productId);
    const scheda = sources.catalog.get(product.productId);
    const title = titoloDi.get(product.productId);
    // Senza scheda non si sa su cosa gira: si guarda lo storico, se c'è, e
    // altrimenti si salta. La piattaforma non si indovina.
    const runs = scheda
      ? platformsOfProduct(scheda)
      : title
        ? platformsOfTitle(title)
        : null;
    if (!runs || runs.size === 0) {
      conteggi.senzaCatalogo += 1;
      continue;
    }
    if (scheda?.demo) {
      conteggi.demo += 1;
      continue;
    }
    const gold = product.kind === 'gold';
    if (
      copie(
        product.productId,
        scheda?.title || title?.name || '',
        runs,
        title,
        {
          acquiredAt: product.acquiredAt,
          ...(gold ? { subscription: 'games_with_gold' as const } : {}),
        },
      )
    ) {
      if (gold) conteggi.gold += 1;
      else conteggi.posseduti += 1;
    }
  }

  for (const [productId, name] of sources.backcompat) {
    if (coperti.has(productId)) continue;
    coperti.add(productId);
    if (copie(productId, name, new Set(X360), titoloDi.get(productId), {})) {
      conteggi.x360 += 1;
    }
  }

  for (const title of sources.history) {
    if (title.productIds.some((pid) => coperti.has(pid))) continue;
    const runs = platformsOfTitle(title);
    if (runs.size === 0) {
      // Solo `Win32`: un gioco di Steam, GOG o altro, visto dall'app Xbox.
      conteggi.altriNegozi += 1;
      continue;
    }
    const productId = title.productIds[0];
    if (!productId) {
      conteggi.senzaProdotto += 1;
      continue;
    }
    for (const pid of title.productIds) coperti.add(pid);
    if (
      copie(productId, title.name, runs, title, {
        subscription: 'game_pass',
        ...(settings.gamePassActive ? {} : { status: 'played' as const }),
      })
    ) {
      conteggi.gamePass += 1;
    }
  }

  return { entries, conteggi };
}

const CONSOLE: XboxPlatform[] = ['xbox360', 'xbox_one', 'xbox_series'];

export async function importXboxLibrary(
  account: StoreAccountRow,
): Promise<ImportReport> {
  const credentials = await xboxCredentials(account);
  const settings: XboxSettings = {
    platforms: credentials.platforms,
    gamePassActive: credentials.gamePassActive,
  };

  let sources: XboxSources;
  try {
    const session = await openXboxSession(credentials.accessToken);
    const owned = await fetchXboxCollections(session);
    const history = await fetchXboxTitleHistory(session);
    const catalog = await fetchXboxCatalog(owned.map((p) => p.productId));
    // I 360 costano fino a una trentina di richieste: solo se una console che
    // li fa girare è spuntata.
    const backcompat = settings.platforms.some((p) => CONSOLE.includes(p))
      ? await findXboxBackcompatOwned(
          session,
          history,
          new Set(owned.map((p) => p.productId)),
        )
      : new Map<string, string>();
    // Le ore per ultime, e al meglio: è la richiesta meno provata, e senza si
    // perdono solo le ore.
    let minutes = new Map<string, number>();
    try {
      minutes = await fetchXboxMinutes(
        session,
        history
          .filter((t) => t.devices.some((d) => d !== 'Win32'))
          .map((t) => t.titleId),
      );
    } catch (error) {
      if (error instanceof XboxAuthError) throw error;
      console.log(
        `[import] xbox: ore non lette (${error instanceof Error ? error.message : error})`,
      );
    }
    sources = { owned, catalog, backcompat, history, minutes };
  } catch (error) {
    // Un token revocato a metà, o un account che Xbox non fa più entrare: in
    // tutti e due i casi lo sblocca solo un nuovo collegamento.
    if (error instanceof XboxAuthError || error instanceof XboxAccountError) {
      return requireReauth(account);
    }
    throw error;
  }

  const { entries, conteggi } = buildXboxEntries(sources, settings);
  console.log(
    `[import] xbox: ${conteggi.posseduti} posseduti, ${conteggi.gold} Games with Gold, ` +
      `${conteggi.x360} Xbox 360, ${conteggi.gamePass} Game Pass; ` +
      `saltati ${conteggi.altriNegozi} di altri negozi, ${conteggi.demo} demo, ` +
      `${conteggi.senzaCatalogo} senza piattaforma, ${conteggi.senzaProdotto} senza prodotto, ` +
      `${conteggi.fuoriDallePiattaforme} fuori dalle piattaforme spuntate`,
  );

  return importLibrary(account, entries);
}
