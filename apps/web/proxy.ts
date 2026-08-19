import { NextResponse, type NextRequest } from 'next/server';

// Convenzione `proxy` di Next 16: sostituisce `middleware`, deprecato dalla 16.0.
// Il file va nella radice dell'app e la funzione si deve chiamare `proxy`.
//
// Controllo OTTIMISTICO: qui si guarda solo se il cookie di sessione esiste, non
// se è valido — validarne la firma richiederebbe una chiamata all'API a ogni
// richiesta. L'enforcement vero resta alle procedure oRPC, che rispondono 401 e
// filtrano sempre per userId. Questo serve solo a evitare che un anonimo veda lo
// scheletro di una pagina privata prima del rimbalzo.
//
// Nota per il deploy: il cookie è emesso dall'API (porta 3001) e arriva al web
// (porta 3000) perché i cookie non sono separati per porta. Con API e web su
// sottodomini diversi servirà configurare `crossSubDomainCookies` in Better Auth,
// o qui il cookie non si vedrà.
const SESSION_COOKIE = 'better-auth.session_token';

const PRIVATE_PATHS = ['/backlog'];
const GUEST_ONLY_PATHS = ['/login', '/register'];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // In produzione Better Auth prefissa il cookie con `__Secure-`.
  const hasSession =
    request.cookies.has(SESSION_COOKIE) ||
    request.cookies.has(`__Secure-${SESSION_COOKIE}`);

  if (!hasSession && PRIVATE_PATHS.some((path) => pathname.startsWith(path))) {
    const url = new URL('/login', request.url);
    // Dopo l'accesso si torna dove si voleva andare.
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (
    hasSession &&
    GUEST_ONLY_PATHS.some((path) => pathname.startsWith(path))
  ) {
    return NextResponse.redirect(new URL('/backlog', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/backlog/:path*', '/login', '/register'],
};
