import { createTransport } from 'nodemailer';

// Chi spedisce le email: Scaleway TEM, via SMTP. Il fornitore sta tutto nelle
// variabili, quindi cambiarlo vuol dire cambiare il `.env` e non il codice.
//
// In sviluppo si spedisce a Mailpit (`docker-compose.yml`), che le tiene per
// sé. Senza `SMTP_HOST` non si spedisce niente: l'email finisce nel log
// dell'API, link compreso, e da lì si apre a mano.
const host = process.env.SMTP_HOST;
const from = process.env.MAIL_FROM ?? 'Ludex <noreply@localhost>';

const user = process.env.SMTP_USER;

const transport = host
  ? createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      // 465 è TLS dall'inizio; le altre porte partono in chiaro e salgono con
      // STARTTLS, obbligatorio quando c'è una password da non mandare in
      // chiaro. Senza credenziali è Mailpit, in sviluppo, che TLS non ce l'ha.
      secure: process.env.SMTP_PORT === '465',
      requireTLS: Boolean(user) && process.env.SMTP_PORT !== '465',
      auth: user ? { user, pass: process.env.SMTP_PASS ?? '' } : undefined,
    })
  : null;

export type Mail = { to: string; subject: string; text: string; html: string };

export async function sendMail(mail: Mail) {
  // Nei test ogni registrazione ne spedirebbe una, a Mailpit se il `.env` di
  // sviluppo lo nomina: niente rete e niente rumore nel log.
  if (process.env.NODE_ENV === 'test') return;
  if (!transport) {
    console.info(
      `[email] a ${mail.to}: ${mail.subject}\n${mail.text}\n[/email]`,
    );
    return;
  }
  await transport.sendMail({ from, ...mail });
}

/**
 * Better Auth aspetta la spedizione dentro la richiesta: un SMTP lento
 * terrebbe ferma la registrazione, e il tempo di risposta direbbe a chi prova
 * se un'email è registrata (al recupero password si spedisce solo a chi c'è).
 * Quindi si parte senza aspettare, e un errore resta nel log.
 */
export function sendInBackground(mail: Mail) {
  sendMail(mail).catch((error: unknown) =>
    console.error(`[email] spedizione fallita a ${mail.to}`, error),
  );
}
