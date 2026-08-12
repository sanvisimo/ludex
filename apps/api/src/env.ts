import { config } from "dotenv";

// Importato per primo da server.ts e worker.ts: @repo/auth e @repo/db leggono
// process.env al momento dell'import, quindi il .env deve essere già caricato.
// I task turbo girano con cwd = apps/api, il .env sta alla radice del repo.
config({ path: "../../.env" });
