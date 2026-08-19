'use client';

import type { BacklogQueryInput, BacklogStatus } from '@repo/contracts';
import {
  backlogSortValues,
  backlogStatusValues,
  sortDirectionValues,
  storeValues,
} from '@repo/contracts';
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsFloat,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  useQueryStates,
} from 'nuqs';
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
 * `clearOnDefault` è attivo di default in nuqs: nell'URL compaiono soltanto i
 * criteri che l'utente ha davvero toccato.
 */

// Tutti gli stati tranne "non mi interessa". È l'unico default che restringe, e
// sta qui — nel client — e non nel contratto: il server non deve nascondere
// niente di sua iniziativa, mentre qui la scelta si vede spuntata nel pannello e
// si può togliere.
export const defaultStatus: BacklogStatus[] = backlogStatusValues.filter(
  (value) => value !== 'excluded',
);

export const filterParsers = {
  q: parseAsString.withDefault(''),
  status: parseAsArrayOf(parseAsStringLiteral(backlogStatusValues)).withDefault(
    defaultStatus,
  ),
  platforms: parseAsArrayOf(parseAsString).withDefault([]),
  stores: parseAsArrayOf(parseAsStringLiteral(storeValues)).withDefault([]),
  attributes: parseAsArrayOf(parseAsInteger).withDefault([]),
  tags: parseAsArrayOf(parseAsString).withDefault([]),
  // I range restano `null` quando non sono impostati: `0` sarebbe un filtro
  // ("durata minima zero"), e su `durationMin` sarebbe pure un filtro diverso da
  // "non filtrare", perché escluderebbe i giochi senza durata.
  durationMin: parseAsInteger,
  durationMax: parseAsInteger,
  ratingMin: parseAsFloat,
  ratingMax: parseAsFloat,
  criticMin: parseAsInteger,
  releasedFrom: parseAsInteger,
  releasedTo: parseAsInteger,
  neverPlayed: parseAsBoolean.withDefault(false),
  sort: parseAsStringLiteral(backlogSortValues).withDefault('addedAt'),
  direction: parseAsStringLiteral(sortDirectionValues).withDefault('desc'),
};

// Derivato dall'hook e non riscritto a mano: i parser decidono già quali campi
// sono nullabili e quali hanno un default, e una seconda dichiarazione si
// scollerebbe dalla prima al primo criterio aggiunto.
export type BacklogFilterState = ReturnType<typeof useBacklogFilter>['filter'];

/** I criteri veri e propri: l'ordinamento non è un filtro e non si azzera con loro. */
const criteri = [
  'q',
  'status',
  'platforms',
  'stores',
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
] as const;

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
    sort: filter.sort,
    direction: filter.direction,
    limit,
    offset: 0,
  };
}

export function useBacklogFilter() {
  const [filter, setFilter] = useQueryStates(filterParsers);

  // `null` su tutto: è così che nuqs toglie un parametro dall'URL e riporta il
  // campo al suo default, compreso lo stato con `excluded` di nuovo nascosto.
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
  // `null` e non `[]`: è il modo di nuqs per togliere il parametro dall'URL
  // invece di lasciarcelo vuoto.
  return next.length > 0 ? next : null;
}
