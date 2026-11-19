# Email a chi diventa admin, e la lingua dell'utente

«Rendi admin» cambiava il ruolo e basta: chi veniva promosso se ne accorgeva
dalla voce Admin nel menu. Ora riceve un'email. È la prima email che non parte
da una richiesta di chi la riceve, quindi il cookie della lingua non c'è: la
lingua dell'utente si salva.

## Decisioni

- **Solo alla promozione**, e solo se prima non era admin. La revoca no: è la
  promozione che serve vedere, per accorgersi di un admin aggiunto da chi non
  doveva.
- **La lingua sta in `user_settings.locale`**, non negli `additionalFields` di
  Better Auth: `auth.ts` è generato, e una preferenza non ha niente da fare
  dentro ogni sessione. Nulla vuol dire mai saputa, e si ripiega sull'italiano.
- **Si scrive alla registrazione** (`databaseHooks.user.create.after`, con
  `localeOf(request)`; gira dopo la transazione, quindi la FK regge) e **al
  cambio di lingua dal menu utente** (`useChangeLocale({ save: true })`). Il
  selettore delle pagine senza sessione scrive solo il cookie.
- Chi era già registrato resta senza lingua, cioè italiano, finché non la cambia
  dal menu.

## Passi

1. Colonna `locale` su `user_settings`, migration `0066`.
2. `locale` in `UserSettingsSchema`, nel servizio `user-settings` e
   nell'esportazione dell'account.
3. Hook alla registrazione in [packages/auth/src/index.ts](../packages/auth/src/index.ts).
4. `madeAdmin` in [emails.ts](../packages/auth/src/emails.ts), in italiano e in
   inglese, col bottone verso `/admin`.
5. `findUserForRoleChange` in
   [admin-users.ts](../apps/api/src/services/admin-users.ts) e l'invio in
   `setRole`, con `sendInBackground` dopo `auth.api.setRole`.
6. Il menu utente salva la lingua scelta.

## Fuori

- Il mobile: la lingua viene dal telefono, si salverà quando avrà un selettore.
- Chi accede da un browser nuovo vede la lingua del cookie di quel browser, non
  quella salvata.

## Verifica

- `pnpm check-types`, `pnpm lint`, `pnpm --filter api test`: verdi il
  19/11/2026 (1232 test).
- A mano, provato dall'utente il 19/11/2026: registrazione col browser in inglese → `locale = 'en'`;
  cambio di lingua dal menu → il campo cambia; «Rendi admin» → email in
  inglese su Mailpit (http://localhost:8035); di nuovo «Rendi admin» → nessuna
  seconda email.
