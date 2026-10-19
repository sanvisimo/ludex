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
- [ ] **Spostarlo dal mini PC**.
- [ ] **Togliere Cloudflare Access**: l'app si apre senza One-time PIN.
- [ ] **Verifica dell'email** alla registrazione. Oggi è spenta
      (`requireEmailVerification: false` in `packages/auth/src/index.ts`),
      perché manca chi spedisce le email.
- [ ] **Un CAPTCHA?** Da decidere se serve, su quali form e quale.
- [ ] **Stabilizzare login e registrazione**.
- [ ] **Recupero della password** («password dimenticata»): manca, e anche
      questo aspetta chi spedisce le email.
- [x] **Cambio password**: c'è già, dal lotto 12g (la scheda «Password» del
      profilo, `apps/web/components/change-password.tsx`).

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
