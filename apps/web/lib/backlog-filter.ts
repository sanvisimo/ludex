import type {
  BacklogQueryInput,
  BacklogSort,
  BacklogStatus,
  GameType,
  SortDirection,
  Store,
} from '@repo/contracts';
import {
  backlogSortValues,
  backlogStatusValues,
  gameTypeValues,
  sortDirectionValues,
  storeValues,
} from '@repo/contracts';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useMemo } from 'react';

/**
 * Lo stato del filtro vive nell'**URL**, non in React.
 *
 * Non è una raffinatezza: senza salvataggi lato server, la query string è
 * l'unica cosa che fa sopravvivere un filtro a un refresh, lo rende
 * condivisibile con un copia-incolla e fa funzionare il tasto indietro. Il
 * giorno che i salvataggi arriveranno, un filtro salvato sarà semplicemente
 * questa stringa messa da parte.
 *
 * Lo legge e lo scrive il router: la rotta lo valida con `validateBacklogSearch`,
 * e da lì arriva già tipizzato.
 */

// Tutti gli stati tranne "non mi interessa". È l'unico default che restringe, e
// sta qui — nel client — e non nel contratto: il server non deve nascondere
// niente di sua iniziativa, mentre qui la scelta si vede spuntata nel pannello e
// si può togliere.
export const defaultStatus: BacklogStatus[] = backlogStatusValues.filter(
  (value) => value !== 'excluded',
);

/**
 * Un criterio: come si legge dall'URL e quanto vale quando nell'URL non c'è.
 *
 * `parse` è tollerante come lo era nuqs: un valore che non sa leggere lo
 * scarta e il criterio torna al default, invece di rompere la pagina per un
 * link scritto male.
 */
interface Field<T, F> {
  parse: (raw: unknown) => T | undefined;
  fallback: F;
}

function field<T, F>(
  parse: (raw: unknown) => T | undefined,
  fallback: F,
): Field<T, F> {
  return { parse, fallback };
}

const text = (raw: unknown) =>
  typeof raw === 'string'
    ? raw
    : typeof raw === 'number'
      ? String(raw)
      : undefined;

const integer = (raw: unknown) => {
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isInteger(value)
    ? value
    : undefined;
};

const decimal = (raw: unknown) => {
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
};

const flag = (raw: unknown) =>
  raw === true || raw === 'true'
    ? true
    : raw === false || raw === 'false'
      ? false
      : undefined;

const oneOf =
  <T extends string>(values: readonly T[]) =>
  (raw: unknown) =>
    (values as readonly unknown[]).includes(raw) ? (raw as T) : undefined;

/**
 * Le liste nell'URL sono separate da virgole, com'erano con nuqs: i link
 * salvati prima del passaggio continuano ad aprire lo stesso filtro. Un
 * elemento che non si legge si scarta, gli altri restano.
 */
const listOf =
  <T>(item: (raw: unknown) => T | undefined) =>
  (raw: unknown) => {
    const values = Array.isArray(raw)
      ? raw
      : typeof raw === 'string'
        ? raw.split(',')
        : raw === undefined
          ? []
          : [raw];
    const parsed = values
      .map(item)
      .filter((value): value is T => value !== undefined);
    return parsed.length > 0 ? parsed : undefined;
  };

const fields = {
  q: field(text, ''),
  status: field(listOf(oneOf(backlogStatusValues)), defaultStatus),
  platforms: field(listOf(text), [] as string[]),
  stores: field(listOf(oneOf(storeValues)), [] as Store[]),
  attributes: field(listOf(integer), [] as number[]),
  gameTypes: field(listOf(oneOf(gameTypeValues)), [] as GameType[]),
  tags: field(listOf(text), [] as string[]),
  // I range restano `null` quando non sono impostati: `0` sarebbe un filtro
  // ("durata minima zero"), e su `durationMin` sarebbe pure un filtro diverso da
  // "non filtrare", perché escluderebbe i giochi senza durata.
  durationMin: field(integer, null),
  durationMax: field(integer, null),
  ratingMin: field(decimal, null),
  ratingMax: field(decimal, null),
  criticMin: field(integer, null),
  releasedFrom: field(integer, null),
  releasedTo: field(integer, null),
  neverPlayed: field(flag, false),
  // La vista dei nascosti. **Non** sta fra i `criteri` qui sotto: è una vista,
  // non un filtro, quindi «azzera» non ti fa uscire dai nascosti e non conta fra
  // i filtri accesi.
  hidden: field(flag, false),
  sort: field(oneOf(backlogSortValues), 'addedAt' as BacklogSort),
  direction: field(oneOf(sortDirectionValues), 'desc' as SortDirection),
};

type Key = keyof typeof fields;
type Value<X> = X extends Field<infer T, infer F> ? T | F : never;

// Derivato dai criteri e non riscritto a mano: una seconda dichiarazione si
// scollerebbe dalla prima al primo criterio aggiunto.
export type BacklogFilterState = { [K in Key]: Value<(typeof fields)[K]> };

/** Ciò che sta nell'URL: solo i criteri diversi dal loro default. */
export type BacklogSearch = {
  [K in Key]?: Exclude<Value<(typeof fields)[K]>, null>;
};

const keys = Object.keys(fields) as Key[];

const sameValue = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Da stato a URL. Nell'URL compaiono soltanto i criteri che l'utente ha
 * davvero toccato: un default o un `null` si toglie, come faceva il
 * `clearOnDefault` di nuqs.
 */
function toSearch(state: Partial<Record<Key, unknown>>): BacklogSearch {
  const search: Record<string, unknown> = {};
  for (const key of keys) {
    const value = state[key];
    if (value === null || value === undefined) continue;
    if (sameValue(value, fields[key].fallback)) continue;
    search[key] = value;
  }
  return search as BacklogSearch;
}

/** Il `validateSearch` della rotta: legge l'URL e ci lascia solo ciò che vale. */
export function validateBacklogSearch(
  raw: Record<string, unknown>,
): BacklogSearch {
  return toSearch(
    Object.fromEntries(keys.map((key) => [key, fields[key].parse(raw[key])])),
  );
}

function fromSearch(search: BacklogSearch): BacklogFilterState {
  return Object.fromEntries(
    keys.map((key) => [key, search[key] ?? fields[key].fallback]),
  ) as BacklogFilterState;
}

const route = getRouteApi('/_private/backlog');

/** I criteri veri e propri: l'ordinamento non è un filtro e non si azzera con loro. */
const criteri = [
  'q',
  'status',
  'platforms',
  'stores',
  'gameTypes',
  'attributes',
  'tags',
  'durationMin',
  'durationMax',
  'ratingMin',
  'ratingMax',
  'criticMin',
  'releasedFrom',
  'releasedTo',
  'neverPlayed',
] as const satisfies readonly Key[];

/**
 * Da stato dell'URL a input del contratto.
 *
 * Tutta la funzione è una traduzione fra due modi di dire "non filtrare": nella
 * UI un criterio spento è una stringa vuota, una lista vuota o un `null`, nel
 * contratto è un campo **assente**. Mandare `q: ''` o `platforms: []` al server
 * significherebbe chiedergli di filtrare per niente, e lo schema li rifiuterebbe.
 */
export function toQueryInput(
  filter: BacklogFilterState,
  limit: number,
): BacklogQueryInput {
  const vuoto = <T>(value: T[]) => (value.length > 0 ? value : undefined);

  return {
    q: filter.q.trim() || undefined,
    // Tutti gli stati spuntati equivale a non filtrare: si evita al server un
    // `IN` con dentro l'intero enum.
    status:
      filter.status.length === backlogStatusValues.length
        ? undefined
        : vuoto(filter.status),
    platforms: vuoto(filter.platforms),
    stores: vuoto(filter.stores),
    gameTypes: vuoto(filter.gameTypes),
    attributes: vuoto(filter.attributes),
    tags: vuoto(filter.tags),
    durationMin: filter.durationMin ?? undefined,
    durationMax: filter.durationMax ?? undefined,
    ratingMin: filter.ratingMin ?? undefined,
    ratingMax: filter.ratingMax ?? undefined,
    criticMin: filter.criticMin ?? undefined,
    releasedFrom: filter.releasedFrom ?? undefined,
    releasedTo: filter.releasedTo ?? undefined,
    neverPlayed: filter.neverPlayed || undefined,
    hidden: filter.hidden || undefined,
    sort: filter.sort,
    direction: filter.direction,
    limit,
    offset: 0,
  };
}

export function useBacklogFilter() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const filter = useMemo(() => fromSearch(search), [search]);

  // `null` toglie il criterio e lo riporta al suo default, compreso lo stato
  // con `excluded` di nuovo nascosto. `replace` come faceva nuqs: cambiare un
  // filtro non lascia una pagina nella cronologia a ogni spunta.
  const setFilter = useCallback(
    (patch: { [K in Key]?: BacklogFilterState[K] | null }) =>
      navigate({
        search: (prev) => toSearch({ ...fromSearch(prev), ...patch }),
        replace: true,
      }),
    [navigate],
  );

  const reset = useCallback(
    () =>
      setFilter(
        Object.fromEntries(criteri.map((chiave) => [chiave, null])) as Record<
          (typeof criteri)[number],
          null
        >,
      ),
    [setFilter],
  );

  // Quanti criteri sono accesi: serve al bottone che li spegne, e a dire che una
  // lista vuota è vuota per via di un filtro e non perché il backlog è vuoto.
  const activeCount = useMemo(
    () =>
      criteri.filter((chiave) => {
        const value = filter[chiave];
        if (chiave === 'status') {
          // Il default nasconde già `excluded`: conta come filtro solo se
          // l'utente ha cambiato la selezione.
          const selezionati = filter.status;
          return (
            selezionati.length !== defaultStatus.length ||
            defaultStatus.some((stato) => !selezionati.includes(stato))
          );
        }
        if (Array.isArray(value)) return value.length > 0;
        if (typeof value === 'string') return value.trim().length > 0;
        if (typeof value === 'boolean') return value;
        return value !== null;
      }).length,
    [filter],
  );

  return { filter, setFilter, reset, activeCount };
}

/**
 * Aggiunge o toglie un valore da un criterio multiplo.
 *
 * Sta qui perché la usano quattro pannelli identici nella forma — piattaforme,
 * store, attributi, tag — e ognuno che se la riscrivesse sarebbe un'occasione di
 * scriverla storta.
 */
export function toggle<T>(values: T[], value: T): T[] | null {
  const next = values.includes(value)
    ? values.filter((item) => item !== value)
    : [...values, value];
  // `null` e non `[]`: toglie il parametro dall'URL invece di lasciarcelo
  // vuoto, e sullo stato rimette il default.
  return next.length > 0 ? next : null;
}
