# PileCue — integrazione del marchio approvato

## Decisione (10/11/2026)

Approvata la prima variante della tavola in
[docs/brand/pilecue](../docs/brand/pilecue/README.md): wordmark con pila dalla e
finale, icona P davanti alla pila. La proposta e la decisione precedono il codice.
Il cambio dei token UI è ancora separato da questo lotto.

## Implementazione

- [x] Conservare la tavola approvata nel repository.
- [x] Disegnare i tracciati SVG condivisi e riusare la stessa P.
- [x] Integrare Wordmark e Logo su web e mobile, con nome accessibile PileCue.
- [x] Preparare asset statici e generatore per web, favicon ed Expo.
- [x] Aggiornare nome pubblico della pagina web e dell'app mobile.
- [x] Verificare build, typecheck, storie e resa su fondi chiaro/scuro.
- [ ] Revisione del risultato da parte dell'utente.

Nessuna modifica a package name, slug Expo, URL/API, database, palette o font UI.

## Verifiche eseguite

- Build web (client e server): riuscita.
- Typecheck: @repo/ui, web e mobile riusciti.
- Lint: @repo/ui e web riusciti.
- Tre storie del logo in Chromium con controlli axe: riuscite.
- Rendering SVG in Chromium, tema chiaro/scuro e misura navbar: ispezionato
  in [preview.png](../docs/brand/pilecue/preview.png).
- Favicon 16/32/48, PNG 192/512, Apple touch 180 e Expo 1024 generati.
- Generatore verificato con Chromium di sistema usando `--chromium`.
- Expo sul Pixel 9a: wordmark verificato nei due temi e al cambio di schema.
- Icona launcher e splash standalone: asset/config verificati; serve una build nativa dedicata.

## Correzione tema di sistema (10/11/2026)

Lo SVG usava `theme.color12.val`: il colore chiaro calcolato sul server poteva
restare nell’attributo SVG dopo l’idratazione, pur con pagina scura. Ora usa
`theme.color12.get()`: sul web resta la variabile CSS, su native il colore.
Riprodotto da ospite su `/` e verificato con sistema scuro/chiaro e cambio
di preferenza a pagina aperta. Aggiunta storia di regressione che cambia il
colore CSS senza aggiornare il contesto React.

## Email (10/11/2026)

Le email dell'account ([emails.ts](../packages/auth/src/emails.ts)) usano la
palette di [email-brand.ts](../packages/auth/src/email-brand.ts) e, in testa
alla card bianca, il wordmark PNG («Pile» navy, fondo bianco) allegato inline
(CID): niente immagini caricate da un indirizzo, quindi niente «mostra
immagini» né tracciamento. Se le immagini sono spente resta l'alt «PileCue».
Provata prima una fascia navy (più robusta nel tema scuro dei client, che
scuriscono la card ma non il PNG); scelta la testata bianca.
Colori e PNG si rigenerano con `pnpm --filter @repo/ui brand:email`.

- [x] Palette e logo nelle email.
- [ ] Prova con l'SMTP di produzione su Gmail e Outlook.

## Favicon a 16 px (11/11/2026)

Assottigliato il gambo della P da 4 a 3 px e ripristinato il piedino in basso
a sinistra, con una sporgenza di 1 px nelle ultime due righe. Il foro resta
3×3 px. Rigenerati SVG, PNG 16 e ICO dalla sorgente condivisa; verificati
i pixel in Chromium e la corrispondenza del livello 16 px nel contenitore ICO.
