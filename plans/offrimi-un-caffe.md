# Offrimi un caffè

**Stato: segnaposto fatto il 28/10/2026** nel lotto del [rilascio](rilascio.md),
e il 29/10 le schede in roadmap e nell'account. La piattaforma è ancora da
scegliere (Ko-fi è la candidata), quindi la costante è `supportUrl` in
`lib/credits.ts`: finché è `null` non si vede niente, né il footer né le
schede. Le schede sono nostre e non il widget pronto della piattaforma, che
caricherebbe script e cookie di terzi. Restano la piattaforma e il
chiarimento fiscale qui sotto.
Prima era: **piano, da approvare.** Branch `ccr-32888f38-imrpc3`. Fa parte del
[rilascio](rilascio.md), aggiunto il 21/10/2026.
Roadmap: nessuna voce (vedi sotto).

## Perché

Un modo per sostenere Ludex con una donazione singola, senza abbonamenti. La
piattaforma è **Ko-fi**: 0% di commissione sulle donazioni singole (restano
quelle di Stripe / PayPal). Liberapay, unica alternativa non profit e UE, fa
solo donazioni ricorrenti e qui non serve.

Gli abbonamenti non sono in questo lotto: se arrivano, arrivano con l'AI
(step 13/14). Ko-fi li gestisce sulla stessa pagina, quindi il link di adesso
resta buono.

## Cosa si fa

1. **L'indirizzo**: `kofiUrl` in
   [credits.ts](../apps/web/lib/credits.ts), accanto a `repoUrl` e `issuesUrl`.
2. **Dove si vede**: nel `Footer` di
   [app-shell.tsx](../apps/web/src/components/app-shell.tsx), quinta voce dopo
   roadmap, crediti, privacy e condizioni. Esce dall'app, quindi è un
   `ExternalLink` ([external-link.tsx](../apps/web/src/components/external-link.tsx)),
   non un `FooterLink`, che accetta solo le rotte interne.
3. **Il testo**: `nav.coffee` nei due file dei messaggi, «Offrimi un caffè» e
   «Buy me a coffee».

## Cosa non si fa

- **Niente widget ufficiale di Ko-fi**: caricherebbe uno script e i cookie di
  Ko-fi su ogni pagina, e andrebbe aggiornata l'informativa in
  [legal.ts](../apps/web/lib/legal.ts). Un link semplice non raccoglie nulla e
  l'informativa resta com'è.
- **Niente voce in roadmap**: è un link nel footer, non una funzione per
  decidere cosa giocare.

## Da sapere prima del codice

- Il nome utente Ko-fi (`ko-fi.com/<nome>`).
- Fisco: in Italia le donazioni a una persona fisica possono contare come
  reddito. Da chiarire con un commercialista prima di attivare il link.

## Verifica

- `pnpm lint` e `pnpm check-types`.
- Sulla pagina vera: il link nel footer, in italiano e in inglese, apre Ko-fi
  in una scheda nuova; sul telefono va a capo con le altre voci senza
  sovrapporsi alla barra in basso.
