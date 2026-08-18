import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";
import type { ApiClient } from "@repo/contracts";

const link = new RPCLink({
  url: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/rpc`,
  // L'API sta su un'origine diversa dal web: senza credentials il cookie di
  // sessione non parte e ogni procedura autenticata risponde 401.
  fetch: (request, init) => globalThis.fetch(request, { ...init, credentials: "include" }),
});

// Tipizzato dal contratto: se cambia un input in packages/contracts, qui il
// compilatore se ne accorge senza generare niente.
export const client: ApiClient = createORPCClient(link);

// `api.games.latest.queryOptions()` e `api.backlog.add.mutationOptions()`:
// le chiavi di cache le costruisce l'integrazione, quindi l'invalidazione dopo
// una mutazione non dipende da stringhe scritte a mano.
export const api = createTanstackQueryUtils(client);
