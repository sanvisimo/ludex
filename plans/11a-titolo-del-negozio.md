# 11a — il titolo del negozio accanto all'id

Correzione dell'admin nata dal caso Epic del 13–14/10/2026.

## Il problema

Sulla scheda admin di _Shadow Tactics: Blades of the Shogun_ ci sono due id Epic,
`24f4bf69…` e `355de40c…`. Uno è il gioco, l'altro è _Aiko's Choice_ agganciato
male. «Non è questo gioco» chiede quale id ripuntare, e niente sulla pagina dice
quale sia quale: `external_ids` tiene solo il codice. Per Steam, GOG e Xbox c'è
il link alla pagina del negozio; per Epic e Amazon nemmeno quello. Lo si è
capito incrociando gli ordini Epic dell'utente, che per un gioco che non è nella
propria libreria non ci sono.

## La decisione

Una colonna `external_ids.store_title`, nullable: il nome che il negozio dà a
quell'id, come l'ha visto l'ultimo import. L'import lo ha già in mano per ogni
voce (è il nome con cui cerca su IGDB) e finora lo buttava.

**Chi la scrive:**

1. `importLibrary`, per **tutte** le voci risolte, nuove e già note, solo dove il
   titolo è cambiato. Un passo solo dopo il collegamento, per tutti i negozi;
   riempie anche le righe che esistono già.
2. La risoluzione a mano di uno scarto, dell'utente e dell'admin, e quella degli
   scarti della wishlist: lo scarto il nome ce l'ha.

I collegamenti portati da IGDB (gli appid dell'enrichment) restano senza titolo
finché qualcuno non li importa. Hanno il link alla pagina del negozio.

**Dove si vede:** nella tabella «Collegamenti dai negozi» una colonna «Sul
negozio», e nella riga in alto del dialog «Non è questo gioco».

## Passi

- [x] schema + migration (`pnpm db:generate`)
- [x] `importLibrary` scrive il titolo
- [x] risoluzione a mano degli scarti (utente, admin, wishlist)
- [x] contracts, `gameAdminDetail`, tabella e dialog nell'admin, messaggi
- [x] test: titolo sui collegamenti nuovi e su quelli noti, aggiornato al reimport
- [x] `docs/modello-dati.md`

## Verifica

`pnpm --filter api test`, `pnpm check-types`, `pnpm lint`. Sul mini PC: deploy,
reimport Epic, e la scheda di Shadow Tactics mostra quale dei due id è Aiko's
Choice.

## Aggiunta: la copertina (14/10/2026)

Il titolo da solo ha ingannato: per `24f4bf69…` Epic manda «Shadow Tactics
Blades of the Shogun», e quell'id è _Aiko's Choice_. Lo dicono la data d'ingresso
in libreria e il namespace, che coincidono con l'ordine «Shadow Tactics - Aiko's
Choice» del 05/01/2023. La copertina che Epic dà a quella voce invece è quella
giusta.

- [x] `external_ids.store_image_url` + migration
- [x] l'import la scrive insieme al titolo; una voce senza copertina non la
      cancella (Steam non ne manda, la compone `storeCoverUrl`)
- [x] la risoluzione a mano degli scarti, libreria e wishlist, scrive la loro
- [x] admin: copertina accanto al titolo nella tabella e nel dialog, con
      `UnresolvedCover`
- [x] test e `docs/modello-dati.md`

**La data no.** È la data della copia di ciascun utente, non dell'id, e le copie
non sanno da quale id sono nate: per averla per id andrebbe cambiato il modello
delle copie. Deciso di non farlo.
