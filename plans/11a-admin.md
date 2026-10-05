# Step 11a — Admin

**Aperto il 05/10/2026.** Piano approvato dall'utente con tre decisioni (sotto).
La fusione di due righe `games` è uscita da qui ed è il lotto **11b**, con un
piano suo. Sotto ogni passo, man mano, cosa è stato fatto e cosa l'ha smentito.

## Contesto

Lo step 11 in [ordine-sviluppo](../docs/ordine-sviluppo.md) è «dove finisce ciò
che nessun automatismo ha saputo chiudere»: giochi non collegati, scarti
d'import, fonti in `not_found`, gestione degli utenti. Qui c'è solo ciò che va
deciso da un umano; la riapertura automatica dei `not_found` è enrichment e
resta lì.

Cosa c'è già, letto dal codice:

- **Nessun ruolo.** Better Auth (1.6.27) ha solo email e password
  ([packages/auth](../packages/auth/src)), oRPC ha `authed` e `maybeAuthed`
  ([context.ts](../apps/api/src/rpc/context.ts)).
- **L'id esterno scritto a mano è già quasi possibile.** HLTB, OpenCritic e
  Metacritic, se `game_sources.external_id` c'è, vanno per id e saltano il
  match per nome ([hltb-enrichment.ts](../apps/api/src/services/hltb-enrichment.ts),
  [opencritic-enrichment.ts](../apps/api/src/services/opencritic-enrichment.ts),
  [metacritic-enrichment.ts](../apps/api/src/services/metacritic-enrichment.ts)).
  All'admin basta scrivere l'id, rimettere la fonte in `pending` e accodarla.
- **Gli scarti sono per utente** (`unresolved_imports`): lo stesso Netflix su
  PSN è una riga per ogni utente. Risolverne uno scrive già la mappatura in
  `external_ids` **per tutti**
  ([unresolved-imports.ts](../apps/api/src/services/unresolved-imports.ts)),
  ma gli scarti degli altri restano lì fino al loro prossimo import.
- **La fusione di due `games`** è descritta allo step 5 e non esiste: è l'11b.

## Decisioni prese

- **Ruolo admin col plugin `admin` di Better Auth**: porta `role`, `banned`,
  `banReason`, `banExpires` su `user` (e `impersonatedBy` su `session`), e le
  chiamate per elencare utenti, cambiare ruolo, bannare, chiudere le sessioni.
  Schema rigenerato con `pnpm auth:generate`, migration da drizzle-kit. Il
  primo admin lo nomina uno script a mano.
- **Fusione di due giochi: lotto nuovo, 11b.** Qui «Collega a IGDB» funziona
  solo se l'id IGDB è libero; se è già di un altro gioco lo dice e si ferma.
- **Uno scarto nascosto può valere per tutti, e si fa ora.** Vedi sotto.

## Scarti nascosti per tutti

La regola già scritta in [import-librerie](../docs/import-librerie.md) era «per
utente adesso, promuovibile dopo»: questo è il «dopo». La forma:

- **una tabella nuova, `global_hidden_imports`**: `store`, `external_id`,
  `hidden_kind`, chi l'ha deciso, quando. Chiave (`store`, `external_id`).
- **Solo i tipi che sono un fatto**: `app`, `dlc`, `extra`, `prerelease`. Mai
  `unwanted`, che è una preferenza: un vincolo nel database lo esclude.
- **Promuovere** nasconde, con quel tipo, le righe di `unresolved_imports` con
  quella chiave che sono ancora visibili. Quelle già nascoste dall'utente non si
  toccano.
- **All'import**, `recordUnresolved` fa nascere già nascoste le righe nuove la
  cui chiave è nella tabella. Solo all'inserimento: l'upsert di un reimport non
  tocca `hidden_at`, quindi un utente che la rimette fra i «da sistemare» resta
  libero di farlo.
- **Togliere dalla tabella** smette di applicarla alle righe nuove e non tocca
  quelle già scritte.

## Passi

1. **Ruolo admin.** Plugin `admin` nel server e nel client di
   [packages/auth](../packages/auth/src), `pnpm auth:generate`, migration.
   Middleware `admin` in [context.ts](../apps/api/src/rpc/context.ts) (dopo
   `authed`, rifiuta chi non ha `role = 'admin'`), gruppo `admin.*` nel
   contratto. Script per nominare il primo admin per email, documentato in
   [apps/api/CLAUDE.md](../apps/api/CLAUDE.md).
2. **Wireframe** (Excalidraw, `11a-admin.excalidraw`) di `/admin` e delle
   quattro sezioni. Si corregge lì finché la struttura non è approvata.
3. **Fonti in `not_found`**: lista filtrabile per fonte, con gioco, motivo
   (`error`) e quanti utenti ce l'hanno. Azioni «Ritenta» (in coda) e
   «Inserisci id» (`external_id` scritto, `pending`, in coda).
4. **Scarti d'import di tutti**: raggruppati per negozio e id esterno, con
   quante librerie li hanno e come li hanno nascosti. Azioni:
   - **«Collega per tutti»**: la riga di `external_ids` e la risoluzione degli
     scarti di ogni utente con quella chiave, con la stessa logica di
     `resolveUnresolvedImport`;
   - **«Nascondi per tutti»** con il tipo, e il suo rovescio: la sezione sopra.
5. **Giochi non collegati** (senza `igdbId`): lista, con quanti utenti li hanno
   in backlog. Azione «Collega a IGDB» se l'id è libero, altrimenti messaggio
   che rimanda all'11b.
6. **Utenti**: nome, email, iscrizione, numero di giochi e di account
   collegati. Azioni: ruolo, ban e rimozione del ban, chiudi le sessioni. Niente
   cancellazione (step 16) e niente impersonazione.
7. **Web**: `/admin` col menu a sinistra come `/account`, sotto-rotte `fonti`,
   `scarti`, `giochi`, `utenti`. Il link compare solo agli admin; la rotta
   rimanda via chi non lo è (la sicurezza vera la fa il middleware).
8. **Documentazione**: step 11 in [ordine-sviluppo](../docs/ordine-sviluppo.md)
   diviso in 11a e 11b; in [import-librerie](../docs/import-librerie.md) la
   risposta alla domanda «è roba di uno o di tutti?».

## Verifica

Test contro Postgres, in `apps/api`:

- il middleware respinge un utente senza ruolo;
- con l'id inserito a mano l'enrichment va per id e non rifà il match;
- «Collega per tutti» ripetuto due volte dà lo stesso risultato;
- «Nascondi per tutti» non tocca le righe già nascoste dall'utente, e un
  import successivo fa nascere nascoste le righe nuove con quella chiave;
- `unwanted` non entra in `global_hidden_imports`;
- «Collega a IGDB» con un id già usato si rifiuta.

`global_hidden_imports` non è seedata da una migration, quindi non va aggiunta
alla lista delle tabelle escluse dal troncamento.

## Fuori da questo lotto

- **11b — fusione di due righe `games`**, con backlog, possessi,
  `external_ids` e le due righe di backlog dello stesso utente.
- **Ripuntare una riga di `external_ids`** a un altro gioco: è la seconda
  strada di «Un collegamento sbagliato non si disfa togliendo il gioco», e sta
  con l'11b.
- Cancellazione ed esportazione dell'account: step 16.
