export const locales = ['it', 'en'] as const;

export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'it';

// Nome convenzionale di next-intl: usarlo significa che eventuali utility della
// libreria che leggono il cookie trovano già quello giusto.
export const localeCookie = 'NEXT_LOCALE';

export function isLocale(value: string | null | undefined): value is Locale {
  return (
    value !== null &&
    value !== undefined &&
    (locales as readonly string[]).includes(value)
  );
}
