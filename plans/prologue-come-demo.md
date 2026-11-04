# I Prologue si scartano come le demo

**Stato: in corso** (dal 04/11/2026). Branch `fix/prologue-come-demo`.

## La richiesta

Un gioco dev'essere scollegabile dall'admin. Il caso: su _Citizen_ (IGDB 60169)
c'è la voce Steam 2182110, _Citizens: Far Lands - Prologue_, e dalla scheda admin
non si può sistemare. «Scollega» rifiuta l'id unico, e «Non è questo gioco» vuole
un gioco giusto che non c'è: il Prologue non è il gioco completo.

## Come ci era arrivato (misurato il 04/11/2026)

- Il titolo intero su IGDB non trova niente, e l'appid IGDB non lo conosce
  ([9f](9f-steam-gratuiti-e-demo.md)).
- `searchWithFallback` taglia ai due punti e cerca «Citizens».
- Il giudizio confronta con entrambe le forme: _Citizen_ prende 0,92 contro
  «Citizens», _Citizen X_ 0,80, _Citizens: Far Lands_ 0,79. Soglia 0,85, distacco
  0,05: passa _Citizen_.

## Decisioni

- **Un Prologue è una demo** (decisione dell'utente, 04/11/2026). Ribalta il 9a,
  che contava i Prologue fra i giochi salvati dal titolo accorciato.
- **Non si aggiunge a `PRERELEASE_NAME`**, che salta la ricerca per nome: alcuni
  hanno una scheda propria (_Alder's Blood: Prologue_, _Kingdom Hearts HD 2.8
  Final Chapter Prologue_). Si collega per nome solo a un candidato che si chiama
  Prologue anche lui. Altrimenti scarti, nascosto come `prerelease`.
- **Per id resta dove lo mette IGDB**, come una demo.
- **Il matcher non si tocca**: il confronto col titolo accorciato resta quello.
- **Niente tabella di rifiuti né migration**: con la regola il reimport non
  ricollega, ed era l'unica ragione per averla.

## Passi

1. Regola in `resolveByName` e nella nascita degli scarti, con i test. **Fatto.**
2. «Scollega» anche sull'id unico, se la voce è una demo o un Prologue: il
   collegamento si toglie, le copie tornano fra gli scarti nascoste, la riga di
   backlog sparisce se è intatta (con voto, note, tag o stato diverso da
   `backlog` resta senza quella copia). Le copie senza account restano sul gioco.
   Dialogo con l'anteprima, testi in italiano e inglese. **Fatto.**
3. `docs/import-librerie.md`. **Fatto.**

## Il limite che resta

Se IGDB conosce l'id, il reimport e l'enrichment lo riportano sul gioco anche dopo
«Scollega». Non è il caso di _Citizens_, e nel lotto non c'è un caso vero: una
memoria dei collegamenti rifiutati si aggiunge se ne arriva uno.

## I collegamenti già scritti

La regola non li corregge, e non c'è pulizia automatica. Nel database di sviluppo
il 04/11/2026: _Citizen_ è il passo 2; _NecroCity_, _Builders of Egypt_, _Legend
of Keepers_, _Siege Survival_ e _Vagrus_ hanno un secondo id, e «Scollega» funziona
già. Per le quattro GOG non è verificato se IGDB le conosca per id: in quel caso
il reimport le ricollega.
