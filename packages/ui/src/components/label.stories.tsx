import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';
// Il campo grezzo di Tamagui, finché il nostro Input non c'è (step 6).
import { Input } from 'tamagui';

import { Text, Theme, XStack, YStack } from '../primitives';
import { Label } from './label';

const meta = {
  title: 'Components/Label',
  component: Label,
  args: {
    children: 'Titolo',
  },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** La forma di quasi tutti gli usi: l'etichetta sopra il suo campo. */
export const WithField: Story = {
  render: () => (
    <YStack gap="$2" width={280}>
      <Label htmlFor="titolo">Titolo</Label>
      <Input id="titolo" placeholder="Hollow Knight" />
    </YStack>
  ),
};

/** Chiaro e scuro affiancati. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4">
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <Label htmlFor={`note-${name}`}>Note</Label>
            <Input id={`note-${name}`} placeholder="Da rigiocare" />
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};

/**
 * L'unico comportamento: un clic sull'etichetta porta il focus al campo. È
 * ciò che rende `htmlFor` qualcosa di più di un attributo.
 */
export const FocusesField: Story = {
  render: () => (
    <YStack gap="$2" width={280}>
      <Label htmlFor="email">Email</Label>
      <Input id="email" placeholder="nome@esempio.it" />
    </YStack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Email'));
    await expect(canvas.getByPlaceholderText('nome@esempio.it')).toHaveFocus();
  },
};
