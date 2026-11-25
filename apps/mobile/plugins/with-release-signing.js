const { withAppBuildGradle } = require('expo/config-plugins');

// Il `build.gradle` generato firma la release con la chiave di debug. Questa
// firma la release con la nostra chiave, letta da `~/.gradle/gradle.properties`
// (`PILECUE_*`), fuori dal repo. Senza quelle proprietà l'APK esce non
// firmato, che non si installa: meglio di uno firmato con la chiave di debug,
// che si installerebbe e poi non accetterebbe aggiornamenti.
const signingConfig = `
        release {
            if (project.hasProperty('PILECUE_STORE_FILE')) {
                storeFile file(PILECUE_STORE_FILE)
                storePassword PILECUE_STORE_PASSWORD
                keyAlias PILECUE_KEY_ALIAS
                keyPassword PILECUE_KEY_PASSWORD
            }
        }`;

const debugSigning = /(signingConfigs \{\n\s+debug \{[^}]*\})/;
const releaseUsesDebug =
  /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/;

module.exports = (config) =>
  withAppBuildGradle(config, (config) => {
    const gradle = config.modResults.contents;
    if (!debugSigning.test(gradle) || !releaseUsesDebug.test(gradle))
      throw new Error(
        'with-release-signing: il build.gradle generato non ha più la forma attesa',
      );
    config.modResults.contents = gradle
      .replace(debugSigning, `$1${signingConfig}`)
      .replace(
        releaseUsesDebug,
        "$1signingConfig project.hasProperty('PILECUE_STORE_FILE') ? signingConfigs.release : null",
      );
    return config;
  });
