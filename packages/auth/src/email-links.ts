// I link delle email arrivano tutti a una pagina sola del web, `/email-link`,
// che dice a che punto si è leggendo `step` nell'URL di ritorno. Il web lo
// scrive quando chiede il link (`signup`, `change-confirmed`); il secondo link
// del cambio email però lo costruisce Better Auth riusando l'URL del primo, e
// il passo giusto (`change-done`) lo scriviamo qui, prima di spedirlo.

/**
 * Il tipo di richiesta scritto nel token di Better Auth: `undefined` per la
 * registrazione, `change-email-verification` per il secondo link del cambio
 * email. Si legge senza verificare la firma: serve solo a scegliere il testo,
 * e il token lo verifica Better Auth quando il link si apre.
 */
export function requestTypeOf(token: string): string | undefined {
  try {
    const payload = token.split('.')[1] ?? '';
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      requestType?: unknown;
    };
    return typeof json.requestType === 'string' ? json.requestType : undefined;
  } catch {
    return undefined;
  }
}

/** Il link con `step` cambiato nell'URL di ritorno, se ne ha uno. */
export function withStep(url: string, step: string): string {
  const link = new URL(url);
  const callback = link.searchParams.get('callbackURL');
  if (!callback) return url;
  const back = new URL(callback);
  back.searchParams.set('step', step);
  link.searchParams.set('callbackURL', back.toString());
  return link.toString();
}

/**
 * Il link con l'URL di ritorno del web, se Better Auth non ne ha uno. Succede
 * al link rispedito quando si prova ad accedere senza aver confermato: il web
 * non passa `callbackURL` all'accesso (sarebbe anche la destinazione dopo un
 * accesso riuscito), e Better Auth scrive `/`, che dall'API porterebbe alla
 * radice dell'API.
 */
export function withCallback(url: string, callback: string): string {
  const link = new URL(url);
  const current = link.searchParams.get('callbackURL');
  if (current && !current.startsWith('/')) return url;
  link.searchParams.set('callbackURL', callback);
  return link.toString();
}
