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
prepara la PR e verifica in sola lettura.

1. [x] **DNS su Cloudflare** per `pilecue.com` e `pilecue.it`. Sul `.it` prima
       la zona di Infomaniak corretta dalla sua diagnosi (DKIM
       `20261110._domainkey`, `autoconfig`, `autodiscover`, MX, SPF), poi gli
       stessi record copiati su Cloudflare, quelli della posta con la nuvola
       grigia, poi i nameserver. Registro verificato il 10/11 alle 16:08:
       `adam`/`sunny.ns.cloudflare.com` su entrambi, DNSSEC spento. Il `.it`
       non risolveva ancora: la zona del registro era di prima della
       registrazione.
   - [ ] Record della posta di `pilecue.it` verificati da fuori, a dominio
         pubblicato. Il 10/11: NS Cloudflare, MX `mta-gw.infomaniak.ch`,
         SPF `include:spf.infomaniak.ch -all` e DKIM rispondono; mancano
         `autoconfig` e `autodiscover`, e `_dmarc` (arriva con 1b).
3b. [x] Tolte da `ludex-vps` le rotte su `pilecue.it`: col tunnel davanti
        serviva l'app anche lì (200). Il record Tunnel nel DNS resta, come
        record proxied per il redirect del passo 5.
   - [ ] WHOIS del `.it`: titolare come persona fisica, senza consenso alla
         pubblicazione (oggi è un'organizzazione, con l'indirizzo in chiaro).
1b. [x] **Scaleway TEM** (dominio verificato il 10/11): dominio `pilecue.it` nello stesso progetto. Nel DNS
        il DKIM di Scaleway, **un solo** SPF con i due include
        (`v=spf1 include:<Infomaniak> include:_spf.tem.scaleway.com ~all`) e
        **un solo** `_dmarc` (`p=none`). Niente MX blackhole: ci sono gli MX
        veri. Si aspetta la verifica.
        Il 10/11: SPF unito e `_dmarc` a `p=none` rispondono. Era entrato anche
        l'MX `10 blackhole.tem.scaleway.com`, da togliere: è il ripiego quando
        Infomaniak non risponde, e la posta di `info@` finirebbe nel nulla.
        Superato dalla scelta di `pilecue.com` (1c): l'include di Scaleway, il
        suo DKIM e il dominio su TEM si possono togliere da `pilecue.it`.
1c. [ ] **Scaleway TEM su `pilecue.com`**: il dominio nello stesso progetto;
        nel DNS il DKIM di Scaleway, `v=spf1 include:_spf.tem.scaleway.com -all`,
        `_dmarc` a `p=none` e l'MX `blackhole.tem.scaleway.com` (qui sì: su
        `pilecue.com` non c'è posta). Si aspetta la verifica, **prima del
        merge**.
2. [x] **Turnstile**: `pilecue.com` fra gli hostname del widget. Saltarlo
       chiude fuori tutti al cambio.
3. [x] **Tunnel `ludex-vps`**: hostname `pilecue.com` con le stesse due
       rotte, in quest'ordine: `^/(api/auth|rpc)/` → `127.0.0.1:3005`, il
       resto → `127.0.0.1:8095`. Il vecchio nome resta finché c'è il redirect.
4. [ ] **Il cambio**, insieme:
   - in `ludex.env` `BETTER_AUTH_URL` e `WEB_URL` a `https://pilecue.com`,
     senza riavviare;
   - PR con `PUBLIC_API_URL=https://pilecue.com` in `ci.yml`. Al merge
     `deploy.sh` installa l'immagine e, ricreando i container, rilegge
     `ludex.env`: bundle e server cambiano insieme.
4b. [ ] `MAIL_FROM="PileCue <noreply@pilecue.com>"` in `ludex.env`, **solo
        dopo** la verifica di 1c: un mittente non verificato fa rifiutare gli
        invii. Entra in `ludex.env` insieme alle due del passo 4: la
        ricreazione dei container al deploy le legge tutte.
4c. [ ] `contactEmail` a `info@pilecue.it`, nella stessa PR: esce col deploy.
5. [ ] **Redirect Rules**, 301: `ludex.sanvisimo.tech/*`, `pilecue.it` e
       `www.pilecue.com` → `https://pilecue.com` + path + query. Ogni nome
       senza record vuole un `AAAA 100::` proxied; sull'apex del `.it` non
       tocca la posta.
6. [ ] **Kuma**: il monitor del sito su `https://pilecue.com/api/auth/ok`.
7. [ ] **Documentazione**: i riferimenti in [rilascio](rilascio.md) e in
       [.env.example](../.env.example), compreso il default di `MAIL_FROM`.

### Le prove

- Home, `/login`, `/api/auth/ok` su `pilecue.com`; il vecchio nome rimanda con
  path e query.
- Un recupero password: l'email arriva in posta in arrivo, il link porta a
  `pilecue.com`, SPF, DKIM e DMARC a `pass`.
- Una mail da `info@pilecue.it`, stessi tre controlli.

### Dopo

Il dominio `ludex.sanvisimo.tech` su Scaleway e i suoi record si possono
togliere, senza fretta.
