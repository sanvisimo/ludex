import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Text, Theme, XStack, YStack } from '../primitives';
import { Button } from './button';
import { Input, type InputProps } from './input';
import { Label } from './label';

// Annotato e non inferito: il tipo di `Input` è così grande che TypeScript si
// rifiuta di scriverlo da solo (TS7056).
const meta: Meta<InputProps> = {
  title: 'Components/Input',
  component: Input,
  args: {
    placeholder: 'Hollow Knight',
    'aria-label': 'Titolo',
  },
  argTypes: {
    disabled: { control: 'boolean' },
  },
  decorators: [
    (Story) => (
      <YStack width={320}>
        <Story />
      </YStack>
    ),
  ],
};

export default meta;
type Story = StoryObj<InputProps>;

export const Default: Story = {};

/** La forma di quasi tutti gli usi: etichetta sopra, campo sotto. */
export const WithLabel: Story = {
  render: () => (
    <YStack gap="$2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="nome@esempio.it" />
    </YStack>
  ),
};

/** Campo e bottone sulla stessa riga: per questo hanno la stessa altezza. */
export const WithButton: Story = {
  render: () => (
    <XStack gap="$2">
      <Input flex={1} aria-label="Cerca" placeholder="Cerca su IGDB" />
      <Button variant="outline">Cerca</Button>
    </XStack>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, value: 'Non modificabile' },
};

/** Chiaro e scuro affiancati: il bordo deve vedersi su entrambi. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4" width={240}>
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <Input aria-label={`Titolo ${name}`} placeholder="Vuoto" />
            <Input aria-label={`Note ${name}`} defaultValue="Scritto" />
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};

/**
 * Il contratto con le schermate: `onChange` riceve l'**evento** del DOM, come
 * con l'`<input>` di prima, e `event.target.value` è il testo.
 */
export const Typing: Story = {
  args: { onChange: fn() },
  render: function Render(args) {
    const [value, setValue] = useState('');
    return (
      <YStack gap="$2">
        <Input
          aria-label="Titolo"
          value={value}
          onChange={(event) => {
            args.onChange?.(event);
            setValue(event.target.value);
          }}
        />
        <Text color="$color11" fontSize={12}>
          {value ? `Hai scritto: ${value}` : 'Vuoto'}
        </Text>
      </YStack>
    );
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Titolo');
    await userEvent.type(input, 'Celeste');
    await expect(input).toHaveValue('Celeste');
    await expect(canvas.getByText('Hai scritto: Celeste')).toBeInTheDocument();
    await expect(args.onChange).toHaveBeenCalledTimes(7);
    await expect(getComputedStyle(input).height).toBe('32px');
  },
};
