# Il nome: da Ludex a Beatpile

**Da approvare.** Il nome è deciso l'08/11/2026; questo piano dice cosa
cambia nel codice e cosa no. Niente è stato toccato.

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

## Da decidere prima del codice

1. **Il simbolo.** Il `Logo` è una tessera con la **«L»** e due copertine
   dietro (12, F2). Con la B la «L» non regge. Tre strade:
   - **A — la stessa tessera con la «B»**: cambia un solo `Path`, il resto
     del disegno resta.
   - **B — la tessera senza lettera**: le tre copertine impilate sono già una
     _pile_, e il simbolo non dipende più dal nome.
   - **C — un simbolo nuovo**: torna al passo 1 del 12, con tre proposte.

   Parere: **B**. La pila è proprio il nome, e un simbolo senza lettera non va
   ridisegnato al prossimo cambio. Come nel 12, prima di scegliere si vedono
   in SVG accanto al nome e a 16 px.

2. **Il dominio.** Quale si compra (`beatpile.gg`, `.com`, `.app`) e se il
   sito ci passa subito o resta per ora su un sottodominio di
   `sanvisimo.tech` (`beatpile.sanvisimo.tech`).

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

1. Il simbolo: tre SVG accanto al nome, scelta.
2. Nome e simbolo in `packages/ui` e negli asset; `pnpm --filter @repo/ui test`.
3. Messaggi, testi legali, email, file scaricabili; `pnpm --filter web test`,
   `pnpm --filter api test`, `pnpm lint`, `pnpm check-types`.
4. La riga del `CLAUDE.md`.
5. Il dominio, quando è comprato: CI, `docs/minipc.md`, e la lista delle cose
   da cambiare fuori dal repo.
