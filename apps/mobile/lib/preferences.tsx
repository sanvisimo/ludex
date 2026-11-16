import * as SecureStore from 'expo-secure-store';
import type { ReactNode } from 'react';
import { createContext, useContext, useState } from 'react';
import { useColorScheme } from 'react-native';

export type ThemeChoice = 'system' | 'light' | 'dark';
export type LocaleChoice = 'system' | 'it' | 'en';
export type Locale = 'it' | 'en';

const THEME_KEY = 'pilecue_theme';
const LOCALE_KEY = 'pilecue_locale';

function read<T extends string>(key: string, allowed: readonly T[]): T {
  const value = SecureStore.getItem(key);
  return allowed.includes(value as T) ? (value as T) : allowed[0]!;
}

function deviceLocale(): Locale {
  const tag = Intl.DateTimeFormat().resolvedOptions().locale;
  return tag.toLowerCase().startsWith('it') ? 'it' : 'en';
}

type Preferences = {
  theme: ThemeChoice;
  setTheme: (value: ThemeChoice) => void;
  locale: LocaleChoice;
  setLocale: (value: LocaleChoice) => void;
  dark: boolean;
  resolvedLocale: Locale;
};

const PreferencesContext = createContext<Preferences | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme();
  const [theme, setThemeState] = useState(() =>
    read<ThemeChoice>(THEME_KEY, ['system', 'light', 'dark']),
  );
  const [locale, setLocaleState] = useState(() =>
    read<LocaleChoice>(LOCALE_KEY, ['system', 'it', 'en']),
  );

  const value: Preferences = {
    theme,
    setTheme: (next) => {
      SecureStore.setItem(THEME_KEY, next);
      setThemeState(next);
    },
    locale,
    setLocale: (next) => {
      SecureStore.setItem(LOCALE_KEY, next);
      setLocaleState(next);
    },
    dark: theme === 'system' ? system === 'dark' : theme === 'dark',
    resolvedLocale: locale === 'system' ? deviceLocale() : locale,
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const value = useContext(PreferencesContext);
  if (!value) throw new Error('usePreferences fuori da PreferencesProvider');
  return value;
}
