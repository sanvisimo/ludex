# 9b — La lista delle piattaforme sbagliate, una pagina sua

Ritocco dell'admin nato correggendo la lista del 9b
([9b-psn-nomi-tagliati](9b-psn-nomi-tagliati.md)) per il mini PC
([minipc-correzioni](minipc-correzioni.md)), 15/10/2026. Lavoro dell'admin: la
roadmap non cambia.

## Com'è oggi

In admin → «Segnalati», sotto le segnalazioni, la tabella «Copie su una
piattaforma dove il gioco non è uscito»
([platform-mismatches.tsx](../apps/web/components/admin/platform-mismatches.tsx)):
Gioco · anno, Copie (negozio · piattaforme), «IGDB lo dà su», Utenti, «Apri» e
«Va bene così». «Apri» porta alla scheda admin del gioco, dove si corregge con
«Non è questo gioco» ([repoint-dialog.tsx](../apps/web/components/admin/repoint-dialog.tsx)).
Lì però non si vede né su che console stanno le copie né su cosa è uscito ogni
risultato IGDB: per scegliere fra _Final Fantasy IX_ del 2000, il port del
2016 e quello del 2017 bisogna aprire IGDB.

## La proposta

Decisa dall'utente il 15/10/2026. **Nessun wireframe**: è la stessa schermata
in una pagina nuova, e due righe in più in un dialogo che c'è già.

1. **Una rotta sua**, `/admin/platforms`, con la sua voce nel menu dell'admin
   e il numero delle righe, come scarti e segnalazioni. `PlatformMismatches`
   ci si sposta così com'è, ed esce da «Segnalati».
2. **La copertina sulla riga**, piccola, nella colonna «Gioco». **Titolo e
   copertina sono il link** alla scheda admin del gioco. `listPlatformMismatches`
   rende anche la copertina, che oggi non passa. «Apri» resta.
3. **«Non è questo gioco»**:
   - in testa, sotto la riga di oggi («PlayStation Store · CUSA53711_00 «Call
     of Duty® Modern Warfare 3» → oggi: Call of Duty: Modern Warfare 3»), le
     copie di quel negozio con le piattaforme, come la colonna 2 della lista:
     «PlayStation Store · Sony PlayStation 4, Sony PlayStation 5». Un campo
     nuovo sul collegamento della scheda admin (`GameAdminDetail.links`): i
     nomi delle piattaforme delle copie di quel negozio;
   - fra i risultati IGDB, sotto «Port · Square · IGDB 340349», le piattaforme
     che IGDB dà al gioco, in grigio, come la colonna 3. La ricerca le scarica
     già (`platforms` nei campi di `searchIgdbGames`), ma `IgdbSearchHitSchema`
     le butta: un campo `platforms` coi nomi.
4. **Una traduzione sola dei nomi**: quella che la lista usa oggi (la nostra
   tabella `platforms`, più i nomi fuori tabella, `FUORI_TABELLA`) esce da
   `platform-mismatches.ts` in una funzione comune, così la colonna 3 e il
   dialogo dicono le stesse parole.

Le piattaforme compaiono in **tutti** i dialoghi che usano `IgdbPicker`
(scarti, «Collega a IGDB», la ricerca dell'account): un aiuto anche lì.

## Passi

- [x] branch `feat/9b-lista-piattaforme`, da `main`
- [x] questo piano, approvato
- [x] i nomi delle piattaforme in una funzione comune, coi test
- [x] `platforms` sui risultati della ricerca IGDB (`IgdbSearchHitSchema`,
      `searchGames`), coi test
- [x] la copertina nella lista (`listPlatformMismatches`, contratto), coi test
- [x] le piattaforme delle copie sul collegamento della scheda admin, coi test
- [x] la rotta `/admin/platforms`, la voce nel menu, «Segnalati» senza la lista
- [x] la riga con copertina e link
- [x] il dialogo: le copie in testa, le piattaforme sotto ogni risultato
- [x] `apps/web/CLAUDE.md` (la sezione admin) e `docs/import-librerie.md` (dove
      sta la lista)

## Verifica

`pnpm --filter api test`, `pnpm check-types`, `pnpm lint`. A occhio in locale:
la lista nella pagina nuova con copertine e link; «Non è questo gioco» su _Call
of Duty: Modern Warfare 3_ mostra le copie PS4 e PS5 in testa e, cercando,
le piattaforme di ogni risultato.
