# Il rilascio

**Stato: in arrivo, segnato il 18/10/2026.** Viene subito dopo il CSV (10) e
Xbox (9e), che sono in corso insieme. Roadmap: `release` («Ludex aperto a
tutti») in cima a «In arrivo», in
[ordine di lavoro](../docs/ordine-sviluppo.md) prima degli abbonamenti.

Il 28/10/2026 sono decisi server, sistema operativo, email e backup: vedi le
sezioni qui sotto. Il codice non è ancora cominciato.

## Perché

Oggi Ludex è un ambiente di prova sul mini PC di casa, dietro Cloudflare
Access con il One-time PIN ([minipc](../docs/minipc.md)): entra solo chi è
nella lista. Il rilascio lo porta su un server stabile e lo apre a tutti,
e aprirlo vuol dire che login e registrazione devono reggere da soli, senza
il cancello davanti.

## Cosa c'è da fare

Segnato dall'utente il 18/10/2026, aggiornato il 28/10.

- [ ] **Chi spedisce le email**: deciso il 28/10, Scaleway TEM. Vedi «Le
      email».
- [ ] **Verifica dell'email** alla registrazione. Oggi è spenta
      (`requireEmailVerification: false` in `packages/auth/src/index.ts`),
      perché manca chi spedisce le email.
- [ ] **Recupero della password** («password dimenticata»): manca, e anche
      questo aspetta chi spedisce le email.
- [ ] **Un CAPTCHA?** Da decidere se serve, su quali form e quale.
- [ ] **Stabilizzare login e registrazione**.
- [ ] **«Offrimi un caffè»**: un link a Ko-fi nel footer, solo donazioni
      singole. Piano a parte in [offrimi-un-caffe.md](offrimi-un-caffe.md),
      aggiunto dall'utente il 21/10/2026.
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

## Proposti, da confermare

Aggiunti alla domanda «dimentico qualcosa?», non ancora accettati.

- **Cambio email**: il lotto 12g l'aveva rimandato per la stessa ragione del
  recupero password ([12g-account.md](12g-account.md)).
- **Limiti di frequenza** su login, registrazione e recupero: senza Access
  davanti sono raggiungibili da chiunque.
- **Il trasloco intero**, non solo l'app: i dati degli utenti di prova (dump e
  ripristino), il deploy automatico (`deploy.sh` è del mini PC), i backup e il
  monitoraggio, oggi su Kuma in LAN.
- **Informativa e condizioni** da rileggere: dove stanno i dati (Leaseweb,
  Amsterdam), chi spedisce le email (Scaleway, Francia), dove vanno i backup
  (Cloudflare R2), ed eventualmente chi fornisce il CAPTCHA.
