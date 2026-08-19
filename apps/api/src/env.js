"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var dotenv_1 = require("dotenv");
// Importato per primo da server.ts e worker.ts: @repo/auth e @repo/db leggono
// process.env al momento dell'import, quindi il .env deve essere già caricato.
// I task turbo girano con cwd = apps/api, il .env sta alla radice del repo.
(0, dotenv_1.config)({ path: '../../.env' });
