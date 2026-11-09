# Il nome: da Ludex a Beatpile

**Da approvare.** Il nome è deciso l'08/11/2026, il simbolo il 09/11;
questo piano dice cosa cambia nel codice e cosa no. Il codice non è stato
toccato.

## Perché

«Ludex» è già preso tre volte nel mondo dei giochi: ludex.it («Eventi e
giochi», italiano, il conflitto più serio), Ludex di ludex.com (app americana
per le carte collezionabili) e Ludex Technologies di Montréal (sfide ai
videogiochi). Il dominio non ci blocca, vivendo su `ludex.sanvisimo.tech`; il
marchio sì.

**Beatpile** viene da _beat the pile_, «batti la pila»: la _pile of shame_ è il
backlog nel gergo dei giocatori, e _beat_ è il verbo con cui finiscono un
gioco. La pila è **la tua**: Ludex sceglie dentro il backlog che hai, non
propone giochi nuovi come NextPlay o WhichGameNext. Lo scopo del progetto non
cambia, e il `CLAUDE.md` non si riscrive. I concorrenti e le alternative
scartate (Pilepick, Pilebeat, WhatPlayNext, What2play…) sono in
[docs/competitors.md](../docs/competitors.md) e nella conversazione dell'08/11.

Verificato dall'utente: nessun prodotto, dominio o marchio «Beatpile» trovato.

## Il simbolo — deciso il 09/11/2026

Tutte le bozze, in ordine, sono in [nome-beatpile-bozze/](nome-beatpile-bozze/):
un PNG da guardare e l'HTML da cui viene. In `sorgenti/` gli script che le
producono, uno per bozza, con il carattere: da quella cartella
`node 12-nomi-e-accento.mjs` riscrive l'HTML, e `node png.cjs` (Playwright)
rifà i PNG. Rigenerate dal repo, le bozze 01–11 escono identiche.

[nome-beatpile-simbolo.svg](nome-beatpile-simbolo.svg) è la bozza scelta
(bozza 11):

- **tre custodie di videogiochi**, una pila un po' storta (−3°, 3°, 8°);
- i **colori delle tre console**, vicini ai marchi ma non uguali, saturi:
  blu davanti (`#0050e6`, PlayStation è `#003791`), rosso in mezzo
  (`#ee0a1f`, Nintendo `#e60012`), verde dietro (`#13a313`, Xbox `#107c10`,
  valore non confermato). I valori dei marchi vengono da siti di palette, non
  dalle linee guida ufficiali;
- il **bordo di plastica chiaro**: la scocca è il colore della custodia
  schiarito (bianco al 45%), più spessa a sinistra dove c'è la cerniera, con
  la copertina rientrata nel colore pieno;
- il **riflesso lucido** sulle copertine: uno sfumato chiaro in diagonale
  dall'angolo in alto a sinistra;
- **«bp» minuscolo, bianco**, centrato nella copertina blu sull'inchiostro
  delle lettere (Space Grotesk 700, 11,4), con lo stesso margine ai due lati.
  Contrasto 6,4.

Come ci si è arrivati, in ordine: la tessera teal senza lettera → la stessa
nei colori del fuoco → «BP» → «bp» minuscolo, più leggibile a 32 px → le
tessere diventano custodie → storte, con il bordo di plastica chiaro → le
custodie nei colori delle console (blu, rosso, verde), che slegano il simbolo
dall'accento → colori più vicini ai marchi e lucidi → le lettere centrate
nella copertina. Scartati per strada: la pila in fiamme con «BP» (a 16 px
restava una macchia), la tessera davanti scura, i colori del fuoco e quelli
Radix delle console (opachi accanto ai marchi).

Cose che la bozza lascia aperte, da chiudere nella rifinitura:

- **i colori del simbolo sono fissi**, come oggi: è anche favicon e icona
  dell'app, che il tema non lo sanno;
- **a 16 px le lettere non si leggono**: resta la sagoma, tre rettangoli
  storti blu, rosso e verde. Va deciso se la favicon è questa o una versione
  semplificata;
- su fondo chiaro il bordo lucido quasi si perde;
- le lettere sono testo in Space Grotesk: nel `Logo` e nei file della favicon
  e dell'icona vanno convertite in tracciati.

## Il nome scritto — confermato il 09/11/2026

Due forme, perché il nome disegnato a 24 px non regge:

- **disegnato**, per home, splash e crediti: nella prima bozza «BEAT» nel
  fuoco e «PILE» fatto di custodie impilate. Col simbolo nei colori delle
  console il fuoco non c'è più: va ridisegnato;
- **in testo**, per la barra e dove il disegno non regge: «**beat**pile» in
  Space Grotesk, _beat_ nel colore dell'accento e _pile_ in quello del testo,
  che cambiano col tema.

## I colori — l'accento, da decidere

Con il fuoco l'accento sarebbe passato all'arancio; con i colori delle console
il simbolo non è più legato all'accento. Il teal accanto ai tre colori però
stona (09/11). Le due strade (bozza 08):

- **blu**, dalla scala Radix `blue`, che ha già i passi misurati per i due
  temi: il blu del simbolo, fisso e scuro, come testo sul fondo scuro fa 2,4.
  Sul pulsante il testo va scuro (5,0 sul `blue 9`; il bianco fa 3,3);
- **neutro**: pulsanti neri sul chiaro e bianchi sullo scuro, il colore lo
  porta solo il simbolo. È l'idea di `palettes.ts`: l'interfaccia sta
  indietro, il colore lo mettono le copertine.

Verde e rosso restano fuori: sono già «riuscito» e «distruttivo».

Tocca `accents` e `defaultAccent` in `packages/ui/src/palettes.ts`, i commenti
che motivano il teal (`palettes.ts`, `button.tsx`, `logo.tsx`, la timeline di
`_app.roadmap.tsx`) e la voce «L'identità» di
[packages/ui/CLAUDE.md](../packages/ui/CLAUDE.md). Prima del codice si
misurano i contrasti di Button e Badge, come nel 12a.

## Da decidere prima del codice

1. **Il dominio.** Quale si compra (`beatpile.gg`, `.com`, `.app`) e se il
   sito ci passa subito o resta per ora su un sottodominio di
   `sanvisimo.tech` (`beatpile.sanvisimo.tech`).
2. **Beatpile o Pilepick.** Il 09/11 si è riaperta la prova con Pilepick
   (bozza 07): stesso simbolo, «pp» al posto di «bp», e nel nome in testo si
   colora il verbo, _pick_.
3. **L'accento**: blu o neutro, sopra. La bozza 12 mette i due nomi con i due
   accenti in un pezzo d'interfaccia: barra, pulsante, voce attiva,
   etichetta, link. Lì stonavano tre blu diversi (simbolo, nome, pulsante) e
   il pulsante blu col testo scuro; la bozza 13 prova un blu solo: Radix
   `indigo`, o il blu del simbolo stesso, tutti e due col testo bianco sul
   pulsante.
4. **Le forme delle custodie** (bozza 14): le tre custodie con i segni dei
   modelli delle console, senza loghi. Prima di sceglierla va pesato che
   colore e forma insieme richiamano la confezione di ciascun marchio. La
   bozza 15 tiene le copertine chiare e dà a tutte e tre la forma del modello
   Xbox, senza la striscia nera: cornice colorata e lucida, fascia
   rettangolare in alto, in due spessori di cornice. Lì però la fascia si
   appiattiva nella cornice; la bozza 16 la stacca: tono più scuro, striscia
   scura in diagonale, due righe chiare, o solo senza il riflesso sopra.

## Cosa cambia: ciò che vede chi usa l'app

- **Nome e simbolo**: `Wordmark` e `Logo` in `packages/ui`, con la loro storia
  (`logo.stories.tsx` cerca il testo «Ludex»); favicon e
  `apple-touch-icon` in `apps/web/public`; icona e splash in
  `apps/mobile/assets`; `name` in `apps/mobile/app.json`.
- **I due file dei messaggi**, `apps/web/messages/it.json` e `en.json`: una
  cinquantina di frasi ciascuno, compresi titolo, login, registrazione,
  roadmap, crediti e la scheda del caffè. Tre frasi scrivono «ludex»
  minuscolo: diventano «Beatpile» come le altre.
- **I testi legali**, `apps/web/lib/legal.ts`: privacy e condizioni nominano
  il servizio. Vanno cambiati con lo stesso senso, nelle due lingue.
- **Le email**, `packages/auth/src/emails.ts`: oggetti, testi, intestazione e
  piede. Il mittente di riserva in `packages/auth/src/mailer.ts` e
  `MAIL_FROM` in `.env.example`; quello vero va cambiato anche nel `.env` del
  mini PC.
- **I file che si scaricano**: l'export dell'account
  (`ludex-export-AAAA-MM-GG.json`, in `account-data.tsx`) e l'esempio del CSV
  (`apps/web/public/ludex-import-example.csv`, citato da `csv-import.tsx` e dal
  test di `csv-file`). Diventano `beatpile-…`.
- **Il dominio**, se cambia: `PUBLIC_API_URL` in `.github/workflows/ci.yml`,
  `docs/minipc.md`, e fuori dal repo il tunnel e Access di Cloudflare,
  `BETTER_AUTH_URL` e `WEB_URL` sul mini PC e i redirect registrati presso i
  negozi che li vogliono. Cambiando host le sessioni aperte si perdono: chi
  usa l'app rientra una volta.
- **Il `CLAUDE.md`**: una riga in cima che dice che il prodotto si chiama
  Beatpile e che `ludex` resta il nome interno, così chi legge «ludex» nel
  codice non lo prende per un residuo da correggere.

## Cosa resta `ludex`

Non lo vede chi usa l'app, e cambiarlo costa senza dare niente:

- il database, l'utente Postgres e i container (`docker-compose.yml`, CI,
  mini PC): rinominarli è un trasloco del database;
- il repository, i nomi dei pacchetti e l'immagine `ghcr.io/sanvisimo/ludex`
  (il link al sorgente nei crediti e nelle condizioni resta valido);
- l'`User-Agent` verso le fonti esterne, il canale Redis, la classe CSS dello
  `Spinner`, lo `slug` di Expo;
- i commenti nel codice e lo storico in `plans/` e `docs/`.

## Passi

1. ~~Il simbolo: le bozze accanto al nome, scelta.~~ Fatto il 09/11.
2. L'accento: le misure qui sopra, poi `palettes.ts`;
   `pnpm --filter @repo/ui test`, e Chromatic per vedere tutto il resto.
3. Nome e simbolo in `packages/ui` e negli asset, con le lettere in
   tracciati; `pnpm --filter @repo/ui test`.
4. Messaggi, testi legali, email, file scaricabili; `pnpm --filter web test`,
   `pnpm --filter api test`, `pnpm lint`, `pnpm check-types`.
5. La riga del `CLAUDE.md` e la voce «L'identità» di `packages/ui/CLAUDE.md`.
6. Il dominio, quando è comprato: CI, `docs/minipc.md`, e la lista delle cose
   da cambiare fuori dal repo.
