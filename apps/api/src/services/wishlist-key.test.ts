import { describe, expect, it } from 'vitest';

import { wishlistKey } from './wishlist-key';

describe('wishlistKey', () => {
  it('Steam e GOG: l’id com’è', () => {
    expect(wishlistKey('steam', '1145360')).toBe('1145360');
    expect(wishlistKey('gog', '1207658924')).toBe('1207658924');
  });

  it('PSN: il titleId, in maiuscolo, dal pezzo di mezzo dell’id di prodotto', () => {
    expect(wishlistKey('psn', 'EP3643-PPSA06465_00-3571249245584917')).toBe(
      'PPSA06465_00',
    );
    expect(wishlistKey('psn', 'EP0002-cusa13801_00-hades')).toBe(
      'CUSA13801_00',
    );
  });

  it('PSN: nulla se l’id non contiene un titleId', () => {
    expect(wishlistKey('psn', 'NIENTE')).toBeNull();
    expect(wishlistKey('psn', '')).toBeNull();
  });
});
