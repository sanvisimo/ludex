# Ludex — ambiente di test sul mini PC

Stato dell'ambiente di test di Ludex (`sanvisimo/ludex`) ospitato sul mini PC di casa.
Ricostruito dalle sessioni di lavoro del 28–29 settembre 2026; i punti da ricontrollare sul server sono marcati **[da verificare]**.

## Cos'è

Ambiente di test raggiungibile da amici su `https://ludex.sanvisimo.tech`, dietro Cloudflare Access (One-time PIN). Il mini PC (Fujitsu Esprimo Q558, Debian 13, `192.168.1.19`) ospita già altri servizi self-hosted; Ludex è uno stack Docker Compose come gli altri, ma con deploy automatico da CI.

In locale il `docker-compose.yml` del repo resta invariato: tutto ciò che è specifico del mini PC sta in un `docker-compose.override.yml` che **non** va committato.

## Layout sul server

```
/opt/docker/ludex/
├── app/                      ← clone del repo + docker-compose.override.yml
├── db/                       ← Postgres (bind mount; .noaiobackup; datadir in db/data/)
├── redis/                    ← Redis (bind mount; .noaiobackup)
├── ludex.env                 ← variabili dell'app, 600, fuori dal clone
├── deploy.sh                 ← deploy automatico, 700 root:root
└── .deploy/failed            ← ID dell'ultima immagine che non è partita
```

Regola dell'infrastruttura: i database stanno su NVMe in `/opt/docker/`, mai su MergerFS.

## Servizi

| Servizio    | Ruolo                                                 | Esposizione                                                         |
| ----------- | ----------------------------------------------------- | ------------------------------------------------------------------- |
| `postgres`  | database (container `ludex-postgres`)                 | nessuna porta pubblicata, solo rete dello stack (`postgres:5432`)   |
| `redis`     | code                                                  | `127.0.0.1:6380`, serve alla dashboard                              |
| `migrate`   | applica le migration a ogni `up` ed esce; idempotente | —                                                                   |
| `api`       | backend                                               | `127.0.0.1:3005`                                                    |
| `worker`    | processo BullMQ, servizio a parte                     | —                                                                   |
| `web`       | frontend                                              | `127.0.0.1:8095` → 8085 nel container (la 8085 dell'host è di Komf) |
| `dashboard` | dashboard BullMQ, `network_mode: host`                | `127.0.0.1:3002`, solo via tunnel SSH                               |

`api` e `worker` partono solo se `migrate` termina con successo e Redis è healthy.

Note sull'override (Compose ≥ 2.24):

- `ports: !reset []` toglie la porta di Postgres pubblicata dal compose del repo; `!override` sostituisce volumi e porte di Redis con bind mount su NVMe.
- `init: true` sui servizi Node: pnpm come PID 1 non inoltra i segnali, senza init il worker non chiude i job in corso.
- La dashboard usa la rete dell'host perché ascolta su `127.0.0.1` per scelta: dentro un container sarebbe il loopback del container, irraggiungibile.
- `ludex.env` sta fuori dal clone per non finire nell'immagine.
- `PUBLIC_API_URL` entra nel bundle del web **a build time**: cambiarla significa ricostruire l'immagine, non riavviare.
- Un solo hostname (`ludex.sanvisimo.tech`) per web e API: Access non blocca le chiamate lato server e i cookie di sessione non attraversano sottodomini.

## Rete e accesso

- **Cloudflare Tunnel** (config file-based in `/etc/cloudflared/config.yml`): due regole di ingress verso web e API. Si usa `127.0.0.1`, non `localhost`, perché le porte sono bindate solo in IPv4.
- **Cloudflare Access** con One-time PIN come identity provider (Zero Trust → Integrations → Identity providers: dal giugno 2026 l'OTP non è più abilitato di default sulle nuove organizzazioni). Serve qui perché l'app è un test esposto a persone esterne.
- **Dashboard BullMQ:** `ssh -L 3002:127.0.0.1:3002 sanvi@ssh.sanvisimo.tech`, poi `http://localhost:3002`. L'SSH passa da Cloudflare Tunnel, quindi sul client serve `cloudflared` come ProxyCommand.
- **Database:** nessun accesso diretto da fuori. Per `psql`:

  ```
  ssh -t sanvi@ssh.sanvisimo.tech "sudo docker exec -it ludex-postgres sh -c 'psql -U \"\$POSTGRES_USER\" \"\$POSTGRES_DB\"'"
  ```

  Se serve un client grafico: porta su loopback (`127.0.0.1:5433:5432` nell'override) più tunnel SSH. Non applicato.

- **Log:** `cd /opt/docker/ludex/app && sudo docker compose logs -f api worker`

## CI/CD

1. Push su `main` → GitHub Actions costruisce l'immagine e la pubblica su `ghcr.io/sanvisimo/ludex:main`.
2. Sul mini PC `deploy.sh` gira da cron **ogni 5 minuti**: se c'è un'immagine nuova fa il dump del DB, tira l'immagine e rifà `docker compose up -d`. Ogni deploy lascia una riga `installato` nel log; un'immagine già installata non viene rilanciata.
3. Va lanciato col percorso completo (`sudo /opt/docker/ludex/deploy.sh`) e vuole permessi `700`.

Modello degli errori, a due livelli:

| Tipo    | Quando                                          | Effetto                                                                                                     |
| ------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `abort` | errore transitorio (pull fallito, dump fallito) | solo Kuma, si riprova al giro dopo; un dump fallito **rimanda** il deploy, non blocca l'immagine per sempre |
| `fail`  | l'immagine non parte                            | un solo messaggio Telegram, ID dell'immagine in `.deploy/failed` così non si ripete ogni 5 minuti           |

Notifiche: Telegram con `TELEGRAM_TOKEN` / `TELEGRAM_CHAT_ID` da `/opt/scripts/telegram.env`. Monitor push su Uptime Kuma, heartbeat 900 s, URL LAN `http://192.168.1.19:3001/api/push/<TOKEN>` (non il dominio pubblico: col tunnel di mezzo un guasto del tunnel farebbe diventare rosso il monitor sbagliato).

GitHub: il mini PC usa una chiave SSH registrata sull'account personale, non una deploy key (scelta consapevole).

## Backup

- **Dump Postgres** dentro `/opt/scripts/backup-dbs.sh` (01:10, retention 7 giorni), con verifica del dump; errore → Telegram, successo → push Kuma.
- **Borg (via Nextcloud AIO)** copia `/opt/docker`, quindi anche config, `ludex.env` e il dump. I file `.noaiobackup` in `db/` e `redis/` evitano il `file changed while we backed it up` che farebbe cancellare l'archivio della notte.
- Off-site: gli archivi Borg sono replicati su OneDrive da rclone.
- Ripristino del DB: dal dump, a mano.

## Limiti noti

- Il **clone in `app/` non viene aggiornato** da `deploy.sh`: l'immagine sì, ma `docker-compose.yml` del repo e override restano alla versione clonata. Se cambiano a monte, `git pull` a mano.
- **Le migration distruttive vengono applicate in automatico** se la CI passa: `migrate` gira a ogni deploy. Il dump pre-deploy è l'unica rete di sicurezza.
- **Il rollback è manuale:** pin dell'immagine precedente e ripristino del dump.
- Redis non ha un dump dedicato: è coda, ricostruibile.
- **[da verificare]** permessi di `ludex.env` (devono essere `600`; in una prima versione erano `644`).
