import {
  createSystemFont,
  v5SystemFontLineHeight,
  v5SystemFontSizes,
} from '@tamagui/create-system-font';
import { isWeb } from '@tamagui/core';

/**
 * I caratteri: **Inter** per il testo, **Space Grotesk** per titoli e nome.
 *
 * Inter dove la pagina è fitta — righe del backlog, durate, voti — perché resta
 * leggibile in piccolo e ha le cifre tabellari. Space Grotesk dove si legge una
 * parola sola, e lì dà all'app una voce sua. Sono tutte e due di Google Fonts,
 * con licenza aperta: esistono su tutte e due le piattaforme, che è il vincolo
 * che ha tagliato la lista (vedi il piano dell'identità).
 *
 * **Sul web** il nome è quello che dichiara `@fontsource-variable`: un file per
 * famiglia, con tutti i pesi, caricato dall'app e non da Google. Dietro resta
 * lo stack di sistema, che si vede solo finché il file non è arrivato.
 *
 * **Su mobile** React Native non regge i font variabili: ogni peso è un file
 * a sé, con un nome suo, e `face` dice a Tamagui quale nome usare per quale
 * peso — `fontWeight` sparisce e resta la famiglia giusta. Qui ci sono solo i
 * pesi che i componenti usano; quelli in mezzo li riempie `createFont` col
 * precedente. I file li carica `apps/mobile` con `expo-font`, **con questi
 * stessi nomi**: `@repo/ui` non dipende da Expo, e un nome che non combacia
 * su iOS è un errore.
 */
const SYSTEM =
  '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Le interlinee dei titoli sono quelle della config v5: più strette del testo.
const headingLineHeight = (size: number) => Math.round(size * 1.12 + 5);

const body = isWeb
  ? { family: `"Inter Variable", ${SYSTEM}` }
  : {
      family: 'Inter_400Regular',
      face: {
        400: { normal: 'Inter_400Regular' },
        500: { normal: 'Inter_500Medium' },
        600: { normal: 'Inter_600SemiBold' },
        700: { normal: 'Inter_700Bold' },
      },
    };

const heading = isWeb
  ? { family: `"Space Grotesk Variable", ${SYSTEM}` }
  : {
      family: 'SpaceGrotesk_600SemiBold',
      face: {
        600: { normal: 'SpaceGrotesk_600SemiBold' },
        700: { normal: 'SpaceGrotesk_700Bold' },
      },
    };

// Le taglie e le interlinee della config v5, come le passa Tamagui ai suoi
// caratteri v5: da Tamagui 3 quelle di serie di `createSystemFont` sono la
// scala nuova della v6, e il testo cambiava misura (la taglia 4 da 15 a 14).
export const fonts = {
  body: createSystemFont({
    sizes: v5SystemFontSizes,
    sizeLineHeight: v5SystemFontLineHeight,
    font: { ...body, weight: { 1: '400' } },
  }),
  heading: createSystemFont({
    sizes: v5SystemFontSizes,
    font: { ...heading, weight: { 0: '600', 6: '700', 9: '700' } },
    sizeLineHeight: headingLineHeight,
  }),
};
