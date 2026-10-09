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
  cosa (va in `/admin/segnalati`) e non cambia.
- Niente template per le issue, per ora.

## Da sapere

- «In corso» oggi non ha voci, e il tipo le prevede già.
- I mesi delle voci fatte sono approssimati: la storia dei commit è fatta di
  merge, non di step. Si correggono in `lib/roadmap.ts`.
- **EA è «In arrivo»**, non fatto (corretto il 09/10/2026): l'importazione una
  tantum non c'è ancora.
- Dentro «In arrivo» c'è «Steam con login e Nintendo»: sono costruiti e provati
  sul mini PC, ma il rilascio agli altri utenti aspetta l'esito.
- **«In arrivo» segue l'ordine di lavoro** deciso il 09/10/2026 (11b, EA, CSV,
  abbonamenti, Xbox, AI, mobile, in [ordine-sviluppo](../docs/ordine-sviluppo.md)),
  dopo due cose piccole: il link alle fonti senza voto e il rilascio di Steam con
  login e Nintendo. Xbox è passata da «Idea» a «In arrivo» perché è nell'ordine,
  anche se il suo significato è ancora da decidere.
- L'unica idea è **le playlist aperte**: vedi [15b-wishlist.md](15b-wishlist.md).
