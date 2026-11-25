import type { ConfigContext, ExpoConfig } from 'expo/config';

// Il `versionCode` di Android deve crescere a ogni APK, o non si installa
// come aggiornamento: lo ricava dalla versione, così si alza una cosa sola.
// Regge finché minor e patch restano sotto 100.
export default ({ config }: ConfigContext): ExpoConfig => {
  const parts = (config.version ?? '').split('.').map(Number);
  const [major, minor, patch] = parts;
  if (
    parts.length !== 3 ||
    !parts.every((n) => Number.isInteger(n) && n >= 0 && n < 100)
  )
    throw new Error(
      `app.json: versione "${config.version}" non è MAJOR.MINOR.PATCH`,
    );

  return {
    ...config,
    name: config.name ?? 'PileCue',
    slug: config.slug ?? 'ludex',
    android: {
      ...config.android,
      versionCode: major! * 10000 + minor! * 100 + patch!,
    },
  };
};
