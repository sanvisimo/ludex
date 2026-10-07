import { call } from '@orpc/server';
import { auth } from '@repo/auth';
import { PlaylistQuerySchema } from '@repo/contracts';
import type { PlaylistQueryInput } from '@repo/contracts';
import { db, schema } from '@repo/db';
import { eq } from '@repo/db/orm';
import { beforeEach, describe, expect, it } from 'vitest';

import { createGame, createUser, linkStoreAccount } from '../../test/factories';
import { router } from '../rpc/router';
import { exportAccount } from './account-export';
import {
  addToBacklog,
  setBacklogHidden,
  setBacklogStatus,
  updateBacklogEntry,
} from './backlog';
import {
  createPlaylist,
  deletePlaylist,
  sharePlaylist,
  unsharePlaylist,
} from './playlists';
import { openSharedPlaylist } from './shared-playlists';

// La condivisione (step 15d) si prova su ciò che, sbagliando, regala ai
// passanti qualcosa di tuo: una nota, un voto, un tag, il nome di un account, i
// giochi che hai nascosto. E sul link, che è l'unica protezione.

/** Tutte le chiavi di un oggetto, a qualunque profondità: un campo si cerca per nome, non per testo. */
function keysOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keysOf);
  if (value && typeof value === 'object' && !(value instanceof Date))
    return Object.entries(value).flatMap(([key, inner]) => [
      key,
      ...keysOf(inner),
    ]);
  return [];
}

const query = (input: PlaylistQueryInput = {}) =>
  PlaylistQuerySchema.parse(input);

const open = (token: string, viewerId: string | null = null) =>
  openSharedPlaylist({ token, limit: 30, offset: 0 }, viewerId);

async function aggiungi(
  userId: string,
  game: Parameters<typeof createGame>[0],
  status: 'backlog' | 'playing' | 'excluded' = 'backlog',
) {
  const { id } = await createGame(game);
  const entryId = await addToBacklog({
    userId,
    gameId: id,
    status,
    ownerships: [{ platformSlug: 'pc_windows', store: 'steam' }],
  });
  return { entryId, gameId: id };
}

/** Crea una playlist e la condivide: rende il link. */
async function condivisa(userId: string, input: PlaylistQueryInput = {}) {
  const playlist = await createPlaylist(userId, {
    name: 'Per gli amici',
    query: query(input),
  });
  const token = await sharePlaylist(userId, playlist!.id);
  return { playlist: playlist!, token: token! };
}

describe('il link', () => {
  let userId: string;
  let altro: string;

  beforeEach(async () => {
    userId = await createUser();
    altro = await createUser();
  });

  it('condividere dà un link, e chiederlo di nuovo dà lo stesso', async () => {
    const playlist = await createPlaylist(userId, {
      name: 'P',
      query: query(),
    });
    const primo = await sharePlaylist(userId, playlist!.id);
    const secondo = await sharePlaylist(userId, playlist!.id);

    expect(primo).toMatch(/^[A-Za-z0-9_-]{22}$/);
    expect(secondo).toBe(primo);
  });

  it('due richieste insieme non si sovrascrivono: rendono lo stesso link', async () => {
    const playlist = await createPlaylist(userId, {
      name: 'P',
      query: query(),
    });
    const tokens = await Promise.all(
      Array.from({ length: 6 }, () => sharePlaylist(userId, playlist!.id)),
    );
    expect(new Set(tokens).size).toBe(1);
  });

  it('revocare lo spegne subito, e ricondividere ne dà uno nuovo', async () => {
    const { playlist, token } = await condivisa(userId);
    expect(await open(token)).toBeDefined();

    expect(await unsharePlaylist(userId, playlist.id)).toBe(true);
    expect(await open(token)).toBeUndefined();

    const nuovo = await sharePlaylist(userId, playlist.id);
    expect(nuovo).not.toBe(token);
    expect(await open(token)).toBeUndefined();
    expect(await open(nuovo!)).toBeDefined();
  });

  it('non si condivide né si revoca la playlist di un altro', async () => {
    const { playlist, token } = await condivisa(userId);

    expect(await sharePlaylist(altro, playlist.id)).toBeUndefined();
    expect(await unsharePlaylist(altro, playlist.id)).toBe(false);
    expect(await open(token)).toBeDefined();
  });

  it('cancellare la playlist porta via il link', async () => {
    const { playlist, token } = await condivisa(userId);
    await deletePlaylist(userId, playlist.id);
    expect(await open(token)).toBeUndefined();
  });

  it('un link sconosciuto e uno revocato rispondono uguale', async () => {
    const { playlist, token } = await condivisa(userId);
    await unsharePlaylist(userId, playlist.id);

    const rifiuti = await Promise.all(
      [token, 'x'.repeat(22)].map((t) =>
        call(
          router.sharedPlaylists.get,
          { token: t },
          { context: { headers: new Headers() } },
        ).then(
          () => ({ code: 'OK', message: '' }),
          (error: { code: string; message: string }) => error,
        ),
      ),
    );
    expect(rifiuti[0]).toMatchObject({ code: 'NOT_FOUND' });
    expect(rifiuti[1]).toMatchObject({ code: 'NOT_FOUND' });
    expect(rifiuti[0]!.message).toBe(rifiuti[1]!.message);
  });

  it('il tetto per pagina è 140: una più grande non passa', async () => {
    const userId = await createUser();
    const { token } = await condivisa(userId);
    const get = (limit: number) =>
      call(
        router.sharedPlaylists.get,
        { token, limit },
        { context: { headers: new Headers() } },
      );

    await expect(get(140)).resolves.toMatchObject({ total: 0 });
    await expect(get(141)).rejects.toThrow();
  });

  it('un valore che non può essere un link non arriva al database', async () => {
    await expect(
      call(
        router.sharedPlaylists.get,
        { token: 'corto' },
        { context: { headers: new Headers() } },
      ),
    ).rejects.toThrow();
  });
});

describe('cosa esce', () => {
  let userId: string;

  beforeEach(async () => {
    userId = await createUser();
  });

  it('i giochi come li mostra il catalogo, e niente di tuo', async () => {
    const { entryId, gameId } = await aggiungi(userId, {
      name: 'Hollow Knight',
      hltbMainMinutes: 600,
    });
    await updateBacklogEntry(userId, {
      id: entryId,
      rating: 4.5,
      notes: 'NOTA-SEGRETA',
      tags: [{ kind: 'tag', name: 'tag-privato' }],
    });
    const account = await linkStoreAccount(userId, 'steam');
    await db
      .update(schema.storeAccounts)
      .set({ label: 'ACCOUNT-PRIVATO' })
      .where(eq(schema.storeAccounts.id, account.id));
    await db
      .update(schema.ownerships)
      .set({ storeAccountId: account.id, playtimeMinutes: 4321 });
    const [tag] = await db.select().from(schema.userTags);
    const { token } = await condivisa(userId, { tags: [tag!.id] });

    const aperta = await open(token);
    const file = JSON.stringify(aperta);

    expect(aperta!.games.map((g) => g.name)).toEqual(['Hollow Knight']);
    expect(aperta!.games[0]).toMatchObject({
      id: gameId,
      hltbMainMinutes: 600,
      status: null,
    });
    // Né i valori…
    for (const segreto of [
      'NOTA-SEGRETA',
      'tag-privato',
      'ACCOUNT-PRIVATO',
      '4321',
      userId,
      account.id,
      'esempio.test',
      'Utente',
    ])
      expect(file).not.toContain(segreto);
    // …né i campi in cui stanno: si cercano fra le chiavi, perché `addedAt` può
    // comparire come *valore* (l'ordinamento della playlist) senza essere un dato.
    const chiavi = new Set(keysOf(JSON.parse(file)));
    for (const campo of [
      'rating',
      'notes',
      'ownerships',
      'playtimeMinutes',
      'storeAccount',
      'storeAccountId',
      'addedAt',
      'hiddenAt',
      'userId',
    ])
      expect(chiavi.has(campo)).toBe(false);
  });

  it('il nome è quello della playlist, e il proprietario non c’è', async () => {
    const { token } = await condivisa(userId);
    const aperta = await open(token);
    expect(aperta!.name).toBe('Per gli amici');
    expect(Object.keys(aperta!).sort()).toEqual([
      'droppedTags',
      'games',
      'name',
      'query',
      'total',
    ]);
  });

  it('i giochi nascosti non escono', async () => {
    await aggiungi(userId, { name: 'Visibile' });
    const { entryId } = await aggiungi(userId, { name: 'Nascosto' });
    await setBacklogHidden(userId, entryId, true);
    const { token } = await condivisa(userId);

    const aperta = await open(token);
    expect(aperta!.games.map((g) => g.name)).toEqual(['Visibile']);
    expect(aperta!.total).toBe(1);
  });

  it('i «non mi interessa» non escono, qualunque cosa dica il filtro', async () => {
    await aggiungi(userId, { name: 'Da giocare' });
    await aggiungi(userId, { name: 'Scartato' }, 'excluded');

    // Senza filtro sullo stato: tutti e sei, e `excluded` resta fuori.
    const senza = await condivisa(userId);
    expect((await open(senza.token))!.games.map((g) => g.name)).toEqual([
      'Da giocare',
    ]);

    // Con un filtro che li nomina espressamente.
    const esplicito = await createPlaylist(userId, {
      name: 'Anche scartati',
      query: query({ status: ['backlog', 'excluded'] }),
    });
    const token = (await sharePlaylist(userId, esplicito!.id))!;
    expect((await open(token))!.games.map((g) => g.name)).toEqual([
      'Da giocare',
    ]);
  });

  it('un filtro che chiede solo i «non mi interessa» non mostra tutto il resto', async () => {
    await aggiungi(userId, { name: 'Da giocare' });
    await aggiungi(userId, { name: 'Scartato' }, 'excluded');
    const { token } = await condivisa(userId, { status: ['excluded'] });

    const aperta = await open(token);
    expect(aperta!.games).toEqual([]);
    expect(aperta!.total).toBe(0);
  });

  it('è la playlist di oggi: un gioco nuovo compare, uno cambiato esce', async () => {
    const { entryId } = await aggiungi(userId, {
      name: 'Breve',
      hltbMainMinutes: 60,
    });
    const { token } = await condivisa(userId, { durationMax: 120 });
    expect((await open(token))!.total).toBe(1);

    await aggiungi(userId, { name: 'Altro breve', hltbMainMinutes: 30 });
    expect((await open(token))!.total).toBe(2);

    await setBacklogStatus(userId, entryId, 'excluded');
    expect((await open(token))!.games.map((g) => g.name)).toEqual([
      'Altro breve',
    ]);
  });

  it('la pagina la sceglie chi apre, entro i limiti, e il totale è intero', async () => {
    for (const name of ['A', 'B', 'C'])
      await aggiungi(userId, { name, hltbMainMinutes: 30 });
    const { token } = await condivisa(userId, {
      sort: 'name',
      direction: 'asc',
    });

    const pagina = await openSharedPlaylist(
      { token, limit: 2, offset: 2 },
      null,
    );
    expect(pagina!.games.map((g) => g.name)).toEqual(['C']);
    expect(pagina!.total).toBe(3);
  });
});

describe('i filtri, per chi li riusa', () => {
  it('i tag filtrano la lista ma non escono: si conta quanti erano', async () => {
    const userId = await createUser();
    const { entryId } = await aggiungi(userId, {
      name: 'Con tag',
      hltbMainMinutes: 30,
    });
    await aggiungi(userId, { name: 'Senza tag', hltbMainMinutes: 30 });
    await updateBacklogEntry(userId, {
      id: entryId,
      tags: [{ kind: 'tag', name: 'stanco' }],
    });
    const [tag] = await db.select().from(schema.userTags);
    const { token } = await condivisa(userId, {
      tags: [tag!.id],
      durationMax: 90,
    });

    const aperta = await open(token);
    expect(aperta!.games.map((g) => g.name)).toEqual(['Con tag']);
    expect(aperta!.droppedTags).toBe(1);
    expect(aperta!.query).toMatchObject({ durationMax: 90 });
    expect(aperta!.query).not.toHaveProperty('tags');
    expect(JSON.stringify(aperta)).not.toContain(tag!.id);
  });

  it('senza tag non c’è niente da dire', async () => {
    const userId = await createUser();
    const { token } = await condivisa(userId);
    expect((await open(token))!.droppedTags).toBe(0);
  });
});

describe('chi guarda', () => {
  const PASSWORD = 'password-di-prova';

  async function signUp(email: string) {
    const { headers, response } = await auth.api.signUpEmail({
      body: { email, password: PASSWORD, name: email.split('@')[0]! },
      returnHeaders: true,
    });
    const cookie = headers
      .getSetCookie()
      .map((value) => value.split(';')[0])
      .join('; ');
    return { userId: response.user.id, headers: new Headers({ cookie }) };
  }

  it('lo stato è il suo, non del proprietario', async () => {
    const owner = await createUser();
    const { gameId } = await aggiungi(owner, { name: 'Condiviso' }, 'playing');
    await aggiungi(owner, { name: 'Solo del proprietario' }, 'playing');
    const { token } = await condivisa(owner);

    const viewer = await signUp('visitatore@esempio.test');
    await addToBacklog({
      userId: viewer.userId,
      gameId,
      status: 'completed',
      ownerships: [{ platformSlug: 'pc_windows', store: 'gog' }],
    });

    const comeVisitatore = await call(
      router.sharedPlaylists.get,
      { token },
      { context: { headers: viewer.headers } },
    );
    const stati = Object.fromEntries(
      comeVisitatore.games.map((g) => [g.name, g.status]),
    );
    // Il gioco che ha anche lui porta il suo stato; l'altro, nessuno: quello
    // del proprietario («playing») non esce mai.
    expect(stati).toEqual({
      Condiviso: 'completed',
      'Solo del proprietario': null,
    });

    const anonimo = await call(
      router.sharedPlaylists.get,
      { token },
      { context: { headers: new Headers() } },
    );
    expect(anonimo.games.every((g) => g.status === null)).toBe(true);
  });

  it('il proprietario condivide dal router, e solo il suo', async () => {
    const owner = await signUp('proprietario@esempio.test');
    const intruso = await signUp('intruso@esempio.test');
    const playlist = await createPlaylist(owner.userId, {
      name: 'Mia',
      query: query(),
    });

    const { token } = await call(
      router.playlists.share,
      { id: playlist!.id },
      { context: { headers: owner.headers } },
    );
    expect(token).toMatch(/^[A-Za-z0-9_-]{22}$/);

    await expect(
      call(
        router.playlists.unshare,
        { id: playlist!.id },
        { context: { headers: intruso.headers } },
      ),
    ).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(await open(token)).toBeDefined();
  });
});

describe('l’esportazione', () => {
  it('dice se è condivisa, e il link non c’è', async () => {
    const userId = await createUser();
    const { token } = await condivisa(userId);
    await createPlaylist(userId, { name: 'Privata', query: query() });

    const file = await exportAccount(userId);
    expect(file.playlists.map((p) => [p.name, p.shared])).toEqual([
      ['Per gli amici', true],
      ['Privata', false],
    ]);
    expect(JSON.stringify(file)).not.toContain(token);
  });
});
