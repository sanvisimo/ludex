import './env';

import { serve } from '@hono/node-server';
import { onError } from '@orpc/server';
import { RPCHandler } from '@orpc/server/fetch';
import { auth } from '@repo/auth';
import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { router } from './rpc/router';

const webUrl = process.env.WEB_URL ?? 'http://localhost:3000';
const port = Number(process.env.API_PORT ?? 3001);

const app = new Hono();

const rpc = new RPCHandler(router, {
  interceptors: [onError((error) => console.error(error))],
});

// Le richieste di Better Auth portano il cookie di sessione, quindi servono
// origine esplicita e credentials: con "*" il browser le rifiuta.
app.use(
  '/api/auth/*',
  cors({
    origin: webUrl,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }),
);

// Il core di Better Auth è un handler fetch standard: su Hono si monta diretto.
app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

// Stesso trattamento CORS dell'auth: le chiamate oRPC portano il cookie di
// sessione, quindi origine esplicita e credentials.
app.use(
  '/rpc/*',
  cors({
    origin: webUrl,
    credentials: true,
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }),
);

app.use('/rpc/*', async (c, next) => {
  // Gli header grezzi sono tutto il contesto iniziale: la sessione la risolvono
  // i middleware oRPC in rpc/context.ts.
  const { matched, response } = await rpc.handle(c.req.raw, {
    prefix: '/rpc',
    context: { headers: c.req.raw.headers },
  });

  if (matched) return c.newResponse(response.body, response);
  await next();
});

app.get('/health', (c) => c.json({ status: 'ok' }));

serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`api in ascolto su http://localhost:${port}`);
});
