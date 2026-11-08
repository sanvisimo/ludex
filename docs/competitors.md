# Concorrenti

Cosa fanno gli altri e cosa li separa da Ludex, misurato sulla domanda che
conta qui: **"cosa gioco adesso"**. Non è una lista di feature da copiare: una
cosa che hanno loro e noi no entra solo se aiuta a decidere cosa giocare.

Le informazioni invecchiano. Ogni voce dice quando è stata controllata e da
dove viene; dove le fonti sono di terzi o si contraddicono, è scritto. Prima di
usarne una per una decisione, ricontrollarla.

## Grouvee

_Controllato il 07/11/2026, da fonti di terzi: il sito non era raggiungibile
dalla sessione._

- **Cos'è**: un "Goodreads dei videogiochi", nato nel 2012 a Indianapolis.
  Scaffali predefiniti più scaffali personali senza limite, wishlist, backlog,
  voto e recensione, tempo impiegato e livello di completamento segnati a mano.
  Ogni gioco mostra il voto medio degli utenti di Grouvee.
- **Come si paga**: gratis. Grouvee Gold toglie la pubblicità e dà accesso
  anticipato alle novità.
- **Import**: Steam, dalla libreria pubblica del profilo (verificato sul sito
  l'08/11/2026). Per PSN e gli altri negozi un moderatore del forum dice che
  mancano API pubbliche: nessun import confermato.
- **Dati**: passato da Giant Bomb a IGDB, con fusione delle vecchie schede non
  ancora completa al momento del post.
- **Mobile**: incerto. La stessa directory lo dà presente e, fra i contro,
  dismesso.
- **Rispetto a Ludex**: è un tracker con il social al centro, cioè quello che
  Ludex dichiara di non essere. Scaffali e wishlist li copriamo con playlist
  (15a) e wishlist (15b). Il voto medio della community e le recensioni non
  aiutano a decidere cosa giocare. Ci separano gli import da tutti i negozi,
  HLTB e voti della critica, gli abbonamenti e il motore decisionale (13).

Fonti: [Digital Trends](https://digitaltrends.com/?p=3711342),
[AlternativeTo](https://alternativeto.net/software/grouvee),
[sugggest.com](https://sugggest.com/software/grouvee),
[CB Insights](https://www.cbinsights.com/company/grouvee),
[forum Grouvee, passaggio a IGDB](https://discuss.grouvee.com/t/igdb-data-switch-discussion/11135),
[forum Grouvee, import](https://discuss.grouvee.com/t/site-suggestions-missing-games-import-errors-incorrectly-combined-games-etc/368),
[forum Grouvee, PSN](https://discuss.grouvee.com/t/console-scraper/2284).

## Backloggd

_Controllato il 07/11/2026, dalla roadmap pubblica e da recensioni di terzi._

- **Cos'è**: il "Letterboxd dei videogiochi". Diario di gioco, voto,
  recensioni, liste, profilo pubblico.
- **Come si paga**: gratis, con un programma di sostenitori facoltativo (circa
  1 e 3 $/mese) che dà statistiche annuali, niente pubblicità ed export CSV.
- **Import**: nessuno automatico. L'import da Steam è una richiesta aperta
  sulla roadmap.
- **Mobile**: solo il sito adattato al telefono. App Android e iOS sono sulla
  roadmap; esiste un wrapper Android non ufficiale. "Backloggr" su App Store è
  un altro prodotto.
- **Rispetto a Ludex**: stesso discorso di Grouvee, ancora più spostato sul
  diario e sul social. Senza import, la libreria si costruisce a mano gioco per
  gioco: il problema che Ludex risolve per primo.

Fonti: [roadmap di Backloggd](https://backloggd.com/roadmap/),
[Two Average Gamers, recensione](https://www.twoaveragegamers.com/backloggd-review/),
[Two Average Gamers, state of game tracking 2026](https://www.twoaveragegamers.com/state-of-game-tracking-2026-the-complete-industry-report/).

## HowLongToBeat

_Controllato il 07/11/2026, da fonti di terzi e da una copia archiviata del 2022._

- **Cos'è**: un database di durate (storia, storia più extra, completista)
  raccolte dagli utenti, con un backlog personale accanto.
- **Come si paga**: non ho trovato un piano a pagamento.
- **Import**: Steam, dalla libreria pubblica del profilo (verificato sul sito
  l'08/11/2026).
- **Rispetto a Ludex**: per noi è una **fonte**, non un concorrente diretto
  (step 6, recupero HLTB). Ha la durata ma non la usa per proporti cosa
  giocare stasera; Ludex filtra per durata in SQL e ragiona sul resto.

Fonti: [home archiviata, 2022](https://webcf.waybackmachine.org/web/20220430210854/https://howlongtobeat.com),
[forum di Steam](https://steamcommunity.com/discussions/forum/10/3761103203684072086).

## Playnite

_Controllato il 07/11/2026, dal repository GitHub._

- **Cos'è**: gestore e launcher di librerie open source per Windows. Unifica
  Steam, Epic, GOG, EA App, Battle.net e altri, più gli emulatori. Si estende
  con plugin .NET, script PowerShell e temi. I dati stanno sul PC.
- **Come si paga**: gratis, open source.
- **Mobile**: nessuno. È l'assenza da cui nasce Ludex.
- **Stato**: in riscrittura da zero per la versione 11; le pull request sono in
  pausa.
- **Rispetto a Ludex**: è il modello per l'unificazione delle librerie, ma
  vive su un PC solo, lancia i giochi invece di aiutare a sceglierli, e non c'è
  quando sei lontano dal PC. Ludex sta sul server, si apre da web e telefono, e
  le console (PSN, Xbox, Nintendo) ci entrano come librerie, non come
  emulatori.

Fonti: [repository GitHub](https://github.com/JosefNemec/Playnite/).

## Le app "cosa gioco dopo"

_Controllato l'08/11/2026, dai riassunti della ricerca web: le pagine di App
Store e Product Hunt non erano raggiungibili dalla sessione. Sono descrizioni
scritte dagli sviluppatori._

Quattro app piccole che promettono la stessa cosa di Ludex. Contano più per il
nome (lo slogan "what to play next" è già affollato) che come concorrenti.

| App                                 | Dove                               | Cosa fa                                                                                               | Come sceglie                                                                                                            | Import         |
| ----------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- | -------------- |
| **Playnxt** (Trblclef Technologies) | iOS, prezzo incerto                | backlog e wishlist con statistiche, gioco con gli amici; si dice "premium"                            | non dichiarato                                                                                                          | nessuno citato |
| **NextPlay: Game Database**         | iPhone, gratis con acquisti in-app | quattro liste (Playing, Played, Want to Play, Dropped), giochi aggiunti a mano                        | Smart Pick: da storico, voti e gusti; gratis pesca solo da Want to Play, a pagamento l'AI propone anche giochi non tuoi | nessuno citato |
| **WhichGameNext**                   | web, lanciato il 21/01/2025        | consigli con l'AI, prezzi nei negozi e negli abbonamenti, backlog e liste; 9 follower su Product Hunt | AI, senza dettagli                                                                                                      | non trovato    |
| **Playlogged**                      | iPad, gratis, senza account        | tracker minimale, dati da IGDB                                                                        | Next to Play: a caso, il più vecchio aggiunto, o il voto più alto                                                       | nessuno citato |

**Rispetto a Ludex**: nessuna dice di filtrare per tempo disponibile,
piattaforma o mood. Scelgono a caso, per voto, o delegano tutto all'AI, che è
proprio ciò che la divisione SQL / vector search / LLM evita. E senza import
la libreria si riempie a mano.

Fonti: [App Store – Playnxt](https://apps.apple.com/jp/app/playnxt/id6444549960?l=en-US),
[App Store – NextPlay](https://apps.apple.com/us/app/nextplay-game-database/id6760037398),
[Product Hunt – WhichGameNext](https://www.producthunt.com/products/whichgamenext/launches),
[App Store – Playlogged](https://apps.apple.com/us/app/playlogged/id6760157713).
