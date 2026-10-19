import type { BacklogStatus, Store } from '@repo/contracts/vocabulary';
import { parse } from 'csv-parse/sync';

/**
 * Il file dell'import da CSV (10): una riga per gioco, colonne riconosciute
 * **per nome** e tutte le altre ignorate. I nomi sono quelli dell'export di
 * Playnite (l'estensione Library Exporter Advanced), in inglese e in italiano,
 * così il suo file si carica com'è; chi il file lo scrive a mano parte dal CSV
 * d'esempio, che usa i nomi inglesi. Vedi `plans/10-import-csv.md`.
 *
 * I nomi vengono dalla localizzazione di Playnite (`LocSource.xaml` e
 * `it_IT.xaml`): `Time Played` e non `Playtime`. Al singolare (`Source`,
 * `Platform`) per chi scrive il file a mano.
 */
const COLONNE = {
  name: ['Name', 'Nome'],
  sources: ['Sources', 'Source', 'Sorgenti', 'Sorgente'],
  gameId: ['Game Id', 'Id del gioco'],
  platforms: ['Platforms', 'Platform', 'Piattaforme', 'Piattaforma'],
  releaseDate: ['Release Date', 'Data di uscita'],
  links: ['Links', 'Collegamenti'],
  playtime: ['Time Played', 'Tempo di gioco'],
  lastPlayed: ['Last Played', "Giocato l'ultima volta"],
  completion: ['Completion Status', 'Stato di completamento'],
  categories: ['Categories', 'Categorie'],
} as const satisfies Record<string, readonly string[]>;

type Colonna = keyof typeof COLONNE;

/**
 * Senza queste una riga non si sa né cos'è né da dove viene. L'id no: chi
 * scrive il file a mano non sa l'id Ubisoft di un gioco, e senza la riga si
 * riconosce dal nome (vedi `csv-import.ts`).
 */
const OBBLIGATORIE: Colonna[] = ['name', 'sources'];

/**
 * Il negozio dalla sorgente: i nomi di Playnite (`EA app`, `Ubisoft Connect`,
 * `PlayStation`…), quelli di Ludex e qualche variante ovvia. Una sorgente che
 * non è qui (itch.io, Humble, un gioco aggiunto a mano in Playnite) non ha un
 * negozio nostro: la riga si salta e si conta.
 */
const STORE_BY_SOURCE: Record<string, Store> = {
  steam: 'steam',
  gog: 'gog',
  epic: 'epic',
  'epic games': 'epic',
  'epic games store': 'epic',
  amazon: 'amazon',
  'amazon games': 'amazon',
  'ea app': 'ea',
  ea: 'ea',
  origin: 'ea',
  'ubisoft connect': 'ubisoft',
  ubisoft: 'ubisoft',
  uplay: 'ubisoft',
  'battle.net': 'battlenet',
  battlenet: 'battlenet',
  xbox: 'xbox',
  playstation: 'psn',
  'playstation store': 'psn',
  psn: 'psn',
  nintendo: 'nintendo',
  'nintendo eshop': 'nintendo',
};

/**
 * Lo stato, che entra **solo alla nascita** della riga di backlog: i nomi di
 * Playnite e i nostri. Uno stato che non è qui — Playnite li lascia rinominare
 * e aggiungere — vale `backlog`.
 */
const STATUS_BY_COMPLETION: Record<string, BacklogStatus> = {
  new: 'backlog',
  'not played': 'backlog',
  'plan to play': 'backlog',
  'on hold': 'backlog',
  backlog: 'backlog',
  playing: 'playing',
  played: 'played',
  beaten: 'played',
  completed: 'completed',
  abandoned: 'dropped',
  dropped: 'dropped',
  "won't play": 'excluded',
  excluded: 'excluded',
};

export type CsvRow = {
  name: string;
  /** L'id del negozio, se il file lo porta. */
  gameId: string | null;
  /** La sorgente com'è scritta nel file, anche quando non è un negozio nostro. */
  source: string;
  store: Store | null;
  /** I nomi di Playnite, che sono quelli della tabella `platforms`. */
  platforms: string[];
  releaseYear: number | null;
  steamAppId: string | null;
  playtimeMinutes: number | null;
  lastPlayedAt: Date | null;
  status: BacklogStatus;
  categories: string[];
};

export type CsvFileErrorReason = 'not_csv' | 'missing_columns' | 'empty';

export class CsvFileError extends Error {
  constructor(
    readonly reason: CsvFileErrorReason,
    readonly missing: string[] = [],
  ) {
    super(
      reason === 'missing_columns'
        ? `Mancano le colonne: ${missing.join(', ')}`
        : reason === 'empty'
          ? 'Il file non ha giochi'
          : 'Il file non è un CSV leggibile',
    );
    this.name = 'CsvFileError';
  }
}

/** Le liste: separate da virgola, coi vuoti tolti. */
const lista = (valore: string | undefined) =>
  (valore ?? '')
    .split(',')
    .map((voce) => voce.trim())
    .filter(Boolean);

/**
 * `aaaa-mm-gg` (il CSV d'esempio) o `gg/mm/aaaa` (Playnite in italiano), con
 * l'ora o senza. L'ordine giorno/mese dell'export inglese di Playnite non è
 * misurato: si legge come quello italiano.
 */
function data(valore: string | undefined): Date | null {
  const testo = valore?.trim() ?? '';
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(testo);
  if (iso) {
    const [, aaaa, mm, gg] = iso;
    return new Date(Date.UTC(+aaaa!, +mm! - 1, +gg!));
  }
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/.exec(
    testo,
  );
  if (!m) return null;
  const [, gg, mm, aaaa, hh = '0', mi = '0', ss = '0'] = m;
  return new Date(Date.UTC(+aaaa!, +mm! - 1, +gg!, +hh, +mi, +ss));
}

/** L'appid Steam dai collegamenti, se ce n'è uno solo. */
function steamAppId(valore: string | undefined): string | null {
  const ids = new Set(
    [...(valore ?? '').matchAll(/store\.steampowered\.com\/app\/(\d+)/g)].map(
      (m) => m[1]!,
    ),
  );
  return ids.size === 1 ? [...ids][0]! : null;
}

export function parseCsvFile(testo: string): CsvRow[] {
  let records: string[][];
  try {
    records = parse(testo, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][];
  } catch {
    throw new CsvFileError('not_csv');
  }

  const [intestazione, ...righe] = records;
  if (!intestazione) throw new CsvFileError('empty');

  // Senza distinguere le maiuscole: chi scrive a mano «name» intende `Name`.
  const nomi = intestazione.map((nome) => nome.trim().toLowerCase());
  const indice = Object.fromEntries(
    (Object.keys(COLONNE) as Colonna[]).map((chiave) => [
      chiave,
      nomi.findIndex((nome) =>
        COLONNE[chiave].some((alias) => alias.toLowerCase() === nome),
      ),
    ]),
  ) as Record<Colonna, number>;

  const mancanti = OBBLIGATORIE.filter((chiave) => indice[chiave] < 0);
  if (mancanti.length > 0) {
    throw new CsvFileError(
      'missing_columns',
      mancanti.map((chiave) => COLONNE[chiave][0]),
    );
  }

  const campo = (riga: string[], chiave: Colonna) =>
    indice[chiave] < 0 ? undefined : riga[indice[chiave]];

  const rows = righe.flatMap((riga): CsvRow[] => {
    const name = campo(riga, 'name')?.trim();
    if (!name) return [];

    const source = campo(riga, 'sources')?.trim() ?? '';
    const secondi = Number(campo(riga, 'playtime'));
    const completion = campo(riga, 'completion')?.trim().toLowerCase() ?? '';

    return [
      {
        name,
        gameId: campo(riga, 'gameId')?.trim() || null,
        source,
        store: STORE_BY_SOURCE[source.toLowerCase()] ?? null,
        platforms: lista(campo(riga, 'platforms')),
        releaseYear: data(campo(riga, 'releaseDate'))?.getUTCFullYear() ?? null,
        steamAppId: steamAppId(campo(riga, 'links')),
        playtimeMinutes:
          Number.isFinite(secondi) && secondi > 0
            ? Math.round(secondi / 60)
            : null,
        lastPlayedAt: data(campo(riga, 'lastPlayed')),
        status: STATUS_BY_COMPLETION[completion] ?? 'backlog',
        categories: lista(campo(riga, 'categories')),
      },
    ];
  });

  if (rows.length === 0) throw new CsvFileError('empty');
  return rows;
}
