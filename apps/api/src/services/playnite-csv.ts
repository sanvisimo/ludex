import type { BacklogStatus, Store } from '@repo/contracts/vocabulary';
import { parse } from 'csv-parse/sync';

/**
 * Il file di Playnite (10), com'è fatto l'export di **Library Exporter
 * Advanced**: i campi li sceglie chi esporta, e le intestazioni sono nella
 * lingua dell'interfaccia di Playnite. Qui si legge per nome di colonna e si
 * ignora ciò che non serve; vedi `plans/10-import-csv.md`.
 */

/** `ubisoft` entra nel vocabolario al passo 3, con la migration. */
type FileStore = Store | 'ubisoft';

/** Le colonne che servono, per chiave nostra. */
const COLONNE = {
  name: ['Nome'],
  gameId: ['Id del gioco'],
  sources: ['Sorgenti'],
  platforms: ['Piattaforme'],
  releaseDate: ['Data di uscita'],
  links: ['Collegamenti'],
  playtime: ['Tempo di gioco'],
  lastPlayed: ["Giocato l'ultima volta"],
  completion: ['Stato di completamento'],
  categories: ['Categorie'],
} as const satisfies Record<string, readonly string[]>;

type Colonna = keyof typeof COLONNE;

/** Senza queste una riga non si sa né cos'è né da dove viene. */
const OBBLIGATORIE: Colonna[] = ['name', 'gameId', 'sources'];

/**
 * Il negozio da `Sorgenti`, col nome che gli dà Playnite. Una sorgente che non
 * è qui (itch.io, Humble, un gioco aggiunto a mano) non ha un negozio nostro:
 * la riga si salta e si conta.
 */
const STORE_BY_SOURCE: Record<string, FileStore> = {
  steam: 'steam',
  gog: 'gog',
  epic: 'epic',
  amazon: 'amazon',
  'ea app': 'ea',
  origin: 'ea',
  'ubisoft connect': 'ubisoft',
  uplay: 'ubisoft',
  'battle.net': 'battlenet',
  xbox: 'xbox',
  playstation: 'psn',
  nintendo: 'nintendo',
};

/**
 * Lo stato di Playnite, che entra **solo alla nascita** della riga di backlog.
 * Uno stato che non è qui — Playnite li lascia rinominare e aggiungere — vale
 * `backlog`.
 */
const STATUS_BY_COMPLETION: Record<string, BacklogStatus> = {
  new: 'backlog',
  'not played': 'backlog',
  'plan to play': 'backlog',
  'on hold': 'backlog',
  playing: 'playing',
  played: 'played',
  beaten: 'played',
  completed: 'completed',
  abandoned: 'dropped',
  "won't play": 'excluded',
};

export type PlayniteRow = {
  name: string;
  gameId: string;
  /** La sorgente com'è scritta nel file, anche quando non è un negozio nostro. */
  source: string;
  store: FileStore | null;
  /** I nomi di Playnite, che sono quelli della tabella `platforms`. */
  platforms: string[];
  releaseYear: number | null;
  steamAppId: string | null;
  playtimeMinutes: number | null;
  lastPlayedAt: Date | null;
  status: BacklogStatus;
  categories: string[];
};

export class PlayniteCsvError extends Error {
  constructor(
    readonly reason: 'not_csv' | 'missing_columns' | 'empty',
    readonly missing: string[] = [],
  ) {
    super(
      reason === 'missing_columns'
        ? `Mancano le colonne: ${missing.join(', ')}`
        : reason === 'empty'
          ? 'Il file non ha giochi'
          : 'Il file non è un CSV leggibile',
    );
    this.name = 'PlayniteCsvError';
  }
}

/** Le liste di Playnite: separate da virgola, coi vuoti tolti. */
const lista = (valore: string | undefined) =>
  (valore ?? '')
    .split(',')
    .map((voce) => voce.trim())
    .filter(Boolean);

/** `gg/mm/aaaa`, con l'ora o senza. */
function data(valore: string | undefined): Date | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})(?: (\d{2}):(\d{2}):(\d{2}))?/.exec(
    valore?.trim() ?? '',
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

export function parsePlayniteCsv(testo: string): PlayniteRow[] {
  let records: string[][];
  try {
    records = parse(testo, {
      bom: true,
      relax_column_count: true,
      skip_empty_lines: true,
    }) as string[][];
  } catch {
    throw new PlayniteCsvError('not_csv');
  }

  const [intestazione, ...righe] = records;
  if (!intestazione) throw new PlayniteCsvError('empty');

  const indice = Object.fromEntries(
    (Object.keys(COLONNE) as Colonna[]).map((chiave) => [
      chiave,
      intestazione.findIndex((nome) =>
        (COLONNE[chiave] as readonly string[]).includes(nome.trim()),
      ),
    ]),
  ) as Record<Colonna, number>;

  const mancanti = OBBLIGATORIE.filter((chiave) => indice[chiave] < 0);
  if (mancanti.length > 0) {
    throw new PlayniteCsvError(
      'missing_columns',
      mancanti.map((chiave) => COLONNE[chiave][0]),
    );
  }

  const campo = (riga: string[], chiave: Colonna) =>
    indice[chiave] < 0 ? undefined : riga[indice[chiave]];

  const rows = righe.flatMap((riga): PlayniteRow[] => {
    const name = campo(riga, 'name')?.trim();
    const gameId = campo(riga, 'gameId')?.trim();
    if (!name || !gameId) return [];

    const source = campo(riga, 'sources')?.trim() ?? '';
    const secondi = Number(campo(riga, 'playtime'));
    const completion = campo(riga, 'completion')?.trim().toLowerCase() ?? '';

    return [
      {
        name,
        gameId,
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

  if (rows.length === 0) throw new PlayniteCsvError('empty');
  return rows;
}
