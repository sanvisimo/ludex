import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Text, Theme, XStack, YStack } from '../primitives';
import { Checkbox, type CheckboxProps } from './checkbox';
import { Label } from './label';

const meta: Meta<CheckboxProps> = {
  title: 'Components/Checkbox',
  component: Checkbox,
  args: {
    'aria-label': 'Mai giocato',
    onCheckedChange: fn(),
  },
  argTypes: {
    checked: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<CheckboxProps>;

export const Default: Story = {};

/** La forma degli usi veri: una lista di spunte, ciascuna con l'etichetta accanto. */
export const List: Story = {
  render: () => (
    <YStack gap="$2">
      {['PC', 'PlayStation 5', 'Nintendo Switch'].map((name, index) => (
        <XStack key={name} gap="$2" items="center">
          <Checkbox id={`platform-${index}`} defaultChecked={index === 1} />
          <Label htmlFor={`platform-${index}`}>{name}</Label>
        </XStack>
      ))}
    </YStack>
  ),
};

export const States: Story = {
  render: () => (
    <XStack gap="$4" items="center">
      <Checkbox aria-label="Spenta" />
      <Checkbox aria-label="Accesa" defaultChecked />
      <Checkbox aria-label="Spenta disabilitata" disabled />
      <Checkbox aria-label="Accesa disabilitata" defaultChecked disabled />
    </XStack>
  ),
};

/** Chiaro e scuro affiancati: il bordo spento deve vedersi su entrambi. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4">
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <XStack gap="$3">
              <Checkbox aria-label={`Spenta ${name}`} />
              <Checkbox aria-label={`Accesa ${name}`} defaultChecked />
            </XStack>
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};

/** Un clic accende, cambia il fondo e chiama `onCheckedChange(true)`. */
export const Toggle: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole('checkbox');
    const offColor = getComputedStyle(control).backgroundColor;

    await userEvent.click(control);
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true);
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await expect(getComputedStyle(control).backgroundColor).not.toBe(offColor);
  },
};

/** Il clic sull'etichetta accende la spunta, come con un `input` vero. */
export const LabelClick: Story = {
  render: (args) => (
    <XStack gap="$2" items="center">
      <Checkbox id="never-played" onCheckedChange={args.onCheckedChange} />
      <Label htmlFor="never-played">Mai giocato</Label>
    </XStack>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Mai giocato'));
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true);
  },
};

export const DisabledNotRespond: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    // Tamagui la rende `pointer-events: none`: il clic non arriva nemmeno.
    await userEvent.click(canvas.getByRole('checkbox'), {
      pointerEventsCheck: 0,
    });
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
  },
};
