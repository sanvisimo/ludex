# Ludex — il server di produzione

Il VPS di Leaseweb (VPS 1, Ubuntu 26.04, `85.17.188.29`, Amsterdam), dal
06/11/2026. Come ci si è arrivati, le scelte e le prove stanno in
[plans/rilascio.md](../plans/rilascio.md); il dominio in
[plans/pilecue-dominio.md](../plans/pilecue-dominio.md). Questo file dice com'è
**adesso**: se cambia il server, cambia anche lui.

L'app risponde su `https://pilecue.com`, senza Cloudflare Access. I nomi vecchi
(`ludex.sanvisimo.tech`, `pilecue.it`, `www.pilecue.com`) rimandano lì con un 301.

## Accesso

- **SSH**: `ssh sanvi@ssh-vps.sanvisimo.tech`, attraverso il tunnel di
  Cloudflare, con `cloudflared` come `ProxyCommand` sul client. Solo chiave
  (`id_ed25519` dell'utente), niente root, niente password. La 22 è chiusa dal
  firewall del pannello Leaseweb, che è quello vero (non `ufw`).
- **`sudo` chiede la password**, e Claude non ce l'ha: i comandi da root li
  lancia l'utente. `sanvi` **non** è nel gruppo `docker`, che varrebbe root
  senza password: si usa `sudo docker`.
- `sanvi` è nel gruppo **`systemd-journal`** (12/11/2026): legge i log senza
  `sudo`, ed è così che Claude li legge da solo. Vedi «Log».
- Per le emergenze, la console «Connect» del pannello con la password di root.

## Layout

```
/opt/docker/ludex/
├── app/                    clone del repo via HTTPS (è pubblico) + compose.override.yml
├── db/                     dati di Postgres
├── redis/                  dati di Redis
├── ludex.env               variabili dell'app, 600 root — fuori dal clone
├── deploy.sh               deploy da cron, 700 root
├── backup.sh               backup notturno, 700 root
└── .deploy/                stato del deploy (l'ultima immagine fallita)
/opt/scripts/telegram.env   TELEGRAM_TOKEN e TELEGRAM_CHAT_ID degli script, 600 root
/etc/cron.d/ludex-deploy    deploy.sh ogni 5 minuti
/etc/cron.d/ludex-backup    backup.sh alle 01:10 UTC
```

`compose.override.yml` vive solo sul server e non va committato: il
`docker-compose.yml` del repo resta quello dello sviluppo.

## Servizi

| Servizio    | Ruolo                                                 | Esposizione                                                       |
| ----------- | ----------------------------------------------------- | ----------------------------------------------------------------- |
| `postgres`  | database (container `ludex-postgres`)                 | nessuna porta pubblicata, solo rete dello stack (`postgres:5432`) |
| `redis`     | code e cache                                          | `127.0.0.1:6380`, serve alla dashboard                            |
| `migrate`   | applica le migration a ogni `up` ed esce; idempotente | —                                                                 |
| `api`       | backend                                               | `127.0.0.1:3005`                                                  |
| `worker`    | processo BullMQ, servizio a parte                     | —                                                                 |
| `web`       | frontend                                              | `127.0.0.1:8095` → 8085 nel container                             |
| `dashboard` | dashboard BullMQ, `network_mode: host`                | `127.0.0.1:3002`, solo via tunnel SSH                             |

`api` e `worker` partono solo se `migrate` termina con successo e Redis è
healthy. Il tunnel `ludex-vps` ha due rotte, nell'ordine:
`^/(api/auth|rpc)/` → `127.0.0.1:3005`, il resto → `127.0.0.1:8095`.

Note sull'override (Compose ≥ 2.24):

- `ports: !reset []` toglie la porta di Postgres pubblicata dal compose del
  repo; `!override` sostituisce volumi e porte di Redis.
- `init: true` sui servizi Node: pnpm come PID 1 non inoltra i segnali, e senza
  init il worker non chiude i job in corso.
- La dashboard usa la rete dell'host perché ascolta su `127.0.0.1` per scelta:
  dentro un container sarebbe il loopback del container, irraggiungibile.
- `PUBLIC_API_URL` entra nel bundle del web **a build time** (in
  `.github/workflows/ci.yml`): cambiarla vuol dire un'immagine nuova, non un
  riavvio.

## Deploy

1. Push su `main` → GitHub Actions costruisce l'immagine e la pubblica su
   `ghcr.io/sanvisimo/ludex:main`.
2. `deploy.sh`, ogni 5 minuti: se c'è un'immagine nuova fa il dump del DB, la
   tira e rifà `docker compose up -d`, che **ricrea i container**. Un'immagine
   già installata non viene rilanciata.
3. Un errore transitorio (pull o dump falliti) si riprova al giro dopo; un
   dump fallito rimanda il deploy. Un'immagine che non parte manda **un solo**
   messaggio Telegram e si segna in `.deploy/`, per non ripetersi ogni 5
   minuti. A ogni giro riuscito `deploy.sh` spinge «ok» al monitor di Kuma.

Limiti:

- **Il clone in `app/` non si aggiorna da solo**: l'immagine sì, ma
  `docker-compose.yml` e l'override restano come sono. Se cambia il compose
  del repo, `git pull` a mano.
- **Le migration distruttive si applicano in automatico** se la CI passa: il
  dump prima del deploy è la rete di sicurezza.
- **Il rollback è a mano**: si fissa l'immagine precedente e si ripristina il
  dump.
- Una variabile nuova in `ludex.env` arriva ai container solo ricreandoli
  (`sudo docker compose up -d`): un `restart` non rilegge il file.

## Log

Dal 12/11/2026 `api` e `worker` scrivono nel **journal di sistema** (driver
`journald` nell'override, tag `ludex-api` e `ludex-worker`), e non più nei file
di Docker, che sparivano a ogni deploy insieme al container. Il journal tiene
**30 giorni, al massimo 1 GB** (`/etc/systemd/journald.conf.d/ludex.conf`), e
sopravvive a deploy e riavvii.

```bash
journalctl -t ludex-worker --since "2 hours ago" | grep "import\]"
journalctl -t ludex-api -f
```

Senza `sudo`, da `sanvi`. Da fuori, la stessa cosa dentro `ssh
ssh-vps.sanvisimo.tech '…'`. Gli altri servizi (`web`, `migrate`, Postgres,
Redis) restano sul default di `/etc/docker/daemon.json`: file di Docker,
10 MB × 3, persi alla ricreazione del container; si leggono con `sudo docker
compose logs <servizio>` da `/opt/docker/ludex/app`.

## Database e code

- **`psql`**, solo da dentro:

  ```bash
  cd /opt/docker/ludex/app && sudo docker compose exec postgres psql -U ludex -d ludex
  ```

- **Dashboard BullMQ**: `ssh -L 3002:127.0.0.1:3002 ssh-vps.sanvisimo.tech`,
  poi `http://localhost:3002`.

## Backup

`backup.sh` alle 01:10 UTC: dump, controllo con `pg_restore -l`, cifratura con
`age` (la chiave privata è sul PC dell'utente), caricamento su R2 (bucket
`ludex-backup`, EU, 8 giorni, blocco a 7). Su R2 c'è **solo il database**:
`ludex.env` l'utente lo tiene fuori dal server, e senza `STORE_TOKEN_KEY` gli
account dei negozi vanno ricollegati. Redis non ha backup: è coda e cache,
ricostruibile. Dettagli e ripristino provato in
[plans/rilascio.md](../plans/rilascio.md), «Il contorno».

## Monitoraggio e avvisi

- **Uptime Kuma** (nella LAN di casa, raggiunto da `uptime.sanvisimo.tech`):
  il push del deploy, il push «Ludex backup» (heartbeat 25 ore) e il sito,
  HTTP(s) - Keyword `"ok":true` su `https://pilecue.com/api/auth/ok`.
- **Telegram**: gli errori di deploy e backup (dagli script, con
  `/opt/scripts/telegram.env`) e, dall'app, i codici di piattaforma che un
  import Nintendo o PSN non conosce
  ([plans/avviso-codici-sconosciuti.md](../plans/avviso-codici-sconosciuti.md)).
  L'app li legge da `TELEGRAM_TOKEN` e `TELEGRAM_CHAT_ID` in `ludex.env`.
- Il monitoraggio di Leaseweb, col ping (due regole ICMP nel firewall del
  pannello: senza, segna il server DOWN).
