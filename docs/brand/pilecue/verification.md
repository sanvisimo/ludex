# Verifica finale PileCue — 10 novembre 2026

## Galleria

Risolto `ManyThumbnails`: il bordo destro della miniatura rimaneva tagliato di
2 px con `scrollIntoView`. Ora si misura il viewport del contenitore e si usa
l’API `ScrollView.scrollTo({ x, animated })` per il minimo spostamento richiesto.
La regressione verifica entrambi i bordi, fino all’ultima miniatura e ritorno
alla prima. Supportata la preferenza web di movimento ridotto.

Tutte le **153 storie/test UI** passano, incluse le verifiche axe eseguite.
Gli **8 file / 68 test web** passano. Build web, lint e typecheck di UI, web,
mobile e auth verificati.

## Nome pubblico

Aggiornati i valori delle traduzioni IT/EN (incluse le stringhe negli array),
privacy e condizioni con nuova data di revisione, email account e mittente.
Il display name MAIL_FROM è aggiornato nell’esempio e nell’ambiente locale,
preservando l’indirizzo. Nessuna modifica a chiavi di traduzione, slug, package,
URL del repository o risorse di database.

## Backlog autenticato

Verifica sulla pagina reale, tramite API reali, con account QA temporaneo e
14 giochi già nel catalogo; cinque stati e copie digitali. Email catturata
esclusivamente da Mailpit locale, CAPTCHA con chiavi di test locali. Verificati
nome e mittente PileCue anche nella conferma account.

- Griglia, elenco e compatta nei due temi, desktop e 390 px: nessun overflow.
- Attivazione/disattivazione filtro di stato: riuscita.
- Griglia scura: pagina #101426, scheda #1A1E2B, selezione #29243F,
  testo selezionato #B8AEFF e bordo #8172C1.
- Griglia chiara: pagina #F5F6FF, scheda #EDEFF7, selezione #EFEBFF,
  testo selezionato #5541AD e bordo #8D78DD.
- Nessun pageerror JavaScript nella verifica autenticata.
- Account e backlog QA eliminati tramite API, messaggi QA eliminati da Mailpit.

La cache in memoria del compilatore Tamagui conservava i vecchi stili dei
consumer: riavviato lo stack dev locale con lo stesso comando pnpm dev,
senza cambiare la configurazione di estrazione. Ricontrollati i colori effettivi
dopo il riavvio. Nessuna cache compilata è una sorgente del marchio.

Screenshot reali e report senza credenziali:
[scuro desktop](ui/backlog-desktop-dark.png),
[chiaro desktop](ui/backlog-desktop-light.png),
[scuro mobile](ui/backlog-mobile-dark.png),
[chiaro mobile](ui/backlog-mobile-light.png),
[report QA](ui/backlog-qa.json).

## Expo

Generati offline i bundle Hermes Android e iOS con il codice finale. I sei
font statici sono negli asset nativi. Config risolta: nome PileCue, icona e
splash 1024×1024, userInterfaceStyle automatic, splash navy in entrambi i temi.
Gli identificatori tecnici esistenti sono conservati.

**Prova fisica eseguita su Pixel 9a**, via USB, con Expo Go 57.0.9 per SDK 57.
Logo, font, schede, badge e pulsanti osservati nei due temi; verificato anche
il passaggio scuro → chiaro → scuro senza rimontare la schermata.

Il controllo ha rilevato che il Button styleable di Tamagui 2.7.7 conservava
alcuni colori dello schema precedente su Android. Il Button condiviso ora
passa esplicitamente il nome del tema al proprio frame solo su native;
il tema eventualmente specificato dal consumer conserva la precedenza.
La barra di stato dello scheletro Expo segue ora il tema scelto.

Misure sui pixel degli screenshot reali:

| Ruolo | Scuro | Chiaro |
| --- | --- | --- |
| Pagina | #101426 | #F5F6FF |
| Scheda | #1A1E2B | #EDEFF7 |
| Pulsante primario | #8B7CFF | #6654C9 |

Prove: [scuro Pixel](ui/expo-pixel-dark.png),
[chiaro Pixel](ui/expo-pixel-light.png), [misure](ui/expo-pixel-qa.json).
Dopo la correzione: typecheck e lint UI/mobile, 12 storie Button/InputGroup
in Chromium ed export finale Expo Android/iOS/web riusciti.

Restano warning di sviluppo Tamagui sulle dimensioni nominali dei Button e
sull’adapter dei menu nativi, fuori dalla verifica di logo e palette.
Il tunnel USB è stato ripristinato dopo una disconnessione; il successivo
ricaricamento e Fast Refresh hanno funzionato.

Expo Go ospita lo scheletro del design system, non il backlog mobile completo.
**Icona launcher e splash standalone richiedono una build nativa dedicata**:
config e asset sono verificati, la loro resa standalone non è certificata da
questa prova. Nessuna pubblicazione remota.

## Revisione completa web

La revisione estesa richiesta dall’utente, con mobile rinviato, è documentata
in [web-audit](web-audit/README.md), con [report consolidato](web-audit/report.json).
Include catalogo, ricerca, schede gioco, accesso/registrazione/recupero,
playlist, wishlist, link condivisi, account, pagine di servizio, 404 e sette
sezioni admin in sola lettura.

Corrette le coppie di contrasto residue (footer, correlati, avvisi di errore,
illustrazione Nintendo), le etichette dei Select, il focus menu → dialogo,
i margini dei modali, le checkbox dei tag, il markup delle liste condivise
e l’accesso da tastiera alle tabelle admin.

Suite finale: **154 UI e 68 web**, lint/typecheck web/UI e build web riusciti.
Confermati anche login dal browser con CAPTCHA di test, salvataggi della
fixture, export JSON, preferenze tema/lingua e traduzioni EN dei campi nuovi.
I collegamenti reali ai negozi e gli import esterni restano fuori dalla prova.
