import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import type { ColorTokens } from 'tamagui';

import { Text, Theme, useTheme, View, XStack, YStack } from './primitives';

/**
 * La pagina dei token.
 *
 * I colori **non sono di Tamagui**: sono le scale [Radix](https://www.radix-ui.com/colors)
 * scelte in `palettes.ts` — `slate` per la base, `teal` per l'accento, più
 * red/green/amber per gli stati. Radix dà ai dodici passi un significato
 * fisso, ed è la ragione per cui questa pagina conta più di una tavolozza:
 *
 * | passi | a cosa servono |
 * | --- | --- |
 * | 1–2 | sfondi di pagina |
 * | 3–5 | superfici di controlli (normale, sopra, premuto) |
 * | 6–8 | bordi (separatore, controllo, controllo sotto il mouse) |
 * | 9–10 | tinte piene |
 * | 11–12 | testo (tenue, pieno) |
 *
 * Il numero sotto ogni tacca è il **contrasto con lo sfondo di questo tema**,
 * calcolato qui e non copiato: è quello che dice se un bordo si vedrà. Per un
 * controllo identificato dal solo bordo la soglia è 3.0 (WCAG 1.4.11), per il
 * testo 4.5.
 */
const meta = {
  title: 'Foundations/Colors',
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const steps = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

function toRgb(color: string): [number, number, number] {
  const m = color.match(/hsla?\(([-\d.]+),\s*([\d.]+)%,\s*([\d.]+)%/);
  if (!m) return [0, 0, 0];
  const h = Number(m[1]) / 360;
  const s = Number(m[2]) / 100;
  const l = Number(m[3]) / 100;
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    let u = t;
    if (u < 0) u += 1;
    if (u > 1) u -= 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
}

function luminance(color: string) {
  const [r, g, b] = toRgb(color).map((v) =>
    v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Il rapporto WCAG fra due colori, nell'ordine che non conta. */
function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (high + 0.05) / (low + 0.05);
}

function Scale({
  name,
  prefix,
  note,
}: {
  name: string;
  prefix: string;
  note?: string;
}) {
  const theme = useTheme() as unknown as Record<
    string,
    { val?: string } | undefined
  >;
  const value = (key: string) => theme[key]?.val ?? '';
  const background = value('background');

  return (
    <YStack gap="$2">
      <XStack gap="$2" items="baseline">
        <Text fontSize={13} fontWeight="600" color="$color12">
          {name}
        </Text>
        {note ? (
          <Text fontSize={11} color="$color11">
            {note}
          </Text>
        ) : null}
      </XStack>

      <XStack>
        {steps.map((step) => {
          const key = `${prefix}${step}`;
          const val = value(key);
          // Il token si compone a runtime, quindi il tipo va dichiarato: è
          // sempre un colore del tema, ma TypeScript non può saperlo da una
          // stringa costruita.
          const token = `$${key}` as ColorTokens;
          const k = val && background ? contrast(val, background) : 0;
          return (
            <YStack key={step} width={62} gap={2}>
              <View
                height={44}
                bg={token}
                borderWidth={1}
                borderColor="$color6"
              />
              <Text fontSize={10} color="$color12">
                {step}
              </Text>
              <Text fontSize={10} color={k >= 3 ? '$green11' : '$color11'}>
                {k.toFixed(2)}
              </Text>
            </YStack>
          );
        })}
      </XStack>
    </YStack>
  );
}

/**
 * Le cinque scale. Cambia il tema dalla barra in alto: i contrasti si
 * ricalcolano, ed è lì che si vede quanto la scala scura sia **compressa in
 * basso** — sette passi fra il 7% e il 28% di luminosità, cioè sette tacche
 * che l'occhio fatica a separare.
 */
export const Scales: Story = {
  render: () => (
    <YStack gap="$5">
      <Scale
        name="base"
        prefix="color"
        note="slate — backgrounds, surfaces, borders, text"
      />
      <Scale name="accent" prefix="accent" note="teal — the primary" />
      {/*
       * Gli stati sono `childrenThemes`: **dentro** un `<Theme name="red">` i
       * loro passi diventano `$color1…$color12`, ed è così che vanno usati.
       * Letti da fuori come `$red9` si disegnano lo stesso, ma `useTheme()`
       * non ne conosce il valore — e il contrasto verrebbe fuori identico su
       * tutti e dodici i passi, che è il segno che sta leggendo il nulla.
       */}
      <Theme name="red">
        <Scale name="error" prefix="color" />
      </Theme>
      <Theme name="green">
        <Scale name="success" prefix="color" />
      </Theme>
      <Theme name="amber">
        <Scale name="warning" prefix="color" />
      </Theme>
    </YStack>
  ),
};
