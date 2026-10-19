import { describe, expect, it } from 'vitest';

import { importTagDate } from './import-tag';

describe('la data nel tag dell’import da CSV', () => {
  const giorno = new Date(2026, 9, 9, 23, 30);

  it('in italiano come la si scrive, con gli zeri', () => {
    expect(importTagDate(giorno, 'it')).toBe('09/10/2026');
  });

  it('nelle altre lingue in ISO, che non scambia giorno e mese', () => {
    expect(importTagDate(giorno, 'en')).toBe('2026-10-09');
  });
});
