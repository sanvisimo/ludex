import { createSystemFont } from '@tamagui/config/v5';
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
 * **Su mobile** resta il carattere di sistema, per ora: React Native vuole un
 * nome per ogni peso, e un nome che iOS non conosce è un errore, non un
 * ripiego. I file per React Native arrivano con `expo-font`, e con loro i nomi.
 */
const SYSTEM =
  '-apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Le interlinee dei titoli sono quelle della config v5: più strette del testo.
const headingLineHeight = (size: number) => Math.round(size * 1.12 + 5);

export const fonts = {
  body: createSystemFont({
    font: {
      ...(isWeb && { family: `"Inter Variable", ${SYSTEM}` }),
      weight: { 1: '400' },
    },
  }),
  heading: createSystemFont({
    font: {
      ...(isWeb && { family: `"Space Grotesk Variable", ${SYSTEM}` }),
      weight: { 0: '600', 6: '700', 9: '700' },
    },
    sizeLineHeight: headingLineHeight,
  }),
};
