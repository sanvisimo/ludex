import type {
  BacklogQuery,
  BacklogSort,
  BacklogStatus,
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

// La durata si sceglie in ore; all'estremo destro vuol dire «nessun limite».
export const DURATION_MAX_HOURS = 100;

export type MobileFilter = {
  status: BacklogStatus[];
  platforms: string[];
  stores: Store[];
  subscriptions: Subscription[];
  durationHours: [number, number];
};

export const emptyFilter: MobileFilter = {
  status: defaultStatus,
  platforms: [],
  stores: [],
  subscriptions: [],
  durationHours: [0, DURATION_MAX_HOURS],
};

export const sortKeys: BacklogSort[] = [
  'addedAt',
  'name',
  'duration',
  'rating',
  'released',
];

function sameStatus(a: BacklogStatus[], b: BacklogStatus[]) {
  return a.length === b.length && a.every((value) => b.includes(value));
}

export function activeCount(filter: MobileFilter) {
  return [
    !sameStatus(filter.status, defaultStatus),
    filter.platforms.length > 0,
    filter.stores.length > 0,
    filter.subscriptions.length > 0,
    filter.durationHours[0] > 0 || filter.durationHours[1] < DURATION_MAX_HOURS,
  ].filter(Boolean).length;
}

export function toQuery(
  filter: MobileFilter,
  q: string,
  sort: BacklogSort,
  direction: SortDirection,
): Omit<BacklogQuery, 'limit' | 'offset'> {
  const [min, max] = filter.durationHours;
  return {
    q: q.trim() || undefined,
    status: filter.status.length > 0 ? filter.status : undefined,
    platforms: filter.platforms.length > 0 ? filter.platforms : undefined,
    stores: filter.stores.length > 0 ? filter.stores : undefined,
    subscriptions:
      filter.subscriptions.length > 0 ? filter.subscriptions : undefined,
    durationMin: min > 0 ? min * 60 : undefined,
    durationMax: max < DURATION_MAX_HOURS ? max * 60 : undefined,
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
