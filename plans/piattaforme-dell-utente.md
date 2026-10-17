# Idea — le piattaforme dell'utente

**Stato: idea dell'utente (17/10/2026), nata dallo studio del 9e. Non decisa, non
in ordine di sviluppo, nessun codice.** Sta qui perché non si perda quando il 9e si
chiude.

## L'idea

L'utente dice quali piattaforme ha, e l'import porta solo le copie per quelle.

Esempi:

- ha solo una Xbox Series X: un gioco Play Anywhere non deve entrare anche come copia
  PC, perché un PC non ce l'ha;
- ha solo una PS5: i giochi PS4 che girano sulla PS5 restano, ma la copia «PS4»
  forse non gli serve;
- ha un gioco sia per console sia per PC, ma non ha un PC e non vuole importare i
  giochi per PC.

In pratica, delle impostazioni.

## Perché ha senso qui

Il backlog risponde a «cosa gioco adesso», e una copia per una piattaforma che non
si possiede non si può avviare stasera: è rumore per il motore decisionale. Il 9e la
rende evidente, perché Play Anywhere fa nascere due copie (decisione 3 di
[9e-xbox](9e-xbox.md)), ma vale già oggi per il cross-buy PSN (PS4 e PS5) e per
qualunque negozio PC se l'utente gioca solo su console.

## Domande da decidere, quando si riprende

- **Dove sta**: `user_settings` (c'è già, con `auto_sync_library`) o una tabella sua.
- **Cosa fa a una copia che c'è già**: un import filtrato non crea la copia nuova, ma
  quella entrata prima si toglie, si nasconde, o resta? Ricordarsi che «niente si
  cancella per non vederlo» ([import-librerie](../docs/import-librerie.md)): una copia
  tolta va ricordata, o il prossimo import la ricrea.
- **Filtro all'import o di vista**: non importarla affatto, o importarla e non
  mostrarla (il possesso c'è, l'utente ha scelto di non vederlo).
- **Il default**: nessuna scelta vuol dire «tutte», come oggi.
- **Xbox One e Series**: se l'utente ha solo la Series, una copia «One» va scritta
  come Series? Una delle domande aperte del 9e.
