# PileCue — il dominio e le email

## Decisione (10/11/2026)

L'app passa da `ludex.sanvisimo.tech` a **`https://pilecue.com`**. Il vecchio
nome, `pilecue.it` e `www.pilecue.com` rimandano lì con un 301 che conserva
path e query, così i link `/shared/...` già condivisi restano validi.

Le email dell'app partono da **`PileCue <noreply@pilecue.com>`** (deciso lo
stesso giorno, al posto di `noreply@pilecue.it`): stesso nome del sito, e un
SPF solo di Scaleway, che non si mescola con la posta di Infomaniak. `noreply@`
non è una casella, conta solo il dominio verificato. La casella vera è
`info@pilecue.it`, su Infomaniak, ed è anche il contatto di informativa e
condizioni (`contactEmail` in `apps/web/lib/credits.ts`, prima l'indirizzo
personale). Scartati: `.gg` (non aggiunge niente a un
link condiviso), `.app` (facoltativo, non preso), `pileque.com` (il refuso,
già registrato da altri).

Domini comprati il 10/11/2026 su Infomaniak; il `.it` risulta dal registrar
Key-Systems. DNS di entrambi su Cloudflare, nello stesso account del tunnel.

## Cosa dipende dal nome

- `PUBLIC_API_URL`, a **build time**, in [ci.yml](../.github/workflows/ci.yml):
  serve un'immagine nuova.
- `BETTER_AUTH_URL` e `WEB_URL` in `ludex.env` sul server: origine del CORS,
  `trustedOrigins` di Better Auth, link nelle email.
- `MAIL_FROM` in `ludex.env`.
- Hostname del widget Turnstile, rotte del tunnel `ludex-vps`, monitor di Kuma.

Nessun negozio ha un callback sul nostro dominio: i `redirect_uri` di GOG,
Amazon e PSN sono loro.

Al cambio tutti escono una volta: il cookie di sessione è legato al vecchio
nome.

## I passi

I pannelli li tocca l'utente; i comandi sul server li lancia l'utente. Claude
prepara la PR e verifica in sola lettura. **Fatti tutti il 10/11/2026.**

1. [x] **DNS su Cloudflare** per `pilecue.com` e `pilecue.it`. Sul `.it` prima
       la zona di Infomaniak corretta dalla sua diagnosi, poi gli stessi
       record copiati su Cloudflare, quelli della posta con la nuvola grigia,
       poi i nameserver (`adam`/`sunny.ns.cloudflare.com`, DNSSEC spento). Il
       `.it` appena registrato non risolve finché il registro non ripubblica
       la sua zona, e un resolver interrogato prima ricorda il «non esiste».
       Sul `.it` restano: MX `5 mta-gw.infomaniak.ch`, SPF, DKIM
       `20261110._domainkey` di Infomaniak, `_dmarc` a `p=none`,
       `autoconfig` e `autodiscover` → `infomaniak.com`.
2. [x] **Scaleway TEM su `pilecue.com`**, il mittente: DKIM di Scaleway,
       `v=spf1 include:_spf.tem.scaleway.com -all`, MX
       `blackhole.tem.scaleway.com` (su `pilecue.com` non c'è posta) e
       `_dmarc` a **`p=reject`**: più stretto del `p=none` proposto, e giusto
       per un dominio che spedisce solo da Scaleway, con DKIM. Prima si era
       provato `pilecue.it`: l'MX blackhole proposto da Scaleway era finito
       accanto a quello di Infomaniak, come ripiego che avrebbe buttato la
       posta di `info@`. Tolto.
3. [x] **Turnstile**: `pilecue.com` fra gli hostname del widget.
4. [x] **Tunnel `ludex-vps`**: hostname `pilecue.com` con le stesse due rotte,
       in quest'ordine: `^/(api/auth|rpc)/` → `http://127.0.0.1:3005`, il
       resto → `http://127.0.0.1:8095`. Il primo tentativo dava 502: c'era
       scritto `127.0.01`. Le rotte su `pilecue.it` sono state tolte, perché
       servivano l'app anche lì; togliendole Cloudflare ha cancellato anche
       il record Tunnel nel DNS.
5. [x] **Il cambio**: in `ludex.env` `BETTER_AUTH_URL` e `WEB_URL` a
       `https://pilecue.com` e `MAIL_FROM="PileCue <noreply@pilecue.com>"`,
       senza riavviare; poi il merge di #124 (`PUBLIC_API_URL` in `ci.yml` e
       `contactEmail` a `info@pilecue.it`). `deploy.sh` ha ricreato i
       container con l'immagine nuova e il nuovo `ludex.env`. Verificato: il
       bundle chiama `https://pilecue.com`, l'API risponde
       `access-control-allow-origin: https://pilecue.com`.
6. [x] **Redirect Rules**, 301 con la query: `ludex.sanvisimo.tech` e
       `pilecue.it` → `concat("https://pilecue.com", http.request.uri.path)`;
       `www.pilecue.com` col modello di Cloudflare `https://www.*` →
       `https://${1}`. `pilecue.it` e `www.pilecue.com` hanno un
       `AAAA 100::` proxied, che non porta da nessuna parte: serve solo a far
       passare la richiesta da Cloudflare. **Always Use HTTPS** acceso su
       `pilecue.com`, o `http://` serviva l'app in chiaro e `http://www.`
       sfuggiva alla regola (522). Il redirect da `ludex.sanvisimo.tech`
       scatta prima del tunnel. L'avviso «may not be proxying» sulla regola
       `www` si ignora: nasce dal modello, che non nomina un hostname.
7. [x] **Kuma**: il monitor del sito, HTTP(s) - Keyword `"ok":true`, su
       `https://pilecue.com/api/auth/ok`.
8. [x] **Documentazione**: il default di `MAIL_FROM` in
       [.env.example](../.env.example) e una nota in [rilascio](rilascio.md),
       che resta il racconto di com'era.

### Le prove

- [x] Home, `/login`, `/api/auth/ok` su `pilecue.com`; i tre nomi vecchi
      rimandano con path e query, anche da `http://`.
- [ ] Un accesso dal browser, che prova anche Turnstile.
- [ ] Un recupero password: l'email arriva in posta in arrivo, il link porta a
      `pilecue.com`, SPF, DKIM e DMARC a `pass`.
- [ ] Una mail da `info@pilecue.it`, stessi tre controlli.

Favicon e `apple-touch-icon.png` del marchio nuovo (#125) si vedono tardi:
Cloudflare e il browser le tengono 4 ore (`max-age=14400`). Si svuota con un
purge dei tre indirizzi su Cloudflare.

### Da fare, sui pannelli

- [ ] WHOIS del `.it`: titolare come persona fisica, senza consenso alla
      pubblicazione (oggi è un'organizzazione, con l'indirizzo in chiaro).
- [ ] `pilecue.it` via da Scaleway; dal suo DNS il DKIM di Scaleway
      (`3df29148-…._domainkey`) e `include:_spf.tem.scaleway.com` dall'SPF,
      che torna `v=spf1 include:spf.infomaniak.ch -all`.
- [ ] `ludex.sanvisimo.tech` via da Scaleway, coi suoi record (SPF, MX,
      DMARC, DKIM del sottodominio).
- [ ] Le due rotte di `ludex.sanvisimo.tech` dal tunnel: il record Tunnel nel
      DNS va tenuto, o sostituito con un `AAAA 100::` proxied, perché il
      redirect ha bisogno di un record con il proxy.
- [ ] `ludex.sanvisimo.tech` fra gli hostname di Turnstile.
