# Il rilascio

**Stato: in arrivo, segnato il 18/10/2026.** Viene subito dopo il CSV (10) e
Xbox (9e), che sono in corso insieme. Roadmap: `release` («Ludex aperto a
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
- [ ] **Verifica dell'email** alla registrazione. Oggi è spenta
      (`requireEmailVerification: false` in `packages/auth/src/index.ts`),
      perché manca chi spedisce le email.
- [ ] **Un CAPTCHA?** Da decidere se serve, su quali form e quale.
- [ ] **Stabilizzare login e registrazione**.
- [ ] **Recupero della password** («password dimenticata»): manca, e anche
      questo aspetta chi spedisce le email.
- [ ] **«Offrimi un caffè»**: un link a Ko-fi nel footer, solo donazioni
      singole. Piano a parte in [offrimi-un-caffe.md](offrimi-un-caffe.md),
      aggiunto dall'utente il 21/10/2026.
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

## Proposti, da confermare

Aggiunti alla domanda «dimentico qualcosa?», non ancora accettati.

- **Chi spedisce le email** (un provider SMTP o transazionale, con SPF, DKIM
  e DMARC sul dominio): è il prerequisito di verifica e recupero, e va scelto
  per primo.
- **Cambio email**: il lotto 12g l'aveva rimandato per la stessa ragione del
  recupero password ([12g-account.md](12g-account.md)).
- **Limiti di frequenza** su login, registrazione e recupero: senza Access
  davanti sono raggiungibili da chiunque.
- **Il trasloco intero**, non solo l'app: i dati degli utenti di prova (dump e
  ripristino), il deploy automatico (`deploy.sh` è del mini PC), i backup e il
  monitoraggio, oggi su Kuma in LAN.
- **Informativa e condizioni** da rileggere: dove stanno i dati, chi spedisce
  le email, ed eventualmente chi fornisce il CAPTCHA.
