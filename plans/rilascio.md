# Il rilascio

**Stato: in corso dal 28/10/2026, il codice** (sezione «Il codice» più sotto).
Segnato il 18/10/2026, dopo il CSV (10) e Xbox (9e). Roadmap: `release` («Ludex aperto a
tutti») in cima a «In arrivo», in
[ordine di lavoro](../docs/ordine-sviluppo.md) prima degli abbonamenti.

## Perché

Oggi Ludex è un ambiente di prova sul mini PC di casa, dietro Cloudflare
Access con il One-time PIN ([minipc](../docs/minipc.md)): entra solo chi è
nella lista. Il rilascio lo porta su un server stabile e lo apre a tutti,
e aprirlo vuol dire che login e registrazione devono reggere da soli, senza
il cancello davanti.

## Cosa c'è da fare

Segnato dall'utente il 18/10/2026; niente è ancora analizzato né deciso.

- [ ] **Trovare dove metterlo**: il server stabile al posto del mini PC.
      Analisi del 18–22/10/2026 in «Dove metterlo» più sotto; la scelta è
      ancora aperta.
- [ ] **Spostarlo dal mini PC**.
- [ ] **Togliere Cloudflare Access**: l'app si apre senza One-time PIN.
- [ ] **Verifica dell'email** alla registrazione: vedi «Il codice».
- [ ] **CAPTCHA**: deciso il 28/10/2026, **Cloudflare Turnstile**.
- [ ] **Stabilizzare login e registrazione**: coperto da verifica, limiti di
      frequenza e CAPTCHA (confermato dall'utente il 28/10/2026).
- [ ] **Recupero della password**: vedi «Il codice».
- [ ] **«Offrimi un caffè»**: per ora **un segnaposto** (28/10/2026), il link
      vero quando ci sono nome Ko-fi e chiarimento fiscale. Piano a parte in
      [offrimi-un-caffe.md](offrimi-un-caffe.md).
- [x] **Cambio password**: c'è già, dal lotto 12g (la scheda «Password» del
      profilo, `apps/web/components/change-password.tsx`).

## Dove metterlo

Analisi del 18–22/10/2026, **niente è ancora deciso**.

Quello che conta: sei container (Postgres con pgvector, Redis, `migrate`,
`api`, `worker`, `web`), un worker BullMQ sempre acceso — quindi niente
serverless —, un'immagine sola già pubblicata su `ghcr.io/sanvisimo/ludex` e
un deploy che funziona (`deploy.sh`, dump prima di ogni deploy, override del
compose). Gli utenti sono europei: i dati restano in UE o in Svizzera.

- **Un VPS con lo stesso Docker Compose del mini PC** — la strada consigliata. Si sposta quasi tutto così com'è; Cloudflare Tunnel può restare,
  togliendo solo Access. Va rifatto quello che sul mini PC facevano altri:
  i backup (oggi Borg via Nextcloud AIO) e il monitoraggio (oggi Kuma in LAN).
  Un 4 vCPU / 8 GB basta per tutto.
- **Dove**, i due candidati:
  - **Hetzner** (Germania o Finlandia), circa 8–15 €/mese per quella taglia.
  - **Infomaniak** (Svizzera): ha anche l'API LLM candidata per lo step 13
    ([13-ai.md](13-ai.md)), quindi dati e fattura da un fornitore solo. La
    Svizzera ha la decisione di adeguatezza UE.

  Il server dell'app e il fornitore dell'LLM sono scelte indipendenti.

- **Scartati**: un PaaS (Render, Railway) — Postgres e backup gestiti, ma tre
  servizi a pagamento più database, circa 40–70 €/mese, e `deploy.sh` da
  buttare; restare sul mini PC togliendo solo Access — utenti veri sulla
  connessione di casa.

**Da verificare prima del trasloco**: oggi gli import dei negozi (PSN, Epic,
GOG, Nintendo) partono dall'IP di casa; da un datacenter qualcuno potrebbe
rispondere diversamente o bloccare. Una prova su un VPS preso a ore, un import
per negozio.

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
2. [ ] **Verifica dell'email**. Lato server fatto: `requireEmailVerification`,
       l'email parte alla registrazione, e **a ogni accesso tentato con la
       password giusta** se l'email non è verificata (`sendOnSignIn`): niente
       pulsante «rispedisci», cambiato rispetto alla prima proposta. Il link
       fa entrare (`autoSignInAfterVerification`). La migration
       `0062_verifica-email-utenti-esistenti` segna verificati gli utenti di
       prova, che altrimenti resterebbero fuori. Da fare: le schermate.
3. [ ] **Recupero della password**. Lato server fatto, e il reset chiude
       tutte le sessioni (`revokeSessionsOnPasswordReset`). Da fare: due
       pagine, «password dimenticata» e «nuova password».
4. [x] **Limiti di frequenza**: quelli di Better Auth (3 ogni 10 s su accesso,
       registrazione, cambi di password ed email; 3 al minuto su recupero e
       rinvio), accesi sempre tranne nei test, e l'IP letto da
       `cf-connecting-ip`, perché dietro il tunnel le richieste arrivano tutte
       dallo stesso. **Vale solo se l'API sul nuovo server è raggiungibile
       solo dal tunnel**: con una porta aperta, l'intestazione la scrive chi
       vuole.
5. [ ] **CAPTCHA Turnstile** su accesso, registrazione e recupero (plugin
       `captcha` di Better Auth). Lato server fatto: si accende con
       `TURNSTILE_SECRET_KEY`; CORS lascia passare `x-captcha-response`. La
       chiave pubblica entra nel bundle come `PUBLIC_API_URL` (`ARG` nel
       Dockerfile, variabile `TURNSTILE_SITE_KEY` del repo nella CI). Da
       fare: il widget nelle tre schermate.
6. [ ] **Cambio email** (accettato il 28/10/2026). Lato server fatto: il link
       va prima all'indirizzo di adesso, poi Better Auth verifica quello
       nuovo. Da fare: il campo nel Profilo.
7. [ ] **«Offrimi un caffè»**: il segnaposto nel footer.
8. [ ] **I testi**: codici d'errore nuovi in `lib/auth-error.ts`;
       nell'informativa Scaleway (email) e Cloudflare (Turnstile) fra chi
       riceve i dati; nelle condizioni, «chiudere l'account scrivendo a…» è
       superato dallo step 16.
9. [x] **Roadmap**: `release` era già «in corso»; il testo nomina anche il
       cambio email.

I test che registravano un utente e usavano subito la sua sessione passano da
`signUpVerified` in `apps/api/test/factories.ts`; due casi nuovi in
`rpc/auth-verification.test.ts` controllano che senza verifica non si entri.

**Le schermate** si vedono prima del codice: wireframe in
[rilascio.excalidraw](rilascio.excalidraw), da approvare.

**Da fare fuori dal codice**, prima di accendere: su Scaleway il dominio di
`MAIL_FROM` verificato, con SPF, DKIM e DMARC nel DNS; su Cloudflare il sito
Turnstile e le due chiavi, la pubblica nelle variabili del repo su GitHub e la
segreta nel `.env` del server.

**Verifica**: `pnpm lint`, `pnpm check-types`, `pnpm test`; a mano in
sviluppo, coi link presi dal log: registrazione → verifica → accesso;
password dimenticata → reset → le altre sessioni escono; cambio email → due
link → l'indirizzo cambia; Turnstile con le chiavi di prova di Cloudflare.

## Proposti, da confermare

Aggiunti alla domanda «dimentico qualcosa?». Email, cambio email e limiti di
frequenza sono passati in «Il codice» il 28/10/2026.

- **Il trasloco intero**, non solo l'app: i dati degli utenti di prova (dump e
  ripristino), il deploy automatico (`deploy.sh` è del mini PC), i backup e il
  monitoraggio, oggi su Kuma in LAN.
- **Informativa e condizioni** da rileggere: dove stanno i dati, chi spedisce
  le email, ed eventualmente chi fornisce il CAPTCHA.
