import {
  amber,
  amberDark,
  blue,
  blueDark,
  green,
  greenDark,
  red,
  redDark,
} from '@tamagui/colors';

/** Primitivi Midnight Cue approvati. I componenti usano soltanto i semantici.
 * Scale originali a 12 passi: docs/brand/pilecue/color-map.md contiene le
 * combinazioni misurate, non le garanzie delle scale Radix che sostituiscono.
 */
type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
const scale = (colors: readonly string[]): Record<`step${Step}`, string> => {
  if (colors.length !== 12)
    throw new Error('Una scala deve avere dodici passi');
  return Object.fromEntries(
    colors.map((color, index) => [`step${index + 1}`, color]),
  ) as Record<`step${Step}`, string>;
};
const navyDark = scale([
  '#0D1020',
  '#101426',
  '#1A1E2B',
  '#232737',
  '#2B3041',
  '#343A4E',
  '#424A61',
  '#59637E',
  '#6C7794',
  '#8C96AF',
  '#B9BED2',
  '#F5F6FF',
]);
const navyLight = scale([
  '#FDFDFF',
  '#F5F6FF',
  '#EDEFF7',
  '#E3E6F0',
  '#D8DDEB',
  '#C9D0E1',
  '#B6BFD3',
  '#9BA8C2',
  '#7A87A2',
  '#68758F',
  '#525E78',
  '#101426',
]);
const violetDark = scale([
  '#141127',
  '#1B1731',
  '#29243F',
  '#352D55',
  '#42366C',
  '#514384',
  '#66589F',
  '#8172C1',
  '#8B7CFF',
  '#9C90FF',
  '#B8AEFF',
  '#E5E1FF',
]);
const violetLight = scale([
  '#FDFCFF',
  '#F7F5FF',
  '#EFEBFF',
  '#E4DDFF',
  '#D7CDFF',
  '#C4B5FA',
  '#AA98EE',
  '#8D78DD',
  '#6654C9',
  '#5945B8',
  '#5541AD',
  '#2E215B',
]);

export const base = { light: navyLight, dark: navyDark };
export const accents = {
  violet: { light: violetLight, dark: violetDark },
} as const;
export type Accent = keyof typeof accents;
export const defaultAccent: Accent = 'violet';

// La pressione del primario non usa il passo 8, riservato ai bordi selezionati.
export const actionPress = { dark: '#8072EC', light: '#5C49BB' };

/** Stati Radix indipendenti dall'identità del marchio. */
export const states = {
  red: { light: red, dark: redDark },
  green: { light: green, dark: greenDark },
  amber: { light: amber, dark: amberDark },
  blue: { light: blue, dark: blueDark },
} as const;

export function toAccent(
  scale: Record<string, string>,
): Record<`accent${Step}`, string> {
  const values = Object.values(scale);
  if (values.length !== 12)
    throw new Error('Un accento deve avere dodici passi');
  return Object.fromEntries(
    values.map((value, index) => [`accent${index + 1}`, value]),
  ) as Record<`accent${Step}`, string>;
}
