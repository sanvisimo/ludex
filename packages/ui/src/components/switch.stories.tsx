import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';

import { Text, Theme, XStack, YStack } from '../primitives';
import { Label } from './label';
import { Switch, type SwitchProps } from './switch';

// Annotato e non inferito, come per l'Input (TS7056).
const meta: Meta<SwitchProps> = {
  title: 'Components/Switch',
  component: Switch,
  args: {
    'aria-label': 'Aggiorna automaticamente',
    onCheckedChange: fn(),
  },
  argTypes: {
    checked: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

export default meta;
type Story = StoryObj<SwitchProps>;

export const Default: Story = {};

/**
 * La forma degli usi veri: l'interruttore con la sua etichetta **accanto**,
 * legati da `id` e `htmlFor`.
 */
export const WithLabel: Story = {
  render: () => (
    <XStack gap="$3" items="center">
      <Switch id="auto-sync" defaultChecked />
      <Label htmlFor="auto-sync">Aggiorna automaticamente la libreria</Label>
    </XStack>
  ),
};

/** Spento, acceso, e i due disabilitati: su PSN l'account segue il generale. */
export const States: Story = {
  render: () => (
    <XStack gap="$4" items="center">
      <Switch aria-label="Spento" />
      <Switch aria-label="Acceso" defaultChecked />
      <Switch aria-label="Spento disabilitato" disabled />
      <Switch aria-label="Acceso disabilitato" defaultChecked disabled />
    </XStack>
  ),
};

/** Chiaro e scuro affiancati: il binario spento deve vedersi su entrambi. */
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
              <Switch aria-label={`Spento ${name}`} />
              <Switch aria-label={`Acceso ${name}`} defaultChecked />
            </XStack>
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};

/**
 * Il comportamento: un clic accende, chiama `onCheckedChange(true)` e sposta
 * il pallino dall'altra parte — che è la cosa che si rompe quando si toccano
 * le misure, perché la distanza la calcola Tamagui dalla larghezza.
 */
export const Toggle: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const control = canvas.getByRole('switch');
    const thumb = control.firstElementChild!.firstElementChild!;
    const start = thumb.getBoundingClientRect().left;
    const offColor = getComputedStyle(control).backgroundColor;

    await userEvent.click(control);
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true);
    await expect(control).toHaveAttribute('aria-checked', 'true');
    await expect(getComputedStyle(control).backgroundColor).not.toBe(offColor);
    await waitFor(() =>
      expect(thumb.getBoundingClientRect().left - start).toBeCloseTo(14, 0),
    );
  },
};

export const DisabledNotRespond: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('switch'));
    await expect(args.onCheckedChange).not.toHaveBeenCalled();
  },
};
