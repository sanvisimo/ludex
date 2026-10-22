# Step 9g — Meta Quest

**Stato: in corso dal 22/10/2026**, segnato «in corso» nella roadmap. Fatto il
passo 1 (questo piano). Si fa adesso **solo lo studio e il probe**, fuori
dall'ordine di lavoro di [ordine-sviluppo](../docs/ordine-sviluppo.md)
(rilascio · 13 · mobile): costa poco e non tocca il rilascio. L'import vero si
mette in coda dopo, guardando i dati.

## Contesto

La roadmap pubblica ha `metaquest` («studio di fattibilità») e la migration
[0053](../packages/db/drizzle/0053_vr_platforms.sql) ha già i visori fra le
piattaforme: Oculus Quest (384), Meta Quest 2 (386), Meta Quest 3 (471),
Oculus Rift (385). Restano fuori «Oculus VR» (162) e Oculus Go (387).
Playnite non ha una libreria Meta Quest.

## Cosa dicono le fonti (lette, **non provate**)

[frame-control](https://github.com/saphid/frame-control/pull/93) (PR #93,
merged, con `docs/meta-library.md` e `ui/frame_meta.py`), che prende i fatti
da [OculusGraphQLApiLib](https://github.com/ComputerElite/OculusGraphQLApiLib),
QAVS, DownQuest e BSManager. frame-control dichiara di non aver mai provato il
login vero; dice però che un account vero ha reso 92 entitlement, 71 dei quali
app Quest, tutti `PERMANENT`.

- **il credenziale**: il cookie `oc_ac_at` di `secure.oculus.com`, che comincia
  per `OC`; dall'app per PC (solo Windows) un token `FRL`. L'utente lo incolla,
  come per EA ([guida di BSManager](https://github.com/Zagrios/bs-manager/wiki/How-to-obtain-your-Oculus-Token)).
  Nessun refresh token noto, e **quanto dura il cookie non lo dice nessuno**:
  è la misura che decide fra collegamento e importazione una tantum
  (`oneShotStoreValues`). «Uscire» dal sito o dall'app di solito lo chiude;
- **il formato del token** (BSManager, OculusGraphQLApiLib): `OC` o `FRL`,
  niente `%`, `|` o `:` (quelli sono token d'app o copie codificate), non `OC`
  seguito da 15 cifre;
- **l'API**: `POST https://graph.oculus.com/graphql`, form
  `application/x-www-form-urlencoded` con `access_token`, `doc_id`,
  `variables`. Il token va nel corpo, mai nell'URL. Token rifiutato:
  `OAuthException`, codice 190 (o 102), oppure 401/403;
- **le query sono salvate e opache** (`doc_id`): non si sa quali campi rendano
  finché non si chiamano.
  - «chi sono»: `4149322231793299` → `data.viewer.user {id, alias}`;
  - i posseduti: `4850747515044496`, `variables: {}` →
    `data.viewer.user.active_entitlements.nodes[]`, secondo il modello di
    OculusGraphQLApiLib con `active_state`, `grant_reason`, `grant_time`,
    `expiration_time`, `is_refundable`, `id` e `item` (un'applicazione:
    `id`, `display_name`, `platform`, `supported_hmd_platforms`, `category`,
    `is_concept` per App Lab, `release_date`, `genre_names`…);
- **la piattaforma dell'app**: `platform` vale `ANDROID_6DOF` per Quest, `PC`
  per Rift, `ANDROID_3DOF` per Go (frame-control lo dà per supposto);
- **nessuna paginazione**: nessuno dei tool pagina la lista;
- **cosa manca**: le ore di gioco. Non è detto se DLC e app non giochi arrivino
  mescolati ai giochi.

**IGDB** ha una sorgente esterna «Oculus» (id da verificare su
`/v4/external_game_sources`). Prima di metterla in `IGDB_SOURCES`
([igdb.ts](../apps/api/src/external/igdb.ts)) va misurato che i suoi uid siano
gli app id di Meta: Epic e PSN sono state proprio la trappola dell'uid
sbagliato.

## Regola di prudenza: l'account dell'utente non si stressa

È un'API interna non documentata, probabilmente contro i termini di Meta, e
l'account Meta è spesso legato a Facebook o Instagram. Come per Xbox e Steam
(vedi «Il blocco dell'account» in [negozi](../docs/negozi.md)): **il probe lo
lancia l'utente, una volta, concordato**. Due query in sola lettura e niente
altro: niente download, niente `securecdn.oculus.com`.

## I passi

Ognuno col suo «ok, procedi».

1. [x] questo piano, e `metaquest` «in corso» nella roadmap
       ([roadmap.ts](../apps/web/lib/roadmap.ts));
2. [ ] **il probe** `meta:probe` (`apps/api/src/scripts/meta-probe.ts`): il
       token da stdin; «chi sono», poi i posseduti; il JSON grezzo in un file
       locale fuori da git; un riassunto con i conteggi per `platform`,
       `active_state`, `grant_reason`, `supported_hmd_platforms`, `category`,
       `is_concept` e quali campi arrivano davvero; poi IGDB per sorgente con
       gli app id (la nostra chiave, non l'account dell'utente). La durata del
       token si misura rilanciando, giorni dopo, solo «chi sono» con lo stesso
       token: è un secondo contatto, da concordare;
3. [ ] **le decisioni** sui dati dell'utente: una tantum o collegamento; cosa è
       un gioco e cosa no (app, DLC, App Lab); Horizon+ come abbonamento
       (`grant_reason`, `expiration_time`); su che visore va la copia;
       risoluzione per sorgente IGDB o per nome; `grant_time` come data
       d'acquisto;
4. [ ] **il lato server**: `meta` in `storeValues` e `linkableStoreValues`,
       `external/meta.ts`, l'import, i test contro Postgres con il client
       stubbato al confine del modulo;
5. [ ] **la scheda in `/account`**: proposta scritta e wireframe prima del
       codice;
6. [ ] **il primo import vero**, con un foglio di revisione come
       [9e-xbox-revisione.csv](9e-xbox-revisione.csv);
7. [ ] **la documentazione**: «Meta Quest (9g)» in
       [negozi](../docs/negozi.md), [ordine-sviluppo](../docs/ordine-sviluppo.md)
       e la roadmap.

## Valori di partenza (da confermare al passo 3)

- la copia va **sul visore che l'utente spunta** collegando, come
  `xboxPlatformValues`, e solo se il gioco lo supporta
  (`supported_hmd_platforms`);
- Rift (`PC`) entra solo se l'utente spunta `oculus_rift`;
- Go resta fuori.
