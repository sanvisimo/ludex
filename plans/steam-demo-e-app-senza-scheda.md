# Steam: la demo dentro il gioco base e le app senza scheda

Segnalato da un'utente il 13/11/2026, il giorno dopo l'iscrizione: due demo
importate come giochi completi, _Create the Drops of God: The Ambrosia_ e
_inZOI_.

## Cosa è successo

**Drops of God.** In produzione il collegamento è `2687220` → _Drops of God:
Creating your Ambrosia_, col titolo del negozio scritto da un import. È l'appid
**del gioco completo**: Steam lo dà come posseduto perché la demo sta dentro
l'app del gioco, che sullo store non è uscito (`is_coming_soon`, «To be
announced»). Il collegamento è giusto, e lo sarà per chi il gioco lo comprerà:
è la copia che non lo è. Né «Scollega» né «Non è questo gioco» c'entrano.

**inZOI.** `3092450` _inZOI: Creative Studio_, l'editor dei personaggi
gratuito, uscito prima del gioco. Oggi non ha una scheda sullo store
(`GetItems`: `success: 15`) e IGDB non conosce l'appid. Arriva da
`GetOwnedGames` (gratuito avviato), si cerca per nome, il titolo intero non
trova niente e quello accorciato ai due punti, «inZOI», trova _Inzoi_. Nel nome
non c'è «demo», quindi `isPrereleaseName` non lo ferma. Il collegamento è stato
scollegato a mano il 13/11, ma il reimport lo rifarebbe per la stessa strada, e
la copia è rimasta sul gioco.

## Cosa si fa

1. **Un'app che lo store dà come non ancora uscita non si importa.** Per tutte
   le voci Steam (proprie, famiglia, licenze) si chiede `GetItems`, anonima,
   cento app per richiesta: `is_coming_soon` c'è anche senza `include_release`.
   Saltata, non scarto nascosto: uno scarto nascosto che si risolve porta il
   gioco nel backlog **già nascosto** (`hideEntriesFromHiddenUnresolved`), e
   chi lo compra all'uscita non lo vedrebbe. Un preordine, se Steam lo dà,
   aspetta l'uscita: prima non si gioca. Un errore dello store non ferma
   l'import. `withStoreFacts` in `steam-import.ts`. **Fatto.**
2. **Un'app senza scheda sullo store si cerca solo col titolo intero.** Dalla
   stessa risposta di `GetItems`. _inZOI: Creative Studio_ finisce fra i «da
   sistemare», visibile. Un gioco ritirato che si trovava solo col titolo
   accorciato finisce lì anche lui: un costo che si vede. `fullTitleOnly` su
   `LibraryEntry`, rispettato da `searchWithFallback`. Verificato su IGDB vero:
   col titolo intero niente, accorciato _Inzoi_. **Fatto.**
3. **La documentazione**: `docs/import-librerie.md` (le demo) e
   `docs/negozi.md` (Steam). **Fatto.**

## Le copie già scritte

L'import Steam non pota le copie proprie, quindi non si spostano da sole. Dopo
il deploy l'utente usa **Rimuovi** su entrambi i giochi: con 1 e 2 il reimport
non li ricrea.

## Verifica

`pnpm --filter api test`. Dopo il deploy, un reimport dell'utente: i due giochi
non tornano nel backlog, _Creative Studio_ è fra i «da sistemare».
