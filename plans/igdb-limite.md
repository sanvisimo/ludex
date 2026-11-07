# IGDB — il limite fra più processi

**Stato: fatto** (chiuso il 07/11/2026). PR #117.

IGDB consente **4 richieste al secondo per chiave**. La pausa di `igdb.ts` valeva
dentro un processo, ma la chiave la usano il server (ricerca, `fromIgdb`,
admin), il worker (enrichment, import) e gli arnesi lanciati a mano: insieme
fino a 8 al secondo e oltre. E un 429 diventava un errore qualunque. Annotato in
[admin-uso.md](admin-uso.md), dove il contatore dei 429 lo rende visibile.
Lavoro interno: niente voce in roadmap. Deciso e fatto il 07/11/2026.

## Com'è fatto

- **Il turno sta in Redis**: `reserveSlot` (`apps/api/src/lib/redis.ts`), uno
  script Lua atomico sulla chiave `igdb:next`, che tiene l'istante da cui può
  partire il prossimo. L'ora la dà Redis (`TIME`), così gli orologi dei processi
  non contano. Chi prenota sa fra quanti ms parte, e aspetta.
- **Dentro un processo** le richieste restano in fila (`schedule` in
  `igdb.ts`), una aperta alla volta: il turno condiviso distanzia le partenze,
  la fila evita che un processo ne prenoti venti insieme.
- **275 ms e non 250**: il turno lo prenota Redis, ma la partenza la fa un timer
  del processo, che a volte scatta in ritardo. Con 250 tondi, fra due processi
  si è misurata una distanza di 239 ms e cinque partenze nello stesso secondo.
- **Dopo un 429** si spostano avanti di un secondo i turni di tutti, non solo
  quello respinto, e la richiesta si riprova fino a due volte; poi è un errore
  («IGDB …: 429, troppe richieste») e il job lo ritira BullMQ. La pausa si
  scrive dentro il turno: fuori, la richiesta che segue nello stesso processo
  avrebbe già prenotato il suo. Passa al più la richiesta che un altro processo
  aveva già prenotato.
- **Redis giù**: ogni processo distanzia da sé, come prima. Insieme possono
  sforare, ma l'enrichment non si ferma. Costa il timeout del comando Redis
  (1 s) e una riga di log per richiesta, come le altre funzioni di `redis.ts`;
  il worker senza Redis comunque non gira.

## Verifica

Uno script nella scratchpad: due processi che importano il client vero, con
`fetch` sostituito da un IGDB finto che annota l'istante di ogni partenza, 20
richieste a testa lanciate tutte insieme.

- Redis acceso: 40 partenze, distanza minima 260 ms, mai più di 4 in un secondo.
- Con un 429 ogni cinque risposte: nessun errore (48 partenze, i 429 ritentati),
  minima 264 ms, mai più di 4 in un secondo, e dopo ogni 429 la fila riparte a
  un secondo da lui (le distanze di ~727 ms, dopo la richiesta già prenotata
  dall'altro processo).
- Redis spento: 8 richieste, nessun errore, distanziate dentro il processo.
- `check-types` e `lint` di `api`. I test di `api` non toccano `igdb.ts` (lo
  stubbano con `vi.mock`), e qui non sono girati: manca pgvector.

- [x] **Sul server**: la colonna dei 429 di IGDB in `/admin/usage` resta a
      zero con server e worker accesi insieme. Provato dall'utente il
      07/11/2026: OK.
