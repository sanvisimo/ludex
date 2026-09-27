import { createServerFn } from '@tanstack/react-start';
import { getCookie } from '@tanstack/react-start/server';

const SESSION_COOKIE = 'better-auth.session_token';

/**
 * Controllo OTTIMISTICO: guarda solo se il cookie di sessione esiste, non se è
 * valido — validarne la firma richiederebbe una chiamata all'API a ogni
 * navigazione. L'enforcement vero resta alle procedure oRPC, che rispondono
 * 401 e filtrano sempre per userId. Questo serve solo a evitare che un anonimo
 * veda lo scheletro di una pagina privata prima del rimbalzo.
 *
 * È una server function perché il cookie è `httpOnly`: dal browser non si
 * legge, quindi anche nelle navigazioni lato client la domanda va al server.
 *
 * Nota per il deploy: il cookie è emesso dall'API (porta 3005) e arriva al web
 * (porta 8085) perché i cookie non sono separati per porta. Con API e web su
 * sottodomini diversi servirà configurare `crossSubDomainCookies` in Better
 * Auth, o qui il cookie non si vedrà.
 */
export const hasSession = createServerFn({ method: 'GET' }).handler(
  // In produzione Better Auth prefissa il cookie con `__Secure-`.
  () =>
    getCookie(SESSION_COOKIE) !== undefined ||
    getCookie(`__Secure-${SESSION_COOKIE}`) !== undefined,
);
