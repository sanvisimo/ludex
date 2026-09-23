# Step 12a — Il design system, universale

## Contesto

Lo step 12 riscrive l'interfaccia, nell'ordine **12a design system → 12b guscio
→ 12c backlog → 12d card e pagina gioco → 12e home → 12f ricerca → 12g account**.
Il 12a viene per primo perché gli altri sei costruiscono su di lui.

In fase di piano è stata presa una decisione che il CLAUDE.md lasciava
esplicitamente aperta — «non introdurre un layer di componenti cross-platform
senza una decisione esplicita»: **il design system è universale, web e mobile
condividono i componenti**, costruito su **Tamagui**. La vecchia riga «Web e
mobile non condividono componenti UI» va riscritta di conseguenza.

Cosa c'è oggi, misurato:

- **15 componenti** in `apps/web/components/ui`, usati **82 volte**: shadcn/ui
  stile `base-nova` su Base UI 1.7.0, Tailwind 4, token oklch neutri.
- **`app/layout.tsx` è l'unico server component**: gli altri 41 file sono
  `'use client'`. I punti di contatto con Next sono 17 in tutto.
- **`apps/mobile` non esiste**: nel repo ci sono solo `api` e `web`.
- Ogni pagina ripete a mano `mx-auto grid max-w-4xl gap-6 p-6` (4 copie).

## Il metro

Cosa chiedono i lotti 12b–12g, ricavato dal piano e dal codice:

| Lotto | Chiede |
| --- | --- |
| 12b guscio | navigazione laterale, sheet mobile, separator, avatar, tooltip |
| 12c backlog | toggle di vista (righe/griglia/compatta), paginazione, lista densa, popover, checkbox, slider di range, accordion, stato vuoto |
| 12d gioco | tabs, barre dei voti, carosello screenshot, anteprima al passaggio |
| 12e home | card, list item |
| 12f ricerca | campo con ricerca asincrona e risultati a tendina |
| 12g account | tabs, liste, dialoghi, menu |

Tamagui copre Dialog, AlertDialog, Popover, Sheet, Tooltip, Toast, Select,
Accordion, Tabs, Group, Avatar, Card, Image, ListItem, Form, Input, Checkbox,
RadioGroup, Slider, Switch, Progress, Spinner, Separator, ScrollView, gli stack
e la tipografia. **Restano da costruire**: navigazione laterale, paginazione,
carosello, tabella densa, campo di ricerca con tendina. Su mobile le ultime due
diventano comunque un'altra cosa (lista virtualizzata, schermata di ricerca),
quindi il "costruire da soli" è in parte inevitabile a prescindere.

## La decisione, e cosa costa

**Tamagui 2.7.7** (`@tamagui/core` per lo styling, `tamagui` per il kit). È
l'unico candidato credibile per un design system universale: compila a CSS
atomico sul web e a stili nativi su mobile, i token sono type-safe e condivisi,
il modello dei componenti è copy-paste componibile come shadcn.

Gli altri, e perché escono:

- **react-strict-dom** (Meta): fermo a `0.0.55`, ultima pubblicazione 09/01/2026.
  È la via "standard" per unificare web e native e non è matura.
- **NativeWind** 4.2.7: porta Tailwind su React Native, ma è solo styling — i
  componenti resterebbero da scrivere comunque, senza il compilatore né i token
  type-safe di Tamagui.
- **gluestack-ui**: `@gluestack-ui/themed` è fermo a settembre 2025.
- **Base UI + registry shadcn**: era la strada precedente ed esce per un motivo
  solo ma insuperabile — è DOM, su React Native non gira.

**Il prezzo, dichiarato e accettato:**

- **Si perde il registry shadcn**, cioè 60+ componenti già scritti. I ~30 che
  servono ai lotti 12b–12g li scriviamo noi, accessibilità compresa.
- **Si perde l'HTML semantico sul web**: react-native-web emette `div`, e
  l'accessibilità passa da `accessibilityRole` invece che da `<form>`,
  `<label>`, `<dialog>`, `<table>`. Va tenuto d'occhio sulle pagine pubbliche
  (`/`, `/games/[id]`).
- **`react-native-web` entra nel bundle web**, ed è il punto che sembra una
  contraddizione perché Tamagui lo dichiara concorrente nei suoi benchmark.
  Misurato sul pacchetto installato: il **motore** non lo tocca —
  `@tamagui/web`, `@tamagui/core` e i componenti costruiti su di esso (`button`,
  `card`, `dialog`, `stacks`, `text`) hanno **0 file** che lo importano. Lo
  importano dieci pacchetti, e sono tutti dello stesso tipo: `scroll-view`,
  `image`, `slider`, `spinner`, `sheet`, `linear-gradient` più gli aiutanti per
  animazioni e tastiera. Cioè Tamagui compete con RNW come **libreria di stile**
  — lì traduce a runtime, Tamagui compila — e lo usa come **polyfill di
  primitive**, perché sul web l'implementazione di riferimento di `ScrollView` o
  `ActivityIndicator` è la sua. Non è un'incoerenza, è una divisione del lavoro
  mal dichiarata nella loro documentazione, che alla pagina di installazione non
  lo nomina nemmeno. Per noi: `primitives.ts` esporta `ScrollView` e `Spinner`,
  che sono fra i dieci. Il peso si misura al **12b**, quando ci sarà un bundle
  vero; se pesa, sul web lo scorrimento lo fa il body e lo spinner si disegna in
  venti righe, mentre su mobile quelle primitive restano quelle giuste.

- **Tailwind esce progressivamente.** Non si toglie nel 12a: i lotti 12b–12g
  riscrivono ogni schermata, quindi Tailwind sparisce lotto per lotto e si
  rimuove alla fine del 12. Nel frattempo i due sistemi convivono — è brutto
  dentro, non si vede fuori, e dura il tempo dello step.

## I token li fa Tamagui

Niente Panda CSS (è **web-only**: genera CSS, e React Native non legge CSS) e
niente pipeline DTCG/Style Dictionary. Con Tamagui i token sono già
cross-platform e type-safe: è il problema che risolve di mestiere, e
aggiungerci un formato intermedio sarebbe una terza definizione degli stessi
valori.

DTCG risolve il problema di tenere gli stessi valori in **due sistemi di
styling diversi** — web in Tailwind, mobile in StyleSheet. Con Tamagui su
entrambe le piattaforme quel problema non c'è: il file dei token di Tamagui *è*
la sorgente unica, e un JSON sopra sarebbe la stessa cosa scritta due volte con
uno step di build che può sfasarsi. **Cambia il giorno che entra Figma o un
designer**: lì DTCG è il ponte fra strumento di design e codice, ed è il suo
mestiere. Si aggiunge allora, e costa poco proprio perché i token staranno in un
punto solo.

Resta valida la struttura a tre livelli, che è la best practice indipendente
dallo strumento:

    primitivi (la scala: gray1…gray12, l'accent)
      → semantici (background, backgroundHover, borderColor, color)
        → di componente (nei `styled()` dei nostri componenti)

L'invariante da far rispettare: **nessun componente punta a un primitivo**.
Tamagui la incoraggia già con i suoi temi (`$background`, `$color`), che sono
esattamente il livello semantico.

## Come si costruisce, con Next 16

Punto verificato perché è dove queste cose si rompono: **Turbopack non supporta
plugin di bundler**, quindi Tamagui non usa più `withTamagui` su Next 16. In
sviluppo funziona senza alcun setup; in produzione l'ottimizzazione passa dalla
CLI, che avvolge il comando di build:

    tamagui build --target web ./src -- next build

`@tamagui/next-plugin` e `@tamagui/vite-plugin` (entrambi 2.7.7, pubblicati il
22/09/2026) restano per chi è su webpack o su Vite.

## Il banco di lavoro

**Storybook 10.6** con `@storybook/react-native-web-vite` (10.6.0, 19/09/2026):
le storie girano in react-native-web, quindi un solo Storybook mostra i
componenti universali. Le alternative sono state misurate e non reggono: Ladle
è fermo dal 04/11/2025, Histoire è in beta da gennaio, React Cosmos non ha
l'integrazione con Vitest.

Serve davvero, e più di prima: gli stati che questa UI deve mostrare sono
scomodi da riprodurre a mano — account `needs_reauth`, import in corso, gioco
senza copertina, senza durata, backlog con 0 / 1 / 400 righe, possesso su disco
accanto a uno da abbonamento. Nell'app servono dati veri nel database; in una
story sono props. E con un design system universale c'è una ragione in più:
è il posto dove si vede lo stesso componente sulle due piattaforme.

Test: `@storybook/addon-a11y` su tutte le storie, interaction test solo dove
c'è comportamento (select, dialog, rating a mezze stelle, toggle delle viste).

**La verifica che questa sezione rimandava è stata fatta, e l'esito è sì**:
`addon-vitest` gira sul framework react-native-web-vite. Misurato sul Button —
sette storie, sette test verdi, i due `play` compresi. Gli interaction test
entrano in CI.

E l'a11y **morde davvero**, il che non era scontato: provocata una violazione
di contrasto, il test diventa rosso con `color-contrast`. Vale la pena scrivere
anche il limite, scoperto nella stessa prova: un bottone di sola icona **senza**
`aria-label` passa axe, perché il glifo che contiene conta come nome
accessibile. La rete automatica non sostituisce l'etichetta sui bottoni icona —
va messa a mano, e su react-native-web si scrive `aria-label` come sul web.

Quattro cose misurate montandolo, che valgono per chi lo rimonterà:

- **Il banco vive in `packages/ui`**, non in `apps/web` come diceva la versione
  precedente di questo piano: i componenti stanno lì, e un banco montato
  sull'app web non si aprirebbe senza Next — cioè chiederebbe al design system
  universale proprio la dipendenza che non deve avere. Il comando è
  `pnpm --filter @repo/ui storybook`.
- **`turbo.json` non va toccato.** Il task `test` è già dichiarato in modo
  generico: basta lo script nel package, e `turbo run test --dry` mostra
  `@repo/ui#test -> vitest run`. La riga che prevedeva di dichiararlo era
  un'ipotesi sbagliata.
- **vitest resta sulla linea 4.** La 5.0.1 è uscita, ma
  `@storybook/addon-vitest@10.6.0` dichiara `^3 || ^4`, e `apps/api` è già su
  `4.1.10`: il monorepo resta su una versione sola. `@vitest/browser` e
  `@vitest/browser-playwright` vanno pinnati a `4.1.11`, perché il loro
  `latest` è già 5.
- **I test girano in un Chromium vero**, non in jsdom, ed è voluto: ciò che si
  verifica qui sono stili calcolati, focus da tastiera e contrasto, cioè
  esattamente ciò che jsdom non calcola. Costa 114 MB di Chrome headless in
  `~/.cache/ms-playwright`, fuori dal repo, e **in CI vanno installati**
  (`playwright install chromium`). È lo specchio di `apps/api`, che gira in Node
  contro un Postgres vero per la ragione simmetrica.

**Chromatic** è entrato dopo, ed è l'altra metà del banco: `addon-vitest`
verifica comportamento e accessibilità, Chromatic confronta i **pixel** fra una
build e l'altra. Nessuno dei due vede ciò che vede l'altro — un test di
interazione non si accorge di un bottone diventato storto, e uno snapshot non
si accorge che `onPress` non viene chiamato. Con quindici componenti e due temi
è la rete che rende sicuro toccare un token: si cambia un colore e si vede
subito **ogni** storia che ne risente.

Il prezzo va scritto perché non è tecnico: Chromatic è un servizio esterno, e
pubblicare una build gli manda gli snapshot dei componenti. Per un design
system non c'è niente di riservato lì dentro — sono bottoni e schede vuote, non
dati di libreria — ma il giorno che una storia montasse dati veri smetterebbe
di essere vero.

Due cose da non rifare male, perché `chromatic init` le lascia così:

- **il project token finisce in chiaro** nello script di `package.json`. Chi ce
  l'ha può pubblicare build sul progetto, quindi sta in `.env` come
  `CHROMATIC_PROJECT_TOKEN` e in `globalEnv` di `turbo.json`, come vuole il
  CLAUDE.md per ogni segreto. Chromatic **non** legge `.env` da sé — nel suo
  bundle `dotenv` compare solo nel package.json interno — quindi lo script
  passa da `dotenv-cli`: `dotenv -e ../../.env -- chromatic`.
- **serve un commit.** Chromatic aggancia ogni snapshot a un commit e a un
  ramo; con le storie ancora non tracciate dice «inizializza un repository
  Git», che è fuorviante — il repository c'è, è il lavoro che non è ancora
  dentro. Genera anche `build-storybook.log`, da ignorare.

**Le icone sono lucide, e il pacchetto giusto ha un `-2` in fondo.**
`@tamagui/lucide-icons-2` (2.7.7, stesso core del nostro) rende su entrambe le
piattaforme. Esiste anche `@tamagui/lucide-icons` **senza** il `-2`, fermo a un
`2.0.0-rc` di marzo che pinna un `@tamagui/core` diverso: due copie di core
nello stesso bundle, e il contesto del tema si spacca. Stanno dietro
`@repo/ui/icons`, un sottopercorso suo, perché sono oltre millecinquecento nomi
e in `index.ts` affogherebbero i componenti.

Su Vite chiedono **una riga di configurazione, e senza quella non rendono**:

    import { tamaguiAliases } from '@tamagui/vite-plugin'
    // in resolve.alias:
    ...tamaguiAliases({ svg: true })

`svg: true` sostituisce l'intero `react-native-svg` con
`@tamagui/react-native-svg`, che disegna SVG del DOM. È la soluzione giusta per
la ragione più semplice: **sul web quella libreria non serve**, il browser
l'SVG ce l'ha già.

Vale la pena tenere scritto cosa succede senza, perché l'errore non nomina né
le icone né l'SVG e ci si perde un pomeriggio. `react-native-svg` tiene la sua
versione per browser in file gemelli (`ReactNativeSVG.web.js` accanto a
`ReactNativeSVG.js`); Metro e webpack sanno che sul web va preso il gemello,
Vite no, e carica quello per telefoni, che chiede a React Native un registro di
immagini che nel browser non esiste. Dirglielo a mano **non basta**: Vite 8
prepara le librerie con rolldown, che ignora sia `resolve.alias` sia
`resolve.extensions`; e spegnere quella preparazione scopre il difetto gemello,
un parser in CommonJS in mezzo a file ESM che proprio quella preparazione
traduceva. È una tenaglia senza uscita, ed è la ragione per cui la via è
togliere di mezzo la libreria invece di configurarla.

Due cose trovate per strada:

- **`react-native-web@0.21.2` ha una dipendenza fantasma**: importa
  `@react-native/assets-registry/registry` senza dichiararlo. Con npm o yarn
  l'hoisting lo nasconde; con pnpm quel modulo non esiste e va installato a
  parte.
- **`tamaguiAliases` ha anche `rnwLite`**, che sostituisce `react-native-web`
  con una versione ridotta di Tamagui. È la risposta alla domanda sul peso di
  RNW lasciata al 12b: quando ci sarà un bundle vero da pesare, si prova quello
  prima di rinunciare a `ScrollView` e `Spinner`.

Due note minori ma da non riscoprire: `react-native` entra come devDependency
di `packages/ui` (20 MB) perché il framework lo dichiara peer **non** opzionale,
e resta un peer scontento — `react-native@0.87.1` vuole `react ^19.2.3` e il
repo è su `19.2.0`. Innocuo sul web, dove `react-native` è comunque aliasato a
`react-native-web`; si sistemerà quando React si muove in tutto il monorepo.
La telemetria di Storybook, accesa di default, è spenta in `main.ts`.

## Il secondo consumatore

Un design system universale **senza un secondo consumatore non è
verificabile**: si scriverebbero componenti "anche per mobile" senza che nessuno
li apra mai su un telefono, e il primo che ci prova trova il conto.

Quindi il 12a crea **uno scheletro `apps/mobile`** (Expo 57): non l'app mobile,
che resta dopo lo step 13 nell'ordine di sviluppo, ma una schermata sola che
importa `packages/ui` e mostra i componenti. Serve a provare che girano, e a
tenere onesto tutto il resto dello step.

Vincoli che restano in piedi: `apps/mobile` **non importa mai `packages/db`**, e
`next-intl` è di Next — l'i18n mobile sarà un problema suo, quando ci sarà.

## Cosa fa il 12a, in ordine

Ogni passo è piccolo e verificabile. **Nessun componente nuovo oltre a quelli
che esistono già**: i mancanti (navigazione laterale, paginazione, carosello…)
nascono nel lotto che li usa.

**L'ordine è cambiato in corsa, e vale la pena dire perché**: Storybook era il
passo 4, dopo i quindici componenti. È diventato il 3. Con quindici componenti
da guardare, renderizzarli uno a uno — come è stato fatto per il Button, con uno
script di SSR usa e getta — sarebbe diventato *il lavoro* invece della verifica.
Il banco prima, i componenti dentro il banco.

1. ~~**`packages/ui` universale**~~ — **fatto**. Workspace nuovo con
   `@tamagui/core` e `tamagui`. Dipende da React e Tamagui e **da nient'altro**:
   né `@repo/contracts`, né `@repo/db`, né `next/*`.
2. ~~**I token e i due temi**~~ — **fatto**. Tre livelli, chiaro e scuro, accento
   teal parametrizzato in una mappa (`accenti`) perché aggiungerne uno sia una
   riga. La dieta dei temi è misurata: 390 temi / 562 KB → **48 temi / 82 KB**,
   tagliando i `childrenThemes` inutilizzati e i `componentThemes` deprecati.
3. ~~**Storybook**~~ — **fatto**, e anticipato. `react-native-web-vite` +
   `addon-a11y` + `addon-themes` + `addon-vitest`, in `packages/ui`. La prova
   che tiene tutto in piedi: `pnpm --filter @repo/ui test` monta le storie in
   Chromium e fa passare axe su ciascuna.
4. **I 15 componenti riscritti** su Tamagui, a parità di API dove possibile, così
   che le schermate cambino un import e non la struttura. Il Button è fatto ed è
   **lo stampo**: variant/size come varianti Tamagui, i nomi di prima, i token
   solo semantici. L'app deve continuare a funzionare identica: `apps/web` monta
   il provider Tamagui nel layout, la build passa dalla CLI. Ogni componente
   nasce con la sua storia — che è anche il suo test.
5. **Scheletro `apps/mobile`** con Expo, una schermata che importa
   `packages/ui`: la prova che l'universale è universale.
6. **Le regole che tengono il confine**, in
   [packages/eslint-config](../packages/eslint-config): dentro `packages/ui` sono
   vietati `next/*`, `@repo/contracts` e `@repo/db`.
7. **CLAUDE.md**: riscrivere la regola su web e mobile con la decisione presa e
   il suo perché, aggiungere la sezione sul design system (Tamagui, i tre livelli
   di token con la loro invariante, le alternative scartate), la nota su come si
   costruisce con Turbopack e quella su Chromium in CI.

## Verifica

- `pnpm lint` e `pnpm check-types` puliti sul monorepo. ✔ al passo 3.
- `pnpm --filter @repo/ui storybook` apre il banco, `pnpm --filter @repo/ui test`
  fa passare ogni storia in Chromium con axe. ✔ al passo 3: 7 storie, 7 verdi.
- `pnpm build` su `apps/web` con la CLI Tamagui nel mezzo.
- `pnpm --filter mobile start` apre lo scheletro Expo e mostra gli stessi
  componenti.
- `pnpm dev` e un giro a mano su `/`, `/backlog`, `/games/[id]`, `/account`:
  **stesse funzioni di prima**, aspetto nuovo. Una differenza di comportamento è
  un errore del 12a, non una feature.

## Rimasto aperto: chi serve il web

Da decidere **dopo il 12a e prima del 12b**, perché il guscio *è* routing e
farlo due volte è l'unico spreco possibile. Con il design system universale,
Next non ha più molto da offrire qui — gli RSC non si usano, `next/image` serve
poco a copertine che la CDN IGDB dà già in taglie fisse — quindi la scelta è
fra due:

- **TanStack Start**: app web separata su Vite, router type-safe con search
  params validati da Zod (gli schemi ci sono già in `@repo/contracts`), mobile
  Expo a parte. Si condividono i componenti, non le rotte.
- **Expo Router anche per il web**: una sola app universale, schermate e
  routing condivisi.

**Parere: TanStack Start**, per una ragione che viene dal 12 stesso.
Condividere i *componenti* non è condividere le *schermate*: sidebar, tabella
densa, pannello filtri e paginazione su un telefono diventano bottom tab, lista
a schede e bottom sheet. Con il routing condiviso si finirebbe con `.web.tsx` e
`.native.tsx` sparsi ovunque, cioè a pagare la condivisione senza incassarla.

Un argomento da **non** usare contro Expo Router, perché sarebbe falso: il SEO.
Tutte le pagine sono `'use client'` e i dati arrivano da react-query, quindi il
catalogo pubblico è già renderizzato nel browser e non c'è nessun rendering
server da perdere.

In **entrambi** gli scenari esce anche `next-intl`, e il 12b si porta dietro la
sostituzione dell'i18n (Paraglide o Lingui). Va contato nel costo del guscio.

La misura che decide: quante schermate del 12 sarebbero davvero identiche sulle
due piattaforme. Dopo il 12a i componenti ci sono, e quel conto si fa guardando.

I dati raccolti finora:

- Il costo è più basso di quanto sembri: un solo server component, 17 punti di
  contatto con Next, e degli RSC oggi non si usa niente.
- L'attrito vero è **`nuqs`** (197 righe in
  [backlog-filter.ts](../apps/web/lib/backlog-filter.ts)): l'adapter TanStack Router
  è sperimentale e **non copre Start**. I filtri passerebbero ai search params di
  TanStack Router, validati con Zod — con gli schemi già in `@repo/contracts`
  sarebbe un miglioramento, ma è lavoro del 12c.
- Tamagui su Vite ha un plugin vero, mentre su Next/Turbopack si passa dalla
  CLI: una ragione in più per valutarlo, non decisiva.

Il 12a è identico nei due scenari, perché `packages/ui` non importa `next/*`.

## Fuori dal 12a, ma già trovato

- **`backlog.list` si rompe a 250 righe**: `limit` è `max(200)` in
  [schemas.ts](../packages/contracts/src/schemas.ts) e il client somma 50 per volta
  da 50. Al quinto "carica altri" il server rifiuta. Lo chiude il 12c.
- **La pagina gioco alla ROMM chiede dati che non abbiamo**: `artworks`,
  `screenshots`, `videos`, `involved_companies` non sono fra i `DETAIL_FIELDS` di
  [igdb.ts](../apps/api/src/external/igdb.ts) e non hanno colonne. Non costano
  richieste in più, costano una migration e un backfill forzato. Si decide nel
  12d, insieme a **quali informazioni** stanno sulla card, sulla riga e sulla
  scheda.

## Fonti

[Tamagui](https://tamagui.dev/docs/intro/compiler-install) (compiler e Turbopack,
[Next.js guide](https://tamagui.dev/docs/guides/next-js),
[UI kit](https://tamagui.dev/ui/intro)),
[Storybook 10](https://storybook.js.org/blog/storybook-10/) e
[addon Vitest](https://storybook.js.org/docs/writing-tests/integrations/vitest-addon),
[Panda CSS è web-only](https://github.com/chakra-ui/panda/discussions/745),
[confronto librerie headless](https://blog.logrocket.com/headless-ui-alternatives/),
[nuqs adapters](https://nuqs.dev/docs/adapters).
Versioni e date di pubblicazione da `npm view`, 22/09/2026.
