# Ricerca nei filtri su telefono, e la x che svuota

**Stato: deciso il 25/10/2026, in corso.** Due commenti dall'uso sul telefono
(il web, non l'app Expo):

1. aprendo i filtri di `/backlog` la ricerca sparisce: il pannello copre il
   90% dello schermo, e con lui la barra;
2. nelle ricerche manca la x per svuotare il testo.

## 1. La ricerca nel pannello dei filtri

`FilterPanel` (`apps/web/components/backlog-filters.tsx`) ha in cima la stessa
`SearchInput` della barra, sopra l'ordinamento, **solo sotto `$sm`**: è la
soglia dove la ricerca della barra prende una riga sua. Le due caselle scrivono
lo stesso `q` nell'URL, e `SearchInput` si riallinea quando il valore cambia da
fuori. La visibilità la decide il CSS, su un `YStack` intorno (la regola
dell'idratazione in [apps/web](../apps/web/CLAUDE.md)).

Solo `/backlog`: playlist e liste a mano non hanno il pannello.

## 2. `ClearableInput` in `packages/ui`

Un `Input` dentro un `InputGroup`, con la x quando c'è testo: i pezzi di
`SearchField`. La x svuota il campo e rimette il fuoco nel campo; in
`SearchInput` (`/backlog`, playlist, liste) svuota anche la lista **subito**,
senza il ritardo della scrittura, mentre le altre ricerche seguono il loro; sta fuori dal giro del Tab, come nel
`SearchField`. Etichetta della x per i lettori di schermo decisa dall'app.
Con la sua storia, che è il suo test.

Dove va — le ricerche che la x non l'avevano (`SearchField` e `Combobox` ce
l'hanno già):

| Dove                                             | File                                                   |
| ------------------------------------------------ | ------------------------------------------------------ |
| `/backlog`, playlist aperta, lista a mano aperta | `components/list-controls.tsx` (`SearchInput`)         |
| `/search`                                        | `src/routes/_app.search.tsx`                           |
| Da sistemare / Nascosti dell'account             | `components/account-filters.tsx`                       |
| Anteprima dell'import CSV                        | `components/csv-import.tsx`                            |
| Admin: dati mancanti, scarti, utenti             | `src/routes/_app.admin.{missing,unresolved,users}.tsx` |
| Admin: ricerca della fusione, `IgdbPicker`       | `components/admin/{merge-dialog,igdb-pick-dialog}.tsx` |
| «Aggiungi gioco», il titolo che cerca su IGDB    | `components/add-game-dialog.tsx`                       |
| Il campo di tag e categorie (filtra e crea)      | `components/tag-picker.tsx`                            |

Restano senza x, decisione dell'utente: accesso e registrazione, password,
nomi (playlist, liste, account, etichette dei negozi), profili e token dei
negozi, note, data di aggiunta, «Segnala un errore», «Inserisci id» e motivo
del ban dell'admin, i campi numerici degli slider e «Vai a pagina», il link
della playlist condivisa.

## 3. Le azioni dell'intestazione vanno a capo, a destra

Dall'uso (27/10, Firefox su Pixel 9, pagina ingrandita a circa 288 px): su
`/backlog` «Aggiungi gioco» usciva dal margine destro. Il gruppo delle azioni
di `Page` (`apps/web/src/components/page.tsx`) aveva `flexWrap`, ma una view di
Tamagui non si restringe: restava largo quanto i bottoni in fila e i bottoni
non andavano mai a capo. Ora ha `maxW="100%"`, quindi a 288 «Aggiungi gioco»
va sotto «Nascosti», e — scelta dell'utente — `ml="auto"` e
`justify="flex-end"`: le azioni stanno a destra anche su una riga loro. Vale per
ogni pagina con azioni; da `$md` non cambia niente.

Il blocco dei filtri a 288 va a capo (la vista sulla riga sotto, a destra) ma
resta nei margini: non si tocca.

Provato con Playwright in Chromium a 288, 412 e 1280: prima a 288 il bottone
finiva 13 px oltre l'intestazione, dopo nessuno la supera.

## Verifiche

`pnpm lint`, `pnpm check-types`, `pnpm --filter @repo/ui test`, e una prova a
390 px con Playwright sul pannello dei filtri.
