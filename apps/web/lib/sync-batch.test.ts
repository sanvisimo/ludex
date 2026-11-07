import { describe, expect, it } from 'vitest';

import { nextSyncBatch, syncBatchProgress } from './sync-batch';

describe('nextSyncBatch', () => {
  it('nessuno in importazione: il giro è finito', () => {
    expect(nextSyncBatch(['steam', 'gog'], [])).toEqual([]);
  });

  it('tiene chi ha finito finché il giro non è chiuso', () => {
    // Steam ha finito, GOG e PSN no: Steam resta nel giro, ed è l'«1» di «1 di 3».
    const batch = nextSyncBatch(['steam', 'gog', 'psn'], ['gog', 'psn']);
    expect(batch).toEqual(['steam', 'gog', 'psn']);
    expect(syncBatchProgress(batch, ['gog', 'psn'])).toEqual({
      done: 1,
      total: 3,
    });
  });

  it('un account che parte a metà allunga il totale', () => {
    const batch = nextSyncBatch(['steam', 'gog'], ['gog', 'xbox']);
    expect(batch).toEqual(['steam', 'gog', 'xbox']);
    expect(syncBatchProgress(batch, ['gog', 'xbox'])).toEqual({
      done: 1,
      total: 3,
    });
  });

  it('il giro dopo riparte da zero', () => {
    const chiuso = nextSyncBatch(['steam', 'gog'], []);
    expect(nextSyncBatch(chiuso, ['psn'])).toEqual(['psn']);
  });
});
