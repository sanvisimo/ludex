import { describe, expect, it } from 'vitest';

import {
  epicCoverUrl,
  epicLoginUrl,
  parseEpicAuthCode,
  pickEpicGames,
} from './epic';

// Puro: nessuna rete, nessun database. Epic è il negozio dove il gesto è più
// facile da sbagliare, perché quello che l'utente si trova davanti non è un
// indirizzo ma una **pagina JSON**.

describe('parseEpicAuthCode', () => {
  const codice = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

  it('accetta il JSON intero, che è quello che si vede a schermo', () => {
    expect(
      parseEpicAuthCode(
        `{"redirectUrl":"https://localhost/launcher?code=${codice}","authorizationCode":"${codice}","sid":null}`,
      ),
    ).toBe(codice);
  });

  it('accetta il solo codice, anche fra virgolette', () => {
    expect(parseEpicAuthCode(codice)).toBe(codice);
    expect(parseEpicAuthCode(`"${codice}"`)).toBe(codice);
    expect(parseEpicAuthCode(`  ${codice}  `)).toBe(codice);
  });

  it('rende null su un JSON senza il campo giusto', () => {
    // Succede se l'utente copia la pagina sbagliata: va distinto da un codice
    // illeggibile, perché il rimedio non è lo stesso.
    expect(parseEpicAuthCode('{"redirectUrl":"https://x","sid":null}')).toBe(
      null,
    );
    expect(parseEpicAuthCode('{ rotto')).toBe(null);
  });

  it('rende null su tutto ciò che codice non è', () => {
    expect(parseEpicAuthCode('')).toBe(null);
    expect(parseEpicAuthCode('   ')).toBe(null);
    // Un codice GOG: lungo, ma non 32 esadecimali. Incollare quello di un altro
    // negozio nel campo sbagliato è un errore che si fa davvero.
    expect(
      parseEpicAuthCode('GxRJzadTmNNIAmbXUdn0Y-5gsBlF4llYEkWAO_sEywg'),
    ).toBe(null);
  });
});

describe('epicLoginUrl', () => {
  it('manda al login con il redirect che restituisce il codice', () => {
    const url = new URL(epicLoginUrl());

    expect(url.origin + url.pathname).toBe(
      'https://www.epicgames.com/id/login',
    );

    // Il redirect è una pagina di Epic, non nostra: come GOG e Amazon, la lista
    // dei redirect è legata al client_id del launcher. È composto da noi e non
    // preso da `legendary.gl/epiclogin`, che punta esattamente qui.
    const redirect = new URL(url.searchParams.get('redirectUrl')!);
    expect(redirect.origin + redirect.pathname).toBe(
      'https://www.epicgames.com/id/api/redirect',
    );
    expect(redirect.searchParams.get('responseType')).toBe('code');
    expect(redirect.searchParams.get('clientId')).toBeTruthy();
  });
});

describe('epicCoverUrl', () => {
  it('preferisce la copertina verticale', () => {
    expect(
      epicCoverUrl([
        { type: 'DieselGameBox', url: 'https://cdn1.epicgames.com/wide.jpg' },
        {
          type: 'DieselGameBoxTall',
          url: 'https://cdn1.epicgames.com/tall.jpg',
        },
      ]),
    ).toBe('https://cdn1.epicgames.com/tall.jpg');
  });

  it('ripiega sulla orizzontale', () => {
    expect(
      epicCoverUrl([
        {
          type: 'DieselGameBoxLogo',
          url: 'https://cdn1.epicgames.com/logo.png',
        },
        { type: 'DieselGameBox', url: 'https://cdn1.epicgames.com/wide.jpg' },
      ]),
    ).toBe('https://cdn1.epicgames.com/wide.jpg');
  });

  it('codifica gli spazi, che negli URL di Epic ci sono davvero', () => {
    expect(
      epicCoverUrl([
        {
          type: 'DieselGameBoxTall',
          url: 'https://cdn1.epicgames.com/item/TheEscapists_PDP Promo-2560.jpg',
        },
      ]),
    ).toBe('https://cdn1.epicgames.com/item/TheEscapists_PDP%20Promo-2560.jpg');
  });

  it('rende null senza nessuna delle due', () => {
    expect(epicCoverUrl(undefined)).toBeNull();
    expect(epicCoverUrl([])).toBeNull();
    expect(
      epicCoverUrl([{ type: 'DieselGameBoxLogo', url: 'https://x/logo.png' }]),
    ).toBeNull();
  });
});

describe('pickEpicGames', () => {
  // Fallout: New Vegas Ultimate Edition: un prodotto, il gioco e i DLC.
  const fnv = 'prodotto-fnv';
  const gioco = { productId: fnv, catalogItemId: 'fnv-gioco' };
  const deadMoney = { productId: fnv, catalogItemId: 'fnv-dead-money' };
  // Il catalogo rende solo ciò che è gioco: i DLC lì non ci sono.
  const titoli = new Map([
    [
      'fnv-gioco',
      {
        title: 'Fallout: New Vegas',
        imageUrl: 'https://x/fnv.jpg',
        presence: true,
      },
    ],
  ]);

  it('trova il gioco anche quando il DLC arriva per primo', () => {
    const acquisto = new Date('2024-12-19T16:00:00Z');

    expect(
      pickEpicGames(
        new Map([[fnv, [deadMoney, gioco]]]),
        titoli,
        new Map([[fnv, acquisto]]),
      ),
    ).toEqual([
      {
        externalId: fnv,
        name: 'Fallout: New Vegas',
        acquiredAt: acquisto,
        imageUrl: 'https://x/fnv.jpg',
        sameProductAs: null,
      },
    ]);
  });

  it('non importa un prodotto fatto di soli DLC', () => {
    expect(
      pickEpicGames(new Map([[fnv, [deadMoney]]]), titoli, new Map()),
    ).toEqual([]);
  });
});

// Prodotti veri con più voci che il catalogo chiama `games`, presi dalla
// libreria dell'utente il 14/10/2026. Ogni caso arriva con il DLC, la beta o il
// secondo gioco **per primo**, come sul mini PC.
describe('pickEpicGames: più voci gioco nello stesso prodotto', () => {
  type Voce = {
    id: string;
    title: string;
    acquired: string;
    presence?: boolean;
  };

  const scelto = (voci: Voce[]) => {
    const [risultato] = pickEpicGames(
      new Map([
        [
          'prodotto',
          voci.map((voce) => ({
            productId: 'prodotto',
            catalogItemId: voce.id,
            acquisitionDate: voce.acquired,
          })),
        ],
      ]),
      new Map(
        voci.map((voce) => [
          voce.id,
          {
            title: voce.title,
            imageUrl: null,
            presence: voce.presence ?? false,
          },
        ]),
      ),
      new Map(),
    );
    return risultato?.name;
  };

  it('prende la voce acquistata per prima: TROY, non AMAZONS', () => {
    expect(
      scelto([
        { id: 'amazons', title: 'AMAZONS', acquired: '2020-09-26T10:00:00Z' },
        {
          id: 'troy',
          title: 'A Total War Saga: TROY',
          acquired: '2020-08-13T10:00:00Z',
        },
      ]),
    ).toBe('A Total War Saga: TROY');
  });

  it('a pari data, il titolo che è l’inizio degli altri', () => {
    const data = '2024-04-04T10:00:00Z';
    expect(
      scelto([
        { id: 'pt', title: 'Chivalry 2 - Public Testing', acquired: data },
        { id: 'c2', title: 'Chivalry 2', acquired: data },
      ]),
    ).toBe('Chivalry 2');
    // Senza spazi né punteggiatura: «KillingFloor2Beta».
    expect(
      scelto([
        { id: 'beta', title: 'KillingFloor2Beta', acquired: data },
        { id: 'kf2', title: 'Killing Floor 2', acquired: data },
      ]),
    ).toBe('Killing Floor 2');
  });

  it('poi la voce che il launcher avvia: Tropico 5, non Map Pack', () => {
    // «Map Pack» è più corto: senza `PresenceId` vincerebbe lui.
    const data = '2020-12-23T10:00:00Z';
    expect(
      scelto([
        { id: 'map', title: 'Map Pack', acquired: data },
        { id: 't5', title: 'Tropico 5', acquired: data, presence: true },
      ]),
    ).toBe('Tropico 5');
  });

  it('a parità di tutto, la scelta non dipende dall’ordine', () => {
    const data = '2026-05-14T15:44:09Z';
    const s1 = {
      id: '6de90e98',
      title: 'Telltale Batman Season 1',
      acquired: data,
      presence: true,
    };
    const s2 = {
      id: 'a1402f3a',
      title: 'Telltale Batman Season 2',
      acquired: data,
      presence: true,
    };
    expect(scelto([s2, s1])).toBe('Telltale Batman Season 1');
    expect(scelto([s1, s2])).toBe('Telltale Batman Season 1');
  });

  it('un titolo di sola punteggiatura non è l’inizio di tutto', () => {
    // Ridotto a niente, sarebbe il prefisso di ogni altro titolo.
    const data = '2024-01-01T10:00:00Z';
    expect(
      scelto([
        { id: 'punti', title: '…', acquired: data },
        { id: 'gioco', title: 'Gioco', acquired: data, presence: true },
      ]),
    ).toBe('Gioco');
  });
});

describe('pickEpicGames: le altre voci del prodotto', () => {
  const tulip = 'prod-tulip';
  const thimbleweed = {
    productId: tulip,
    catalogItemId: '115a33f2',
    acquisitionDate: '2019-02-21T18:26:07.658Z',
  };
  const delores = {
    productId: tulip,
    catalogItemId: '6a398fcd',
    acquisitionDate: '2020-06-19T06:38:46.613Z',
  };
  const titoli = new Map([
    [
      '115a33f2',
      {
        title: 'Thimbleweed Park',
        imageUrl: 'https://x/tp.jpg',
        presence: true,
      },
    ],
    [
      '6a398fcd',
      {
        title: 'Delores: A Thimbleweed Park mini-adventure',
        imageUrl: 'https://x/delores.jpg',
        presence: true,
      },
    ],
  ]);

  it('escono come voci proprie, col catalogItemId e il prodotto accanto', () => {
    // Delores arriva per prima, come può capitare: resta la voce in più.
    expect(
      pickEpicGames(
        new Map([[tulip, [delores, thimbleweed]]]),
        titoli,
        new Map([[tulip, new Date(thimbleweed.acquisitionDate)]]),
      ),
    ).toEqual([
      {
        externalId: tulip,
        name: 'Thimbleweed Park',
        acquiredAt: new Date(thimbleweed.acquisitionDate),
        imageUrl: 'https://x/tp.jpg',
        sameProductAs: null,
      },
      {
        externalId: '6a398fcd',
        name: 'Delores: A Thimbleweed Park mini-adventure',
        acquiredAt: new Date(delores.acquisitionDate),
        imageUrl: 'https://x/delores.jpg',
        sameProductAs: tulip,
      },
    ]);
  });

  it('la stessa voce acquisita due volte è una voce sola, con la data più vecchia', () => {
    const ancora = { ...delores, acquisitionDate: '2025-01-31T10:00:00.000Z' };
    const voci = pickEpicGames(
      new Map([[tulip, [thimbleweed, ancora, delores]]]),
      titoli,
      new Map(),
    );

    expect(voci).toHaveLength(2);
    expect(voci[1]!.acquiredAt).toEqual(new Date(delores.acquisitionDate));
  });

  it('il gioco acquisito due volte non diventa una voce in più', () => {
    const ancora = {
      ...thimbleweed,
      acquisitionDate: '2025-01-31T10:00:00.000Z',
    };

    expect(
      pickEpicGames(
        new Map([[tulip, [ancora, thimbleweed]]]),
        titoli,
        new Map(),
      ),
    ).toHaveLength(1);
  });
});
