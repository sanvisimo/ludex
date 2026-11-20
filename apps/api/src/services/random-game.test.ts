import type { BacklogStatus, RandomFilter } from '@repo/contracts';
import { backlogStatusValues } from '@repo/contracts/vocabulary';
import { describe, expect, it } from 'vitest';

import { createGame, createUser } from '../../test/factories';
import { addToBacklog, setBacklogHidden, setBacklogStatus } from './backlog';
import {
  addToCuratedPlaylist,
  createCuratedPlaylist,
} from './curated-playlists';
import { createPlaylist } from './playlists';
import { pickRandomGame } from './random-game';
import { deleteUserTag, ensureUserTags } from './tags';

// Il dado (15c). Si testa il giro: dentro il filtro, senza ripetizioni, da
// capo in fondo, e col segnalibro che regge quando il gioco esce dal filtro.

/** Ciò che il client manda senza filtri: il default di `/backlog`. */
const tutto: RandomFilter = {
  status: backlogStatusValues.filter((status) => status !== 'excluded'),
};

async function add(
  userId: string,
  name: string,
  status: BacklogStatus = 'backlog',
  platformSlug = 'pc_windows',
) {
  const game = await createGame({ name, gameType: 'main_game' });
  const id = await addToBacklog({
    userId,
    gameId: game.id,
    status,
    ownerships: [{ platformSlug, store: 'steam' }],
  });
  return { id, gameId: game.id, slug: game.slug };
}

/** Il giro intero da un seme: il primo tiro, poi `after` fino a `n` passi. */
async function giro(
  viewerId: string | null,
  filter: RandomFilter,
  seed: string,
  n: number,
) {
  const visti: (string | null)[] = [];
  let after: string | undefined;
  for (let i = 0; i < n; i++) {
    const slug = await pickRandomGame({ viewerId, filter, seed, after });
    visti.push(slug);
    after = slug ?? undefined;
  }
  return visti;
}

describe('da loggati', () => {
  it('senza niente da pescare rende null, non un errore', async () => {
    const userId = await createUser();
    expect(
      await pickRandomGame({ viewerId: userId, filter: tutto, seed: 'a' }),
    ).toBeNull();
  });

  it('pesca dentro il filtro, mai nascosti né giochi degli altri', async () => {
    const userId = await createUser();
    const altro = await createUser();
    const buono = await add(userId, 'Da giocare su PC');
    await add(userId, 'Da giocare su Switch', 'backlog', 'nintendo_switch');
    await add(userId, 'In corso su PC', 'playing');
    const nascosto = await add(userId, 'Nascosto');
    await setBacklogHidden(userId, nascosto.id, true);
    await add(altro, 'Dell’altro');

    const filter: RandomFilter = {
      status: ['backlog'],
      platforms: ['pc_windows'],
    };
    for (const seed of ['a', 'b', 'c', 'd', 'e'])
      expect(await pickRandomGame({ viewerId: userId, filter, seed })).toBe(
        buono.slug,
      );
  });

  it('senza filtri pesca da tutto il backlog, ma non da «non mi interessa»', async () => {
    const userId = await createUser();
    const giochi = [
      await add(userId, 'Da giocare'),
      await add(userId, 'Finito', 'completed'),
    ];
    await add(userId, 'Non mi interessa', 'excluded');

    const visti = await giro(userId, tutto, 'seme', 2);
    expect(new Set(visti)).toEqual(new Set(giochi.map((g) => g.slug)));
  });

  it('passa per tutti prima di ripetere, e in fondo ricomincia', async () => {
    const userId = await createUser();
    const slugs = [];
    for (const nome of ['Uno', 'Due', 'Tre', 'Quattro', 'Cinque'])
      slugs.push((await add(userId, nome)).slug);

    const visti = await giro(userId, tutto, 'k3f9', 6);
    expect(new Set(visti.slice(0, 5))).toEqual(new Set(slugs));
    expect(visti[5]).toBe(visti[0]);
  });

  it('lo stesso seme dà lo stesso mazzo', async () => {
    const userId = await createUser();
    for (const nome of ['Uno', 'Due', 'Tre', 'Quattro'])
      await add(userId, nome);

    expect(await giro(userId, tutto, 'x1', 4)).toEqual(
      await giro(userId, tutto, 'x1', 4),
    );
  });

  it('il gioco uscito dal filtro fa ancora da segnalibro', async () => {
    const userId = await createUser();
    const giochi = new Map<string, string>();
    for (const nome of ['Uno', 'Due', 'Tre', 'Quattro']) {
      const { id, slug } = await add(userId, nome);
      giochi.set(slug, id);
    }
    const filter: RandomFilter = { status: ['backlog'] };
    const [, secondo, terzo] = await giro(userId, filter, 's', 3);

    // Pescato fra i «da giocare» e segnato «in corso»: non è più nel filtro.
    await setBacklogStatus(userId, giochi.get(secondo!)!, 'playing');

    expect(
      await pickRandomGame({
        viewerId: userId,
        filter,
        seed: 's',
        after: secondo!,
      }),
    ).toBe(terzo);
  });

  it('con un solo gioco, dal gioco stesso non c’è un altro', async () => {
    const userId = await createUser();
    const solo = await add(userId, 'Solo');

    expect(
      await pickRandomGame({ viewerId: userId, filter: tutto, seed: 'a' }),
    ).toBe(solo.slug);
    expect(
      await pickRandomGame({
        viewerId: userId,
        filter: tutto,
        seed: 'a',
        after: solo.slug,
      }),
    ).toBeNull();
  });

  it('uno slug che non esiste riparte dal primo', async () => {
    const userId = await createUser();
    for (const nome of ['Uno', 'Due', 'Tre']) await add(userId, nome);

    const primo = await pickRandomGame({
      viewerId: userId,
      filter: tutto,
      seed: 'z',
    });
    expect(
      await pickRandomGame({
        viewerId: userId,
        filter: tutto,
        seed: 'z',
        after: 'non-esiste',
      }),
    ).toBe(primo);
  });
});

describe('da una playlist', () => {
  /** Il giro intero dentro una playlist, col filtro di `/backlog` che non conta. */
  async function giroPlaylist(
    viewerId: string,
    playlistId: string,
    seed: string,
    n: number,
  ) {
    const visti: (string | null)[] = [];
    let after: string | undefined;
    for (let i = 0; i < n; i++) {
      const slug = await pickRandomGame({
        viewerId,
        filter: { status: ['dropped'] },
        playlistId,
        seed,
        after,
      });
      visti.push(slug);
      after = slug ?? undefined;
    }
    return visti;
  }

  it('a filtro: pesca dal filtro salvato, tutti prima di ripetere', async () => {
    const userId = await createUser();
    const dentro = [
      await add(userId, 'In corso uno', 'playing'),
      await add(userId, 'In corso due', 'playing'),
      await add(userId, 'In corso tre', 'playing'),
    ];
    await add(userId, 'Da giocare');
    await add(userId, 'In corso su Switch', 'playing', 'nintendo_switch');
    const playlist = await createPlaylist(userId, {
      name: 'Stasera',
      query: {
        status: ['playing'],
        platforms: ['pc_windows'],
        sort: 'addedAt',
        direction: 'desc',
      },
    });

    const visti = await giroPlaylist(userId, playlist!.id, 'p1', 4);
    expect(new Set(visti.slice(0, 3))).toEqual(
      new Set(dentro.map((g) => g.slug)),
    );
    expect(visti[3]).toBe(visti[0]);
  });

  it('a filtro: un tag cancellato si ignora, come nella pagina', async () => {
    const userId = await createUser();
    const gioco = await add(userId, 'Qualunque');
    const [tag] = await ensureUserTags(userId, [
      { kind: 'tag', name: 'da rigiocare' },
    ]);
    const playlist = await createPlaylist(userId, {
      name: 'Col tag',
      query: { tags: [tag!.id], sort: 'addedAt', direction: 'desc' },
    });
    await deleteUserTag(userId, tag!.id);

    expect(await giroPlaylist(userId, playlist!.id, 'a', 1)).toEqual([
      gioco.slug,
    ]);
  });

  it('scelta a mano: pesca dai suoi giochi, anche fuori dal backlog', async () => {
    const userId = await createUser();
    const nelBacklog = await add(userId, 'Nel backlog');
    await add(userId, 'Fuori dalla playlist');
    const nonMio = await createGame({ name: 'Non mio', gameType: 'main_game' });
    const playlist = await createCuratedPlaylist(userId, 'Scelti');
    for (const gameId of [nonMio.id, nelBacklog.gameId])
      await addToCuratedPlaylist(userId, { listId: playlist!.id, gameId });

    const visti = await giroPlaylist(userId, playlist!.id, 'c', 3);
    expect(new Set(visti.slice(0, 2))).toEqual(
      new Set([nonMio.slug, nelBacklog.slug]),
    );
    expect(visti[2]).toBe(visti[0]);
  });

  it('una playlist di un altro non ha niente da pescare', async () => {
    const userId = await createUser();
    const altro = await createUser();
    await add(userId, 'Mio');
    const sua = await createCuratedPlaylist(altro, 'Sua');
    const game = await createGame({ name: 'Suo', gameType: 'main_game' });
    await addToCuratedPlaylist(altro, { listId: sua!.id, gameId: game.id });

    expect(await giroPlaylist(userId, sua!.id, 'a', 1)).toEqual([null]);
  });
});

describe('da anonimi', () => {
  it('pesca dal catalogo, solo i tipi giocabili, e ignora il filtro', async () => {
    const userId = await createUser();
    const giocabili = [
      (await createGame({ name: 'Gioco', gameType: 'main_game' })).slug,
      (await createGame({ name: 'Remake', gameType: 'remake' })).slug,
      // Di qualcuno, ma per un anonimo è catalogo come gli altri.
      (await add(userId, 'Nel backlog di qualcuno')).slug,
    ];
    await createGame({ name: 'DLC', gameType: 'dlc' });
    await createGame({ name: 'Bundle', gameType: 'bundle' });
    await createGame({ name: 'Non ancora arricchito' });

    const visti = await giro(null, { status: ['excluded'] }, 'anon', 3);
    expect(new Set(visti)).toEqual(new Set(giocabili));
    expect(await giro(null, {}, 'anon', 4)).toContain(visti[0]);
  });
});
