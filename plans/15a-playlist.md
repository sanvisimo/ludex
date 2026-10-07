# Step 15a — Playlist

Filtri del backlog salvati con un nome, dinamici, con rotte loro. Le decisioni
di base sono in [docs/ordine-sviluppo.md](../docs/ordine-sviluppo.md) (step 15,
06/10/2026). Qui sotto: cosa si fa, in che ordine, e — man mano — cosa è
andato diversamente.

## Lotto A — Server

1. **Tabella `playlists`**
   ([packages/db/src/schema/playlists.ts](../packages/db/src/schema/playlists.ts)):
   `id`, `userId` (cascade), `name`, `query` (jsonb), `timestamps`. Unico su
   `(userId, lower(name))`, come `user_tags`. Migration da `pnpm db:generate`.
2. **Contratto**: `PlaylistQuerySchema` = `BacklogFilterSchema` senza `hidden`,
   più `sort` e `direction`. Niente `limit` e `offset` (paginazione) e niente
   `hidden` (è una vista). Router `playlists`: `list`, `get`, `create`,
   `update`, `remove`.
3. **Servizio** `apps/api/src/services/playlists.ts`: ogni lettura e scrittura
   parte da `userId`. `get` esegue la query salvata con `searchBacklog` e
   restituisce `missingTags`: i tag salvati per id che non esistono più (o non
   sono dell'utente) si tolgono dalla query prima di eseguirla, non la
   svuotano.
4. **Esportazione dell'account** (step 16): `playlists` nel file, con i tag
   per **nome** e non per id, come il resto dell'esportazione. La cancellazione
   passa da sola dalla FK in cascade.
5. **Test** su Postgres vero: isolamento fra utenti, nome unico senza
   distinzione di maiuscole, tag cancellato ignorato e segnalato, campo
   sconosciuto scartato da Zod senza rompere la playlist, esportazione.

## Lotto B — Schermate

Dopo A, e **prima del codice**: proposta scritta e wireframe in Excalidraw
(`/playlist`, `/playlist/$id`, «salva questi filtri» da `/backlog`).

## Rimandato alla 15b

La wishlist riusa questa tabella come «lista con nome», ma non ha una
`BacklogQuery`: la migration della 15b rende `query` nullable o aggiunge un
tipo di lista. Qui `query` è obbligatoria.
