import { describe, expect, it } from 'vitest';

import { eventForUser } from './events';

const account = '00000000-0000-4000-8000-000000000001';

describe('eventForUser', () => {
  it("consegna l'evento d'import al proprietario, senza il destinatario", () => {
    expect(
      eventForUser(
        {
          type: 'import',
          phase: 'finished',
          storeAccountId: account,
          userId: 'io',
        },
        'io',
      ),
    ).toEqual({ type: 'import', phase: 'finished', storeAccountId: account });
  });

  it("non consegna l'import di un altro utente", () => {
    // È il solo filtro che c'è: senza, chiunque sia connesso saprebbe quando
    // un altro importa, e da quale account.
    expect(
      eventForUser(
        {
          type: 'import',
          phase: 'started',
          storeAccountId: account,
          userId: 'altro',
        },
        'io',
      ),
    ).toBeNull();
  });

  it('consegna i giochi a tutti: il catalogo è condiviso', () => {
    const event = { type: 'games' as const, gameIds: [account] };
    expect(eventForUser(event, 'chiunque')).toEqual(event);
  });
});
