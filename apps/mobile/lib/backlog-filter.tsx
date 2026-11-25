import type {
  BacklogQuery,
  BacklogSort,
  BacklogStatus,
  DurationBasis,
  GameType,
  Medium,
  ScoreSource,
  SortDirection,
  Store,
  Subscription,
} from '@repo/contracts';
import { backlogStatusValues } from '@repo/contracts';
import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

// Come sul web: il client, non il server, nasconde «non mi interessa», e la
// scelta si vede spuntata nel foglio dei filtri.
export const defaultStatus: BacklogStatus[] = backlogStatusValues.filter(
  (value) => value !== 'excluded',
);

// Gli estremi del web (`apps/web/components/backlog-filters.tsx`): all'estremo
// la maniglia vuol dire «nessun limite».
export const DURATION_MAX_HOURS = 100;
export const RATING_MIN = 0.5;
export const RATING_MAX = 5;
export const RELEASED_MIN = 1970;
export const RELEASED_MAX = new Date().getFullYear();

export type MobileFilter = {
  neverPlayed: boolean;
  status: BacklogStatus[];
  platforms: string[];
  stores: Store[];
  media: Medium[];
  subscriptions: Subscription[];
  excludeSubscriptions: Subscription[];
  gameTypes: GameType[];
  attributes: number[];
  tags: string[];
  durationHours: [number, number];
  durationBasis: DurationBasis;
  noDuration: boolean;
  rating: [number, number];
  criticMin: number;
  criticSource: ScoreSource | null;
  released: [number, number];
};

export const emptyFilter: MobileFilter = {
  neverPlayed: false,
  status: defaultStatus,
  platforms: [],
  stores: [],
  media: [],
  subscriptions: [],
  excludeSubscriptions: [],
  gameTypes: [],
  attributes: [],
  tags: [],
  durationHours: [0, DURATION_MAX_HOURS],
  durationBasis: 'main',
  noDuration: false,
  rating: [RATING_MIN, RATING_MAX],
  criticMin: 0,
  criticSource: null,
  released: [RELEASED_MIN, RELEASED_MAX],
};

export const sortKeys: BacklogSort[] = [
  'addedAt',
  'name',
  'released',
  'duration',
  'rating',
  'criticRating',
  'lastPlayed',
  'playtime',
  'status',
];

function sameStatus(a: BacklogStatus[], b: BacklogStatus[]) {
  return a.length === b.length && a.every((value) => b.includes(value));
}

const durationOn = (f: MobileFilter) =>
  f.durationHours[0] > 0 || f.durationHours[1] < DURATION_MAX_HOURS;
const ratingOn = (f: MobileFilter) =>
  f.rating[0] > RATING_MIN || f.rating[1] < RATING_MAX;
const releasedOn = (f: MobileFilter) =>
  f.released[0] > RELEASED_MIN || f.released[1] < RELEASED_MAX;

export function activeCount(f: MobileFilter) {
  return [
    f.neverPlayed,
    !sameStatus(f.status, defaultStatus),
    f.platforms.length > 0,
    f.stores.length > 0,
    f.media.length > 0,
    f.subscriptions.length > 0,
    f.excludeSubscriptions.length > 0,
    f.gameTypes.length > 0,
    f.attributes.length > 0,
    f.tags.length > 0,
    durationOn(f) || f.noDuration,
    ratingOn(f),
    f.criticMin > 0,
    releasedOn(f),
  ].filter(Boolean).length;
}

const list = <T,>(values: T[]) => (values.length > 0 ? values : undefined);

export function toQuery(
  f: MobileFilter,
  q: string,
  sort: BacklogSort,
  direction: SortDirection,
): Omit<BacklogQuery, 'limit' | 'offset'> {
  const [durationMin, durationMax] = f.durationHours;
  return {
    q: q.trim() || undefined,
    neverPlayed: f.neverPlayed || undefined,
    status: list(f.status),
    platforms: list(f.platforms),
    stores: list(f.stores),
    media: list(f.media),
    subscriptions: list(f.subscriptions),
    excludeSubscriptions: list(f.excludeSubscriptions),
    gameTypes: list(f.gameTypes),
    attributes: list(f.attributes),
    tags: list(f.tags),
    durationMin: durationMin > 0 ? durationMin * 60 : undefined,
    durationMax:
      durationMax < DURATION_MAX_HOURS ? durationMax * 60 : undefined,
    // Come sul web: il tempo scelto va al server solo con l'intervallo acceso.
    durationBasis: durationOn(f) ? f.durationBasis : undefined,
    noDuration: f.noDuration || undefined,
    ratingMin: f.rating[0] > RATING_MIN ? f.rating[0] : undefined,
    ratingMax: f.rating[1] < RATING_MAX ? f.rating[1] : undefined,
    criticMin: f.criticMin > 0 ? f.criticMin : undefined,
    criticSource: f.criticMin > 0 ? (f.criticSource ?? undefined) : undefined,
    releasedFrom: f.released[0] > RELEASED_MIN ? f.released[0] : undefined,
    releasedTo: f.released[1] < RELEASED_MAX ? f.released[1] : undefined,
    sort,
    direction,
  };
}

type BacklogView = {
  filter: MobileFilter;
  setFilter: (filter: MobileFilter) => void;
  q: string;
  setQ: (q: string) => void;
  sort: BacklogSort;
  direction: SortDirection;
  setSort: (sort: BacklogSort, direction: SortDirection) => void;
};

const Context = createContext<BacklogView | null>(null);

/** Filtri, ricerca e ordine del backlog: durano finché l'app è aperta. */
export function BacklogViewProvider({ children }: { children: ReactNode }) {
  const [filter, setFilter] = useState(emptyFilter);
  const [q, setQ] = useState('');
  const [order, setOrder] = useState<{
    sort: BacklogSort;
    direction: SortDirection;
  }>({ sort: 'addedAt', direction: 'desc' });

  const value = useMemo(
    () => ({
      filter,
      setFilter,
      q,
      setQ,
      ...order,
      setSort: (sort: BacklogSort, direction: SortDirection) =>
        setOrder({ sort, direction }),
    }),
    [filter, q, order],
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBacklogView() {
  const view = useContext(Context);
  if (!view) throw new Error('useBacklogView fuori da BacklogViewProvider');
  return view;
}
