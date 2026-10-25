import { eventIterator, oc } from '@orpc/contract';
import { z } from 'zod';

import {
  AccountExportSchema,
  AdminRoleSchema,
  AdminUserSchema,
  BacklogEntrySchema,
  BacklogFilterOptionsSchema,
  BacklogListSchema,
  BacklogQuerySchema,
  BacklogSortSchema,
  BacklogStatusSchema,
  EnrichmentSourceSchema,
  GameAdminDetailSchema,
  GameDetailSchema,
  GameSchema,
  GlobalHiddenImportSchema,
  GlobalHiddenKindSchema,
  HiddenKindSchema,
  HomeBandSchema,
  HomeGameSchema,
  IgdbSearchHitSchema,
  LinkIgdbResultSchema,
  LinkableStoreSchema,
  LiveEventSchema,
  ManualSourceSchema,
  MergePreviewSchema,
  MergeResultSchema,
  MissingBucketSchema,
  MissingListSchema,
  MissingSummarySchema,
  MyCopySchema,
  NotesSchema,
  OpenReportSchema,
  OwnershipInputSchema,
  PlatformSchema,
  PlatformMismatchSchema,
  PlaylistDetailSchema,
  PlaylistNameSchema,
  PlaylistQuerySchema,
  PlaylistSchema,
  RandomFilterSchema,
  RandomSeedSchema,
  RatingSchema,
  RepointPreviewSchema,
  ReportGroupSchema,
  ReportTargetSchema,
  ShareTokenSchema,
  SharedPlaylistSchema,
  SortDirectionSchema,
  SteamLoginRemovedSchema,
  SteamLoginStartSchema,
  SourceReasonSchema,
  SteamLoginStatusSchema,
  XboxLoginStartSchema,
  XboxLoginStatusSchema,
  PlayedMinMinutesSchema,
  XboxPlatformSchema,
  StoreAccountSchema,
  StoreSchema,
  SyncAllResultSchema,
  UnlinkedGameSchema,
  UnlinkImpactSchema,
  WishlistSortSchema,
  WishlistSchema,
  WishlistMembershipSchema,
  WishlistGamesSchema,
  WishlistUnresolvedSchema,
  UnresolvedGroupListSchema,
  UnresolvedImportSchema,
  UserSettingsSchema,
  UserTagInputSchema,
  UserTagSchema,
} from './schemas';

// Contratto oRPC: sola descrizione di input e output, nessuna implementazione.
// È la ragione per cui questo package non dipende da `packages/db` — web e
// mobile importano da qui e ottengono i tipi senza tirarsi dietro il server.
// L'implementazione sta in `apps/api`, che chiama `implement(contract)`.
export const contract = {
  platforms: {
    // Lista di riferimento per le tendine di inserimento. Pubblica: è dato
    // statico, non dice nulla su nessun utente.
    list: oc.output(z.array(PlatformSchema)),
  },

  games: {
    // La home (12e): le fasce del catalogo, uguali per tutti. Da loggati ogni
    // gioco porta lo stato che ha nel tuo backlog, e niente altro di tuo.
    home: oc.output(z.array(HomeBandSchema)),

    // Scheda gioco, per slug: è ciò che sta nel link. Il gioco si vede sempre;
    // `entry` è popolato solo se chi guarda è autenticato e ha quel gioco nel
    // backlog. È la pagina auth/no-auth.
    bySlug: oc.input(z.object({ slug: z.string().min(1).max(200) })).output(
      z.object({
        game: GameDetailSchema,
        entry: BacklogEntrySchema.nullable(),
      }),
    ),

    // Il dado (15c): un gioco a caso. Pubblica: da loggati pesca dal backlog
    // dentro `filter`, da anonimi dal catalogo (i tipi giocabili della home) e
    // `filter` non conta. I candidati sono mescolati da `seed`, e `after` è lo
    // slug della scheda su cui si è: si riceve il successivo nel mazzo, e in
    // fondo si ricomincia. Senza `after`, il primo. `null` se non c'è niente
    // da pescare, o c'è solo `after`: non è un errore.
    random: oc
      .input(
        z.object({
          filter: RandomFilterSchema.optional(),
          seed: RandomSeedSchema,
          after: z.string().min(1).max(200).optional(),
        }),
      )
      .output(z.object({ slug: z.string() }).nullable()),

    // La ricerca globale (12f), sul catalogo intero e per titolo. Pubblica come
    // la home; da loggati ogni gioco porta lo stato che ha nel tuo backlog.
    // `total` è il conteggio prima di limit/offset, come nel backlog.
    // `inBacklog` divide il catalogo in due: `true` solo i giochi che hai nel
    // backlog, `false` tutti gli altri; senza, tutto. Da sloggati nessun gioco
    // è nel backlog.
    find: oc
      .input(
        z.object({
          q: z.string().trim().min(2).max(100),
          inBacklog: z.boolean().optional(),
          limit: z.number().int().min(1).max(60).default(24),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .output(
        z.object({ games: z.array(HomeGameSchema), total: z.number().int() }),
      ),

    // La seconda metà della ricerca globale: i giochi IGDB che Ludex non ha
    // ancora. Autenticata come `search`, per il rate limit. Non scrive: la
    // riga nasce con `fromIgdb`, quando l'utente sceglie un risultato.
    findOnIgdb: oc
      .input(z.object({ query: z.string().trim().min(2).max(100) }))
      .output(z.array(IgdbSearchHitSchema)),

    // Inserimento di un gioco non risolto, con il solo titolo. Via di scampo
    // quando IGDB non conosce il gioco: l'`igdbId` resta null e l'enrichment
    // dello step 3 non avrà nulla su cui lavorare finché non viene risolto.
    create: oc
      .input(z.object({ name: z.string().trim().min(1).max(200) }))
      .output(GameSchema),

    // Cerca su IGDB. Sincrona e senza coda: è il passo 2 del flusso di
    // risoluzione, distinto dall'enrichment asincrono dello step 3.
    // Autenticata perché consuma il rate limit delle nostre credenziali.
    // `platform` (uno slug nostro) restringe la ricerca per nome a ciò che è
    // uscito lì: fra i 20 risultati di un titolo comune la scheda giusta può
    // non esserci, e filtrarli dopo non la farebbe comparire.
    search: oc
      .input(
        z.object({
          query: z.string().trim().min(2).max(100),
          platform: z.string().min(1).optional(),
        }),
      )
      .output(z.array(IgdbSearchHitSchema)),

    // Scelto un candidato, crea la riga `games` **o riusa quella già presente**
    // se un altro utente aveva già importato lo stesso gioco. È qui che vive la
    // regola "l'enrichment si paga una volta sola".
    fromIgdb: oc
      .input(z.object({ igdbId: z.number().int().positive() }))
      .output(GameSchema),
  },

  accounts: {
    // Gli account di negozio collegati.
    list: oc.output(z.array(StoreAccountSchema)),

    // Dove mandare l'utente a fare il login, per i negozi che vogliono un
    // codice. Null per Steam, che non ha un login da fare: lì basta il profilo.
    //
    // L'indirizzo lo compone il server e non il client per una ragione che si
    // paga cara a sbagliarla: dentro ci sono `client_id` e `redirect_uri`, e
    // quest'ultimo deve combaciare **esattamente** con quello dello scambio del
    // codice. Tenuti in due punti diversi, prima o poi divergono.
    //
    // `state` è un valore opaco che deve tornare **intatto** a `link`: Amazon ci
    // mette il serial del dispositivo, che va deciso prima del login e ritrovato
    // dopo. Null per gli altri negozi. Il client lo tiene dal momento in cui
    // apre il login, non lo rilegge dopo.
    //
    // `accountId` quando si ricollega un account già presente: Amazon riusa il
    // suo dispositivo invece di registrarne un altro.
    loginUrl: oc
      .input(
        z.object({
          store: LinkableStoreSchema,
          accountId: z.uuid().nullish(),
        }),
      )
      .output(
        z.object({
          url: z.string().nullable(),
          state: z.string().nullable(),
        }),
      ),

    // Collega un negozio con quello che l'utente ha incollato.
    //
    // Un endpoint solo per tutti perché il gesto è lo stesso: si incolla una
    // stringa presa dal browser. Cosa sia dipende dal negozio — per Steam l'URL
    // del profilo, lo SteamID64 o il nome scelto; per GOG l'indirizzo di
    // atterraggio dopo il login, col codice dentro — ma è il server a saperlo
    // interpretare, non il client.
    //
    // **Il campo non si chiama `code` apposta**: chi lo manda può averlo
    // ottenuto in modi diversi. Dal web lo incolla l'utente, da mobile lo
    // prenderà una WebView senza che nessuno lo veda. Questa procedura non deve
    // sapere quale dei due è stato, o legherebbe l'API al copia-incolla.
    //
    // Collegare fa partire subito il primo import: non ha senso far premere un
    // secondo bottone per avere i propri giochi.
    link: oc
      .input(
        z.object({
          store: LinkableStoreSchema,
          // Largo: un URL di atterraggio con dentro un codice di autorizzazione
          // supera comodamente i 200 caratteri.
          value: z.string().trim().min(1).max(2000),
          // Come vuole chiamarlo l'utente. Opzionale, e quasi sempre vuota: il
          // nome del negozio basta finché di account ce n'è uno. Serve quando
          // ce ne sono due della stessa persona, dove nessun dato dell'API li
          // separa — su Amazon rendono lo stesso nome di battesimo.
          label: z.string().trim().max(60).nullish(),
          // Lo `state` reso da `loginUrl`, così com'era.
          state: z.string().max(200).nullish(),
          // L'account che si sta ricollegando. Se il negozio ne rende un altro
          // — su Amazon succede quando la sessione del sito è sull'account
          // legato — il collegamento si rifiuta con CONFLICT, invece di
          // aggiornare in silenzio l'altro.
          accountId: z.uuid().nullish(),
          // La soglia «conta come giocato», dove il negozio dà i tempi
          // (`playtimeStoreValues`): vale già per il primo import. Nulla =
          // spenta; assente = resta quella che c'era, su un ricollegamento.
          playedMinMinutes: PlayedMinMinutesSchema.nullish(),
        }),
      )
      .output(StoreAccountSchema),

    // Il login Steam col QR (9f): un secondo modo di collegare Steam, accanto al
    // profilo incollato, che porta con sé la famiglia. Sono due modi della stessa
    // riga — la chiave è lo SteamID64 — quindi farli uno dopo l'altro non
    // duplica niente.
    //
    // Non passa da `link`: il QR non è un valore che l'utente incolla, è una
    // sessione che il server tiene aperta mentre lui inquadra e conferma
    // nell'app. `start` apre la sessione e rende il QR; `status` si interroga a
    // intervalli; a `done` l'account è già scritto e l'import accodato.
    steamLogin: {
      // `accountId` quando si ricollega un account già presente: se il login è
      // fatto con un altro account Steam lo stato è `failed` con
      // `wrong_account`, e nessuna riga viene toccata. Una sola sessione attiva
      // per utente: aprirne una nuova annulla la precedente.
      start: oc
        .input(
          z.object({
            label: z.string().trim().max(60).nullish(),
            accountId: z.uuid().nullish(),
            // Come per `link`.
            playedMinMinutes: PlayedMinMinutesSchema.nullish(),
          }),
        )
        .output(SteamLoginStartSchema),

      // Il token web incollato: l'altro modo di collegare Steam con la famiglia,
      // **senza sessione sul nostro conto**. Vale 24 ore e non si rinnova. Il
      // token non è valido: BAD_REQUEST. Su un ricollegamento di un altro
      // account: CONFLICT, come per `link`.
      token: oc
        .input(
          z.object({
            token: z.string().trim().min(1).max(8000),
            label: z.string().trim().max(60).nullish(),
            accountId: z.uuid().nullish(),
            playedMinMinutes: PlayedMinMinutesSchema.nullish(),
          }),
        )
        .output(StoreAccountSchema),

      status: oc
        .input(z.object({ loginId: z.uuid() }))
        .output(SteamLoginStatusSchema),

      // Toglie il solo login: l'account, il profilo e i giochi propri restano, le
      // copie della famiglia escono. CONFLICT se un import è in corso, come per
      // lo scollegamento.
      remove: oc
        .input(z.object({ accountId: z.uuid() }))
        .output(SteamLoginRemovedSchema),
    },

    // Il login Xbox col device code (9e). Non passa da `link`, come il QR di
    // Steam: `start` apre la sessione e rende il codice da confermare su
    // microsoft.com/link, `status` si interroga a intervalli, e a `done`
    // l'account è scritto e l'import accodato. Le piattaforme spuntate, il Game
    // Pass attivo e la soglia dei minuti si scelgono qui e stanno nel
    // credenziale; si cambiano con `xboxSettings`. `accountId` su un ricollegamento, con `wrong_account` se il
    // login è di un altro account. Una sola sessione attiva per utente.
    xboxLogin: {
      start: oc
        .input(
          z.object({
            platforms: z.array(XboxPlatformSchema).min(1),
            gamePassActive: z.boolean(),
            minMinutes: PlayedMinMinutesSchema,
            label: z.string().trim().max(60).nullish(),
            accountId: z.uuid().nullish(),
          }),
        )
        .output(XboxLoginStartSchema),

      status: oc
        .input(z.object({ loginId: z.uuid() }))
        .output(XboxLoginStatusSchema),
    },

    // Cambia le piattaforme spuntate, il Game Pass e la soglia dei minuti di un
    // account Xbox (9e), **senza un login**: è una scelta nostra, non di
    // Microsoft. Le riscrive nel credenziale e accoda l'import. Le copie già
    // importate restano, anche su una piattaforma tolta o sotto una soglia
    // alzata. `FORBIDDEN` se l'account va ricollegato, `CONFLICT` con un
    // import in corso.
    xboxSettings: oc
      .input(
        z.object({
          accountId: z.uuid(),
          platforms: z.array(XboxPlatformSchema).min(1),
          gamePassActive: z.boolean(),
          minMinutes: PlayedMinMinutesSchema,
        }),
      )
      .output(z.void()),

    // La soglia «conta come giocato» di un account Steam, PSN o Nintendo
    // (plans/soglia-giocato.md); Xbox ha la sua in `xboxSettings`. Nulla =
    // spenta. Accesa, vale **subito** su tutto ciò che l'account ha già: i
    // giochi ancora in `backlog` con almeno tanti minuti passano a `played`.
    // Non serve un import, e non ne accoda. `NOT_FOUND` su un account che non
    // c'è o di un negozio senza tempi.
    playedThreshold: oc
      .input(
        z.object({
          accountId: z.uuid(),
          minMinutes: PlayedMinMinutesSchema.nullable(),
        }),
      )
      .output(z.object({ promoted: z.number().int() })),

    // Rinomina un account già collegato. Esiste separata da `link` perché
    // altrimenti etichettare quelli che hai già vorrebbe dire scollegarli e
    // rifare il giro dal browser per scrivere un campo di testo. Vuota = togli.
    rename: oc
      .input(
        z.object({
          accountId: z.uuid(),
          label: z.string().trim().max(60).nullish(),
        }),
      )
      .output(StoreAccountSchema),

    // Cosa si porterebbe via lo scollegamento. Si chiede **prima** di aprire la
    // scelta, perché «84 giochi» non dice quanti ne spariscono davvero: quelli
    // che stanno anche su GOG restano, e fra gli altri ce ne possono essere con
    // un voto o dei tag dell'utente.
    unlinkImpact: oc
      .input(z.object({ accountId: z.uuid() }))
      .output(UnlinkImpactSchema),

    // Scollega un account, in uno dei due modi.
    //
    // `keep` — i giochi restano suoi, come se li avesse inseriti a mano. La riga
    // dell'account sopravvive senza credenziali, perché è l'unica cosa che
    // ricordi da quale dei due account Amazon veniva un gioco.
    //
    // `purge` — i possessi di quell'account se ne vanno, e con loro le righe di
    // backlog che restano senza nessun possesso: voto, note e tag compresi.
    //
    // Non c'è un default: la scelta la fa l'utente nel dialogo, e un default qui
    // vorrebbe dire che un client distratto ne cancella una a caso.
    unlink: oc
      .input(
        z.object({
          accountId: z.uuid(),
          ownerships: z.enum(['keep', 'purge']),
        }),
      )
      .output(z.void()),

    // Rilancia l'import della libreria di un account già collegato.
    sync: oc.input(z.object({ accountId: z.uuid() })).output(z.void()),

    // Importa (o aggiorna) la wishlist del negozio di un account, 15e: **su
    // richiesta**, mai in automatico. La lista nasce al primo import e lì si
    // aggiorna. `FORBIDDEN` se l'account va ricollegato, `CONFLICT` se
    // l'importazione è già in corso, `BAD_REQUEST` se il negozio non ha una
    // wishlist che si legga.
    syncWishlist: oc.input(z.object({ accountId: z.uuid() })).output(z.void()),

    // Rilancia l'import di tutti gli account collegati. Non fallisce per uno
    // solo: chi è da ricollegare o sta già importando si salta e si conta.
    syncAll: oc.output(SyncAllResultSchema),

    // Accende o spegne l'aggiornamento automatico di un account. Esiste per le
    // librerie che non cambiano più: aggiornarle è solo lavoro buttato.
    setAutoSync: oc
      .input(z.object({ accountId: z.uuid(), autoSync: z.boolean() }))
      .output(StoreAccountSchema),
  },

  settings: {
    // Le preferenze, coi default per chi non ne ha mai cambiata una.
    get: oc.output(UserSettingsSchema),

    // Scrive solo i campi che arrivano: gli altri restano come sono.
    update: oc.input(UserSettingsSchema.partial()).output(UserSettingsSchema),
  },

  // L'esportazione dei propri dati (step 16). La cancellazione no: passa da
  // Better Auth, con la password.
  accountData: {
    export: oc.output(AccountExportSchema),
  },

  imports: {
    // Le voci che l'import non ha saputo legare a un gioco.
    unresolved: oc.output(z.array(UnresolvedImportSchema)),

    // L'utente sceglie il gioco giusto su IGDB: la voce diventa un gioco nel
    // backlog, col possesso del negozio da cui veniva, e sparisce dalla lista.
    resolve: oc
      .input(z.object({ id: z.uuid(), igdbId: z.number().int().positive() }))
      .output(BacklogEntrySchema),

    // Nasconde una voce, dicendo perché, o la rimette fra i «da sistemare» con
    // `kind: null`. Era `dismiss`, che cancellava la riga — e il prossimo
    // import la riportava, perché nella libreria la voce c'è ancora.
    setHidden: oc
      .input(z.object({ id: z.uuid(), kind: HiddenKindSchema.nullable() }))
      .output(z.void()),
  },

  tags: {
    // Il vocabolario personale, da cui si spunta invece di riscrivere ogni volta.
    list: oc.output(z.array(UserTagSchema)),

    // Toglie una parola dal vocabolario. Non è "stacca il tag da questo gioco" —
    // per quello basta togliere la spunta: qui il tag **sparisce da tutti i
    // giochi**, per via del cascade sul raccordo. Esiste perché con una lista da
    // spuntare un refuso resterebbe a schermo per sempre.
    remove: oc.input(z.object({ id: z.uuid() })).output(z.void()),
  },

  // Le playlist (step 15a): filtri del backlog salvati con un nome. Tutte
  // partono dall'utente: una playlist altrui è `NOT_FOUND`, non «vietata».
  playlists: {
    // Nell'ordine che l'utente ha scelto (`move`); a parità, per nome.
    list: oc.output(z.array(PlaylistSchema)),

    // La playlist **aperta**: la sua query eseguita, con la pagina chiesta dal
    // chiamante. La paginazione non sta nella query salvata.
    //
    // `q`, `sort` e `direction` sono la vista di chi guarda e **non cambiano la
    // playlist**: coprono, per questa apertura, quelli salvati. Una `q` chiesta
    // sostituisce quella salvata, non si somma.
    get: oc
      .input(
        z.object({
          id: z.uuid(),
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
          q: PlaylistQuerySchema.shape.q,
          sort: BacklogSortSchema.optional(),
          direction: SortDirectionSchema.optional(),
        }),
      )
      .output(PlaylistDetailSchema),

    // `CONFLICT` se l'utente ha già una playlist con quel nome, senza guardare
    // le maiuscole. Va in fondo all'elenco.
    create: oc
      .input(z.object({ name: PlaylistNameSchema, query: PlaylistQuerySchema }))
      .output(PlaylistSchema),

    // Rinomina, riscrive i filtri, o tutte e due. Chi non manda un campo lo
    // lascia com'è.
    update: oc
      .input(
        z.object({
          id: z.uuid(),
          name: PlaylistNameSchema.optional(),
          query: PlaylistQuerySchema.optional(),
        }),
      )
      .output(PlaylistSchema),

    remove: oc.input(z.object({ id: z.uuid() })).output(z.void()),

    // Il link pubblico (step 15d). `share` rende quello che c'è, o ne crea uno:
    // chiamarla due volte dà lo stesso link. `unshare` lo toglie e il link smette
    // di funzionare subito; ricondividere ne dà uno nuovo.
    share: oc
      .input(z.object({ id: z.uuid() }))
      .output(z.object({ token: ShareTokenSchema })),
    unshare: oc.input(z.object({ id: z.uuid() })).output(z.void()),

    // Sposta di un posto verso l'alto o verso il basso nell'elenco dell'utente.
    // Spostare la prima su, o l'ultima giù, non fa niente e non è un errore.
    move: oc
      .input(z.object({ id: z.uuid(), direction: z.enum(['up', 'down']) }))
      .output(z.void()),
  },

  // L'import da CSV (10): giochi da un file, per esempio l'export di Playnite.
  // **Non è una libreria**: non ha schede fra gli account, e i giochi che
  // entrano nel backlog col file prendono il tag `tag`.
  csvImport: {
    // Il file si legge subito: un formato sbagliato torna come BAD_REQUEST con
    // `data: { reason, missing }` (le colonne obbligatorie che mancano). Il
    // riconoscimento dei giochi lo fa il worker, un import per negozio.
    //
    // `tag` lo compone il client nella lingua di chi carica: «Importato il
    // 19/10/2026». 10 MB bastano largamente: l'export di Playnite con tutti i
    // campi, descrizioni comprese, fa 50 KB ogni cento giochi.
    upload: oc
      .input(
        z.object({
          file: z.file().max(10 * 1024 * 1024),
          tag: z.string().trim().min(1).max(60),
          // Le righe tolte nell'anteprima, coi numeri che lei ha dato.
          exclude: z.array(z.number().int().min(0)).max(100_000).default([]),
        }),
      )
      .output(
        z.object({
          // Il tag del file, già creato: il resoconto ci filtra il backlog.
          tagId: z.uuid().nullable(),
          queued: z.array(
            z.object({ store: StoreSchema, entries: z.number().int() }),
          ),
          alreadyRunning: z.array(StoreSchema),
          noStore: z.record(z.string(), z.number().int()),
          noPlatform: z.number().int(),
          duplicates: z.number().int(),
        }),
      ),

    // L'anteprima: cosa farebbe `upload`, riga per riga, senza scrivere niente
    // e senza IGDB. Il gioco si dice solo dove l'id è già noto a Ludex; gli
    // altri sono `unknown` e li riconoscerà il worker. Stessi errori di formato
    // di `upload`.
    preview: oc
      .input(z.object({ file: z.file().max(10 * 1024 * 1024) }))
      .output(
        z.object({
          rows: z.array(
            z.object({
              index: z.number().int(),
              name: z.string(),
              source: z.string(),
              store: StoreSchema.nullable(),
              platform: z.string().nullable(),
              status: BacklogStatusSchema,
              outcome: z.enum(['new', 'in_backlog', 'unknown', 'skipped']),
              skipReason: z
                .enum(['no_store', 'platform', 'duplicate'])
                .nullable(),
              game: z.object({ name: z.string(), slug: z.string() }).nullable(),
            }),
          ),
        }),
      ),

    // Per il riquadro in Librerie: l'ultimo import finito e se ce n'è uno in
    // corso. Il tag non serve: è la data, scritta nella lingua di chi guarda.
    status: oc.output(
      z.object({ lastImportAt: z.date().nullable(), syncing: z.boolean() }),
    ),
  },

  // Le liste a mano (step 15b): giochi che non hai ancora e vuoi tenere d'occhio.
  // Stanno in `playlists` col tipo `wishlist`, e **non si confondono** con le
  // playlist a filtro: ognuno dei due vede e tocca solo il proprio.
  wishlists: {
    // Nell'ordine scelto (`move`); a parità, per nome.
    list: oc.output(z.array(WishlistSchema)),

    // `CONFLICT` se hai già una lista con quel nome, maiuscole a parte.
    create: oc
      .input(z.object({ name: PlaylistNameSchema }))
      .output(WishlistSchema),
    rename: oc
      .input(z.object({ id: z.uuid(), name: PlaylistNameSchema }))
      .output(WishlistSchema),
    // Toglie la lista e le sue voci, non i giochi. Vale anche per la wishlist di un
    // negozio (15e): sparisce con le sue voci da sistemare, si reimporta dalla
    // scheda dell'account, e l'aggiornamento automatico non la ricrea. `CONFLICT`
    // se il suo import è in corso.
    remove: oc.input(z.object({ id: z.uuid() })).output(z.void()),
    move: oc
      .input(z.object({ id: z.uuid(), direction: z.enum(['up', 'down']) }))
      .output(z.void()),

    // La lista aperta: ricerca sul titolo, ordine e pagina. I giochi che hai nel
    // backlog non ci sono, anche se la voce c'è ancora.
    get: oc
      .input(
        z.object({
          id: z.uuid(),
          q: z.string().trim().min(1).max(100).optional(),
          sort: WishlistSortSchema.default('addedAt'),
          direction: SortDirectionSchema.default('desc'),
          limit: z.number().int().min(1).max(200).default(50),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .output(WishlistGamesSchema),

    // Mette un gioco in una lista. Senza `listId` va nella prima lista, e se non
    // ne hai nessuna ne crea una che si chiama «Wishlist»: chi vuole solo mettere
    // da parte un gioco non deve inventare un nome. `CONFLICT` se il gioco è già
    // nel tuo backlog. Ripeterla non fa niente.
    add: oc
      .input(z.object({ gameId: z.uuid(), listId: z.uuid().optional() }))
      .output(WishlistSchema),
    removeGame: oc
      .input(z.object({ listId: z.uuid(), gameId: z.uuid() }))
      .output(z.void()),

    // Le voci di una **lista di negozio** (15e) che l'import non ha saputo legare
    // a un gioco, nascoste comprese. `NOT_FOUND` se la lista non è una tua lista
    // di negozio.
    unresolved: {
      list: oc
        .input(z.object({ listId: z.uuid() }))
        .output(z.array(WishlistUnresolvedSchema)),

      // L'utente sceglie il gioco giusto su IGDB: entra nella lista di quell'account
      // (non nel backlog) e la voce sparisce. Su Steam e GOG vale per tutti da quel
      // momento; su PSN fino al prossimo aggiornamento della lista.
      resolve: oc
        .input(z.object({ id: z.uuid(), igdbId: z.number().int().positive() }))
        .output(z.void()),

      // Mette da parte una voce che non è un gioco, o la rimette fra quelle da
      // sistemare.
      setHidden: oc
        .input(z.object({ id: z.uuid(), hidden: z.boolean() }))
        .output(z.void()),
    },

    // Le tue liste, con un `has` per dire in quali sta già il gioco: è il menu
    // della scheda del gioco.
    forGame: oc
      .input(z.object({ gameId: z.uuid() }))
      .output(z.array(WishlistMembershipSchema)),
  },

  // Le playlist condivise (step 15d): **pubbliche**, per chi ha il link. Il
  // proprietario non compare e dei suoi giochi esce solo ciò che il catalogo già
  // mostra; vedi `SharedPlaylistSchema`. Un link sconosciuto e uno revocato
  // rispondono `NOT_FOUND` allo stesso modo.
  sharedPlaylists: {
    get: oc
      .input(
        z.object({
          token: ShareTokenSchema,
          // Più basso del backlog (200): è una query che chiunque può lanciare.
          // 140 sono le 20 righe più grandi del menu per pagina, a 7 colonne
          // (`maxSharedPageSize` nel web).
          limit: z.number().int().min(1).max(140).default(30),
          offset: z.number().int().min(0).default(0),
        }),
      )
      .output(SharedPlaylistSchema),
  },

  backlog: {
    // Il filtraggio dello step 7 sta qui dentro e non in una `search` gemella:
    // la forma di una riga di backlog è definita in un posto solo, e due
    // procedure che rendono la stessa cosa divergerebbero al primo campo nuovo.
    // Senza criteri è la lista di prima.
    list: oc.input(BacklogQuerySchema).output(BacklogListSchema),

    // Di che cosa si compone il pannello dei filtri: solo i valori che compaiono
    // davvero nel backlog di chi guarda.
    filterOptions: oc.output(BacklogFilterOptionsSchema),

    // Almeno un possesso è obbligatorio: la piattaforma è il filtro hard del
    // motore decisionale, e una riga senza piattaforma sarebbe invisibile a
    // "stasera ho la Switch accesa".
    add: oc
      .input(
        z.object({
          gameId: z.uuid(),
          status: BacklogStatusSchema.default('backlog'),
          ownerships: z.array(OwnershipInputSchema).min(1),
        }),
      )
      .output(BacklogEntrySchema),

    setStatus: oc
      .input(z.object({ id: z.uuid(), status: BacklogStatusSchema }))
      .output(BacklogEntrySchema),

    // I campi personali dello step 5. Ogni campo è **opzionale e distingue
    // assente da null**: assente vuol dire "non toccare", `null` vuol dire
    // "togli". Senza questa distinzione un form che manda solo il voto
    // cancellerebbe le note.
    //
    // I tag si mandano interi, non a differenza: il server riscrive l'insieme,
    // come fa l'enrichment con gli attributi IGDB. È ciò che rende la
    // mutazione idempotente e toglie di mezzo un endpoint "stacca tag".
    update: oc
      .input(
        z.object({
          id: z.uuid(),
          status: BacklogStatusSchema.optional(),
          rating: RatingSchema.nullish(),
          notes: NotesSchema.nullish(),
          tags: z.array(UserTagInputSchema).max(50).optional(),
          // Solo assente o una data: la colonna non è mai vuota, e «togli la
          // data» non vuol dire niente.
          addedAt: z.date().optional(),
        }),
      )
      .output(BacklogEntrySchema),

    // Aggiunge una piattaforma a un gioco già nel backlog: fino a qui l'unico
    // modo era cancellare la riga e rifarla. Idempotente — riaggiungere lo
    // stesso possesso non è un errore e non duplica nulla.
    addOwnership: oc
      .input(z.object({ id: z.uuid(), ownership: OwnershipInputSchema }))
      .output(BacklogEntrySchema),

    // Toglie una copia: il disco che l'import ha dedotto male, la piattaforma
    // aggiunta per sbaglio. **Non basta cancellare la riga** — il prossimo
    // import la rimette, e su PSN gira da solo ogni tre giorni — quindi il
    // rifiuto resta scritto accanto, in `ownership_rejections`, e l'import lo
    // rispetta. Riaggiungere a mano quella copia lo cancella: è l'unico modo
    // di tornare indietro, e vale anche come «annulla».
    //
    // L'ultimo possesso non si toglie, per la stessa ragione per cui `add` ne
    // chiede almeno uno: un gioco senza piattaforma è invisibile al filtro
    // hard del motore decisionale. Chi vuole togliere tutto rimuove il gioco.
    removeOwnership: oc
      .input(z.object({ id: z.uuid(), ownershipId: z.uuid() }))
      .output(BacklogEntrySchema),

    // Nasconde il gioco dalla lista, o lo rimette. Il possesso resta: non è
    // «non ce l'ho», è «non lo voglio vedere». E non è `excluded`.
    setHidden: oc
      .input(z.object({ id: z.uuid(), hidden: z.boolean() }))
      .output(BacklogEntrySchema),

    remove: oc.input(z.object({ id: z.uuid() })).output(z.void()),
  },

  // Le segnalazioni dell'utente (11a): «questo gioco è sbagliato», dalla
  // pagina del gioco. Le corregge un admin.
  reports: {
    // Una segnalazione per cosa; una già aperta sulla stessa cosa si aggiorna.
    // La copia di un negozio si segnala solo se è tua. Rende le aperte.
    create: oc
      .input(
        z.object({
          gameId: z.uuid(),
          targets: z.array(ReportTargetSchema).min(1).max(5),
          suggestedIgdbId: z.number().int().positive().optional(),
          suggestedName: z.string().trim().min(1).max(200).optional(),
          note: z.string().trim().min(1).max(1000).optional(),
        }),
      )
      .output(z.array(OpenReportSchema)),

    // Le tue aperte su un gioco: il «Segnalato il …» al posto del bottone.
    openForGame: oc
      .input(z.object({ gameId: z.uuid() }))
      .output(z.array(OpenReportSchema)),

    // Le tue copie dei negozi su un gioco, con l'id e il titolo del negozio:
    // in «Segnala un errore» si vede che cos'è davvero la copia segnalata.
    myCopies: oc
      .input(z.object({ gameId: z.uuid() }))
      .output(z.array(MyCopySchema)),
  },

  // Solo admin (11a): li protegge il middleware `admin`, non il client.
  admin: {
    missing: {
      // La tabellina di «Dati mancanti».
      summary: oc.output(MissingSummarySchema),

      // Una cella della tabellina, aperta. Prima i giochi con più utenti.
      list: oc
        .input(
          z.object({
            source: EnrichmentSourceSchema,
            bucket: MissingBucketSchema,
            reason: SourceReasonSchema.optional(),
            q: z.string().trim().min(1).max(100).optional(),
            limit: z.number().int().min(1).max(100).default(50),
            offset: z.number().int().min(0).default(0),
          }),
        )
        .output(MissingListSchema),
    },

    sources: {
      // «Ritenta»: in coda così com'è, col suo id se ce l'ha.
      retry: oc
        .input(z.object({ gameId: z.uuid(), source: EnrichmentSourceSchema }))
        .output(z.void()),

      // Di quale gioco è già un id: l'avviso del dialogo prima di salvare.
      // `externalId` è quello che l'admin ha incollato, id o indirizzo.
      lookup: oc
        .input(
          z.object({
            gameId: z.uuid(),
            source: ManualSourceSchema,
            externalId: z.string().trim().min(1).max(300),
          }),
        )
        .output(
          z.object({
            externalId: z.string(),
            owner: z
              .object({ id: z.uuid(), name: z.string(), slug: z.string() })
              .nullable(),
          }),
        ),

      // «Cerca» nel dialogo «Inserisci id»: il testo come nome sulla fonte.
      // HLTB e Metacritic non costano; OpenCritic sì, una delle 25 ricerche
      // del giorno, e dopo dice quante ne restano.
      search: oc
        .input(
          z.object({
            source: ManualSourceSchema,
            query: z.string().trim().min(2).max(100),
          }),
        )
        .output(
          z.object({
            hits: z.array(
              z.object({
                id: z.string(),
                name: z.string(),
                releaseYear: z.number().int().nullable(),
                // La copertina sulla fonte, dove la ricerca la dà.
                image: z.string().nullable(),
              }),
            ),
            searchesLeft: z.number().int().nullable(),
          }),
        ),

      // «Inserisci id»: scritto a mano, esente dall'unicità, e in coda. Vale
      // anche su una fonte `ok` agganciata male.
      setExternalId: oc
        .input(
          z.object({
            gameId: z.uuid(),
            source: ManualSourceSchema,
            externalId: z.string().trim().min(1).max(300),
          }),
        )
        .output(z.object({ externalId: z.string() })),
    },

    reports: {
      // Le segnalazioni aperte, una riga per gioco e cosa.
      list: oc
        .input(
          z.object({
            limit: z.number().int().min(1).max(100).default(50),
            offset: z.number().int().min(0).default(0),
          }),
        )
        .output(
          z.object({
            rows: z.array(ReportGroupSchema),
            total: z.number().int(),
          }),
        ),

      // «Archivia»: chiude senza correggere.
      archive: oc
        .input(z.object({ gameId: z.uuid(), target: ReportTargetSchema }))
        .output(z.object({ closed: z.number().int() })),
    },

    // Le copie su una piattaforma dove il gioco non è uscito (9b): l'ultima
    // spiaggia dopo la regola dell'import. Una riga per gioco.
    platformMismatches: {
      // `dismissed`: quelle segnate «va bene così», per annullarle.
      list: oc
        .input(
          z.object({
            dismissed: z.boolean().default(false),
            limit: z.number().int().min(1).max(100).default(50),
            offset: z.number().int().min(0).default(0),
          }),
        )
        .output(
          z.object({
            rows: z.array(PlatformMismatchSchema),
            total: z.number().int(),
          }),
        ),

      // «Va bene così»: è IGDB che non ha la piattaforma.
      dismiss: oc
        .input(
          z.object({
            gameId: z.uuid(),
            platformSlugs: z.array(z.string().min(1).max(100)).min(1).max(20),
          }),
        )
        .output(z.void()),

      // Annulla il «va bene così».
      restore: oc
        .input(
          z.object({
            gameId: z.uuid(),
            platformSlugs: z.array(z.string().min(1).max(100)).min(1).max(20),
          }),
        )
        .output(z.void()),
    },

    games: {
      // I giochi senza id IGDB.
      unlinked: oc
        .input(
          z.object({
            q: z.string().trim().min(1).max(100).optional(),
            limit: z.number().int().min(1).max(100).default(50),
            offset: z.number().int().min(0).default(0),
          }),
        )
        .output(
          z.object({
            rows: z.array(UnlinkedGameSchema),
            total: z.number().int(),
          }),
        ),

      // «Collega a IGDB». Se l'id è già di un altro gioco non scrive niente e
      // rende quell'altro: i due vanno fusi (11b).
      linkIgdb: oc
        .input(
          z.object({ gameId: z.uuid(), igdbId: z.number().int().positive() }),
        )
        .output(LinkIgdbResultSchema),

      // La fusione di due giochi, anteprima: non scrive niente. I due id si
      // passano in qualunque ordine; sopravvive quello con `igdbId`.
      mergePreview: oc
        .input(z.object({ gameId: z.uuid(), otherId: z.uuid() }))
        .output(MergePreviewSchema),

      // La fusione. Non si disfa.
      merge: oc
        .input(z.object({ gameId: z.uuid(), otherId: z.uuid() }))
        .output(MergeResultSchema),

      // La scheda admin di un gioco.
      detail: oc
        .input(z.object({ slug: z.string().min(1).max(200) }))
        .output(GameAdminDetailSchema),
    },

    links: {
      // «Non è questo gioco», anteprima: non scrive niente.
      repointPreview: oc
        .input(
          z.object({ linkId: z.uuid(), igdbId: z.number().int().positive() }),
        )
        .output(RepointPreviewSchema),

      // «Non è questo gioco»: ripunta la riga e sposta le copie di quel negozio.
      repoint: oc
        .input(
          z.object({ linkId: z.uuid(), igdbId: z.number().int().positive() }),
        )
        .output(
          z.object({ wholeRows: z.number().int(), copies: z.number().int() }),
        ),

      // «Scollega»: toglie la riga e nient'altro. Si rifiuta se è l'unico id di
      // quel negozio sul gioco: quello è ripuntare.
      unlink: oc.input(z.object({ linkId: z.uuid() })).output(z.void()),
    },

    users: {
      // Gli utenti, i più recenti prima, con giochi e account.
      list: oc
        .input(
          z.object({
            q: z.string().trim().min(1).max(100).optional(),
            limit: z.number().int().min(1).max(100).default(50),
            offset: z.number().int().min(0).default(0),
          }),
        )
        .output(
          z.object({ rows: z.array(AdminUserSchema), total: z.number().int() }),
        ),

      // Il ruolo. Il proprio non si toglie: si resterebbe senza admin.
      setRole: oc
        .input(z.object({ userId: z.string().min(1), role: AdminRoleSchema }))
        .output(z.void()),

      // Banna e chiude le sessioni. Senza scadenza è per sempre. Se stessi no.
      ban: oc
        .input(
          z.object({
            userId: z.string().min(1),
            reason: z.string().trim().min(1).max(200).optional(),
            expiresInDays: z.number().int().min(1).max(3650).optional(),
          }),
        )
        .output(z.void()),

      unban: oc.input(z.object({ userId: z.string().min(1) })).output(z.void()),

      // Chiude tutte le sessioni dell'utente: dovrà riaccedere.
      revokeSessions: oc
        .input(z.object({ userId: z.string().min(1) }))
        .output(z.void()),
    },

    unresolved: {
      // Gli scarti di tutti, una riga per chiave con almeno uno scarto visibile.
      list: oc
        .input(
          z.object({
            store: StoreSchema.optional(),
            q: z.string().trim().min(1).max(100).optional(),
            limit: z.number().int().min(1).max(100).default(50),
            offset: z.number().int().min(0).default(0),
          }),
        )
        .output(UnresolvedGroupListSchema),

      // La vista «Nascosti per tutti»: le regole scritte.
      globalHidden: oc.output(z.array(GlobalHiddenImportSchema)),

      // «Collega per tutti». Si rifiuta se la chiave è già di un altro gioco:
      // quello è ripuntare, e sta nella scheda admin del gioco.
      resolve: oc
        .input(
          z.object({
            store: StoreSchema,
            externalId: z.string().min(1).max(200),
            igdbId: z.number().int().positive(),
          }),
        )
        .output(z.object({ resolved: z.number().int() })),

      // «Nascondi per tutti», mai con `unwanted`.
      hide: oc
        .input(
          z.object({
            store: StoreSchema,
            externalId: z.string().min(1).max(200),
            kind: GlobalHiddenKindSchema,
          }),
        )
        .output(z.object({ hidden: z.number().int() })),

      // Toglie la regola; le righe già nascoste restano come sono.
      unhide: oc
        .input(
          z.object({
            store: StoreSchema,
            externalId: z.string().min(1).max(200),
          }),
        )
        .output(z.void()),
    },
  },

  events: {
    // Gli aggiornamenti in push: una connessione che resta aperta (SSE sulla
    // stessa /rpc) e porta un evento ogni volta che il worker cambia qualcosa
    // che la pagina mostra. Chi si riconnette rilegge tutto: gli eventi persi
    // nel frattempo non si recuperano.
    subscribe: oc.output(eventIterator(LiveEventSchema)),
  },
};
