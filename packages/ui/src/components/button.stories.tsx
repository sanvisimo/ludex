import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Pencil, SlidersHorizontal, X } from '../icons';
import { XStack, YStack, Text } from '../primitives';
import { Button } from './button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: {
    children: 'Add Game',
    onPress: fn(),
  },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['default', 'outline', 'secondary', 'ghost', 'destructive'],
    },
    size: {
      control: 'inline-radio',
      options: ['default', 'sm', 'icon', 'icon-sm', 'icon-xs'],
    },
    disabled: { control: 'boolean' },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    disabled: false,
  },
};

/**
 * Le cinque varianti una accanto all'altra: è l'unico modo di accorgersi che
 * due si somigliano troppo, che è un difetto che guardandole una per volta non
 * si vede mai.
 */
export const Variants: Story = {
  render: () => (
    <XStack gap="$3" items="center" flexWrap="wrap">
      <Button>Default</Button>
      <Button variant="outline">Outline</Button>
      <Button variant="secondary">Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="destructive">Destructive</Button>
    </XStack>
  ),
};

export const Sizes: Story = {
  render: () => (
    <XStack gap="$3" items="center">
      <Button>Normal</Button>
      <Button size="sm">small</Button>
      <Button size="icon" aria-label="Filtri">
        <SlidersHorizontal size={16} />
      </Button>
      <Button size="icon-sm" aria-label="Modifica">
        <Pencil size={14} />
      </Button>
      <Button size="icon-xs" aria-label="Rimuovi">
        <X size={12} />
      </Button>
    </XStack>
  ),
};

/**
 * Lo stato disabilitato **su tutte le varianti**: `disabledStyle` è
 * un'opacità, e su `ghost` — che è già trasparente — bisogna guardare se resta
 * leggibile o se sparisce del tutto.
 */
export const Disabled: Story = {
  render: () => (
    <XStack gap="$3" items="center" flexWrap="wrap">
      <Button disabled>Default</Button>
      <Button variant="outline" disabled>
        Outline
      </Button>
      <Button variant="secondary" disabled>
        Secondary
      </Button>
      <Button variant="ghost" disabled>
        Ghost
      </Button>
      <Button variant="destructive" disabled>
        Destructive
      </Button>
    </XStack>
  ),
};

/**
 * I due temi affiancati, che è la cosa che il selettore in barra **non** sa
 * mostrare: lì se ne vede uno per volta, e le differenze di peso fra chiaro e
 * scuro si notano solo guardandoli insieme.
 */
export const Themes: Story = {
  parameters: { theme: 'scuro' },
  render: () => (
    <XStack gap="$4" items="flex-start">
      <YStack gap="$2" bg="$background" p="$3" rounded="$4">
        <Text color="$color11" fontSize={12}>
          Dark
        </Text>
        <Button>Add</Button>
        <Button variant="outline">Outline</Button>
      </YStack>
    </XStack>
  ),
};

/**
 * L'unico comportamento che questo componente ha: un clic chiama `onPress` una
 * volta, e da disabilitato non lo chiama affatto. Sembra ovvio, ma su
 * react-native-web il bottone è un `div` con un gestore, non un `<button>`, e
 * «disabilitato» è una cosa che il componente deve fare per conto suo.
 */
export const Interaction: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Add Game'));
    await expect(args.onPress).toHaveBeenCalledTimes(1);
  },
};

export const DisabledNotRespond: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Add Game'));
    await expect(args.onPress).not.toHaveBeenCalled();
  },
};
