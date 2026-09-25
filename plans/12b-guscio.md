# Step 12b — Il guscio, su TanStack Start

**Approvato il 25/09/2026.** Sotto ogni passo, cosa è stato fatto e cosa
ha smentito.

## Contesto

Il 12a ha chiuso il design system e deciso chi serve il web: **TanStack Start**
(vedi [12a](12a-design-system.md), «Chi serve il web»). Il 12b fa due cose, in
quest'ordine e separate:

1. **il passaggio** da Next a TanStack Start, **a parità di comportamento**;
2. **il guscio**: navigazione, contenitore di pagina, e i componenti che
   chiedono (barra laterale, sheet, separator, avatar, tooltip).

Separate perché si verificano in modo diverso. Il passaggio si controlla con
«tutto fa ciò che faceva prima»; il guscio cambia l'aspetto apposta. Mescolate,
una differenza di comportamento non si saprebbe più a chi darla.

## Cosa c'è da spostare, misurato

- **6 rotte**: `/`, `/login`, `/register`, `/backlog`, `/games/[id]`, `/account`.
  Tutte `'use client'`; l'unico server component è `app/layout.tsx`.
- **`next/*` in 12 file**: `Link` (6), `next/navigation` (6: `useRouter`,
  `useSearchParams` solo nel login), `next/image` (1, `GameCover`),
  `next/font` (1, Geist nel layout), `next/headers` (i18n).
- **`proxy.ts`**: il rimbalzo ottimistico da anonimo su `/backlog` e da loggato
  su `/login` e `/register`, guardando solo se il cookie esiste.
- **i18n**: `next-intl` in 34 file, 99 chiamate, 434 chiavi per lingua. Lingua
  nel cookie `NEXT_LOCALE` o da `Accept-Language`, cambiata da una server action.
  Si usano `useTranslations`, `t.rich` (4), `useFormatter` e `useNow` (1).
- **`nuqs`** in un file solo, [backlog-filter.ts](../apps/web/lib/backlog-filter.ts),
  più il suo `debounce` in `backlog-filters.tsx`.
- **build**: la CLI `tamagui build` davanti a `next build`, `tamagui.build.ts`,
  gli alias di Turbopack in `next.config.js`.
- **contorno**: `NEXT_PUBLIC_API_URL` (letto anche da
  [packages/auth/src/client.ts](../packages/auth/src/client.ts)), la config
  ESLint `next-js`, il tsconfig `nextjs.json`, `next typegen` in
  `check-types`, e `AGENTS.md`/`CLAUDE.md` di `apps/web` che scrive `next dev`.

## Decisioni del passaggio

**i18n: `use-intl`, non Paraglide né Lingui.** Qui il piano del 12a si
sbagliava: dava per certo che uscendo da Next si dovesse cambiare libreria.
`use-intl` è il nucleo di `next-intl` senza Next, **stessa API**
(`useTranslations`, `t.rich`, `useFormatter`, `useNow`, ICU) e stesso formato
dei messaggi. Nei 34 file cambia solo l'import, e i JSON restano come sono.
Paraglide o Lingui vorrebbero dire riscrivere 99 chiamate e 868 chiavi per
guadagnare il tree-shaking dei messaggi, che su due lingue non serve.

Quello che si riscrive è il lato server, che era di Next: la lingua si legge
(cookie, poi `Accept-Language`) in una server function di Start chiamata dal
loader della radice, che carica anche i messaggi. `setLocale` diventa una server
function che scrive il cookie, seguita da `router.invalidate()` al posto di
`router.refresh()`.

**`nuqs` esce qui, non al 12c.** L'adapter TanStack Router della 2.10.1 dice
ancora «does not yet cover TanStack Start», quindi senza sostituirlo `/backlog`
smetterebbe di funzionare. Diventa `validateSearch` della rotta con Zod: stesse
chiavi nell'URL, stessi default che non compaiono, e `useBacklogFilter` tiene la
stessa firma (`filter`, `setFilter`, `activeCount`), così `backlog-filters.tsx`
cambia solo il debounce del campo di ricerca. È lavoro **a parità**: riusare gli
schemi di `@repo/contracts` e ridisegnare i filtri resta del 12c.

**SSR acceso** (il default di Start). Serve a due cose che oggi fa il server e
che in SPA si perderebbero: il rimbalzo prima che si veda lo scheletro della
pagina privata, e la lingua da `Accept-Language` al primo paint. I dati
continuano ad arrivare da react-query lato client, come oggi.

**Il resto, uno per uno:**

| Oggi | Dopo |
| --- | --- |
| `proxy.ts` | `beforeLoad` su un layout delle rotte private e su uno di quelle da ospite, che legge il cookie da una server function. Stesso controllo ottimistico, stesso `?next=` |
| `next/link`, `useRouter` | `Link` e `useRouter`/`useNavigate` di TanStack Router |
| `ButtonLink` | stessa forma, col `navigate` e il `preloadRoute` del nuovo router |
| `next/image` | `<img>` con larghezza e altezza: le taglie le dà già la CDN di IGDB |
| `next/font` (Geist) | niente: Geist era già coperto dal carattere di Tamagui, e il font si sceglie con l'aspetto dell'app (piano del 12a) |
| CLI `tamagui build` + alias Turbopack | `@tamagui/vite-plugin` 2.7.7, la stessa versione del resto. Escono `tamagui.build.ts` e `.tamagui/` |
| Tailwind con PostCSS | `@tailwindcss/vite`. Tailwind resta fino alla fine dello step 12, come già deciso |
| `next-themes` | resta: non dipende da Next, solo dal DOM. Va verificato che lo script del tema giri prima del primo paint anche su Start |
| `NEXT_PUBLIC_API_URL` | `PUBLIC_API_URL`, sostituita a build da un `define` di Vite, così `packages/auth` non si lega a `import.meta.env`. Rinominata anche in `turbo.json` e `.env.example` |
| ESLint `next-js`, tsconfig `nextjs.json` | una config React per Vite, stesse regole senza il plugin Next. Il `routeTree.gen.ts` generato va ignorato da lint e prettier |

La porta resta 8085, `WEB_URL` resta com'è.

## Il guscio

Dal metro del 12a: navigazione laterale, sheet mobile, separator, avatar,
tooltip.

**Componenti in `@repo/ui`**, ciascuno con la sua storia:

- `Separator`, `Avatar` (iniziali quando manca l'immagine, e Better Auth
  l'immagine non ce l'ha), `Tooltip`, `Sheet`: Tamagui li ha, si avvolgono come
  gli altri quindici.
- `NavItem`: la voce della barra, con icona, etichetta e stato attivo. **Non
  conosce il router**, perché `@repo/ui` non può: riceve `active` e si rende
  come `<a>` col `render="a"` già usato da `ButtonLink`. Chi lo monta passa
  `href` e la navigazione.

**Il guscio sta in `apps/web`**, perché è una schermata e conosce le rotte:

- **da `$md` in su**, barra laterale fissa: Ludex, poi Catalogo, Backlog e
  Account, e in fondo l'utente (avatar e nome) con un menu che tiene tema,
  lingua ed esci. Da anonimo: Catalogo, poi Accedi e Registrati.
- **sotto `$md`**, una barra in alto col menu che apre la stessa navigazione in
  uno `Sheet`. Sono le finestre strette del web, non l'app mobile, che avrà le
  sue bottom tab.
- **`Page`**, il contenitore che sostituisce le quattro copie di
  `mx-auto grid max-w-4xl gap-6 p-6`, con il titolo della pagina.

Tema e lingua restano raggiungibili da anonimo, come oggi.

## Fuori dal 12b

- il ridisegno di `/backlog`, dei filtri e della paginazione, compreso il
  limite dei 250: è del 12c;
- ogni cambiamento di contenuto delle pagine: il 12b ci mette intorno il guscio
  e basta;
- l'uscita di Tailwind: a fine step 12.

## In che ordine

1. **Scheletro Start** accanto al vecchio: Vite, plugin Tamagui e Tailwind, la
   radice con i provider, `/` che mostra il catalogo. Qui si verificano le cose
   che non si sanno dalla documentazione: SSR di Tamagui, lo script del tema, e
   come si avvia la build in produzione (`start`).

   **Fatto.** Start vive in `apps/web/src/` accanto ad `app/` di Next, sulla
   stessa porta: `pnpm dev:start`, `build:start`, `serve:start` contro
   `dev`, `build`, `start`, e se ne accende uno alla volta. Provato in
   Chromium con l'API accesa: il catalogo arriva, tema chiaro e scuro giusti,
   nessun errore in console, in sviluppo e in produzione. `next build`,
   `lint` e `check-types` restano verdi con Start accanto.

   Tre cose che la documentazione non diceva:

   - **Tamagui sul server va fatto passare da Vite.** Lasciati a Node, i suoi
     pacchetti importano il `react-native` vero, in Flow, e il render muore su
     un `typeof`: `ssr.noExternal: [/tamagui/]`. Ma con quello gli alias del
     plugin puntano ai build CommonJS (l'SVG delle icone), che passati da Vite
     non trovano più `module`: il plugin va con `disableResolveConfig` e gli
     alias li scriviamo noi, per nome nudo, così si prende l'ESM.
     `react-native-web` invece resta a Node: passato da Vite si rompe
     sull'interop di `inline-style-prefixer`.
   - **In produzione non serve Nitro.** `vite build` produce un gestore
     `fetch` in `dist/server/server.js`; la guida propone Nitro, che è ancora
     una 3.0 beta. Lo serve `srvx` 1.0, stabile, con `--static` che è
     **relativo alla cartella dell'entry** (`../client`, non `dist/client`).
   - **`next-themes` regge così com'è**: lo script sta nell'HTML del server e
     la classe `t_light`/`t_dark` è giusta prima dell'idratazione.

   Tre ponti provvisori, ciascuno col passo che lo toglie: `next-intl` è un
   alias di `use-intl` nella config di Vite e la radice ha la lingua fissa
   (passo 2); il catalogo linka `/games/…` con un `<a>` perché quella rotta
   in Start non c'è ancora (passo 3); in `src/` è spenta la regola ESLint di
   Next su `<head>` (passo 5). `GameCover` è già un `<img>` e `favicon.ico`
   sta in `public/`, che vanno bene a tutti e due.
2. **i18n** con `use-intl`, lingua lato server, cambio lingua.

   **Fatto.** I 36 file client importano `use-intl`; `next-intl` resta solo
   nel layout di Next e in `i18n/request.ts`, e se ne va con lui. Le chiavi
   restano tipizzate: l'`AppConfig` in `global.d.ts` ora aumenta `use-intl`,
   e un refuso resta un errore di compilazione. `fromAcceptLanguage` è
   passata in `i18n/config.ts`, così Next e Start leggono il browser con la
   stessa funzione.

   Su Start la lingua la decide `getI18n` in [src/i18n.ts](../apps/web/src/i18n.ts)
   (cookie, poi `Accept-Language`, poi l'italiano), chiamata dal loader della
   radice con `staleTime: Infinity`: navigando non si richiede. Il selettore
   scrive il cookie con la server function `setLocale` e fa
   `router.invalidate()`. Provato in Chromium: la pagina cambia lingua senza
   ricaricarsi, il catalogo resta, il cookie dura un anno e regge il
   ricaricamento. Via curl: `en-US` dà inglese, `de` ripiega sull'italiano, il
   cookie vince sul browser.

   Una cosa che non si vedeva: **`next-intl` 4.13.7 si portava dietro una sua
   `use-intl` 4.13.7**, accanto alla 4.14.7 installata per Start. Due copie
   sono due contesti React, e i componenti con gli import nuovi non avrebbero
   visto il provider di Next. Portato `next-intl` alla 4.14.7, la copia è una
   sola e Next continua a funzionare (provato: `/` in inglese, con i dati).

   Il fuso lo dichiara il server, com'era con next-intl, così server e browser
   non formattano la stessa data in due modi.

   Ponte nuovo, fino al passo 3: la radice di Start ha una barra provvisoria
   con tema e lingua, e il selettore di Start sta in
   `src/components/locale-switcher.tsx` accanto a quello di Next, che se ne va
   con la barra di Next.
3. **Le rotte**, una per una, con `proxy.ts` che diventa `beforeLoad`.

   **Fatto, tranne `/backlog`**, che passa al passo 4 insieme ai filtri: la
   sua pagina sta in piedi su `nuqs`, e spostarla senza vorrebbe dire
   spostarla rotta. Le altre sono passate con `git mv`, così la storia resta:
   `/login` e `/register` sotto il layout `_guest`, `/games/$id`, `/account`,
   e con loro la barra (`SiteNav`) e `ButtonLink` in `src/components`. Il `/`
   di Next è cancellato. Next ora serve solo `/backlog`, senza barra.

   Il rimbalzo da loggato su `/login` e `/register` è il `beforeLoad` di
   `_guest`, che chiede `hasSession` ([src/session.ts](../apps/web/src/session.ts)):
   una server function e non una lettura dal browser, perché il cookie di
   sessione è `httpOnly`. Il controllo resta ottimistico come in `proxy.ts`.
   Il rimbalzo da anonimo su `/backlog` arriva con la rotta, al passo 4.

   Provato in Chromium un giro di nove passi, in sviluppo e sulla build di
   produzione: home da anonimo, clic su un gioco, `/account` da anonimo che
   rimbalza su `/login`, registrazione, `/login` da loggato che rimbalza,
   `/account`, uscita, accesso con `?next=/account` che ci torna, `?next=`
   verso un altro dominio ignorato.

   Tre cose che il giro ha trovato:

   - **Un errore di idratazione, una volta sì e una no.** La barra e
     `/account` leggono la sessione con `useSession`: sul server è sempre
     «in caricamento», nel browser a volte è già arrivata quando React
     idrata, e i due render non combaciano. È una corsa, quindi sfugge a un
     giro solo. [src/use-session.ts](../apps/web/src/use-session.ts) risponde
     «in caricamento» finché l'idratazione non è finita (`useHydrated` del
     router). Tre giri da loggato, zero errori.
   - **L'uscita da `/account` finiva su `/login`.** Chiusa la sessione, la
     pagina se ne accorgeva e rimbalzava da sé, e la navigazione verso `/`
     arrivava tardi. Ora si va prima su `/` e poi si esce.
   - **`ButtonLink` non precarica più al passaggio del mouse**: il
     `preloadRoute` del router vuole una rotta tipizzata, e il bottone porta
     anche a indirizzi con la query. I dati li porta comunque react-query.

   Non servono più: la chiave `login.loading` (era il ripiego del confine di
   Suspense che `useSearchParams` chiedeva a Next) e `i18n/locale.ts`, la
   server action di Next.

   Ponti fino al passo 4: in `hidden-entries.tsx` il link a
   `/backlog?hidden=true` è un `<a>`, e su Start `/backlog` è un 404.
4. **I filtri** da `nuqs` ai search params.
5. **Via Next**: dipendenze, config, ESLint, tsconfig, i file generati da
   `next dev`. Verifica di parità (sotto).
6. **I componenti** in `@repo/ui`, con storie e test.
7. **Il guscio** e `Page`.
8. **CLAUDE.md**: stack, tabella del monorepo e sezione «Design system» (come
   si costruisce sul web, `ButtonLink`), e questo piano aggiornato con ciò che
   i passi 1–7 hanno smentito.

I passi 1–5 finiscono con l'app identica a prima. Si possono fondere lì, prima
del guscio.

## Verifica

- `pnpm lint`, `pnpm check-types`, `pnpm --filter @repo/ui test` puliti.
- `pnpm build` di `apps/web` e l'avvio della build.
- Dopo il passo 5, un giro a mano su `/`, `/login`, `/register`, `/backlog`
  (filtri nell'URL, ricarica con i filtri, «carica altri», nascosti),
  `/games/[id]` e `/account`, da anonimo e da loggato: **stesse funzioni**.
  Anche il rimbalzo con `?next=`, il cambio di lingua senza perdere lo stato e
  il tema senza lampo al caricamento.
- Dopo il passo 7: il guscio a larghezza piena e stretta, da tastiera, in tema
  chiaro e scuro.

## Fonti

Versioni da `npm view`, 25/09/2026: `@tanstack/react-start` 1.168.58, `srvx`
1.0.5, `nitro` 3.0.260903-beta,
`@tanstack/react-router` 1.170.39, `vite` 8.3.1, `@tamagui/vite-plugin` 2.7.7,
`use-intl` 4.14.7, `nuqs` 2.10.1 (README, sezione TanStack Router).
