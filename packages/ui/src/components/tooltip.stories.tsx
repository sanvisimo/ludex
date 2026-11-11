import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { Languages } from '../icons';
import { Text, XStack, YStack } from '../primitives';
import { BrandIcon } from './brand-icon';
import { Button } from './button';
import { Tooltip } from './tooltip';

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
    await userEvent.hover(button);
    await waitFor(() => expect(screen.getByText('Lingua')).toBeVisible());
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
    children: (
      <Button variant="ghost" aria-label="Thronebreaker">
        Thronebreaker: The…
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    await userEvent.hover(
      within(canvasElement).getByRole('button', { name: 'Thronebreaker' }),
    );
    await waitFor(() =>
      expect(screen.getByText(/Edizione completa/)).toBeVisible(),
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
            <Text fontSize={12} lineHeight={16} color="$color1">
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
    await userEvent.hover(
      within(canvasElement).getByRole('button', { name: 'Altri 3 negozi' }),
    );
    await waitFor(() => expect(screen.getByText('GOG')).toBeVisible());
  },
};
