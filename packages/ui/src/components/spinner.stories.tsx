import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, waitFor, within } from 'storybook/test';

import { RefreshCw } from '../icons';
import { Text, XStack } from '../primitives';
import { Button } from './button';
import { Spinner } from './spinner';

const meta = {
  title: 'Components/Spinner',
  component: Spinner,
  argTypes: {
    spinning: { control: 'boolean' },
    duration: { control: { type: 'number', min: 200, max: 3000, step: 100 } },
  },
} satisfies Meta<typeof Spinner>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Il cerchio di caricamento, da solo. */
export const Default: Story = {};

/**
 * Il caso della scheda di un account: l'icona «aggiorna» dentro un bottone di
 * sola icona, che gira mentre importa. Il nome sta sul bottone: lo Spinner è
 * decorativo.
 */
export const InAButton: Story = {
  render: () => (
    <XStack gap="$3" items="center">
      <Button variant="outline" size="icon" aria-label="Aggiorna" disabled>
        <Spinner>
          <RefreshCw size={16} color="$color12" />
        </Spinner>
      </Button>
      <Text color="$color11" fontSize={13}>
        importazione in corso…
      </Text>
    </XStack>
  ),
};

/** Fermo, com'era: la stessa icona senza movimento. */
export const Stopped: Story = {
  args: { spinning: false },
  render: (args) => (
    <Spinner {...args}>
      <RefreshCw size={16} color="$color12" />
    </Spinner>
  ),
};

/**
 * Gira davvero: la rotazione cambia fra due istanti. Si guarda lo stile
 * calcolato, perché è l'unico modo di sapere che si muove e non solo che il
 * componente si è montato. Se il sistema ha chiesto meno movimento la storia
 * non ha niente da provare, e lo dice.
 */
export const Rotates: Story = {
  render: () => (
    <div data-testid="giro">
      <Spinner>
        <RefreshCw size={16} color="$color12" />
      </Spinner>
    </div>
  ),
  play: async ({ canvasElement }) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = within(canvasElement);
    // L'elemento che ruota è quello con la classe della rotazione, non il
    // `<style>` che lo precede né l'icona che gli sta dentro.
    const read = () =>
      getComputedStyle(canvas.getByTestId('giro').querySelector('.ludex-spin')!)
        .transform;
    const first = read();
    await waitFor(() => expect(read()).not.toBe(first), { timeout: 2000 });
  },
};
