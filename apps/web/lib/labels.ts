'use client';

import type { BacklogStatus, GameType, Medium, Store } from '@repo/contracts';
import {
  backlogStatusValues,
  gameTypeValues,
  mediumValues,
  storeValues,
} from '@repo/contracts';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

// Etichette del vocabolario condiviso. Stanno nel web e non in
// packages/contracts perché sono testo di interfaccia: il mobile avrà le sue, e
// il contratto deve restare dato puro.
//
// Sono hook e non costanti perché il testo dipende dalla lingua, che si risolve
// per richiesta. La mappa serve anche alla prop `items` dei Select di Base UI:
// senza, il trigger mostra il valore grezzo ("backlog" invece di "Da giocare").

export function useStatusLabels(): Record<BacklogStatus, string> {
  const t = useTranslations('status');
  return useMemo(
    () =>
      Object.fromEntries(
        backlogStatusValues.map((value) => [value, t(value)]),
      ) as Record<BacklogStatus, string>,
    [t],
  );
}

export function useGameTypeLabels(): Record<GameType, string> {
  const t = useTranslations('gameType');
  return useMemo(
    () =>
      Object.fromEntries(gameTypeValues.map((value) => [value, t(value)])) as
        Record<GameType, string>,
    [t],
  );
}

export function useStoreLabels(): Record<Store, string> {
  const t = useTranslations('store');
  return useMemo(
    () =>
      Object.fromEntries(
        storeValues.map((value) => [value, t(value)]),
      ) as Record<Store, string>,
    [t],
  );
}

export function useMediumLabels(): Record<Medium, string> {
  const t = useTranslations('medium');
  return useMemo(
    () =>
      Object.fromEntries(
        mediumValues.map((value) => [value, t(value)]),
      ) as Record<Medium, string>,
    [t],
  );
}
