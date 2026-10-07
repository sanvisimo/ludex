# Step 15d — Condivisione delle playlist

**In analisi** (08/10/2026). Niente codice finché le scelte in fondo non sono
approvate. Viene dopo la 15a ([15a-playlist.md](15a-playlist.md)), di cui usa la
tabella `playlists`.

## Cosa si vuole

Due usi, entrambi voluti:

- **A — mostrare i miei giochi.** Una pagina **visibile a tutti**, anche senza
  account, che mostra i giochi di una mia playlist con le **sole informazioni
  pubbliche del gioco**.
- **B — passare i filtri.** Lo stesso filtro, applicato al backlog di chi lo
  riceve.

## Proposta: un link solo per tutte e due

Chi condivide una playlist ottiene **un link** (`/condivisa/<token>`). Chi lo
apre:

- **vede la playlist** (A): il nome e i giochi, come le card della home;
- se ha un account, trova **«Usa questi filtri sul mio backlog»** (B): porta a
  `/backlog` con i filtri già impostati, pronti da guardare e da salvare come
  playlist sua. Da anonimo il bottone manda all'accesso e poi torna qui.

Così B non è un'altra funzione: è un bottone sulla pagina di A. Non serve un
secondo meccanismo né un secondo link da spiegare.

## Cosa vede chi apre (A)

Sono giochi del **tuo** backlog, quindi la regola è: esce il gioco, mai niente di
tuo.

- **Sì**: nome della playlist; per ogni gioco quello che la scheda pubblica già
  mostra (`GameSchema`: copertina, titolo, anno, durata, voto della critica). Il
  gioco porta alla sua scheda `/games/$slug`, che è pubblica.
- **No, mai**: stato, voto, note, tag, possessi (negozio, piattaforma, account,
  ore giocate), date di aggiunta, chi sei.
- **Lo stato di chi guarda** sì, come nella home: se il visitatore ha quel gioco
  nel _suo_ backlog, la card lo dice. È una cosa sua, non tua.
- **Mai i giochi nascosti** (`hidden_at`) **né quelli «non mi interessa»**
  (`excluded`): sono giudizi tuoi, e non è tuo interesse farli leggere. Vale
  qualunque cosa dica il filtro salvato.
- **Il filtro** non si mostra come chip. Per B si manda solo ciò che serve per
  riapplicarlo, **senza i tag**: sono per id e di chi li ha scritti, non esistono
  per un altro. Se ne mancano, il bottone lo dice, come l'avviso dei tag
  cancellati.
- **Il nome del proprietario non compare.** Un link condiviso non deve dire chi
  l'ha condiviso, se non sceglie di dirlo.

## Dati

Una colonna su `playlists`: **`share_token`**, testo, **unico**, nullo se non
condivisa. 16 byte casuali in base64url (22 caratteri, 128 bit): non si
indovina. Niente tabella a parte: una playlist ha al più un link.

- **Condividere** crea il token (se c'è già, rende quello). **Smettere** lo
  mette a nullo: il link smette di funzionare subito. Ricondividere dà un link
  **nuovo**; quello vecchio non torna.
- Cancellare la playlist o l'account porta via anche il link (cascade).
- Il token **non** va nell'esportazione dell'account: è un segreto di accesso,
  non un dato dell'utente. Nell'esportazione c'è solo se è condivisa.
- Un token sbagliato e un token revocato rispondono **allo stesso modo**
  (`NOT_FOUND`): non si deve poter capire che un link è esistito.

## API

- `playlists.share({ id })` → `{ token }`, `playlists.unshare({ id })`. Del
  proprietario, come le altre. `Playlist` guadagna `shareToken: string | null`
  (lo vede solo lui).
- `sharedPlaylists.get({ token, limit, offset })`: **pubblica** (`maybeAuthed`,
  solo per lo stato di chi guarda). Rende `{ name, total, games, filters,
droppedTags }`, con `games` della forma di `HomeGame`.
- Esegue la query salvata col `searchBacklog` di sempre, **come il proprietario**,
  ma con due condizioni che chi apre non può togliere: né nascosti, né
  `excluded`. Poi **riduce a `Game`** al confine del servizio, prima che qualunque
  campo personale possa uscire.
- Il tetto per pagina è basso (60): è una query che chiunque può lanciare.

## Schermate

- **Menu di una playlist**: «Condividi…» apre un dialogo con il link, «Copia» e
  «Smetti di condividere». Una playlist condivisa lo dice in `/playlist` (un
  segno accanto al nome).
- **`/condivisa/$token`**: pubblica, dentro il guscio, `noindex`. Titolo, «N
  giochi», la griglia e la paginazione di `/playlist/$id` (senza azioni sulle
  card: i giochi non sono di chi guarda), e il bottone di B.
- Sono due schermate nuove: **va deciso se disegnarle prima** (vedi sotto).

## Test (sul server, contro Postgres)

Il punto non è che funzioni, è che **non perda niente**:

- la risposta pubblica non contiene mai note, voto, tag, possessi, né chi sei;
- un gioco nascosto o `excluded` non esce, nemmeno con un filtro che lo cerca;
- un token sconosciuto e uno revocato rispondono uguale;
- chi non è il proprietario non può condividere né revocare;
- i tag non escono dai filtri e `droppedTags` li conta;
- lo stato di chi guarda compare, quello del proprietario no.

## Piano in passi

1. **Server**: colonna e migration, `share` / `unshare`, `sharedPlaylists.get`
   con i suoi test.
2. **Chi condivide**: il dialogo e il segno in `/playlist`.
3. **Chi apre**: `/condivisa/$token` e il bottone di B.
4. **Documentazione**: [docs/modello-dati.md](../docs/modello-dati.md) e questo
   piano.

## Da decidere

Ho messo il default di ognuna; basta dire quale cambiare.

1. **Dinamica o fotografia.** Default: **dinamica**, la query gira a ogni
   apertura, come per te. Chi ha il link vede i giochi di oggi. L'alternativa
   (congelare l'elenco al momento della condivisione) toglie la sorpresa di
   vedere cambiare la lista, ma ha bisogno di una tabella e smette di essere una
   playlist.
2. **Il proprietario non compare.** Default: nessun nome. Se vuoi che si possa
   scegliere («Playlist di Mario»), è un campo in più e una domanda di privacy
   in più.
3. **Nascosti ed `excluded` mai visibili.** Default: sì.
4. **Chi apre non cerca né riordina**, nel primo giro. Default: l'ordine è quello
   salvato e basta la paginazione.
5. **Solo con il link**: non esiste nessun elenco pubblico delle playlist
   condivise, e la pagina è `noindex`. Default: sì.
6. **Disegno prima del codice?** Le schermate sono due e semplici (un dialogo e
   una pagina che è la playlist aperta senza azioni). Default: **le descrivo qui
   e le faccio vedere a pagina vera**, senza wireframe, come per l'elenco a
   fasce. Se vuoi il disegno, dillo.
