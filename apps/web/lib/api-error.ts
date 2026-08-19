'use client';

import { ORPCError } from '@orpc/client';
import { useTranslations } from 'next-intl';

// I messaggi che l'API mette in `ORPCError` sono testo per chi sviluppa, non
// interfaccia: non sono tradotti e non vanno mostrati così come sono. Qui si
// traduce il *codice*, che è la parte del contratto pensata per essere letta da
// un programma.
const codes = [
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'TOO_MANY_REQUESTS',
  'INTERNAL_SERVER_ERROR',
] as const;

type ErrorCode = (typeof codes)[number];

function codeOf(error: unknown): ErrorCode | null {
  if (!(error instanceof ORPCError)) return null;
  return (codes as readonly string[]).includes(error.code)
    ? (error.code as ErrorCode)
    : null;
}

/**
 * Traduce l'errore di una chiamata oRPC.
 *
 * `fallback` è obbligatorio perché lo stesso codice dice cose diverse a seconda
 * di cosa si stava facendo: un 404 rimuovendo una riga non è un 404 aprendo una
 * scheda. Le sovrascritture per codice servono a quei casi in cui si può essere
 * più precisi del messaggio generico — `CONFLICT` mentre si aggiunge un gioco
 * significa "ce l'hai già", non "esiste già".
 */
export function useApiErrorMessage() {
  const t = useTranslations('errors');

  return function message(
    error: unknown,
    options: { fallback: string } & Partial<Record<ErrorCode, string>>,
  ): string {
    const code = codeOf(error);
    if (!code) return options.fallback;
    return options[code] ?? t(code);
  };
}
