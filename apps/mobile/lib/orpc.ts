import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { createTanstackQueryUtils } from '@orpc/tanstack-query';
import type { ApiClient } from '@repo/contracts';

import { sessionCookie } from './auth';
import { apiUrl } from './env';

const link = new RPCLink({
  url: `${apiUrl}/rpc`,
  headers: async () => ({ cookie: await sessionCookie() }),
});

export const client: ApiClient = createORPCClient(link);

export const api = createTanstackQueryUtils(client);
