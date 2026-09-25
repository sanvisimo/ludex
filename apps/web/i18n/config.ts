export const locales = ['it', 'en'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'it';

// Il nome viene da next-intl, che c'era prima di TanStack Start. Resta questo
// perché cambiarlo farebbe perdere la lingua scelta a chi l'aveva già.
export const localeCookie = 'NEXT_LOCALE';

export function isLocale(value: string | null | undefined): value is Locale {
  return (
    value !== null &&
    value !== undefined &&
    (locales as readonly string[]).includes(value)
  );
}

/**
 * Preferenze del browser, in ordine di qualità dichiarata. Si confronta solo il
 * sottotag primario: `en-GB` e `en-US` sono entrambi `en`, non abbiamo varianti
 * regionali da distinguere.
 */
export function fromAcceptLanguage(
  header: string | null | undefined,
): Locale | null {
  if (!header) return null;

  const ranked = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const quality = params.find((param) => param.startsWith('q='));
      return {
        tag: tag?.toLowerCase().split('-')[0],
        quality: quality ? Number(quality.slice(2)) : 1,
      };
    })
    .filter((entry) => Number.isFinite(entry.quality))
    .sort((a, b) => b.quality - a.quality);

  return (
    (ranked.find((entry) => isLocale(entry.tag))?.tag as Locale | undefined) ??
    null
  );
}
