# PileCue — marchio definitivo

Direzione approvata il 10 novembre 2026: **la prima** della
[tavola originale](approved-direction.png). Marchio esteso con la pila che
emerge dalla **e finale**, icona con la **P davanti alla pila**. La E formata
dalle custodie è scartata. Nel marchio esteso la P è una sola, senza simbolo
aggiuntivo a sinistra. Le due forme usano la stessa silhouette della P.

## Asset e sorgenti

- `wordmark-dark.svg` / `wordmark-light.svg`: marchio esteso, trasparente.
- `icon.svg`: simbolo su fondo navy, colori fissi.
- `favicon.svg`: silhouette dedicata a 16 px, P e due dorsi senza faccette.
- `icon-{16,32,48,192,512}.png`: esportazioni, tutte controllabili a misura reale.
- Sorgente unica dei tracciati: `packages/ui/src/brand-artwork.ts`.
- UI condivisa: `packages/ui/src/components/logo.tsx` (`Logo` e `Wordmark`).

Le lettere sono tracciati originali, non un font: nessuna nuova dipendenza
tipografica e nessun font pixel applicato al testo dell'interfaccia.
La tavola è una proposta raster generata con ImageGen; gli asset di produzione
sono una trascrizione vettoriale della direzione approvata, senza sfondo o titoli
della tavola. Il testo Pile segue il tema; Cue e le custodie hanno colori fissi.

## Rigenerazione

`pnpm --filter @repo/ui brand:generate` (Node >=24 e Chromium di Playwright).
Se Chromium è già installato nel sistema, indicare il suo percorso con
`pnpm --filter @repo/ui brand:generate --chromium=/percorso/al/browser`. Lo script usa solo le dipendenze esistenti,
rigenera gli SVG, i PNG e il contenitore ICO con livelli 16/32/48.

Le copie distribuite sono in `apps/web/public` e `apps/mobile/assets`.
L'icona Expo e la splash sono 1024×1024; Apple touch è 180×180.
Le palette, i token UI e gli identificatori tecnici restano un lotto separato.
