# Revisione web PileCue — 10 novembre 2026

Audit della versione locale in Chromium, con API reali e account QA separato.
Il mobile è rinviato su richiesta dell’utente.

## Copertura

| Ambito | Casi |
| --- | ---: |
| Pagine pubbliche e autenticate | 112 |
| Sette sezioni admin, sola lettura | 28 |
| Dialoghi: layout, axe, focus ed Escape | 60 |
| Moduli libreria e controlli funzionali aggiuntivi | 52 |

Le matrici usano tema chiaro/scuro e viewport 1440×1000 e 390×844.
Il [report consolidato](report.json) conserva l’esito finale di ogni caso,
includendo i ricontrolli dopo le correzioni. Gli skeleton di caricamento
non sono considerati una verifica della schermata popolata.

## Correzioni

- Contrasto del footer chiaro, dei titoli correlati, del testo rosso legacy
  e dell’illustrazione Nintendo.
- Select con nomi accessibili nei moduli gioco, account e filtri admin.
- Focus corretto dal menu al dialogo, con storia di regressione `OpensDialog`.
- Dialoghi con margini di 16 px sul web stretto e checkbox dei tag viola.
- Liste condivise con figli `li` validi e tabelle admin scorrevoli da tastiera.
- Fallback 404 con layout PileCue e traduzioni IT/EN.
- Tooltip con eventi web inoltrati correttamente e dimensioni icona Button
  separate dalle size nominali: rimossi i relativi warning di sviluppo.

## Interazioni reali

Salvataggio note, creazione/rinomina/eliminazione di una playlist QA, modifica
nome e ripristino, validazioni email/password, download JSON dei dati QA,
preferenze tema/lingua, tooltip da tastiera e accesso dal modulo del browser.
Anteprima CSV eseguita senza avviare l’import. Guardie verificate da ospite e
utente standard; l’admin è stato controllato con ruolo temporaneo assegnato
solo all’account QA locale e poi ripristinato.

Build di produzione, typecheck e lint web/UI riusciti; **154 test UI e 68 test
web** passati. Il 404 richiesto nella prova produce il previsto avviso HTTP 404;
nessun pageerror nello smoke finale.

## Screenshot rappresentativi

[Playlist chiara desktop](auth-playlist-light-1440.png) ·
[Gioco chiaro a 390 px](guest-gioco-light-390.png) ·
[Modifica a 390 px](dialog-gioco-modifica-light-390.png) ·
[Profilo chiaro](auth-profilo-light-390.png) ·
[404 scuro](guest-non-trovata-dark-390.png) ·
[Uso admin e focus della tabella](admin-usage-light-390.png).

## Limiti

Verificati gli otto moduli di collegamento libreria; accessi e import reali dai
negozi esterni richiedono account dei servizi e non sono stati eseguiti.
Le azioni admin sui dati esistenti non sono state attivate. La verifica
Chromium e axe non certifica ogni browser o tecnologia assistiva.

L’account QA, il backlog, le liste, le sessioni e i messaggi Mailpit sono stati
eliminati tramite API alla fine della verifica; le credenziali temporanee
non sono conservate nel repository.
