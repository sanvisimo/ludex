import { generatedThemes } from './frozen-themes';
import {
  accents,
  defaultAccent,
  base,
  toAccent,
  actionPress,
} from './palettes';

/**
 * **Livello 2 — i semantici.**
 *
 * Vengono dai primitivi: `$background`, `$color`, `$borderColor`,
 * `$accentBackground` e le loro varianti per hover, press e focus. È il livello
 * che fa da isolante — cambiando la base o l'accento cambia tutto senza toccare
 * un solo componente — ed è l'unico che i componenti hanno il diritto di
 * nominare.
 *
 * La parte generata da Tamagui sta congelata in `frozen-themes.ts`. I ruoli
 * surface/action/selection si aggiungono agli stessi temi, senza generare un
 * secondo set per il vecchio accento.
 */
const accent = accents[defaultAccent];

/**
 * Il tipo di ogni tema è quello completo, come lo dava `createV5Theme`: nel
 * letterale congelato i sottotemi hanno solo le chiavi che cambiano, e il
 * resto lo eredita a runtime dal tema genitore. Senza, i token di un
 * componente sarebbero solo quelli comuni a tutti i 56 temi.
 */
type Theme = typeof generatedThemes.light;

/** Livello semantico condiviso: vale anche dentro superfici e sottotemi.
 * Le superfici seguono il tema locale; azioni e selezioni hanno l'identità
 * di brand del relativo schema. Non si genera un secondo set di temi.
 */
function semanticRoles(scheme: 'light' | 'dark', theme: Theme) {
  const brand = toAccent(accent[scheme]);
  return {
    surface: theme.color3,
    surfaceHover: theme.color4,
    surfacePress: theme.color5,
    surfaceSecondary: scheme === 'dark' ? theme.color6 : theme.color4,
    actionBackground: brand.accent9,
    actionBackgroundHover: brand.accent10,
    actionBackgroundPress: actionPress[scheme],
    actionColor: scheme === 'dark' ? base.dark.step2 : base.light.step2,
    selectionBackground: brand.accent3,
    selectionBackgroundHover: brand.accent4,
    selectionBackgroundPress: brand.accent5,
    selectionColor: brand.accent11,
    selectionBorder: brand.accent8,
    selectionBorderHover: brand.accent9,
    selectionBorderPress: brand.accent9,
    outlineColor: brand.accent9,
  };
}

export const themes = Object.fromEntries(
  Object.entries(generatedThemes).map(([name, theme]) => {
    const scheme = name.startsWith('dark') ? 'dark' : 'light';
    const palette = base[scheme];
    // Il generatore arrotonda gli HEX in HSL. Nei temi base preserviamo i
    // valori approvati e misurati; i sottotemi di stato restano generati.
    const exact =
      name === 'dark' || name === 'light'
        ? {
            ...Object.fromEntries(
              Object.values(palette).map((value, i) => [
                `color${i + 1}`,
                value,
              ]),
            ),
            ...toAccent(accent[scheme]),
            background: palette.step2,
            backgroundHover: scheme === 'dark' ? palette.step3 : palette.step1,
            backgroundPress: scheme === 'dark' ? palette.step1 : palette.step3,
            backgroundFocus: palette.step3,
            backgroundActive: palette.step2,
            color: palette.step12,
            colorHover: palette.step12,
            colorPress: palette.step12,
            borderColor: palette.step4,
          }
        : {};
    const local = { ...(theme as Theme), ...exact };
    return [name, { ...local, ...semanticRoles(scheme, local) }];
  }),
) as {
  [Name in keyof typeof generatedThemes]: Theme &
    ReturnType<typeof semanticRoles>;
};

export type Themes = typeof themes;
