import { describe, expect, it } from 'vitest';

import { idsOfCopy } from './copy-store-ids';

// Test puri: niente database. Pagine e id sono quelli veri del DB di sviluppo.

const ids = (...externalIds: string[]) =>
  externalIds.map((externalId) => ({ externalId }));

describe('idsOfCopy', () => {
  it("su Steam l'id è l'appid della pagina", () => {
    expect(idsOfCopy('app/71163', ids('71163'))).toEqual(ids('71163'));
  });

  it('su PSN sceglie, fra la PS4, la PS5 e il concept, quello della pagina', () => {
    expect(
      idsOfCopy(
        'product/EP5360-PPSA10248_00-VIEWFINDER0005EU',
        ids('10006160', 'CUSA36827_00', 'PPSA10248_00'),
      ),
    ).toEqual(ids('PPSA10248_00'));
  });

  it("su EA l'id col trattino sta intero nella pagina", () => {
    expect(
      idsOfCopy(
        'dragon-age/dragon-age-inquisition',
        ids('dragon-age-inquisition', 'dragon-age-origins'),
      ),
    ).toEqual(ids('dragon-age-inquisition'));
  });

  it('un id non si aggancia a un pezzo che lo contiene', () => {
    expect(idsOfCopy('app/40990', ids('4099', '409'))).toEqual(
      ids('4099', '409'),
    );
  });

  it("senza pagina vale l'unico id del negozio", () => {
    expect(idsOfCopy(null, ids('a1b2c3'))).toEqual(ids('a1b2c3'));
  });

  it('senza pagina e con più id sono tutti: non si sa quale', () => {
    expect(idsOfCopy('the_witcher_3', ids('1207664643', '1495134320'))).toEqual(
      ids('1207664643', '1495134320'),
    );
  });
});
