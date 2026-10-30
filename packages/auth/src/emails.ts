import type { Mail } from './mailer';

// Le email dell'account, in italiano e in inglese. Ognuna esce in HTML e in
// testo semplice, con la stessa struttura (`plans/rilascio-testi.md`): il
// saluto, cosa è successo, il bottone col link scritto anche per esteso,
// quanto vale, cosa fare se la richiesta non è tua. Niente immagini: nessun
// «mostra immagini» e nessun pixel di tracciamento, e il logo è il nome.

type Locale = 'it' | 'en';

const webUrl = process.env.WEB_URL ?? 'http://localhost:8085';

/**
 * La lingua di chi ha fatto la richiesta, con le stesse regole del web
 * (`apps/web/i18n/config.ts`): prima il cookie della lingua scelta, poi il
 * browser, e l'italiano se non dice niente. Il cookie arriva anche qui perché
 * le chiamate all'auth partono con `credentials: include`.
 */
export function localeOf(request?: Request): Locale {
  const cookie = request?.headers.get('cookie') ?? '';
  const chosen = /(?:^|;\s*)NEXT_LOCALE=(it|en)(?:;|$)/.exec(cookie)?.[1];
  if (chosen === 'it' || chosen === 'en') return chosen;

  const language = request?.headers.get('accept-language') ?? '';
  const first = language.split(',')[0]?.trim().toLowerCase().split('-')[0];
  return first === 'en' ? 'en' : 'it';
}

type Content = {
  subject: string;
  /** I paragrafi prima del bottone. */
  intro: string[];
  button?: string;
  /** I paragrafi dopo, in grigio: validità del link, cosa fare se non eri tu. */
  outro: string[];
};

type Texts = {
  greeting: (name: string) => string;
  fallback: string;
  verify: () => Content;
  newAddress: () => Content;
  changeEmail: (newEmail: string) => Content;
  addressTaken: (newEmail: string) => Content;
  reset: () => Content;
  existing: () => Content;
};

const texts: Record<Locale, Texts> = {
  it: {
    greeting: (name) => `Gentile ${name},`,
    fallback: 'Se il bottone non funziona, copia questo indirizzo nel browser:',
    verify: () => ({
      subject: 'Conferma il tuo indirizzo email',
      intro: [
        'per attivare il tuo account Ludex conferma il tuo indirizzo email.',
      ],
      button: "Conferma l'indirizzo",
      outro: [
        "Il link è valido per un'ora.",
        "Se non hai richiesto la registrazione, puoi ignorare questa email: l'account non verrà attivato.",
      ],
    }),
    newAddress: () => ({
      subject: 'Conferma il nuovo indirizzo email',
      intro: [
        'è stato richiesto di associare questo indirizzo al tuo account Ludex.',
      ],
      button: 'Conferma il nuovo indirizzo',
      outro: [
        "Dopo la conferma accederai con questo indirizzo. Il link è valido per un'ora.",
        'Se non hai fatto tu la richiesta, puoi ignorare questa email.',
      ],
    }),
    changeEmail: (newEmail) => ({
      subject: "Richiesta di cambio dell'indirizzo email",
      intro: [
        `è stato richiesto di cambiare l'indirizzo email del tuo account Ludex in ${newEmail}.`,
      ],
      button: 'Conferma il cambio',
      outro: [
        "Dopo la conferma invieremo un link anche al nuovo indirizzo. Il link è valido per un'ora.",
        'Se non hai fatto tu la richiesta, ignora questa email e cambia la password del tuo account.',
      ],
    }),
    addressTaken: (newEmail) => ({
      subject: 'Indirizzo email già in uso',
      intro: [
        `hai chiesto di cambiare l'indirizzo email del tuo account Ludex in ${newEmail}, ma questo indirizzo è già associato a un altro account.`,
        'Il tuo indirizzo non è cambiato.',
      ],
      outro: [
        "Se l'altro account è tuo e non ti serve più, puoi cancellarlo dal suo profilo e poi ripetere la richiesta.",
      ],
    }),
    reset: () => ({
      subject: 'Reimpostazione della password',
      intro: [
        'abbiamo ricevuto una richiesta di reimpostazione della password del tuo account Ludex.',
      ],
      button: 'Imposta una nuova password',
      outro: [
        "Il link è valido per un'ora.",
        'Se non hai fatto tu la richiesta, puoi ignorare questa email: la password resta invariata.',
      ],
    }),
    existing: () => ({
      subject: 'Hai già un account Ludex',
      intro: [
        'è stata richiesta una registrazione con questo indirizzo, che è già associato a un account Ludex.',
        'Per accedere usa la tua password; se non la ricordi, puoi impostarne una nuova.',
      ],
      button: 'Recupera la password',
      outro: [
        'Se non hai fatto tu la richiesta, puoi ignorare questa email: il tuo account non è cambiato.',
      ],
    }),
  },
  en: {
    greeting: (name) => `Dear ${name},`,
    fallback:
      "If the button doesn't work, copy this address into your browser:",
    verify: () => ({
      subject: 'Confirm your email address',
      intro: ['To activate your Ludex account, confirm your email address.'],
      button: 'Confirm address',
      outro: [
        'The link is valid for one hour.',
        "If you didn't sign up, you can ignore this email: the account won't be activated.",
      ],
    }),
    newAddress: () => ({
      subject: 'Confirm your new email address',
      intro: ['A request was made to link this address to your Ludex account.'],
      button: 'Confirm new address',
      outro: [
        "Once confirmed, you'll sign in with this address. The link is valid for one hour.",
        "If you didn't make this request, you can ignore this email.",
      ],
    }),
    changeEmail: (newEmail) => ({
      subject: 'Email address change request',
      intro: [
        `A request was made to change the email address of your Ludex account to ${newEmail}.`,
      ],
      button: 'Confirm the change',
      outro: [
        "Once confirmed, we'll also send a link to the new address. The link is valid for one hour.",
        "If you didn't make this request, ignore this email and change your account password.",
      ],
    }),
    addressTaken: (newEmail) => ({
      subject: 'Email address already in use',
      intro: [
        `You asked to change the email address of your Ludex account to ${newEmail}, but that address already belongs to another account.`,
        "Your address hasn't changed.",
      ],
      outro: [
        'If the other account is yours and you no longer need it, you can delete it from its profile and then try again.',
      ],
    }),
    reset: () => ({
      subject: 'Password reset',
      intro: [
        'We received a request to reset the password of your Ludex account.',
      ],
      button: 'Set a new password',
      outro: [
        'The link is valid for one hour.',
        "If you didn't make this request, you can ignore this email: your password stays the same.",
      ],
    }),
    existing: () => ({
      subject: 'You already have a Ludex account',
      intro: [
        'Someone tried to sign up with this address, which already belongs to a Ludex account.',
        "To sign in, use your password; if you don't remember it, you can set a new one.",
      ],
      button: 'Recover your password',
      outro: [
        "If you didn't make this request, you can ignore this email: your account hasn't changed.",
      ],
    }),
  },
};

type User = { name: string; email: string };

// Il nome lo sceglie l'utente e l'indirizzo nuovo lo scrive lui: nell'HTML
// passano di qui, o un nome come `<a href=…>` diventerebbe un link.
function escape(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

// I colori dell'app, scritti a mano: un client di posta non legge il tema.
// Il bottone è il teal 9 di Radix col testo scuro, come nell'app.
const color = {
  page: '#f8f9fa',
  card: '#ffffff',
  border: '#e6e8eb',
  text: '#11181c',
  muted: '#687076',
  accent: '#12a594',
  onAccent: '#0d3d38',
};

function compose(
  to: string,
  locale: Locale,
  name: string,
  content: Content,
  url?: string,
): Mail {
  const t = texts[locale];
  const host = new URL(webUrl).host;

  const text = [
    t.greeting(name),
    '',
    ...content.intro.flatMap((p) => [p, '']),
    ...(content.button && url ? [`${content.button}: ${url}`, ''] : []),
    ...content.outro.flatMap((p) => [p, '']),
    `Ludex · ${host}`,
    '',
  ].join('\n');

  const p = (body: string, tone: 'text' | 'muted' = 'text') =>
    `<p style="margin:0 0 16px;font-size:${tone === 'text' ? 16 : 14}px;line-height:1.5;color:${color[tone]}">${body}</p>`;

  const button =
    content.button && url
      ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px"><tr><td style="border-radius:8px;background:${color.accent}"><a href="${escape(url)}" style="display:inline-block;padding:12px 20px;font-size:16px;font-weight:600;color:${color.onAccent};text-decoration:none;border-radius:8px">${escape(content.button)}</a></td></tr></table>`
      : '';
  const fallback =
    content.button && url
      ? p(
          `${escape(t.fallback)}<br><a href="${escape(url)}" style="color:${color.muted};word-break:break-all">${escape(url)}</a>`,
          'muted',
        )
      : '';

  const html = `<!doctype html>
<html lang="${locale}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(content.subject)}</title></head>
<body style="margin:0;padding:0;background:${color.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${color.page}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:${color.card};border:1px solid ${color.border};border-radius:12px">
<tr><td style="padding:32px">
<p style="margin:0 0 24px;font-size:20px;font-weight:700;color:${color.accent}">Ludex</p>
<h1 style="margin:0 0 24px;font-size:22px;line-height:1.3;color:${color.text}">${escape(content.subject)}</h1>
${p(escape(t.greeting(name)))}
${content.intro.map((body) => p(escape(body))).join('\n')}
${button}
${content.outro.map((body) => p(escape(body), 'muted')).join('\n')}
${fallback}
</td></tr>
</table>
<p style="margin:16px 0 0;font-size:13px;color:${color.muted}"><a href="${escape(webUrl)}" style="color:${color.muted}">Ludex · ${escape(host)}</a></p>
</td></tr></table>
</body>
</html>
`;

  return { to, subject: content.subject, text, html };
}

/** La conferma dell'indirizzo alla registrazione. */
export function verifyEmail(user: User, url: string, locale: Locale): Mail {
  return compose(user.email, locale, user.name, texts[locale].verify(), url);
}

/**
 * Il secondo link del cambio email, al nuovo indirizzo: Better Auth lo spedisce
 * con la stessa funzione della registrazione, e `user.email` è già quello nuovo.
 */
export function verifyNewAddress(
  user: User,
  url: string,
  locale: Locale,
): Mail {
  return compose(
    user.email,
    locale,
    user.name,
    texts[locale].newAddress(),
    url,
  );
}

export function resetPassword(user: User, url: string, locale: Locale): Mail {
  return compose(user.email, locale, user.name, texts[locale].reset(), url);
}

/**
 * A chi si registra con un indirizzo che ha già un account. La registrazione
 * risponde come per un indirizzo nuovo, così non si scopre chi è iscritto:
 * senza questa email chi ha dimenticato di esserlo aspetterebbe un link che
 * non arriva. `url` porta al recupero della password, non a un reset diretto.
 */
export function existingAccount(user: User, url: string, locale: Locale): Mail {
  return compose(user.email, locale, user.name, texts[locale].existing(), url);
}

/** Va all'indirizzo di adesso, non a quello nuovo: è lui che conferma. */
export function confirmEmailChange(
  user: User,
  newEmail: string,
  url: string,
  locale: Locale,
): Mail {
  return compose(
    user.email,
    locale,
    user.name,
    texts[locale].changeEmail(newEmail),
    url,
  );
}

/**
 * Il cambio verso un indirizzo che ha già un account: Better Auth risponde
 * come se fosse partito, per non dire chi è iscritto, e non spedisce niente.
 * L'avviso va all'indirizzo di adesso, cioè a chi ha chiesto il cambio.
 */
export function addressTaken(
  user: User,
  newEmail: string,
  locale: Locale,
): Mail {
  return compose(
    user.email,
    locale,
    user.name,
    texts[locale].addressTaken(newEmail),
  );
}
