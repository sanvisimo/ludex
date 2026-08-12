import "./env";

import { serve } from "@hono/node-server";
import { auth } from "@repo/auth";
import { Hono } from "hono";
import { cors } from "hono/cors";

const webUrl = process.env.WEB_URL ?? "http://localhost:3000";
const port = Number(process.env.API_PORT ?? 3001);

const app = new Hono();

// Le richieste di Better Auth portano il cookie di sessione, quindi servono
// origine esplicita e credentials: con "*" il browser le rifiuta.
app.use(
  "/api/auth/*",
  cors({
    origin: webUrl,
    credentials: true,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
  }),
);

// Il core di Better Auth è un handler fetch standard: su Hono si monta diretto.
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/health", (c) => c.json({ status: "ok" }));

app.get("/me", async (c) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "non autenticato" }, 401);
  return c.json({ user: session.user });
});

serve({ fetch: app.fetch, port }, ({ port }) => {
  console.log(`api in ascolto su http://localhost:${port}`);
});
