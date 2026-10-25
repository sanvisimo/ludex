# La soglia «conta come giocato», per account

**Stato: in corso** (25/10/2026), voce `playedThreshold` della roadmap.
Branch `ccr-b9301df0-t20pf2`.

## La richiesta

Due cose, arrivate insieme dal telefono:

1. **Il dialogo «Aggiungi libreria» non si usa da mobile.** Con Steam il
   contenuto è più alto dello schermo e sborda sopra e sotto: la tendina in
   cima, il profilo pubblico e la ✕ restano fuori.
2. **Lo slider dei minuti di Xbox per tutti gli account che danno i tempi**:
   ogni libreria decide da quanti minuti un gioco entra fra i giocati.
   _Hollow Knight_ finito su Steam, soglia 60: diventa `played`.
   _SteamWorld Dig_ provato 25 minuti: resta da giocare.

## Decisioni (25/10/2026)

- **Il dialogo**: altezza massima pari allo schermo e scorrimento dentro il
  pannello, nel `DialogContent` di `packages/ui`. Vale per tutti i dialoghi.
- **Negozi**: Steam, PSN, Nintendo, Xbox ed EA, quelli che ci danno i tempi.
  GOG, Epic e Amazon non li danno. **EA li dà solo per i giochi avviati di
  recente** (`recentGames`, 1 su 44 nella misura del 13/10, `9c-ea.md`): c'è lo
  stesso, con una nota sotto la casella che lo dice (decisione del 25/10, dopo
  il primo giro).
- **Il controllo**: una casella «Segna come giocati…» e lo slider, da 0 a
  **240** minuti a passi di 5, 60 di partenza. **Spenta di partenza**: sugli
  account già collegati non cambia niente finché non la si accende.
- **Xbox ha uno slider solo, sempre visibile**, senza casella: la soglia c'era
  già e resta accesa. Vale per tutti i giochi, comprati e del Game Pass; col
  Game Pass non attivo continua anche a decidere quali giochi del Game Pass e
  Gold entrano.
- **Dove**: nel collegamento (Steam, PSN, Nintendo, Xbox, EA) e nelle
  «Impostazioni dell'import» della scheda, che c'erano solo per Xbox.
- **Il tempo si importa sempre**: la soglia decide solo lo stato.
- **Si promuove solo da `backlog` a `played`**. `playing`, `completed`,
  `dropped` ed `excluded` non si toccano, e niente torna mai indietro.

## Com'è fatto

- **`store_accounts.played_min_minutes`**, intero, nullo = spenta. Xbox non la
  usa: la sua soglia sta nel credenziale con le altre scelte (`minMinutes`).
- **Nell'import** (`importLibrary`) si promuove un gioco quando **passa** la
  soglia con questo import: prima del giro le sue ore su questo account erano
  sotto (o non c'erano), dopo sono sopra. Così un gioco che l'utente riporta a
  mano in `backlog` non torna `played` al giro dopo. Con 0, basta un minuto.
- **Salvare la soglia** dalle impostazioni la applica subito a tutto quello che
  c'è, con una `update` sola: è l'utente che chiede di applicarla. Per Steam,
  PSN, Nintendo ed EA non serve un import; Xbox lo accoda come prima, per le
  piattaforme.
- **Cambia una regola di `docs/import-librerie.md`**: «le ore non si usano per
  indovinare lo stato» vale finché l'utente non sceglie una soglia.

- **Nel collegamento la soglia sta in cima**, prima dei modi di accedere: su
  Steam i due login partono dal loro bottone, e una soglia scritta in fondo
  (accanto al nome) non la vedrebbe nessuno. È lo stesso ordine di Xbox, prima
  le scelte e poi il codice. Su Xbox lo slider non è più rientrato sotto il
  Game Pass: vale per tutti i giochi.

## Verifiche

- [x] test contro Postgres: la promozione all'import (sopra, sotto, a 0, al
      giro dopo, riportata a mano, stati diversi da `backlog`, soglia passata
      da Xbox), il salvataggio (subito, spenta, negozi senza tempi, altro
      utente), il collegamento, Xbox coi comprati. API: 1121 test verdi
- [x] typecheck e lint di `apps/api`, `apps/web`, `packages/ui`,
      `packages/contracts`, `packages/db`; `pnpm --filter web test`
- [x] in Chromium a 412×915: il dialogo scorre fino in fondo, la soglia nei
      moduli di Steam, PSN e Xbox, e «Impostazioni dell'import» su Steam che
      porta _Hollow Knight_ (900 min) a giocato e lascia _SteamWorld Dig_ (25)
- [ ] il dialogo su un telefono vero (utente)
