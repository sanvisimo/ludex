# La pagina Roadmap

**Costruita** il 09/10/2026, il lotto si chiude quando l'utente dice che è
pronta. Una pagina pubblica `/roadmap`, nel footer prima di «Crediti», e le
segnalazioni spostate dalla mail alle issue di GitHub.

## Decisioni prese

- **Una timeline sola**, non tre sezioni: prima il futuro (in corso, in
  arrivo, idee), poi il fatto dal più recente. Il riferimento era la roadmap di
  Dawarich, **solo come esempio** della forma: i colori no.
- **Un colore solo, il teal dell'accento.** Gli stati si distinguono per come è
  riempito il pallino e l'etichetta, non per la tinta (niente arcobaleno):
  - in corso: pallino pieno con alone, `Badge` pieno;
  - in arrivo: pallino col solo bordo teal, `Badge` outline teal;
  - idea: pallino grigio tratteggiato, `Badge` grigio;
  - fatto: pallino pieno con la spunta, «Fatto · mese» al posto dell'etichetta.
    Le aree (Import, Playlist…) sono etichette grigie, senza colori loro.
- **L'invito alle issue sta in una colonna a destra** da `$lg` (1024 px), larga
  280 e ferma in vista mentre si scorre; sotto `$lg` va in fondo, dopo la
  timeline. La pagina è larga 1120 px, contro gli 896 delle altre.
- **Scritta a mano** in `lib/roadmap.ts`, per chi usa l'app: non si ricava da
  `docs/ordine-sviluppo.md`, che è il diario di chi sviluppa. Le voci fatte sono
  tappe con due-quattro punti; le altre una frase.
- **Segnalazioni e idee → issue di GitHub** (`issuesUrl`), nei Crediti e nel
  riquadro in fondo alla roadmap. **La mail resta** in informativa e condizioni:
  è il contatto per i diritti sui dati e per chiudere l'account, e non può
  essere una issue pubblica. «Segnala un errore» sulla scheda del gioco è un'altra
  cosa (va in `/admin/reported`) e non cambia.
- Niente template per le issue, per ora.

## Da sapere

- **Il 22/10/2026** «Playlist aperte» (`openPlaylists`) è passata da «Idea» a
  «In arrivo», in fondo: decisa ma non cominciata, e il suo posto nell'ordine
  di lavoro è ancora da decidere. Piano in
  [15f-playlist-aperte.md](15f-playlist-aperte.md).
- **Il 19/10/2026** «Importa da un file CSV» (`csv`) è passata a «Fatto», con
  tre punti al posto del testo (era «In corso» dal 16/10): il lotto 10, piano
  in [10-import-csv.md](10-import-csv.md). In «In corso» resta Xbox.
- I mesi delle voci fatte sono approssimati: la storia dei commit è fatta di
  merge, non di step. Si correggono in `lib/roadmap.ts`.
- **Il 18/10/2026** «Importa da un file CSV» (`csv`) e «La libreria Xbox»
  (`xbox`) sono passate a «In corso», insieme. Subito dopo, in cima a «In
  arrivo», è entrata «Ludex aperto a tutti» (`release`), area Account: il
  rilascio su un server stabile, piano in [rilascio.md](rilascio.md). Gli
  abbonamenti scendono dopo il rilascio.
- **EA è passata a «Fatto» il 13/10/2026** (era «In arrivo» dal 09/10, poi «In
  corso»): l'importazione una tantum, piano in [9c-ea.md](9c-ea.md).
- **Ancora il 16/10/2026**, a lotto chiuso: «Il gioco a caso dal filtro»
  (`randomFilter`) è passata a «Fatto» (era «In corso» dallo stesso giorno),
  con tre punti al posto del testo. In cima a «In arrivo» torna il CSV.
- **Sempre il 16/10/2026**, a lotto chiuso: «I link nella pagina del gioco»
  (`linksFix`) è passata a «Fatto», e «Il gioco a caso dal filtro»
  (`randomFilter`) è salita in cima a «In arrivo», prima del CSV.
- **Il 16/10/2026** «Il filtro digitale o fisico» (`mediaFilter`) è passata a
  «Fatto», e «I link nella pagina del gioco» (`linksFix`) a «In corso».
  «Rinnovo del token per la libreria EA» (`eaRenew`) è **tolta**, non fatta: il
  rinnovo è stato scartato senza codice ([9c-ea-rinnovo.md](9c-ea-rinnovo.md)),
  e la voce `ea` già dice che EA non permette un collegamento che duri.
- **«Il gioco a caso dal filtro»** (`randomFilter`) è entrata in «In arrivo» il
  13/10/2026, dopo il CSV: l'estensione della 15c.
- **«I link nella pagina del gioco»** (`linksFix`) è entrata in «In arrivo» il
  13/10/2026, prima del CSV: il campo `websites` di IGDB.
- «Steam con login e Nintendo» è passata a «Fatto» il 12/10/2026: provati sul mini PC
  per quattro giorni senza blocchi (era «In corso» dal 09/10).
- «Giochi doppi, uniti in uno» (11b) è passata a «Fatto» il 12/10/2026.
- **«In arrivo» segue l'ordine di lavoro** deciso il 09/10/2026 (wishlist
  dei negozi, EA, CSV, abbonamenti, Xbox, AI, mobile, in [ordine-sviluppo](../docs/ordine-sviluppo.md)),
  dopo «Un admin migliore» (la revisione di tabella e link in admin, da
  `plans/11a-admin.md`). Xbox è passata da «Idea» a «In arrivo» perché è
  nell'ordine, anche se il suo significato è ancora da decidere.
- **«In corso»** (il pallino pieno con l'alone) è ciò che si sta facendo adesso:
  dal 09/10/2026 «Giochi doppi, uniti in uno» e, dal 10/10, «Un admin migliore».
  Lo stato c'era già nel tipo (`doing`) e nello stile, ma nessuna voce lo usava.
- «I link alle fonti» è passata a «Fatto» il 09/10/2026.
- L'unica idea era **le playlist aperte**: vedi [15b-wishlist.md](15b-wishlist.md).
  Dal 22/10/2026 è «In arrivo».
