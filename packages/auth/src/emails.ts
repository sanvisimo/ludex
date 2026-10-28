import type { Mail } from './mailer';

// I testi delle email, in italiano e in inglese. Solo testo: niente HTML,
// niente immagini da caricare, e un link che si legge per intero.

type Locale = 'it' | 'en';

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

const texts = {
  it: {
    signature: '— Ludex',
    verify: {
      subject: 'Conferma il tuo indirizzo email',
      body: (name: string, url: string) =>
        `Ciao ${name},\n\nper finire la registrazione su Ludex apri questo link:\n\n${url}\n\nIl link vale un'ora. Se non ti sei registrato tu, ignora questa email.`,
    },
    reset: {
      subject: 'Reimposta la password',
      body: (name: string, url: string) =>
        `Ciao ${name},\n\nhai chiesto di reimpostare la password di Ludex. Scegli quella nuova da qui:\n\n${url}\n\nIl link vale un'ora. Se non l'hai chiesto tu, ignora questa email: la password resta quella di prima.`,
    },
    changeEmail: {
      subject: 'Conferma il cambio di indirizzo email',
      body: (name: string, url: string, newEmail: string) =>
        `Ciao ${name},\n\nhai chiesto di cambiare l'indirizzo email del tuo account Ludex in ${newEmail}. Per confermare apri questo link:\n\n${url}\n\nDopo ti scriveremo al nuovo indirizzo, per verificarlo. Il link vale un'ora. Se non l'hai chiesto tu, ignora questa email e cambia la password.`,
    },
  },
  en: {
    signature: '— Ludex',
    verify: {
      subject: 'Confirm your email address',
      body: (name: string, url: string) =>
        `Hi ${name},\n\nto finish signing up to Ludex open this link:\n\n${url}\n\nThe link is valid for one hour. If you didn't sign up, ignore this email.`,
    },
    reset: {
      subject: 'Reset your password',
      body: (name: string, url: string) =>
        `Hi ${name},\n\nyou asked to reset your Ludex password. Choose the new one here:\n\n${url}\n\nThe link is valid for one hour. If you didn't ask for it, ignore this email: your password stays the same.`,
    },
    changeEmail: {
      subject: 'Confirm your new email address',
      body: (name: string, url: string, newEmail: string) =>
        `Hi ${name},\n\nyou asked to change the email address of your Ludex account to ${newEmail}. To confirm, open this link:\n\n${url}\n\nWe'll then write to the new address to verify it. The link is valid for one hour. If you didn't ask for it, ignore this email and change your password.`,
    },
  },
} as const;

type User = { name: string; email: string };

export function verifyEmail(user: User, url: string, locale: Locale): Mail {
  const t = texts[locale];
  return {
    to: user.email,
    subject: t.verify.subject,
    text: `${t.verify.body(user.name, url)}\n\n${t.signature}\n`,
  };
}

export function resetPassword(user: User, url: string, locale: Locale): Mail {
  const t = texts[locale];
  return {
    to: user.email,
    subject: t.reset.subject,
    text: `${t.reset.body(user.name, url)}\n\n${t.signature}\n`,
  };
}

/** Va all'indirizzo di adesso, non a quello nuovo: è lui che conferma. */
export function confirmEmailChange(
  user: User,
  newEmail: string,
  url: string,
  locale: Locale,
): Mail {
  const t = texts[locale];
  return {
    to: user.email,
    subject: t.changeEmail.subject,
    text: `${t.changeEmail.body(user.name, url, newEmail)}\n\n${t.signature}\n`,
  };
}
