import { createV5Theme } from '@tamagui/config/v5';

import { accents, defaultAccent, base, states, toAccent } from './palettes';

/**
 * **Livello 2 — i semantici.**
 *
 * Tamagui li genera dai primitivi: `$background`, `$color`, `$borderColor`,
 * `$accentBackground` e le loro varianti per hover, press e focus. È il livello
 * che fa da isolante — cambiando la base o l'accento cambia tutto senza toccare
 * un solo componente — ed è l'unico che i componenti hanno il diritto di
 * nominare.
 *
 * Due potature, entrambe misurate, che portano i temi da **390 a 48** e le loro
 * definizioni da **562 KB a 82 KB**:
 *
 * - `childrenThemes` ridotto ai tre colori di stato. Di serie Tamagui genera un
 *   tema per ognuna delle dodici scale Radix: `light_pink_surface2` e gli altri
 *   nove colori sono temi che nessuna schermata chiederà mai.
 * - `componentThemes: false`. Sono i temi per singolo componente
 *   (`dark_Button`, `light_Input`…), che Tamagui stesso dichiara deprecati in
 *   favore degli stili sul componente: da soli erano due terzi del peso.
 */
const accent = accents[defaultAccent];

export const themes = createV5Theme({
  lightPalette: Object.values(base.light),
  darkPalette: Object.values(base.dark),
  accent: {
    light: toAccent(accent.light),
    dark: toAccent(accent.dark),
  },
  childrenThemes: states,
  componentThemes: false,
});

export type Themes = typeof themes;
