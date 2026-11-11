/** PileCue, direzione approvata il 10/11/2026. Tracciati condivisi da UI e asset.
 * `ink` segue il tema solo nel wordmark; i colori del simbolo sono fissi.
 * Non sono font: non richiedono file, licenze o caricamenti aggiuntivi.
 */
export type BrandShape = { d: string; fill: string; transform?: string };
export const brandColors = {
  navy: '#101426',
  white: '#F5F6FF',
  violet: '#8B7CFF',
  violetSide: '#6651CE',
  violetEdge: '#A79AFF',
  aqua: '#4DDED3',
  aquaSide: '#20B8AF',
  aquaEdge: '#8BF0E8',
} as const;
export const wordmarkBox = { width: 804, height: 172 };
export const iconBox = { width: 176, height: 176 };

// La stessa P, con spigoli a gradino e controforma aperta, nei due formati.
const p =
  'M28 4H106Q112 4 112 10V16H118Q124 16 124 22V85Q124 91 118 91H112V98H105V105H98V112H48V150Q48 156 42 156H6Q0 156 0 150V125Q0 119 6 119H12V28Q12 22 18 22H22V10Q22 4 28 4ZM56 42V76H88V42Z';
const i =
  'M4 16H26Q32 16 32 22V38Q32 44 26 44H4Q-2 44-2 38V22Q-2 16 4 16ZM4 54H26Q32 54 32 60V150Q32 156 26 156H4Q-2 156-2 150V60Q-2 54 4 54Z';
const l =
  'M4 16H26Q32 16 32 22V150Q32 156 26 156H4Q-2 156-2 150V22Q-2 16 4 16Z';
const e =
  'M22 50H76Q82 50 82 56V62H88Q94 62 94 68V104Q94 110 88 110H32V124H88Q94 124 94 130V150Q94 156 88 156H18Q12 156 12 150V144H6Q0 144 0 138V74Q0 68 6 68H12V56Q12 50 22 50ZM32 76V88H62V76Z';
const c =
  'M26 10H88Q94 10 94 16V22H100Q106 22 106 28V54Q106 60 100 60H80Q74 60 74 54V44H34V124H74V114Q74 108 80 108H100Q106 108 106 114V138Q106 144 100 144H94V150Q94 156 88 156H26Q20 156 20 150V144H12V138H6Q0 138 0 132V34Q0 28 6 28H12V22H20V16Q20 10 26 10Z';
const u =
  'M6 50H26Q32 50 32 56V124H62V56Q62 50 68 50H88Q94 50 94 56V138Q94 144 88 144H82V150Q82 156 76 156H18Q12 156 12 150V144H6Q0 144 0 138V56Q0 50 6 50Z';

/** Tre faccette di una custodia, nello stesso piano isometrico per ogni asset. */
function stack(x: number, y: number, scale = 1): BrandShape[] {
  const shapes: BrandShape[] = [];
  for (const [dy, top, side, edge] of [
    [50, brandColors.violet, brandColors.violetSide, brandColors.violetEdge],
    [25, brandColors.violet, brandColors.violetSide, brandColors.violetEdge],
    [0, brandColors.aqua, brandColors.aquaSide, brandColors.aquaEdge],
  ] as const) {
    const transform = `translate(${x} ${y}) scale(${scale}) translate(0 ${dy})`;
    shapes.push(
      { d: 'M2 28L32 40V60L5 50Q0 48 0 43V31Z', fill: side, transform },
      {
        d: 'M32 40L120 12V33Q120 37 115 39L36 64Q32 65 32 60Z',
        fill: side,
        transform,
      },
      {
        d: 'M5 23L86 0Q90-1 95 1L116 9Q122 12 116 15L37 41Q32 43 27 41L4 32Q-2 29 5 23Z',
        fill: top,
        transform,
      },
      {
        d: 'M5 24L28 33Q32 35 37 33L116 9L119 11Q121 13 116 15L37 41Q32 43 27 41L4 32Q0 30 2 28Z',
        fill: edge,
        transform: `${transform} translate(0 -1) scale(1 .97)`,
      },
    );
  }
  return shapes;
}

export const wordmarkShapes: BrandShape[] = [
  ...stack(682, 48),
  { d: p, fill: 'ink', transform: 'translate(0 8)' },
  { d: i, fill: 'ink', transform: 'translate(140 8)' },
  { d: l, fill: 'ink', transform: 'translate(186 8)' },
  { d: e, fill: 'ink', transform: 'translate(234 8)' },
  { d: c, fill: brandColors.violet, transform: 'translate(350 8)' },
  { d: u, fill: brandColors.violet, transform: 'translate(478 8)' },
  { d: e, fill: brandColors.violet, transform: 'translate(588 8)' },
];

export const iconShapes: BrandShape[] = [
  {
    d: 'M32 0H144Q176 0 176 32V144Q176 176 144 176H32Q0 176 0 144V32Q0 0 32 0Z',
    fill: brandColors.navy,
  },
  ...stack(70, 78, 0.75),
  { d: p, fill: brandColors.white, transform: 'translate(20 12) scale(.88)' },
];

// Disegno dedicato a 16 px: gambo e foro da 3 px, piedino di 1 px a sinistra.
// Due soli dorsi, niente faccette; coordinate intere per bordi netti.
export const faviconShapes: BrandShape[] = [
  {
    d: 'M3 0H13Q16 0 16 3V13Q16 16 13 16H3Q0 16 0 13V3Q0 0 3 0Z',
    fill: brandColors.navy,
  },
  { d: 'M8 10H14V12H8Z', fill: brandColors.aqua },
  { d: 'M8 13H14V15H8Z', fill: brandColors.violet },
  {
    d: 'M4 2H9V3H11V8H10V9H6V14H2V12H3V4H4ZM6 4V7H9V4Z',
    fill: brandColors.white,
  },
];
