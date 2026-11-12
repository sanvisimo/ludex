import { beforeEach, describe, expect, it, vi } from 'vitest';

import { notifyAdmin } from '../lib/notify';
import { warnUnknownPlatforms } from './unknown-platforms';

vi.mock('../lib/notify', () => ({ notifyAdmin: vi.fn() }));
const claimed = vi.hoisted(() => new Set<string>());
vi.mock('../lib/redis', () => ({
  claimOnce: vi.fn(async (key: string) => {
    if (claimed.has(key)) return false;
    claimed.add(key);
    return true;
  }),
}));

describe('warnUnknownPlatforms', () => {
  beforeEach(() => {
    claimed.clear();
    vi.mocked(notifyAdmin).mockClear();
  });

  it('avvisa una volta per codice, anche su più import', async () => {
    await warnUnknownPlatforms('nintendo', new Map([['CTR', 'Un gioco 3DS']]));
    await warnUnknownPlatforms('nintendo', new Map([['CTR', 'Un altro']]));

    expect(notifyAdmin).toHaveBeenCalledTimes(1);
    expect(vi.mocked(notifyAdmin).mock.calls[0]![0]).toContain('nintendo');
    expect(vi.mocked(notifyAdmin).mock.calls[0]![0]).toContain('CTR');
    expect(vi.mocked(notifyAdmin).mock.calls[0]![0]).toContain('Un gioco 3DS');
  });

  it('lo stesso codice su due negozi sono due avvisi', async () => {
    await warnUnknownPlatforms('nintendo', new Map([['X', 'a']]));
    await warnUnknownPlatforms('psn', new Map([['X', 'b']]));

    expect(notifyAdmin).toHaveBeenCalledTimes(2);
  });

  it('senza codici sconosciuti non avvisa', async () => {
    await warnUnknownPlatforms('psn', new Map());

    expect(notifyAdmin).not.toHaveBeenCalled();
  });
});
