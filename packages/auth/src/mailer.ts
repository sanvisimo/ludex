import { createTransport } from 'nodemailer';

// Chi spedisce le email: Scaleway TEM, via SMTP. Il fornitore sta tutto nelle
// variabili, quindi cambiarlo vuol dire cambiare il `.env` e non il codice.
//
// Senza `SMTP_HOST` (in sviluppo e nei test) non si spedisce niente: l'email
// finisce nel log dell'API, link compreso, e da lì si apre a mano.
const host = process.env.SMTP_HOST;
const from = process.env.MAIL_FROM ?? 'Ludex <noreply@localhost>';

const transport = host
  ? createTransport({
      host,
      port: Number(process.env.SMTP_PORT ?? 587),
      // 465 è TLS dall'inizio; le altre porte partono in chiaro e salgono con
      // STARTTLS, che qui è obbligatorio: la password non viaggia in chiaro.
      secure: process.env.SMTP_PORT === '465',
      requireTLS: process.env.SMTP_PORT !== '465',
      auth: {
        user: process.env.SMTP_USER ?? '',
        pass: process.env.SMTP_PASS ?? '',
      },
    })
  : null;

export type Mail = { to: string; subject: string; text: string };

export async function sendMail(mail: Mail) {
  if (!transport) {
    // Nei test ogni registrazione ne spedirebbe una: il log sarebbe rumore.
    if (process.env.NODE_ENV === 'test') return;
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
