import type { Locale } from '@/i18n/config';
import { contactEmail, licenseUrl, repoUrl } from '@/lib/credits';

/**
 * Informativa privacy e condizioni d'uso, nelle due lingue.
 *
 * Stanno qui e non in `messages/*.json` perché sono prosa lunga che si rilegge
 * come un documento solo: a chiavi sparse non si vedrebbe se l'italiano e
 * l'inglese dicono la stessa cosa. **Sono scritti sui dati che Ludex raccoglie
 * davvero** (schema in `packages/db`, cookie in `apps/web/src`): se cambia
 * uno dei due, cambia anche il testo, e `updated` con lui.
 *
 * Non sono una consulenza legale: li ha scritti chi sviluppa Ludex, e vanno
 * riletti da qualcuno competente prima di aprire il servizio al pubblico.
 */
export type LegalDoc = {
  title: string;
  /** Data dell'ultimo aggiornamento, già nella forma da leggere. */
  updated: string;
  /** Un blocco è un paragrafo; un array di stringhe è un elenco puntato. */
  sections: { heading: string; blocks: (string | string[])[] }[];
};

/** Il titolare: chi risponde dei dati. Una persona, non un'azienda. */
const controller = 'Simone Sanvito';

const privacyIt: LegalDoc = {
  title: 'Informativa sulla privacy',
  updated: 'Ultimo aggiornamento: 6 ottobre 2026',
  sections: [
    {
      heading: 'Chi siamo',
      blocks: [
        `Il titolare del trattamento è ${controller}, persona fisica, che gestisce Ludex senza scopo di lucro. Per qualunque cosa scrivi a ${contactEmail}.`,
      ],
    },
    {
      heading: 'Quali dati raccogliamo',
      blocks: [
        [
          "Account: nome, indirizzo email e password. La password non è salvata in chiaro, ma solo come impronta (hash). Se serve, anche il ruolo (amministratore) e l'eventuale sospensione dell'account, con motivo e scadenza.",
          "Sessione: quando accedi registriamo l'indirizzo IP e il browser (user agent) della sessione, finché la sessione dura.",
          'Libreria: i giochi del tuo backlog con stato, voto, note e tag, le copie che possiedi (piattaforma, negozio, supporto), le ore giocate e le tue preferenze.',
          "Account dei negozi: se ne colleghi uno, l'identificativo e il nome dell'account sul negozio e, dove serve, le credenziali (token) per leggere la tua libreria. I token sono conservati cifrati. Su Steam non ne conserviamo: basta il profilo pubblico.",
          'Segnalazioni: se segnali un errore su un gioco, cosa hai segnalato, il gioco che suggerisci e la nota che scrivi. Le legge chi amministra Ludex, per correggere il gioco per tutti.',
        ],
        'Non raccogliamo dati di pagamento, posizione, né usiamo strumenti di statistica o pubblicità.',
      ],
    },
    {
      heading: 'Perché li usiamo, e su che base',
      blocks: [
        [
          "Per darti il servizio: l'account, la libreria e l'aggiornamento dai negozi che colleghi. La base è il contratto con te (art. 6.1.b GDPR).",
          "Per la sicurezza: le sessioni e l'indirizzo IP servono a tenere sicuro l'accesso, e la sospensione di un account a fermare un abuso. La base è il nostro legittimo interesse (art. 6.1.f GDPR).",
        ],
        'Non vendiamo i tuoi dati e non li usiamo per pubblicità.',
      ],
    },
    {
      heading: 'Cookie e archivio del browser',
      blocks: [
        [
          'better-auth.session_token: tiene aperta la tua sessione. Necessario, scade con la sessione.',
          'NEXT_LOCALE: ricorda la lingua scelta. Dura un anno.',
          'theme (archivio locale del browser): ricorda il tema chiaro o scuro.',
        ],
        'Sono tutti necessari al funzionamento o scelte tue, quindi non serve un banner di consenso. Non usiamo cookie di profilazione né di terzi.',
      ],
    },
    {
      heading: 'A chi arrivano i dati',
      blocks: [
        [
          'Il fornitore di hosting su cui gira Ludex, che conserva i dati per nostro conto.',
          "I negozi che colleghi: ricevono le richieste con cui leggiamo la tua libreria (ad esempio Steam riceve il tuo SteamID). Alcuni hanno sede fuori dall'Unione Europea.",
          'I servizi da cui prendiamo i dati dei giochi (IGDB, HowLongToBeat, OpenCritic, Metacritic, Wikidata) ricevono solo titoli e identificativi di giochi, mai dati personali.',
        ],
        'Non cediamo i dati a nessun altro.',
      ],
    },
    {
      heading: 'Quanto li conserviamo',
      blocks: [
        [
          "Account e libreria: finché hai l'account.",
          'Sessioni: fino alla scadenza.',
          "Credenziali di un negozio: si cancellano quando scolleghi quell'account.",
          "Segnalazioni: finché hai l'account, anche dopo che sono state risolte.",
        ],
        "Se chiudi l'account cancelliamo i tuoi dati: libreria, copie, tag, account dei negozi, segnalazioni. I dati dei giochi (titoli, copertine, durate) sono condivisi fra tutti gli utenti e non sono personali, quindi restano.",
        "Dalla pagina Profilo del tuo account puoi scaricare i tuoi dati in un file JSON e cancellare l'account. La cancellazione chiede la password, è immediata e non si può annullare. Il file non contiene le credenziali dei negozi né la password.",
      ],
    },
    {
      heading: 'I tuoi diritti',
      blocks: [
        `Puoi accedere ai tuoi dati, riceverli in un formato leggibile da un altro servizio (portabilità) e cancellarli dalla pagina Profilo del tuo account. Per correggerli, limitarne il trattamento o opporti scrivi a ${contactEmail}: rispondiamo entro un mese.`,
        'Se ritieni che i tuoi dati siano trattati male puoi presentare reclamo al Garante per la protezione dei dati personali (garanteprivacy.it).',
      ],
    },
    {
      heading: 'Età',
      blocks: ['Ludex non è pensato per chi ha meno di 16 anni.'],
    },
    {
      heading: 'Modifiche',
      blocks: [
        'Se cambia qualcosa di ciò che raccogliamo aggiorniamo questa pagina e la data in alto.',
      ],
    },
  ],
};

const privacyEn: LegalDoc = {
  title: 'Privacy notice',
  updated: 'Last updated: 6 October 2026',
  sections: [
    {
      heading: 'Who we are',
      blocks: [
        `The data controller is ${controller}, an individual, who runs Ludex on a non-profit basis. For anything, write to ${contactEmail}.`,
      ],
    },
    {
      heading: 'What data we collect',
      blocks: [
        [
          'Account: name, email address and password. The password is not stored in clear, only as a hash. Where needed, also the role (administrator) and any suspension of the account, with its reason and expiry.',
          'Session: when you sign in we record the IP address and the browser (user agent) of the session, for as long as the session lasts.',
          'Library: the games in your backlog with status, rating, notes and tags, the copies you own (platform, store, medium), hours played and your preferences.',
          'Store accounts: if you link one, the identifier and name of your account on that store and, where needed, the credentials (tokens) to read your library. Tokens are stored encrypted. For Steam we store none: a public profile is enough.',
          'Reports: if you report a mistake on a game, what you reported, the game you suggest and the note you write. Whoever runs Ludex reads them, to fix the game for everyone.',
        ],
        'We do not collect payment data or location, and we use no analytics or advertising tools.',
      ],
    },
    {
      heading: 'Why we use it, and on what basis',
      blocks: [
        [
          'To provide the service: the account, the library and the updates from the stores you link. The basis is the contract with you (art. 6.1.b GDPR).',
          'For security: sessions and the IP address keep sign-in safe, and suspending an account stops an abuse. The basis is our legitimate interest (art. 6.1.f GDPR).',
        ],
        'We do not sell your data and we do not use it for advertising.',
      ],
    },
    {
      heading: 'Cookies and browser storage',
      blocks: [
        [
          'better-auth.session_token: keeps your session open. Necessary, expires with the session.',
          'NEXT_LOCALE: remembers the language you chose. Lasts one year.',
          'theme (browser local storage): remembers the light or dark theme.',
        ],
        'They are all necessary for the service to work or choices you made, so no consent banner is needed. We use no profiling or third-party cookies.',
      ],
    },
    {
      heading: 'Who receives the data',
      blocks: [
        [
          'The hosting provider Ludex runs on, which stores the data on our behalf.',
          'The stores you link: they receive the requests we use to read your library (for example Steam receives your SteamID). Some are based outside the European Union.',
          'The services we take game data from (IGDB, HowLongToBeat, OpenCritic, Metacritic, Wikidata) only receive game titles and identifiers, never personal data.',
        ],
        'We do not pass the data to anyone else.',
      ],
    },
    {
      heading: 'How long we keep it',
      blocks: [
        [
          'Account and library: as long as you have the account.',
          'Sessions: until they expire.',
          "A store's credentials: deleted when you unlink that account.",
          'Reports: as long as you have the account, even after they are resolved.',
        ],
        'If you close the account we delete your data: library, copies, tags, store accounts, reports. Game data (titles, covers, durations) is shared among all users and is not personal, so it stays.',
        'From the Profile page of your account you can download your data as a JSON file and delete the account. Deleting asks for your password, takes effect immediately and cannot be undone. The file contains neither store credentials nor your password.',
      ],
    },
    {
      heading: 'Your rights',
      blocks: [
        `You can access your data, receive it in a format another service can read (portability) and delete it from the Profile page of your account. To correct it, restrict its processing or object to it, write to ${contactEmail}: we reply within one month.`,
        'If you think your data is being handled badly you can lodge a complaint with your data protection authority; in Italy, the Garante per la protezione dei dati personali (garanteprivacy.it).',
      ],
    },
    {
      heading: 'Age',
      blocks: ['Ludex is not meant for anyone under 16.'],
    },
    {
      heading: 'Changes',
      blocks: [
        'If anything we collect changes we update this page and the date at the top.',
      ],
    },
  ],
};

const termsIt: LegalDoc = {
  title: "Condizioni d'uso",
  updated: 'Ultimo aggiornamento: 1 ottobre 2026',
  sections: [
    {
      heading: "Cos'è Ludex",
      blocks: [
        `Ludex è un gestore della libreria di giochi, gratuito e senza scopo di lucro. È software libero, sotto licenza AGPL-3.0: il sorgente è su ${repoUrl} e la licenza su ${licenseUrl}.`,
      ],
    },
    {
      heading: 'Il tuo account',
      blocks: [
        [
          'Devi avere almeno 16 anni.',
          'I dati che dai alla registrazione devono essere veri.',
          'Custodisci la tua password: rispondi di ciò che si fa con il tuo account.',
        ],
      ],
    },
    {
      heading: 'Uso corretto',
      blocks: [
        [
          'Non cercare di accedere ad account altrui.',
          'Non sovraccaricare il servizio e non estrarne i dati in massa.',
          'Non scrivere nelle note contenuti illeciti.',
        ],
      ],
    },
    {
      heading: 'I negozi che colleghi',
      blocks: [
        'Colleghi un negozio per far leggere a Ludex la tua libreria: ci autorizzi a farlo per tuo conto, e il negozio resta tuo.',
        'Non siamo affiliati a nessun negozio. Alcuni non offrono un accesso ufficiale ai servizi di terzi: collegarli può non essere in linea con le loro condizioni, ed è una scelta e un rischio tuoi. Ludex non risponde di sospensioni o limitazioni che un negozio decida sul tuo account, né del collegamento che smette di funzionare quando un negozio cambia le sue regole.',
      ],
    },
    {
      heading: 'I dati dei giochi',
      blocks: [
        'Titoli, copertine, durate e voti arrivano da servizi di terzi (vedi la pagina Crediti): possono essere incompleti o sbagliati. I marchi appartengono ai loro proprietari.',
      ],
    },
    {
      heading: 'I tuoi contenuti',
      blocks: [
        'Voti, note e tag restano tuoi. Ci dai solo il permesso di conservarli e di mostrarteli.',
      ],
    },
    {
      heading: 'Nessuna garanzia',
      blocks: [
        "Il servizio è gratuito e viene fornito così com'è: può cambiare, avere interruzioni o chiudere. Tieni una copia di ciò che per te conta. Nei limiti consentiti dalla legge non rispondiamo di danni indiretti. Questo non toglie i diritti che la legge ti riconosce e che non si possono escludere.",
      ],
    },
    {
      heading: 'Chiudere o sospendere un account',
      blocks: [
        `Puoi chiudere il tuo account in qualunque momento scrivendo a ${contactEmail}. Possiamo sospendere un account in caso di abuso.`,
      ],
    },
    {
      heading: 'Modifiche e legge applicabile',
      blocks: [
        'Se cambiamo queste condizioni aggiorniamo questa pagina e la data in alto. Si applica la legge italiana, ferme restando le tutele inderogabili del consumatore nel suo paese di residenza.',
      ],
    },
  ],
};

const termsEn: LegalDoc = {
  title: 'Terms of use',
  updated: 'Last updated: 1 October 2026',
  sections: [
    {
      heading: 'What Ludex is',
      blocks: [
        `Ludex is a game library manager, free and non-profit. It is free software under the AGPL-3.0 licence: the source is at ${repoUrl} and the licence at ${licenseUrl}.`,
      ],
    },
    {
      heading: 'Your account',
      blocks: [
        [
          'You must be at least 16.',
          'The details you give when you sign up must be true.',
          'Keep your password safe: you answer for what is done with your account.',
        ],
      ],
    },
    {
      heading: 'Fair use',
      blocks: [
        [
          "Do not try to access other people's accounts.",
          'Do not overload the service or extract its data in bulk.',
          'Do not write unlawful content in your notes.',
        ],
      ],
    },
    {
      heading: 'The stores you link',
      blocks: [
        'You link a store so Ludex can read your library: you authorise us to do that on your behalf, and the store stays yours.',
        'We are not affiliated with any store. Some do not offer official access to third-party services: linking them may not be in line with their terms, and that is your choice and your risk. Ludex is not responsible for suspensions or limits a store puts on your account, or for a link that stops working when a store changes its rules.',
      ],
    },
    {
      heading: 'Game data',
      blocks: [
        'Titles, covers, durations and scores come from third-party services (see the Credits page): they may be incomplete or wrong. Trademarks belong to their owners.',
      ],
    },
    {
      heading: 'Your content',
      blocks: [
        'Ratings, notes and tags stay yours. You only give us permission to store them and show them back to you.',
      ],
    },
    {
      heading: 'No warranty',
      blocks: [
        'The service is free and provided as it is: it may change, be interrupted or close. Keep a copy of what matters to you. To the extent the law allows, we are not liable for indirect damages. This does not take away rights the law gives you that cannot be excluded.',
      ],
    },
    {
      heading: 'Closing or suspending an account',
      blocks: [
        `You can close your account at any time by writing to ${contactEmail}. We may suspend an account in case of abuse.`,
      ],
    },
    {
      heading: 'Changes and governing law',
      blocks: [
        'If we change these terms we update this page and the date at the top. Italian law applies, without prejudice to the mandatory consumer protections of your country of residence.',
      ],
    },
  ],
};

export const privacy: Record<Locale, LegalDoc> = {
  it: privacyIt,
  en: privacyEn,
};

export const terms: Record<Locale, LegalDoc> = {
  it: termsIt,
  en: termsEn,
};
