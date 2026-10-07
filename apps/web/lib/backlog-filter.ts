import type {
  BacklogQueryInput,
  BacklogSort,
  BacklogStatus,
  GameType,
  PlaylistQuery,
  SortDirection,
  WishlistSort,
  Store,
  Subscription,
} from '@repo/contracts';
import {
  backlogSortValues,
  backlogStatusValues,
  gameTypeValues,
  PlaylistQuerySchema,
  sortDirectionValues,
  storeValues,
  subscriptionValues,
  wishlistSortValues,
} from '@repo/contracts';
import { getRouteApi, useRouter } from '@tanstack/react-router';

export const backlogViewValues = ['grid', 'rows', 'compact'] as const;
export type BacklogView = (typeof backlogViewValues)[number];

import { useCallback, useMemo } from 'react';

import { defaultPageSize, maxPageSize } from './page-size';

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

const pageNumber = (raw: unknown) => {
  const value = integer(raw);
  return value !== undefined && value >= 1 ? value : undefined;
};

// Qualunque numero che il contratto accetta: i multipli giusti li sceglie la
// pagina, in base alle colonne che vede (vedi `snapPageSize`).
const pageSize = (raw: unknown) => {
  const value = integer(raw);
  return value !== undefined && value >= 1 && value <= maxPageSize
    ? value
    : undefined;
};

const uuid = (raw: unknown) =>
  typeof raw === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)
    ? raw
    : undefined;

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
  // Famiglia Steam, PS Plus. Sta nel pannello dentro il gruppo Store, ma è un
  // criterio suo: `ownerships.subscription` è un'altra colonna.
  subscriptions: field(listOf(oneOf(subscriptionValues)), [] as Subscription[]),
  // Tiene i giochi con almeno una copia che non è fra queste: toglie quelli che
  // hai solo via famiglia o abbonamento. Vedi il commento sul contratto.
  excludeSubscriptions: field(
    listOf(oneOf(subscriptionValues)),
    [] as Subscription[],
  ),
  attributes: field(listOf(integer), [] as number[]),
  gameTypes: field(listOf(oneOf(gameTypeValues)), [] as GameType[]),
  tags: field(listOf(text), [] as string[]),
  // I range restano `null` quando non sono impostati: `0` sarebbe un filtro
  // ("durata minima zero"), e su `durationMin` sarebbe pure un filtro diverso da
  // "non filtrare", perché escluderebbe i giochi senza durata.
  durationMin: field(integer, null),
  durationMax: field(integer, null),
  // Solo i giochi senza durata da mostrare. Esclusivo con i due di sopra: con la
  // spunta accesa l'intervallo si azzera e lo slider si disattiva.
  noDuration: field(flag, false),
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
  // La playlist da cui si è arrivati con «Modifica filtri». Non è un criterio:
  // serve solo al dialogo «Salva come playlist», che parte da quel nome invece
  // che da un campo vuoto. Resta nell'URL finché ci si lavora, e «azzera» non lo
  // tocca.
  playlist: field(uuid, ''),
  sort: field(oneOf(backlogSortValues), 'addedAt' as BacklogSort),
  direction: field(oneOf(sortDirectionValues), 'desc' as SortDirection),
  // La vista: griglia (di default), righe o compatta. Sta nell'URL come l'ordinamento,
  // così un link condiviso apre la stessa vista. Non la ricorda fra una visita
  // e l'altra: se servirà, è una colonna in `user_settings`.
  view: field(oneOf(backlogViewValues), 'grid' as BacklogView),
  // La pagina, da 1. Non è un criterio e non conta fra i filtri accesi, ma
  // ogni altro cambiamento la riporta a 1: vedi `setFilter`.
  page: field(pageNumber, 1),
  // Quanti giochi per pagina. Come la vista: nell'URL, non un filtro, e non
  // ricordata fra una visita e l'altra. Cambiarla riporta a pagina 1, perché
  // la pagina 7 da 14 e la pagina 7 da 70 sono giochi diversi. È il numero
  // *chiesto*: la pagina lo porta al multiplo delle colonne più vicino.
  size: field(pageSize, defaultPageSize),
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
export function toSearch(state: Partial<Record<Key, unknown>>): BacklogSearch {
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

const route = getRouteApi('/_app/_private/backlog');

/** I criteri veri e propri: l'ordinamento non è un filtro e non si azzera con loro. */
const criteri = [
  'q',
  'status',
  'platforms',
  'stores',
  'subscriptions',
  'excludeSubscriptions',
  'gameTypes',
  'attributes',
  'tags',
  'durationMin',
  'durationMax',
  'noDuration',
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
  // Quanti giochi chiedere davvero: `filter.size` portato al multiplo delle
  // colonne. Senza, quello dell'URL così com'è.
  size: number = filter.size,
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
    subscriptions: vuoto(filter.subscriptions),
    excludeSubscriptions: vuoto(filter.excludeSubscriptions),
    gameTypes: vuoto(filter.gameTypes),
    attributes: vuoto(filter.attributes),
    tags: vuoto(filter.tags),
    durationMin: filter.durationMin ?? undefined,
    durationMax: filter.durationMax ?? undefined,
    noDuration: filter.noDuration || undefined,
    ratingMin: filter.ratingMin ?? undefined,
    ratingMax: filter.ratingMax ?? undefined,
    criticMin: filter.criticMin ?? undefined,
    releasedFrom: filter.releasedFrom ?? undefined,
    releasedTo: filter.releasedTo ?? undefined,
    neverPlayed: filter.neverPlayed || undefined,
    hidden: filter.hidden || undefined,
    sort: filter.sort,
    direction: filter.direction,
    limit: size,
    offset: (filter.page - 1) * size,
  };
}

/**
 * Quanti criteri sono accesi. Una funzione e non un pezzo dell'hook, perché la
 * stessa regola conta anche i filtri di una playlist salvata.
 */
export function countActiveCriteria(filter: BacklogFilterState) {
  return criteri.filter((chiave) => {
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
  }).length;
}

/**
 * Da stato dell'URL a ciò che una playlist salva (step 15a): i criteri e
 * l'ordinamento di `toQueryInput`. Non la pagina, non quanti per pagina e non
 * la vista, e non `hidden`, che è una vista dei nascosti e non un filtro.
 *
 * Li toglie lo schema stesso: Zod scarta i campi che non conosce, e
 * `PlaylistQuerySchema` non ha `hidden`, `limit` né `offset`.
 */
export function toPlaylistQuery(filter: BacklogFilterState): PlaylistQuery {
  return PlaylistQuerySchema.parse(toQueryInput(filter));
}

/**
 * Il passaggio inverso, da una playlist a uno stato che `/backlog` sa leggere.
 *
 * Una playlist senza `status` non filtra per stato: tutti e sei. Lo stato di
 * `/backlog` invece, quando l'URL non ne dice, esclude `excluded`: quindi qui
 * va scritto per intero, o aprire una playlist nel backlog nasconderebbe in
 * silenzio i giochi «non mi interessa» che la playlist mostrava.
 */
export function fromPlaylistQuery(query: PlaylistQuery): BacklogFilterState {
  return {
    q: query.q ?? fields.q.fallback,
    status: query.status ?? [...backlogStatusValues],
    platforms: query.platforms ?? [],
    stores: query.stores ?? [],
    subscriptions: query.subscriptions ?? [],
    excludeSubscriptions: query.excludeSubscriptions ?? [],
    attributes: query.attributes ?? [],
    gameTypes: query.gameTypes ?? [],
    tags: query.tags ?? [],
    durationMin: query.durationMin ?? null,
    durationMax: query.durationMax ?? null,
    noDuration: query.noDuration ?? false,
    ratingMin: query.ratingMin ?? null,
    ratingMax: query.ratingMax ?? null,
    criticMin: query.criticMin ?? null,
    releasedFrom: query.releasedFrom ?? null,
    releasedTo: query.releasedTo ?? null,
    neverPlayed: query.neverPlayed ?? false,
    hidden: fields.hidden.fallback,
    playlist: fields.playlist.fallback,
    sort: query.sort,
    direction: query.direction,
    view: fields.view.fallback,
    page: fields.page.fallback,
    size: fields.size.fallback,
  };
}

/**
 * L'URL di `/backlog` che apre i filtri di una playlist. Con `playlistId` il
 * backlog ricorda da quale arriva, e «Salva come playlist» ne propone il nome.
 */
export function playlistSearch(
  query: PlaylistQuery,
  playlistId?: string,
): BacklogSearch {
  return toSearch({
    ...fromPlaylistQuery(query),
    ...(playlistId && { playlist: playlistId }),
  });
}

/**
 * La vista, la pagina e quanti per pagina: l'unica parte dell'URL che
 * `/playlist/$id` tiene. I filtri sono quelli salvati e l'ordinamento pure.
 */
export type PagingSearch = {
  view?: BacklogView;
  page?: number;
  size?: number;
};

export function validatePagingSearch(
  raw: Record<string, unknown>,
): PagingSearch {
  // `toSearch` ci lascia solo ciò che c'è e non è il default.
  return toSearch({
    view: fields.view.parse(raw.view),
    page: fields.page.parse(raw.page),
    size: fields.size.parse(raw.size),
  });
}

/**
 * L'URL di `/playlist/$id`: la pagina più la vista di chi guarda — ricerca e
 * ordinamento — che copre quelli salvati per quell'apertura e non si salva.
 *
 * `sort` e `direction` non perdono il valore uguale al default di `/backlog`,
 * al contrario del resto: il default di una playlist è quello che ha salvato,
 * e `addedAt` può essere proprio ciò che si sceglie su una salvata per durata.
 * Spetta alla pagina togliere ciò che coincide con la playlist.
 */
export type PlaylistSearch = PagingSearch & {
  q?: string;
  sort?: BacklogSort;
  direction?: SortDirection;
};

export function validatePlaylistSearch(
  raw: Record<string, unknown>,
): PlaylistSearch {
  const q = fields.q.parse(raw.q)?.trim();
  const sort = fields.sort.parse(raw.sort);
  const direction = fields.direction.parse(raw.direction);
  return {
    ...validatePagingSearch(raw),
    ...(q && { q }),
    ...(sort && { sort }),
    ...(direction && { direction }),
  };
}

/**
 * L'URL di una lista aperta (`/wishlist/$id`, step 15b): come quello di una
 * playlist, ma l'ordine è fra quelli di una lista. Una chiave che una lista non
 * ha (il voto personale, l'ultima partita) si scarta. Il default è l'ultimo
 * aggiunto per primo, e lo applica il server.
 */
export type WishlistSearch = Omit<PlaylistSearch, 'sort'> & {
  sort?: WishlistSort;
};

export function validateWishlistSearch(
  raw: Record<string, unknown>,
): WishlistSearch {
  const { sort, ...rest } = validatePlaylistSearch(raw);
  const known = (wishlistSortValues as readonly string[]).includes(sort ?? '');
  return { ...rest, ...(known && sort && { sort: sort as WishlistSort }) };
}

export function useBacklogFilter() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const router = useRouter();
  const filter = useMemo(() => fromSearch(search), [search]);

  // `null` toglie il criterio e lo riporta al suo default, compreso lo stato
  // con `excluded` di nuovo nascosto. `replace` come faceva nuqs: cambiare un
  // filtro non lascia una pagina nella cronologia a ogni spunta.
  //
  // Qualunque cambiamento riporta a pagina 1, se non dice lui quale: la
  // pagina 7 di un insieme diverso non vuol dire niente.
  const setFilter = useCallback(
    (patch: { [K in Key]?: BacklogFilterState[K] | null }) =>
      navigate({
        search: (prev) =>
          toSearch({ ...fromSearch(prev), page: null, ...patch }),
        replace: true,
      }),
    [navigate],
  );

  // Cambiare pagina invece **lascia** una voce nella cronologia, al contrario
  // dei filtri: «indietro» deve tornare alla pagina di prima.
  const goToPage = useCallback(
    (page: number) =>
      navigate({
        search: (prev) => toSearch({ ...fromSearch(prev), page }),
      }),
    [navigate],
  );

  // L'indirizzo di una pagina, per i link della paginazione: «apri in una
  // nuova scheda» deve aprire quella pagina con gli stessi filtri.
  const pageHref = useCallback(
    (page: number) =>
      router.buildLocation({
        to: '/backlog',
        search: toSearch({ ...filter, page }),
      }).href,
    [router, filter],
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
  const activeCount = useMemo(() => countActiveCriteria(filter), [filter]);

  return { filter, setFilter, reset, activeCount, goToPage, pageHref };
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

/**
 * Toglie un valore da un criterio multiplo, senza aggiungerlo se non c'è.
 *
 * Serve alle due liste dello stesso criterio che non si possono contraddire
 * (mostra solo / escludi): spuntare un valore in una lo toglie dall'altra.
 */
export function without<T>(values: T[], value: T): T[] | null {
  const next = values.filter((item) => item !== value);
  return next.length > 0 ? next : null;
}
