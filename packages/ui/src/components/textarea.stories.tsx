import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Text, Theme, XStack, YStack } from '../primitives';
import { Label } from './label';
import { Textarea, type TextareaProps } from './textarea';

// Annotato e non inferito, come per l'Input (TS7056).
const meta: Meta<TextareaProps> = {
  title: 'Components/Textarea',
  component: Textarea,
  args: {
    placeholder: 'Da rigiocare con il DLC',
    'aria-label': 'Note',
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
type Story = StoryObj<TextareaProps>;

export const Default: Story = {};

/** L'unico uso: le note nella modifica del gioco. */
export const WithLabel: Story = {
  render: () => (
    <YStack gap="$2">
      <Label htmlFor="note">Note</Label>
      <Textarea id="note" placeholder="Scrivi qualcosa" maxLength={2000} />
    </YStack>
  ),
};

export const Disabled: Story = {
  args: { disabled: true, value: 'Non modificabile' },
};

/** Chiaro e scuro affiancati. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4" width={240}>
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <Textarea aria-label={`Note ${name}`} placeholder="Vuoto" />
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};

/**
 * Il contratto con la schermata: `onChange` con l'evento del DOM, e l'a capo
 * resta nel testo invece di inviare qualcosa.
 */
export const Typing: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <Textarea
        aria-label="Note"
        value={value}
        onChange={(event) => setValue(event.target.value)}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const textarea = canvas.getByLabelText('Note');
    await userEvent.type(textarea, 'prima riga{enter}seconda');
    await expect(textarea).toHaveValue('prima riga\nseconda');
    await expect(
      parseFloat(getComputedStyle(textarea).height),
    ).toBeGreaterThanOrEqual(64);
  },
};
