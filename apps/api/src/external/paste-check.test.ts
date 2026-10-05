import { checkPastedLogin, type GuidedStore } from '@repo/contracts';
import { describe, expect, it } from 'vitest';

import { parseAmazonAuthCode } from './amazon';
import { parseEpicAuthCode } from './epic';
import { parseGogAuthCode } from './gog';
import { parseNintendoAuthCode } from './nintendo';
import { parseNpsso } from './psn';

// `checkPastedLogin` sta in `packages/contracts` perché lo userà anche il mobile,
// e il contratto non ha un banco di prova suo: lo si prova qui, dove ci sono i
// parser veri a cui deve somigliare. La regola che conta: **non essere più
// severo del server**. Un indirizzo che il server accetta e che la schermata
// chiama «sbagliato» manderebbe l'utente a riprovare per niente.

const accepted = (store: GuidedStore, input: string): boolean => {
  switch (store) {
    case 'gog':
      return Boolean(parseGogAuthCode(input));
    case 'epic':
      return Boolean(parseEpicAuthCode(input));
    case 'amazon':
      return Boolean(parseAmazonAuthCode(input));
    case 'psn':
      return Boolean(parseNpsso(input));
    case 'nintendo':
      return parseNintendoAuthCode(input) !== null;
  }
};

const NPSSO =
  'HcJ2kQ8vT1nR5wLpY7bXeM0aZsD4gFhU3iOoK9lNqVrCtWyPjB6xEfAdSgZmIuTn';

const SAMPLES: Record<GuidedStore, { good: string[]; bad: string[] }> = {
  gog: {
    good: [
      'https://embed.gog.com/on_login_success?origin=client&code=abcDEF123_-xyz',
      '  https://embed.gog.com/on_login_success?code=abcDEF123_-xyz  ',
      'abcdefghijklmnopqrstuvwxyz0123',
    ],
    bad: [
      'https://embed.gog.com/on_login_success?origin=client',
      'troppo corto',
      'https://www.gog.com/',
    ],
  },
  epic: {
    good: [
      '{"redirectUrl":"https://x","authorizationCode":"a1b2c3d4e5f60718293a4b5c6d7e8f90"}',
      'a1b2c3d4e5f60718293a4b5c6d7e8f90',
      '"a1b2c3d4e5f60718293a4b5c6d7e8f90"',
    ],
    bad: [
      '{"redirectUrl":"https://x"}',
      '{ rotto',
      'a1b2c3',
      '{"authorizationCode":""}',
    ],
  },
  amazon: {
    good: [
      'https://www.amazon.com/?openid.oa2.authorization_code=ANxVHkajCQQIUUzpykoQEfSt&x=1',
      'ANxVHkajCQQIUUzpykoQEfSt',
    ],
    bad: ['https://www.amazon.com/?ref=x', 'corto', 'https://www.amazon.com/'],
  },
  psn: {
    good: [`{"npsso":"${NPSSO}"}`, NPSSO, `"${NPSSO}"`],
    bad: [
      '{"npsso":null}',
      '{"npsso":""}',
      '{"error":"unauthorized"}',
      'corto',
    ],
  },
  nintendo: {
    good: [
      'npf5c38e31cd085304b://auth#session_token_code=eyJ.abc.def&state=lo-state&session_state=ff',
      'npf5c38e31cd085304b://auth#state=lo-state&session_token_code=eyJ.abc.def',
    ],
    bad: [
      // Quello che si incolla cliccando il pulsante o copiando la barra degli
      // indirizzi della pagina invece di quella del link.
      'https://accounts.nintendo.com/connect/1.0.0/authorize?client_id=5c38e31cd085304b',
      'npf5c38e31cd085304b://auth#session_token_code=eyJ.abc.def',
      'npf5c38e31cd085304b://auth#state=lo-state',
    ],
  },
};

describe('checkPastedLogin', () => {
  for (const [store, { good, bad }] of Object.entries(SAMPLES) as Array<
    [GuidedStore, (typeof SAMPLES)[GuidedStore]]
  >) {
    describe(store, () => {
      it('dice «ok» a ciò che il server accetta', () => {
        for (const input of good) {
          expect(accepted(store, input), `server: ${input}`).toBe(true);
          expect(checkPastedLogin(store, input), `UI: ${input}`).toBe('ok');
        }
      });

      it('dice «wrong» a ciò che il server rifiuterebbe', () => {
        for (const input of bad) {
          expect(accepted(store, input), `server: ${input}`).toBe(false);
          expect(checkPastedLogin(store, input), `UI: ${input}`).toBe('wrong');
        }
      });

      it('non ha un parere su un campo vuoto', () => {
        expect(checkPastedLogin(store, '')).toBe(null);
        expect(checkPastedLogin(store, '   \n ')).toBe(null);
      });
    });
  }
});
