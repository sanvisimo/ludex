import type { PlaylistQuery } from '@repo/contracts';
import { describe, expect, it } from 'vitest';

import {
  countActiveCriteria,
  defaultStatus,
  fromPlaylistQuery,
  playlistSearch,
  toPlaylistQuery,
  toQueryInput,
  validateBacklogSearch,
  validatePagingSearch,
  validatePlaylistSearch,
} from './backlog-filter';

// Si testa il passaggio fra i tre modi di dire lo stesso filtro — l'URL di
// `/backlog`, ciò che una playlist salva, ciò che il server riceve — perché è
// lì che un filtro cambia in silenzio: uno stato che sparisce, una pagina che
// finisce in una playlist, un id che non torna.

const TAG_A = '11111111-1111-4111-8111-111111111111';
const TAG_B = '22222222-2222-4222-8222-222222222222';
const PLAYLIST = '33333333-3333-4333-8333-333333333333';

const ALL_STATUSES = [
  'backlog',
  'playing',
  'played',
  'completed',
  'dropped',
  'excluded',
];

/** Come lo schema dà una query vuota: solo i due default di `sort` e `direction`. */
const query = (input: Partial<PlaylistQuery> = {}): PlaylistQuery => ({
  sort: 'addedAt',
  direction: 'desc',
  ...input,
});

describe('da filtri a playlist', () => {
  it('conserva i criteri e l’ordinamento', () => {
    const saved = toPlaylistQuery(
      fromPlaylistQuery(
        query({
          durationMax: 120,
          tags: [TAG_A, TAG_B],
          neverPlayed: true,
          sort: 'duration',
          direction: 'asc',
        }),
      ),
    );

    expect(saved).toMatchObject({
      durationMax: 120,
      tags: [TAG_A, TAG_B],
      neverPlayed: true,
      sort: 'duration',
      direction: 'asc',
    });
  });

  it('non salva la pagina, la vista, quanti per pagina né i nascosti', () => {
    const state = {
      ...fromPlaylistQuery(query()),
      hidden: true,
      page: 4,
      size: 35,
      view: 'rows' as const,
      playlist: PLAYLIST,
    };

    const saved = toPlaylistQuery(state);

    for (const key of [
      'hidden',
      'limit',
      'offset',
      'page',
      'size',
      'view',
      'playlist',
    ])
      expect(saved).not.toHaveProperty(key);
  });

  it('tutti e sei gli stati sono nessun filtro sullo stato', () => {
    const state = fromPlaylistQuery(query());
    expect(state.status).toEqual(ALL_STATUSES);
    expect(toPlaylistQuery(state).status).toBeUndefined();
  });

  it('il default di /backlog, senza «non mi interessa», si salva per intero', () => {
    const saved = toPlaylistQuery({
      ...fromPlaylistQuery(query()),
      status: defaultStatus,
    });
    expect(saved.status).toEqual(defaultStatus);
    expect(saved.status).not.toContain('excluded');
  });
});

describe('da playlist a /backlog', () => {
  it('lo stato assente si scrive per intero, o «non mi interessa» sparirebbe', () => {
    expect(playlistSearch(query()).status).toEqual(ALL_STATUSES);
  });

  it('lo stato di default non finisce nell’URL', () => {
    expect(
      playlistSearch(query({ status: defaultStatus })).status,
    ).toBeUndefined();
  });

  it('porta con sé l’id della playlist, se c’è', () => {
    expect(playlistSearch(query(), PLAYLIST).playlist).toBe(PLAYLIST);
    expect(playlistSearch(query())).not.toHaveProperty('playlist');
  });

  it('l’id sopravvive alla lettura dell’URL, e uno non valido si scarta', () => {
    const url = playlistSearch(query({ durationMax: 90 }), PLAYLIST);
    expect(validateBacklogSearch(url as Record<string, unknown>).playlist).toBe(
      PLAYLIST,
    );
    expect(
      validateBacklogSearch({ playlist: 'non-un-uuid' }),
    ).not.toHaveProperty('playlist');
  });

  it('l’id non è un filtro e non va al server', () => {
    const state = { ...fromPlaylistQuery(query()), playlist: PLAYLIST };
    expect(countActiveCriteria(state)).toBe(
      countActiveCriteria(fromPlaylistQuery(query())),
    );
    expect(toQueryInput(state)).not.toHaveProperty('playlist');
  });
});

describe('quanti filtri sono accesi', () => {
  it('il default non è un filtro', () => {
    expect(
      countActiveCriteria({
        ...fromPlaylistQuery(query()),
        status: defaultStatus,
      }),
    ).toBe(0);
  });

  it('una scelta sugli stati conta uno, e ogni criterio conta uno', () => {
    const base = { ...fromPlaylistQuery(query()), status: defaultStatus };
    expect(countActiveCriteria({ ...base, status: ['playing'] })).toBe(1);
    expect(
      countActiveCriteria({
        ...base,
        durationMax: 60,
        tags: [TAG_A],
        neverPlayed: true,
      }),
    ).toBe(3);
  });
});

describe('verso il server', () => {
  it('limite e offset vengono dal numero davvero chiesto, non da quello dell’URL', () => {
    const state = { ...fromPlaylistQuery(query()), page: 3, size: 14 };
    expect(toQueryInput(state, 15)).toMatchObject({ limit: 15, offset: 30 });
    expect(toQueryInput(state)).toMatchObject({ limit: 14, offset: 28 });
  });
});

describe('l’URL di una playlist aperta', () => {
  it('toglie i default di vista, pagina e numero', () => {
    expect(
      validatePagingSearch({ view: 'grid', page: '1', size: '14' }),
    ).toEqual({});
  });

  it('tiene ciò che non è il default, e un numero qualunque entro il tetto', () => {
    expect(
      validatePagingSearch({ view: 'rows', page: '3', size: '15', q: 'x' }),
    ).toEqual({ view: 'rows', page: 3, size: 15 });
  });

  it('scarta ciò che non si legge', () => {
    expect(validatePagingSearch({ view: 'x', page: '0', size: '0' })).toEqual(
      {},
    );
    expect(validatePagingSearch({ size: '500' })).toEqual({});
  });

  it('ricerca e ordine di chi guarda restano anche se uguali al default di /backlog', () => {
    // `addedAt` e `desc` sono i default di /backlog, ma qui il default è quello
    // della playlist: scegliere `addedAt` su una salvata per durata è una scelta.
    expect(
      validatePlaylistSearch({
        q: ' hollow ',
        sort: 'addedAt',
        direction: 'desc',
      }),
    ).toEqual({ q: 'hollow', sort: 'addedAt', direction: 'desc' });
  });

  it('una ricerca vuota o un ordine che non esiste si scartano', () => {
    expect(validatePlaylistSearch({ q: '   ', sort: 'pippo' })).toEqual({});
  });
});
