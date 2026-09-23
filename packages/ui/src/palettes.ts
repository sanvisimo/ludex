import {
  amber,
  amberDark,
  green,
  greenDark,
  red,
  redDark,
  slate,
  slateDark,
  teal,
  tealDark,
} from '@tamagui/colors';

/**
 * **Livello 1 — i primitivi.**
 *
 * Le scale grezze, e nient'altro: qui non c'è nessuna intenzione, solo colori.
 * Nessun componente le importa mai — a farlo sarebbe un componente che sa di
 * essere verde invece di sapere di essere "riuscito", e al primo cambio di tema
 * resterebbe verde. Il livello 2 (i temi) le traduce in `$background`,
 * `$color`, `$borderColor`; il livello 3 sta nei `styled()` dei componenti.
 *
 * Sono le scale Radix, che arrivano con Tamagui: dodici passi pensati perché il
 * 9 sia il colore pieno, l'11 il testo leggibile su fondo chiaro e il 12 quello
 * su fondo scuro. Inventarne di nuove vorrebbe dire rifare a mano quel lavoro
 * sul contrasto.
 */

/** La base: grigio-blu freddo. È la cornice, e deve stare indietro — in Ludex
 *  il colore forte lo mettono le copertine, non l'interfaccia. */
export const base = { light: slate, dark: slateDark };

/**
 * L'accento, cioè "questo è un comando".
 *
 * È una **mappa** e non una costante perché la scelta del tema potrà passare
 * all'utente: aggiungere un accento sarà una voce qui più la riga che genera i
 * suoi temi. Oggi ne esiste uno solo, e non è pigrizia — ogni accento in più è
 * un set completo di temi (48 temi, ~82 KB di definizioni), e quel peso si
 * spende quando c'è un'interfaccia che lo fa scegliere, non prima.
 *
 * Teal e non viola: il viola e il magenta sono dappertutto sulle copertine, e
 * un accento che si confonde con le immagini smette di dire "questo si clicca".
 */
export const accents = {
  teal: { light: teal, dark: tealDark },
} as const;

export type Accent = keyof typeof accents;

export const defaultAccent: Accent = 'teal';

/**
 * I colori di stato, che restano gli stessi qualunque accento si scelga: sono
 * significato, non decorazione. Si usano come sotto-tema — `<Theme name="red">`
 * su un dialogo distruttivo — e non come colore scritto a mano dentro un
 * componente.
 *
 * Tre e non dodici: Tamagui ne genererebbe uno per ogni scala Radix, e gli
 * altri nove sarebbero temi che nessuna schermata chiede mai.
 */
export const states = {
  red: { light: red, dark: redDark },
  green: { light: green, dark: greenDark },
  amber: { light: amber, dark: amberDark },
} as const;

/** Da scala Radix (`teal1`…`teal12`) alle chiavi che Tamagui vuole per l'accento. */
export function toAccent(
  scala: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    Object.values(scala).map((valore, i) => [`accent${i + 1}`, valore]),
  );
}
