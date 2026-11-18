import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { Languages } from '../icons';
import { Text, XStack, YStack } from '../primitives';
import { BrandIcon } from './brand-icon';
import { Button } from './button';
import { Tooltip } from './tooltip';

// Il Tooltip di Tamagui aggancia i listener due volte dopo il montaggio, e un
// hover che cade fra i due perde il timer dell'apertura. Nello Storybook
// compilato, cioè su Chromatic, il `play` parte proprio lì; in locale no,
// perché `addon-vitest` monta le storie dentro `act()`. Se il suggerimento non
// c'è si esce e si riprova; se c'è, si aspetta la fine della sua comparsa.
async function passaSopra(trigger: HTMLElement, testo: string | RegExp) {
  await waitFor(
    async () => {
      if (!screen.queryByText(testo)) {
        await userEvent.unhover(trigger);
        await userEvent.hover(trigger);
      }
      await expect(await screen.findByText(testo)).toBeVisible();
    },
    { timeout: 5000 },
  );
}

const meta = {
  title: 'Components/Tooltip',
  component: Tooltip,
  args: {
    content: 'Lingua',
    children: (
      <Button variant="ghost" size="icon" aria-label="Lingua">
        <Languages size={16} />
      </Button>
    ),
  },
  // Spazio sopra al bottone, o il suggerimento uscirebbe dal canvas.
  decorators: [
    (Story) => (
      <XStack pt={48} px={48}>
        <Story />
      </XStack>
    ),
  ],
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Il passaggio del mouse lo apre, l'uscita lo chiude. Il nome del bottone
 * resta il suo `aria-label`, non il suggerimento.
 *
 * La tastiera non si prova qui: Tamagui lo apre solo su `:focus-visible`, e
 * il focus spostato da `userEvent.tab()` per Chromium non lo è. Si prova
 * sull'app, con la tastiera vera di Playwright.
 */
export const Hover: Story = {
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole('button', {
      name: 'Lingua',
    });
    await passaSopra(button, 'Lingua');
    await userEvent.unhover(button);
    await waitFor(() => expect(screen.queryByText('Lingua')).toBeNull());
  },
};

/**
 * Il testo intero di un titolo troncato: il contenuto va a capo invece di
 * allungarsi in una striscia sola.
 */
export const LongContent: Story = {
  args: {
    content: 'Thronebreaker: The Witcher Tales — Edizione completa',
    children: <Button variant="ghost">Thronebreaker: The…</Button>,
  },
  play: async ({ canvasElement }) => {
    await passaSopra(
      within(canvasElement).getByRole('button', { name: /Thronebreaker/ }),
      /Edizione completa/,
    );
  },
};

/** Un contenuto composto: icone ed etichette, come l'elenco dei negozi. */
export const RichContent: Story = {
  args: {
    content: (
      <YStack gap={6} py={2}>
        {(['steam', 'gog', 'epic'] as const).map((brand) => (
          <XStack key={brand} items="center" gap={8}>
            <BrandIcon brand={brand} size={16} />
            <Text fontSize={12} lineHeight="16px" color="color1">
              {brand.toUpperCase()}
            </Text>
          </XStack>
        ))}
      </YStack>
    ),
    children: (
      <Button variant="ghost" size="icon" aria-label="Altri 3 negozi">
        +3
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    await passaSopra(
      within(canvasElement).getByRole('button', { name: 'Altri 3 negozi' }),
      'GOG',
    );
  },
};
