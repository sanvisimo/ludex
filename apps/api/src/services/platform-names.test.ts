import { describe, expect, it } from 'vitest';

import { igdbPlatformNamer } from './platform-names';

// Test puri: niente database. Le righe sono quelle della tabella `platforms`.

describe('igdbPlatformNamer', () => {
  const nome = igdbPlatformNamer([
    { igdbId: 48, name: 'Sony PlayStation 4' },
    { igdbId: null, name: 'Senza id IGDB' },
  ]);

  it('usa il nome della nostra tabella', () => {
    expect(nome(48)).toBe('Sony PlayStation 4');
  });

  it('conosce i telefoni e il browser, che la tabella non ha', () => {
    expect(nome(39)).toBe('iOS');
    expect(nome(34)).toBe('Android');
  });

  it("un id che non conosce lo mostra com'è", () => {
    expect(nome(999)).toBe('IGDB 999');
  });
});
