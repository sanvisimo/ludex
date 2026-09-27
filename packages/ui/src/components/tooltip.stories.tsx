import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { Languages } from '../icons';
import { XStack } from '../primitives';
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
