import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { ApiClient } from "@repo/contracts";

const link = new RPCLink({
  url: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"}/rpc`,
  // L'API sta su un'origine diversa dal web: senza credentials il cookie di
  // sessione non parte e ogni procedura autenticata risponde 401.
  fetch: (request, init) => globalThis.fetch(request, { ...init, credentials: "include" }),
});

// Tipizzato dal contratto: se cambia un input in packages/contracts, qui il
// compilatore se ne accorge senza generare niente.
export const api: ApiClient = createORPCClient(link);
