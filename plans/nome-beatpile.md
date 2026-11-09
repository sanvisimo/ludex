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

[nome-beatpile-simbolo.svg](nome-beatpile-simbolo.svg) è la bozza scelta:

- **tre custodie di videogiochi**, una pila un po' storta (−3°, 3°, 8°);
- i **colori del fuoco**: ambra davanti (`amber 9`, `#ffc53d`), arancio in
  mezzo (`orange 9`, `#f76b15`), rosso dietro (`red 10`, `#ce2c31`);
- il **bordo di plastica chiaro e lucido**: la scocca è il colore della
  custodia schiarito (bianco al 45%), più spessa a sinistra dove c'è la
  cerniera, con la copertina rientrata nel colore pieno;
- **«bp» minuscolo** sulla custodia ambra, la **b rosso scuro** (`#a3171c`,
  contrasto 4,9 sull'ambra) e la **p scura** (`slate 12`, 10,4).

Come ci si è arrivati, in ordine: la tessera teal senza lettera (B) → la
stessa nei colori del fuoco → «BP» con la B arancio e la p bianca, che
sull'ambra non si leggono (1,9 e 1,6) → «bp» minuscolo, più leggibile a 32 px
→ le tessere diventano custodie → storte, con il bordo di plastica, chiaro.
Scartati per strada: la pila in fiamme con «BP» (a 16 px restava una macchia)
e la tessera davanti scura.

Cose che la bozza lascia aperte, da chiudere nella rifinitura:

- **la p non cambia colore col tema.** Sta sulla custodia ambra, che è uguale
  sui due fondi, e il simbolo resta a colori fissi come oggi: è anche favicon
  e icona dell'app, che il tema non lo sanno;
- **a 16 px le lettere non si leggono**: resta la sagoma, tre rettangoli
  storti nei colori del fuoco. Va deciso se la favicon è questa o una
  versione semplificata;
- su fondo chiaro il bordo lucido quasi si perde;
- le lettere sono testo in Space Grotesk: nel `Logo` e nei file della favicon
  e dell'icona vanno convertite in tracciati.

## Il nome scritto — da confermare

Due forme, perché il nome disegnato a 24 px non regge:

- **disegnato**, per home, splash e crediti: «BEAT» nel fuoco e «PILE» fatto
  di custodie impilate. Solo una prima bozza;
- **in testo**, per la barra e dove il disegno non regge: «**beat**pile» in
  Space Grotesk, _beat_ in arancio e _pile_ nel colore del testo, che cambia
  col tema.

## I colori — l'accento passa al fuoco

Deciso di spostare l'accento dal teal verso i colori del simbolo. Prima del
codice va misurato, come nel 12a:

- **i contrasti** di Button e Badge con l'arancio: con il teal il testo del
  Button è scuro (6,16); sull'arancio Radix va verificato se tiene il testo
  scuro o vuole quello chiaro;
- **l'arancio contro i colori di stato**: `red` è il distruttivo e `amber`
  l'avviso (`palettes.ts`). Un accento arancio fra i due rischia che "questo
  si clicca" e "attenzione" si confondano;
- **le copertine**: il teal era stato scelto perché il viola e il magenta
  stanno dappertutto sulle copertine. Va guardato il backlog vero con
  l'arancio.

Tocca `accents` e `defaultAccent` in `packages/ui/src/palettes.ts`, i commenti
che motivano il teal (`palettes.ts`, `button.tsx`, `logo.tsx`, la timeline di
`_app.roadmap.tsx`) e la voce «L'identità» di
[packages/ui/CLAUDE.md](../packages/ui/CLAUDE.md).

## Da decidere prima del codice

1. **Il dominio.** Quale si compra (`beatpile.gg`, `.com`, `.app`) e se il
   sito ci passa subito o resta per ora su un sottodominio di
   `sanvisimo.tech` (`beatpile.sanvisimo.tech`).
2. **Il nome scritto**, sopra: le due forme vanno confermate.

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
