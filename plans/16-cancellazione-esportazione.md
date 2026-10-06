# Step 16 — Cancellazione ed esportazione dell'account

**Fatto il 06/10/2026.** I diritti di cancellazione e portabilità del GDPR
(artt. 17 e 20): l'utente elimina il proprio account e scarica i propri dati.
Prima di questo, l'informativa privacy poteva solo dire «scrivi a…».

## Cosa c'è già (letto il 06/10/2026)

- Tutte le tabelle dell'utente hanno la FK `user.id` in `cascade`: backlog (e
  con lui possessi e tag), `store_accounts` (e i token), scarti, impostazioni,
  segnalazioni, sessioni, account Better Auth. `games` non ha `userId`, quindi
  i giochi restano.
- `global_hidden_imports.decided_by` e `game_reports.resolved_by` sono
  `set null`: le decisioni degli admin sopravvivono a chi le ha prese.
- Il worker, su un job per un account sparito, lancia «non è più collegato» e
  fallisce senza danni: non serve toccarlo.
- Better Auth ha `deleteUser` spento, e con `freshAge: 0` il suo `delete-user`
  **passa senza password** (`update-user.mjs`, `if (!password && freshAge !== 0)`).
  Il server deve rifiutarlo lui.
- **Rischio da misurare**: `ownerships.store_account_id` è `restrict` e
  `store_accounts` cade nella stessa cascata dell'utente.

## Decisioni

- **Un admin può cancellarsi, ma non se è l'ultimo** (A, scelta dell'utente):
  senza admin non c'è chi gestisce scarti e segnalazioni.
- **La conferma passa dalla password**, che prende il posto del nome da
  scrivere nel dialogo. Senza password il server risponde errore.
- **L'esportazione è un JSON** scaricato dal browser. Contiene profilo, backlog,
  possessi (col nome del gioco e il suo `igdbId`), tag, account dei negozi
  **senza token**, nascosti, scarti, impostazioni e segnalazioni. Niente hash
  della password, niente sessioni.

## Passi

1. **Test della cancellazione sul database vero**, prima di toccare altro.
2. **Cancellazione**: `deleteUser` acceso, hook che rifiuta `/delete-user` senza
   password, rifiuto dell'ultimo admin, dialogo con la password, via
   `DELETION_AVAILABLE`.
3. **Esportazione**: servizio, rotta oRPC, download dal profilo.
4. **Testi**: informativa in `apps/web/lib/legal.ts` (con la data), messaggi
   it/en, `docs/ordine-sviluppo.md`, `apps/web/CLAUDE.md`.
5. **Test**: cancellazione completa, richiesta senza password, ultimo admin,
   export senza token.

## Stato

Tutti e cinque i passi fatti il 06/10/2026.

- **Misurato (passo 1):** la cascata passa anche senza intervenire: Postgres
  percorre prima la FK del backlog e poi quella degli account dei negozi. Ma
  dipende dall'ordine in cui le FK sono state create, e un database ricostruito
  da un dump potrebbe cambiarlo. Per questo `beforeDelete` cancella comunque
  prima il backlog: tre righe, e l'ordine non dipende più dal caso.
- **Dove sta il codice:** hook e `deleteUser` in `packages/auth/src/index.ts`;
  l'export in `apps/api/src/services/account-export.ts`
  (rotta `accountData.export`, schema `AccountExportSchema`); la schermata in
  `apps/web/components/account-data.tsx`; i testi legali in
  `apps/web/lib/legal.ts`.
- **Test:** `apps/api/src/services/account-data.test.ts`, con utenti e sessioni
  veri di Better Auth.
- **Non fatto, apposta:** togliere di mezzo le copie di backup dell'hosting
  (non le conosciamo), e la cancellazione di un utente da parte di un admin,
  che resta fuori (vedi 11a).
