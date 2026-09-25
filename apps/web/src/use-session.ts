import { useSession as useAuthSession } from '@repo/auth/client';
import { useHydrated } from '@tanstack/react-router';

/**
 * La sessione di Better Auth, ma «in caricamento» finché React non ha idratato.
 *
 * Il server non sa chi guarda e rende sempre lo stato di attesa. Nel browser
 * invece la richiesta della sessione può essere già tornata quando React
 * idrata, e allora il primo render non combacia con l'HTML del server: è una
 * corsa, e l'errore di idratazione compare una volta sì e una no. Fino
 * all'idratazione si risponde come il server; da lì in poi è la sessione vera.
 */
export function useSession() {
  const hydrated = useHydrated();
  const session = useAuthSession();
  return hydrated ? session : { ...session, data: null, isPending: true };
}
