import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { XStack, YStack, Text } from '../primitives';
import { Button } from './button';

const meta = {
  title: 'Componenti/Button',
  component: Button,
  args: {
    children: 'Aggiungi un gioco',
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

export const Predefinito: Story = {};

/**
 * Le cinque varianti una accanto all'altra: è l'unico modo di accorgersi che
 * due si somigliano troppo, che è un difetto che guardandole una per volta non
 * si vede mai.
 */
export const Varianti: Story = {
  render: () => (
    <XStack gap="$3" items="center" flexWrap="wrap">
      <Button>Predefinito</Button>
      <Button variant="outline">Contorno</Button>
      <Button variant="secondary">Secondario</Button>
      <Button variant="ghost">Silenzioso</Button>
      <Button variant="destructive">Scollega</Button>
    </XStack>
  ),
};

export const Taglie: Story = {
  render: () => (
    <XStack gap="$3" items="center">
      <Button>Normale</Button>
      <Button size="sm">Piccolo</Button>
      <Button size="icon" aria-label="Filtri">
        ⚙
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="Modifica">
        ✎
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Rimuovi">
        ×
      </Button>
    </XStack>
  ),
};

/**
 * Lo stato disabilitato **su tutte le varianti**: `disabledStyle` è
 * un'opacità, e su `ghost` — che è già trasparente — bisogna guardare se resta
 * leggibile o se sparisce del tutto.
 */
export const Disabilitato: Story = {
  render: () => (
    <XStack gap="$3" items="center" flexWrap="wrap">
      <Button disabled>Predefinito</Button>
      <Button variant="outline" disabled>
        Contorno
      </Button>
      <Button variant="secondary" disabled>
        Secondario
      </Button>
      <Button variant="ghost" disabled>
        Silenzioso
      </Button>
      <Button variant="destructive" disabled>
        Scollega
      </Button>
    </XStack>
  ),
};

/**
 * I due temi affiancati, che è la cosa che il selettore in barra **non** sa
 * mostrare: lì se ne vede uno per volta, e le differenze di peso fra chiaro e
 * scuro si notano solo guardandoli insieme.
 */
export const DueTemi: Story = {
  parameters: { theme: 'scuro' },
  render: () => (
    <XStack gap="$4" items="flex-start">
      <YStack gap="$2" bg="$background" p="$3" rounded="$4">
        <Text color="$color11" fontSize={12}>
          scuro
        </Text>
        <Button>Aggiungi</Button>
        <Button variant="outline">Contorno</Button>
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
export const Interazione: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Aggiungi un gioco'));
    await expect(args.onPress).toHaveBeenCalledTimes(1);
  },
};

export const DisabilitatoNonRisponde: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Aggiungi un gioco'));
    await expect(args.onPress).not.toHaveBeenCalled();
  },
};
