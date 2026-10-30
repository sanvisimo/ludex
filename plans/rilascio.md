# Il rilascio

**Stato: in corso dal 28/10/2026, il codice** (sezione «Il codice» più sotto).
Segnato il 18/10/2026, dopo il CSV (10) e Xbox (9e). Roadmap: `release` («Ludex aperto a
tutti») in cima a «In arrivo», in
[ordine di lavoro](../docs/ordine-sviluppo.md) prima degli abbonamenti.

Il 28/10/2026 sono decisi server, sistema operativo, email e backup: vedi le
sezioni qui sotto. Il codice è fatto fra il 28 e il 30/10: vedi «Il codice»,
«I ritocchi del 29/10/2026» e «Licenze e donazioni».

## Perché

Oggi Ludex è un ambiente di prova sul mini PC di casa, dietro Cloudflare
Access con il One-time PIN ([minipc](../docs/minipc.md)): entra solo chi è
nella lista. Il rilascio lo porta su un server stabile e lo apre a tutti,
e aprirlo vuol dire che login e registrazione devono reggere da soli, senza
il cancello davanti.

## Cosa c'è da fare

Segnato dall'utente il 18/10/2026, aggiornato il 28/10.

- [x] **Chi spedisce le email**: deciso il 28/10, Scaleway TEM. Vedi «Le
      email»; il codice in «Il codice».
- [x] **Verifica dell'email** alla registrazione: vedi «Il codice».
- [x] **Recupero della password**: vedi «Il codice».
- [x] **CAPTCHA**: deciso il 28/10/2026, **Cloudflare Turnstile**. Il
      widget va provato sul server vero (vedi «Il codice»).
- [x] **Stabilizzare login e registrazione**: coperto da verifica, limiti di
      frequenza e CAPTCHA (confermato dall'utente il 28/10/2026).
- [x] **«Offrimi un caffè»**: voce del footer e schede di roadmap e account,
      col bottone di Ko-fi (`supportUrl`). Da accendere solo dopo «Licenze e
      donazioni». Piano a parte in [offrimi-un-caffe.md](offrimi-un-caffe.md).
- [ ] **I backup** fuori dal server: deciso il 28/10, vedi «I backup».
- [ ] **Trovare dove metterlo**: deciso il 28/10, Leaseweb VPS 1 con Ubuntu
      26.04. Vedi «Dove metterlo». **Si compra per ultimo.**
- [ ] **Spostarlo dal mini PC**.
- [ ] **Togliere Cloudflare Access**: l'app si apre senza One-time PIN.
- [x] **Cambio password**: c'è già, dal lotto 12g (la scheda «Password» del
      profilo, `apps/web/components/change-password.tsx`).

## L'ordine

Deciso dall'utente il 28/10/2026: **prima si sistema tutto, il server si
compra quando l'ultima cosa che resta è metterlo online.**

1. Le email, in locale con Mailpit (vedi «Le email»).
2. Il resto della lista qui sopra.
3. L'acquisto del server, al mese e senza vincolo.
4. La prova degli import da lì, nel primo mese (vedi «La prova degli
   import»).
5. Il trasloco e l'apertura, togliendo Access.

Cambia l'ordine di prima, che metteva la prova degli import su un VPS a ore
per prima, perché poteva cambiare la scelta del server. Farla alla fine non
complica niente: il trasloco è lo stesso con qualunque provider (compose,
dump e ripristino, indirizzo nel tunnel), e se un negozio blocca si disdice
dopo un mese e si passa al secondo della lista.

## Dove metterlo

**Deciso il 28/10/2026: Leaseweb VPS 1**, 4 vCPU, 6 GB di RAM, 100 GB NVMe,
IPv4 incluso, nessun pannello di controllo, datacenter Amsterdam (AMS-01).
Visto il carrello il 28/10.

- **Il primo mese senza vincolo, a €4,99** più IVA: è il mese della prova
  degli import.
- **Poi l'annuale, a €4,24 al mese** (contratto e fatturazione di un anno,
  €50,88 anticipati), se la prova va bene.
- **Niente extra**: il backup Acronis (€3,75) lo sostituisce R2, il
  certificato SSL lo fa Cloudflare, il dominio c'è già, le caselle email non
  servono.
- Al primo ordine Leaseweb può chiedere la verifica KYC: l'attivazione può
  prendere ore invece dei 10 minuti dichiarati.

Quello che conta, dall'analisi del 18–22/10: sei container (Postgres con
pgvector, Redis, `migrate`, `api`, `worker`, `web`), un worker BullMQ sempre
acceso — quindi niente serverless né hosting condiviso —, un'immagine sola già
pubblicata su `ghcr.io/sanvisimo/ludex` e un deploy che funziona
(`deploy.sh`, dump prima di ogni deploy, override del compose). Gli utenti
sono europei: i dati restano in UE o in Svizzera. Cloudflare Tunnel resta,
togliendo solo Access: sul VPS non si apre nessuna porta.

**I 6 GB**: la stima è di circa 2 GB usati dall'app, **non misurata**. Il
dato vero viene dal mini PC con `docker stats --no-stream` durante un import
grosso. Se non bastano, il gradino sopra è Leaseweb VPS 2 (6 vCPU, 16 GB,
€8,09).

### I prezzi visti

Il 28/10/2026, dagli screenshot dell'utente. Al mese, senza IVA (da privato
in Italia si aggiunge il 22%); i 24 mesi servono a confrontare le offerte
con il prezzo che sale dopo i primi mesi.

| Provider     | Piano       | vCPU / RAM / disco | Al mese                | 24 mesi  | Perché no                                                                      |
| ------------ | ----------- | ------------------ | ---------------------- | -------- | ------------------------------------------------------------------------------ |
| **Leaseweb** | **VPS 1**   | 4 / 6 / 100 NVMe   | **€4,99, poi €4,24**   | **€102** | scelto                                                                         |
| Contabo      | Cloud VPS 4 | 4 / 8 / 100 SSD    | €6,05 con backup       | €145     | CPU affollate, IP spesso in liste di abusi: il rischio peggiore per gli import |
| Hostinger    | KVM 2       | 2 / 8 / 100 NVMe   | €6,62, poi €14,99      | €159     | 24 mesi anticipati, 2 vCPU, prezzo doppio al rinnovo                           |
| OVH          | VPS-2       | 4 / 8 / 75 NVMe    | €7,21                  | €173     | il secondo della lista: backup giornaliero incluso, ma costa di più            |
| Hetzner      | CX33        | 4 / 8 / 80 NVMe    | €8,99                  | €216     | non ordinabile il 28/10                                                        |
| Aruba        | O4A8        | 4 / 8 / 80         | €11,79                 | €283     | costa di più                                                                   |
| Infomaniak   | Lite        | 4 / 8 / 160        | €18,00                 | €432     | costa di più                                                                   |
| IONOS        | VPS L+      | 4 / 8 / 240 NVMe   | €7 per 3 mesi, poi €22 | €483     | vincolo di 12 mesi; nel carrello un backup «a €0» che dal secondo mese è a €7  |
| Exoscale     | Large       | 4 / 8              | circa €68              | €1.635   | fuori scala                                                                    |

Scartati come tipo, non per prezzo:

- **Un PaaS** (Render, Railway): circa 40–70 €/mese, e `deploy.sh` da buttare.
- **Restare sul mini PC** togliendo solo Access: utenti veri sulla
  connessione di casa.
- **Un hosting condiviso con cPanel**: niente Docker né root, il worker
  verrebbe fermato, niente pgvector.
- **OpenStack** (Aruba) **e Kubernetes** (Scaleway Kapsule, il cui piano
  gratuito è solo il control plane: i nodi si pagano): servono quando le
  macchine sono più di una. Qui sono complessità e costo in più. Se ne
  riparla se un giorno servono più macchine.

### Il sistema operativo

**Ubuntu 26.04**, deciso il 28/10/2026, scegliendo sul merito e non per
somiglianza col mini PC (Debian 13):

- supporto normale fino ad aprile 2031, ESM fino al 2036: nessun salto di
  versione maggiore con l'app in produzione;
- aggiornamenti di sicurezza automatici già attivi, e Livepatch (gratuito con
  Ubuntu Pro per uso personale), che corregge il kernel senza riavviare: con
  un server solo un riavvio è l'app ferma;
- Docker lo elenca fra le versioni supportate, e lo prova prima di tutto su
  Ubuntu.

Contro: circa 200 MB di RAM in più di Debian, soprattutto snapd, che si può
togliere. Scartati Debian 12 (già nella fase LTS ridotta, fino a giugno
2028), Alma 9 e Rocky 9 (SELinux blocca i bind mount di Postgres e Redis,
firewalld si scontra con le regole di Docker).

Da fare all'installazione:

- Docker dal **repository ufficiale di Docker**, non il pacchetto `docker.io`
  di Ubuntu, che è più vecchio.
- Controllare di avere la 26.04.1 (`lsb_release -a`).
- **Provare una volta `deploy.sh` e lo script dei dump**: dalla 25.10 Ubuntu
  usa coreutils e `sudo` riscritti in Rust, quasi del tutto compatibili, ma
  qualche opzione rara si comporta diversamente.

### La prova degli import

Oggi gli import dei negozi (PSN, Epic, GOG, Nintendo) partono dall'IP di casa;
da un datacenter qualcuno potrebbe rispondere diversamente o bloccare. Si
prova dal server comprato, nel primo mese senza vincolo: chi blocca di solito
blocca per rete del provider, quindi una prova da un provider diverso non
direbbe niente su Leaseweb.

La prova parla con gli account veri dell'utente: un negozio alla volta,
concordato, e Steam solo se l'utente lo decide. Se un negozio blocca, si
disdice e si passa a OVH.

## Le email

**Deciso il 28/10/2026: Scaleway TEM**, solo per il server di produzione; in
locale Mailpit.

Le email sono quelle di Better Auth: la verifica alla registrazione, il
recupero della password, e in futuro il cambio email. Poche: decine al mese
all'inizio, centinaia in un picco.

- **Costa di fatto €0**: 300 email gratuite al mese per organizzazione, poi
  €0,25 ogni 1.000, a consumo, senza abbonamento. Va lasciata una carta.
- **Nessun logo** del provider nelle email.
- **Solo transazionali**: gli IP condivisi non li usa chi manda newsletter.
- **In Francia**: contenuto, log e backup delle email trattati a Parigi,
  nessun subfornitore per il contenuto (la loro pagina sulla privacy). Non usa
  AWS.
- **SMTP** su `smtp.tem.scaleway.com`, quindi nodemailer.

Il confronto, il 28/10/2026, per lo più da blog di confronto (i prezzi di
Scaleway dalla pagina ufficiale):

| Provider         | Gratis              | Oltre               | Perché no                                             |
| ---------------- | ------------------- | ------------------- | ----------------------------------------------------- |
| **Scaleway TEM** | 300 al mese         | €0,25 ogni 1.000    | scelto                                                |
| AhaSend          | 1.000 al mese       | da €9 al mese       | il secondo: senza carta, ma il logo è da verificare   |
| Lettermint       | 300 al mese         | da €10 al mese      | salto a €10 oltre la soglia                           |
| Sweego           | forse 100 al giorno | da €10 al mese      | piano gratuito incerto                                |
| Brevo            | 300 al giorno       | da circa $9 al mese | «Sent with Brevo» nelle email, si toglie solo pagando |
| Mailjet          | 200 al giorno       | circa $17 al mese   | il logo, quasi certamente                             |
| Cloudflare Email | 3.000 al mese       | $0,35 ogni 1.000    | serve Workers Paid, minimo $5 al mese; in beta        |
| Amazon SES       | crediti iniziali    | $0,10 ogni 1.000    | la complessità di AWS per risparmiare centesimi       |
| Resend           | 3.000 al mese       | $20 al mese         | americano                                             |
| Postmark         | 100 di prova        | $15 al mese         | americano, a pagamento                                |

**Scartato anche un server di posta nostro** (Postfix sul VPS): costerebbe
€0 come Scaleway, ma le email arriverebbero male. Gli IP dei datacenter
partono con una cattiva reputazione, e con pochi invii non la si costruisce
mai. La porta 25 è spesso chiusa sui VPS. E restano DKIM, PTR, rimbalzi e
liste nere da gestire. Sono proprio le email di verifica e di recupero a non
potersi permettere lo spam. Il codice è lo stesso — nodemailer verso un SMTP
— e cambiare idea vuol dire cambiare `SMTP_URL`.

### Il piano

SMTP ovunque: in locale le email le cattura Mailpit e le mostra in una pagina
web, in produzione le spedisce Scaleway. Cambia solo la variabile d'ambiente.

1. **Branch** e roadmap: la voce `release` passa a «in corso».
2. **Mailpit** in `docker-compose.yml`, sotto un profilo `dev` perché non
   parta sul mini PC. Porte 1025 (SMTP) e 8025 (la pagina).
3. **L'invio** con nodemailer in `packages/auth`, fuori da `./client` perché
   non entri nel bundle del web. Due variabili nuove, `SMTP_URL` e
   `MAIL_FROM`, in `.env.example` e in `globalEnv` di `turbo.json`.
4. **Better Auth**: verifica obbligatoria alla registrazione, accesso
   automatico dopo il clic sul link, e la funzione che spedisce il link del
   reset. La lingua dell'email dal cookie della lingua o da
   `Accept-Language`, come fa il web (`apps/web/src/i18n.ts`): sullo stesso
   host il cookie arriva anche all'API.
5. **Gli utenti che ci sono già**: una migration custom di drizzle-kit li
   segna verificati, o al deploy resterebbero chiusi fuori.
6. **Tre schermate piccole**: «controlla la posta» dopo la registrazione,
   «password dimenticata» (con il link dal login), «nuova password»; e al
   login con email non verificata un pulsante «rispedisci». Prima il
   wireframe in Excalidraw.
7. **Test** contro il Postgres vero, con l'invio stubbato al confine del
   modulo; poi la prova a mano su `http://localhost:8025`.

**Il branch non va su main finché `SMTP_URL` non è configurata sul mini PC**:
il mini PC si aggiorna da solo ogni 5 minuti, e con la verifica obbligatoria
e nessuno che spedisce nessuno potrebbe più registrarsi. Scaleway si attiva
quindi prima del trasloco, già per il mini PC.

Da decidere all'attivazione: il mittente. Default proposto un sottodominio,
`Ludex <noreply@ludex.sanvisimo.tech>`, così la reputazione delle email di
Ludex resta separata da quella del dominio; SPF, DKIM e DMARC si scrivono nel
DNS su Cloudflare.

## I backup

**Deciso il 28/10/2026**, a €0: ogni notte sul VPS

`pg_dump` → `age` (cifrato con la chiave pubblica) → `rclone` → **Cloudflare
R2**, con una regola del bucket che tiene gli ultimi 7 giorni.

- **R2 e non OneDrive**: il token di R2 si limita a un bucket solo, quello di
  OneDrive darebbe a chi entra nel VPS tutto il OneDrive dell'utente. R2 è
  gratuito fino a 10 GB, e un dump di Ludex pesa molto meno.
- **Cifrato**: il dump contiene email, hash delle password e librerie. Sul VPS
  sta solo la chiave pubblica, che cifra e non decifra; la privata la tiene
  l'utente fuori dal server.
- **Il dump basta per ripartire**: l'immagine sta su ghcr, il compose nel
  repo, Redis si ricostruisce. Oltre al dump serve solo `ludex.env`, che si
  copia una volta fuori dal server.
- **Il ripristino si prova una volta prima dell'apertura**: un backup mai
  ripristinato non è ancora un backup.

Il backup del provider (Acronis di Leaseweb, €3,75 al mese) salverebbe la
macchina intera, che non serve.

## I costi

| Voce                           | Al mese, senza IVA    | Con IVA al 22%   |
| ------------------------------ | --------------------- | ---------------- |
| Leaseweb VPS 1                 | €4,99, poi €4,24      | €6,09, poi €5,17 |
| Scaleway TEM                   | €0 fino a 300 al mese | €0               |
| Cloudflare R2, Tunnel, dominio | €0                    | €0               |

**Circa €62 all'anno con l'IVA**, una volta passati all'annuale.

## Il codice

Deciso il 28/10/2026: tutto ciò che il rilascio chiede al codice, prima del
trasloco e indipendente da dove si va. Il trasloco (server, Access, backup,
monitoraggio) resta fuori.

1. [x] **Chi spedisce le email: Scaleway TEM** (scelto dall'utente), via
       SMTP con `nodemailer`, in `packages/auth/src/mailer.ts`. Variabili
       `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (in
       `.env.example` e `globalEnv`). Senza `SMTP_HOST` l'email, link
       compreso, finisce nel log dell'API: è come si lavora in sviluppo. Testi
       solo in testo semplice, italiano o inglese secondo il cookie della
       lingua (`packages/auth/src/emails.ts`). Si spedisce senza aspettare: un
       SMTP lento non tiene ferma la richiesta, e il tempo di risposta del
       recupero non dice se un'email è registrata.
2. [x] **Verifica dell'email**: `requireEmailVerification`,
       l'email parte alla registrazione, e **a ogni accesso tentato con la
       password giusta** se l'email non è verificata (`sendOnSignIn`): niente
       pulsante «rispedisci», cambiato rispetto alla prima proposta. Il link
       fa entrare (`autoSignInAfterVerification`). La migration
       `0062_verifica-email-utenti-esistenti` segna verificati gli utenti di
       prova, che altrimenti resterebbero fuori. Schermate: «Controlla la
       posta» al posto del modulo di registrazione, gli avvisi all'accesso.
       Chi si registra con un indirizzo già iscritto vede la stessa risposta
       e riceve l'email «Hai già un account» (`onExistingUserSignUp`),
       aggiunta in corsa: senza, chi l'aveva dimenticato aspettava un link
       che non arriva.
3. [x] **Recupero della password**: il reset chiude tutte le sessioni
       (`revokeSessionsOnPasswordReset`). Pagine `/forgot-password` e
       `/reset-password`, quest'ultima aperta anche da chi è dentro.
4. [x] **Limiti di frequenza**: quelli di Better Auth (3 ogni 10 s su accesso,
       registrazione, cambi di password ed email; 3 al minuto su recupero e
       rinvio), accesi sempre tranne nei test, e l'IP letto da
       `cf-connecting-ip`, perché dietro il tunnel le richieste arrivano tutte
       dallo stesso. **Vale solo se l'API sul nuovo server è raggiungibile
       solo dal tunnel**: con una porta aperta, l'intestazione la scrive chi
       vuole.
5. [x] **CAPTCHA Turnstile** su accesso, registrazione e recupero (plugin
       `captcha` di Better Auth). Lato server fatto: si accende con
       `TURNSTILE_SECRET_KEY`; CORS lascia passare `x-captcha-response`. La
       chiave pubblica entra nel bundle come `PUBLIC_API_URL` (`ARG` nel
       Dockerfile, variabile `TURNSTILE_SITE_KEY` del repo nella CI). Il
       widget è `useCaptcha` (`apps/web/components/captcha.tsx`); se lo
       script non arriva (un blocco del browser) lo dice, invece di lasciare
       il bottone spento senza ragione.
6. [x] **Cambio email** (accettato il 28/10/2026): il link va prima
       all'indirizzo di adesso, poi Better Auth verifica quello nuovo. Nel
       Profilo, «Cambia» accanto all'email apre il dialogo.
7. [x] **«Offrimi un caffè»**: il segnaposto, `kofiUrl` in
       `lib/credits.ts`, `null` finché non c'è il nome Ko-fi; la voce del
       footer compare quando lo si scrive.
8. [x] **I testi**: codici d'errore nuovi in `lib/auth-error.ts`, e il 429
       dei limiti, che arriva senza codice; nell'informativa Scaleway
       (email) e Cloudflare (Turnstile) fra chi riceve i dati, e lo scopo
       delle email; nelle condizioni, l'account si chiude anche dal
       Profilo. Date di tutti e due al 28/10/2026. **Da rileggere**: se
       Turnstile mette cookie (secondo Cloudflare no) la sezione dei cookie
       va aggiornata.
9. [x] **Roadmap**: `release` era già «in corso»; il testo nomina anche il
       cambio email.

I test che registravano un utente e usavano subito la sua sessione passano da
`signUpVerified` in `apps/api/test/factories.ts`; due casi nuovi in
`rpc/auth-verification.test.ts` controllano che senza verifica non si entri.

**Le schermate**: wireframe in [rilascio.excalidraw](rilascio.excalidraw),
approvato il 28/10/2026 («procedi con lo sviluppo del FE»).

**Mailpit** (`docker-compose.yml`, porte 1025 e 8025) prende le email in
sviluppo: `.env.example` punta lì. Senza credenziali il mailer non chiede TLS,
che Mailpit non ha; con le credenziali di Scaleway sì.

**Da fare fuori dal codice**, prima di accendere: su Scaleway il dominio di
`MAIL_FROM` verificato, con SPF, DKIM e DMARC nel DNS; su Cloudflare il sito
Turnstile e le due chiavi, la pubblica nelle variabili del repo su GitHub e la
segreta nel `.env` del server.

**Verifica**: `pnpm lint`, `pnpm check-types`, `pnpm test`; a mano in
sviluppo, coi link presi da Mailpit: registrazione → verifica → accesso;
password dimenticata → reset → le altre sessioni escono; cambio email → due
link → l'indirizzo cambia; Turnstile con le chiavi di prova di Cloudflare.

Fatta il 28/10/2026 con Playwright, tutto passato: registrazione, accesso
prima della verifica (link rispedito), link che fa entrare, cambio email coi
due link, password dimenticata, reset, accesso con la nuova, link di reset
riusato, link di verifica scaduto, registrazione con un indirizzo iscritto,
email in inglese col cookie della lingua, 429 al quarto accesso sbagliato.
Turnstile solo a metà: dal container `challenges.cloudflare.com` non si
raggiunge, quindi il widget non si è visto; provati il server (senza token
risponde `MISSING_RESPONSE`), il CORS e l'avviso a script bloccato. **Il
widget va provato sul server vero**, con le chiavi di prova prima.

## I ritocchi del 29/10/2026

Commenti dell'utente provando il lotto, approvati lo stesso giorno: testi in
[rilascio-testi.md](rilascio-testi.md), wireframe in
[rilascio-ritocchi.excalidraw](rilascio-ritocchi.excalidraw).

- [x] **Il cambio email «non funziona»**: verso un indirizzo già di un altro
      account Better Auth risponde 200 e non spedisce niente, per non dire
      chi è iscritto. Ora parte l'avviso «Indirizzo email già in uso»
      all'indirizzo di adesso (hook `before` su `/change-email`), e la pagina
      dice sempre «Abbiamo inviato un'email a {indirizzo di adesso}», vero in
      tutti e due i casi.
- [x] **Il secondo link del cambio** aveva il testo della registrazione: ora
      ha il suo (`verifyNewAddress`), scelto dal tipo scritto nel token.
- [x] **`/email-link`**, una pagina sola dove arrivano i link delle email, al
      posto degli avvisi sparsi in Accedi e nel Profilo. Il primo link del
      cambio, aperto dove non si è entrati, prima finiva sull'accesso senza
      spiegazioni.
- [x] **`next=/login`**: il rimbalzo dall'account all'accesso scriveva in
      `next` il percorso dell'accesso stesso (c'era già prima del lotto).
- [x] **L'accesso portava a `/email-link?step=signup`** (segnalato il
      30/10/2026): il `callbackURL` passato all'accesso, pensato per il link
      rispedito a chi non ha confermato, Better Auth lo usa anche come
      destinazione dopo un accesso riuscito, e il suo client ci manda la
      pagina con `window.location`, scavalcando `next`. C'era dal primo giro
      del lotto, nascosto perché `/login?verified=1` rimbalzava al backlog.
      Ora l'accesso non lo passa, e il ritorno del link rispedito lo scrive il
      server (`withCallback` in `email-links.ts`). Verificato: accesso → backlog,
      accesso con `next` → quella pagina, link rispedito → pagina dei link.
- [x] **Le email in HTML**, con la versione in testo, e i **testi più
      formali**, in italiano e in inglese.
- [x] **La scheda delle donazioni** in roadmap e nell'account (da `$md`),
      nostra e non il widget pronto della piattaforma: quello porterebbe
      script e cookie di terzi. La piattaforma è ancora da scegliere: la
      costante è `supportUrl`, `null` finché non c'è.

Verificato con Playwright e Mailpit il 29/10/2026: registrazione e conferma,
cambio email coi link aperti in un altro browser, link riusato, indirizzo già
in uso (avviso all'indirizzo di adesso, niente all'altro), conferma scaduta,
rimbalzo con `next` giusto, reset, email in inglese.

## Licenze e donazioni (30/10/2026)

Il link di donazioni (`supportUrl`, Ko-fi) potrebbe contare come
«monetizzare in qualunque forma», e due fonti lo legano a condizioni
diverse dalla gratuità ([apps/api/CLAUDE.md](../apps/api/CLAUDE.md)):

- [x] **OpenCritic**: o il piano commerciale, o spento. `SHOW_OPENCRITIC=0`
      toglie voti e link dalla pagina del gioco; con `ENABLE_OPENCRITIC=0`
      non si chiama più. In produzione senza piano: tutte e due a `0`.
- [ ] **IGDB**: una email a `partner@igdb.com` ([igdb-email.md](igdb-email.md)) che descriva il caso (senza
      scopo di lucro, gratuito, niente pubblicità, solo donazioni singole) e
      chieda se è uso commerciale. La risposta va conservata. Le condizioni
      ufficiali: api-docs.igdb.com e il Twitch Developer Services Agreement.
- [ ] **Fisco**: il chiarimento sulle donazioni, da
      [offrimi-un-caffe.md](offrimi-un-caffe.md).

## Proposti, da confermare

Aggiunti alla domanda «dimentico qualcosa?». Email, cambio email e limiti di
frequenza sono passati in «Il codice» il 28/10/2026.

- **Il trasloco intero**, non solo l'app: i dati degli utenti di prova (dump e
  ripristino), il deploy automatico (`deploy.sh` è del mini PC), i backup e il
  monitoraggio, oggi su Kuma in LAN.
- **Informativa e condizioni** da rileggere: dove stanno i dati (Leaseweb,
  Amsterdam), chi spedisce le email (Scaleway, Francia), dove vanno i backup
  (Cloudflare R2), ed eventualmente chi fornisce il CAPTCHA.
