# Step 14 — Abbonamenti

**Stato: chiuso il 21/10/2026**, segnato «fatto» nella roadmap. Branch
`feat/14-abbonamenti`, da `main` (che contiene il 9e, PR #88). `pnpm
check-types`, `pnpm lint`, `pnpm --filter web test` e `pnpm --filter api test`
(1106 verdi) passano. Provato dall'utente su Xbox lo stesso giorno: acceso
«Game Pass attivo» e importato, poi spento e reimportato. I giochi sotto la
soglia sono usciti; _The Rogue Prince of Persia_, con voto e tag, è rimasto
«non più tuo».

## Contesto

Dal 9b i giochi da abbonamento **entrano** nel backlog, e la copia ricorda da
dove viene in `ownerships.subscription` (`ps_plus`, `steam_family`, `ea_play`,
`game_pass`, `games_with_gold`; nullo = comprata). Lo step 14 decide cosa
succede quando l'abbonamento **finisce**: le tre domande sono in
[ordine-sviluppo](../docs/ordine-sviluppo.md), step 14.

Oggi solo `steam_family` ha una regola (`pruneFamilyCopies` in
[steam-import.ts](../apps/api/src/services/steam-import.ts)): una copia
`ps_plus`, `ea_play` o `game_pass` che non torna resta lì per sempre.

## Decisioni (21/10/2026)

1. **Chi se ne accorge: l'import successivo.** Una copia da abbonamento che il
   negozio non restituisce più è uscita. Nessun controllo esplicito dello
   stato dell'abbonamento.
2. **Cosa succede:**
   - il gioco ha **un'altra copia** → esce solo questa;
   - è **l'ultima** e la riga **non ha dati dell'utente** (voto, note, tag,
     stato: `hasPersonalData`) → escono la copia e la riga di backlog;
   - è **l'ultima** e la riga **ha dati dell'utente** → la copia resta,
     marcata **«non più tua»**.

   Vale per tutti gli abbonamenti, Steam Family compresa. Una riga di `games`
   non si tocca.

3. **Voto, note e tag** sono la condizione della 2: dove ci sono, la riga resta.
4. **Il disco coperto dal Plus non è un rischio vero**: un disco che si gioca
   ricompare come fisico, lo si è visto su PSN e su Nintendo. Non si chiede
   conferma prima di cancellare.
5. **EA non elenca i giochi EA Play senza abbonamento attivo**: verificato
   dall'utente sul suo account, senza EA Play attivo.

Default dichiarati nella proposta e non contestati:

- la marca è una colonna sulla copia, `ownerships.subscription_ended_at`
  (timestamp, nulla = attivo). Il reimport che ritrova il gioco la azzera;
- si pota solo dopo una lettura **completa** della libreria, come la famiglia;
- una copia «non più tua» **non conta** per il filtro della piattaforma: stasera
  non la puoi avviare.

## Passi

1. **Schema**: `ownerships.subscription_ended_at` in
   [backlog.ts](../packages/db/src/schema/backlog.ts), migration con
   `pnpm db:generate`. L'upsert dei possessi la riscrive a null.
2. **Servizio**: `pruneFamilyCopies` diventa `pruneSubscriptionCopies`, in un
   file suo. Guarda tutte le copie con `subscription` non nulla dell'account;
   dove oggi lascia la copia, scrive `subscription_ended_at`; salta le copie già
   marcate, così la data resta quella del primo import che non le ha viste. I
   giochi da tenere si ricavano come oggi, dagli id del negozio dopo l'import.
3. **Chiamate**, dopo `importLibrary`: Steam (al posto di adesso), PSN, EA,
   Xbox; e lo scollegamento della famiglia
   ([steam-login.ts](../apps/api/src/services/steam-login.ts)). EA con token
   scaduto e Steam senza token escono prima dell'import, quindi non potano.
4. **Filtro piattaforma** in
   [backlog-search.ts](../apps/api/src/services/backlog-search.ts): la copia
   «non più tua» non conta.
5. **UI**: sulla pagina del gioco la copia mostra «non più tua», testi in
   `messages/it.json` ed `en.json`. Ritocco a una schermata esistente, niente
   wireframe.
6. **Test**, su Postgres: i tre esiti; la marca scritta una volta sola; il
   gioco che torna e perde la marca; un altro account non toccato; Xbox che
   toglie «Game Pass attivo» e pota i giochi sotto la soglia. Si adattano i
   test della famiglia.
7. **Documentazione**: step 14 in `docs/ordine-sviluppo.md` (le domande
   diventano risposte), la sezione sugli abbonamenti in `docs/negozi.md`, il
   commento della colonna `subscription`. Roadmap a «fatto» quando l'utente
   dice che il lotto è pronto.

## Verifiche rimandate

- **PSN a Plus scaduto**: non è misurato che gli acquisti `PS_PLUS` spariscano.
  Se restano, non succede niente e non si fa danno; le righe continuano a
  mentire finché non lo si misura su un Plus scaduto vero.

## Com'è venuto

- **Schema**: `ownerships.subscription_ended_at`, migration
  `packages/db/drizzle/0060_nervous_punisher.sql`. L'upsert dei possessi
  (`ensureOwnerships`) la rimette a null.
- **Servizio**: `apps/api/src/services/subscription-copies.ts`.
  `pruneSubscriptionCopies` prende il posto di `pruneFamilyCopies`, e tiene per
  **gioco e piattaforma** (`listedCopies`), non per gioco: su Xbox la console
  tolta dalle spunte è una copia che non torna. Una copia già marcata non tiene
  in vita le altre, e le marcate tornano a ogni giro: una riga a cui l'utente
  toglie i dati se ne va al primo import dopo.
  `pruneUnlistedSubscriptionCopies` è il giro intero per PSN, EA e Xbox.
- **Oltre il piano, per coerenza**: la piattaforma che hai solo su copie «non
  più tue» non si offre nel pannello dei filtri (darebbe zero risultati);
  la colonna va nel contratto (`OwnershipSchema`) e nell'esportazione
  dell'account; la fusione di due giochi (11b) tiene la marca solo se ce
  l'avevano tutte e due le copie.
- **Test**: `subscription-copies.test.ts` (la regola, su Postgres), due casi
  nuovi in `steam-import.test.ts` (la marca, e la famiglia che rimette il
  gioco), tre in `xbox-import.test.ts` (con che voci si pota, il Game Pass
  sotto la soglia, nessuna potatura su un token rifiutato).
