import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, waitFor, within } from 'storybook/test';

import { Theme, XStack, YStack } from '../primitives';
import { Logo, Wordmark } from './logo';

const meta = {
  title: 'Components/Logo',
  component: Wordmark,
} satisfies Meta<typeof Wordmark>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Marchio esteso, come in cima alla barra. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('img', { name: 'PileCue' }),
    ).toBeInTheDocument();
    // Il wordmark a tracciati espone un unico nome accessibile.
    const svg = canvasElement.querySelector('svg');
    await expect(svg).toHaveAttribute('aria-label', 'PileCue');
  },
};

/** Il simbolo da solo, dalla misura della favicon in su. */
export const Sizes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-end">
      <Logo size={16} />
      <Logo size={24} />
      <Logo size={32} />
      <Logo size={64} />
      <Logo size={128} />
    </XStack>
  ),
};

/** Chiaro e scuro: il simbolo non cambia, Pile segue il tema. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4">
      {(['light', 'dark'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack bg="$background" p="$4" gap="$3" rounded="$4">
            <Wordmark />
            <Logo size={16} />
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};

/** Il CSS può risolvere il tema di sistema prima del contesto React (SSR). */
export const SystemThemeBeforeHydration: Story = {
  render: () => (
    <Theme name="light">
      <YStack
        className="t_dark"
        bg="$background"
        p="$4"
        data-testid="system-theme-logo"
      >
        <Wordmark />
      </YStack>
    </Theme>
  ),
  play: async ({ canvasElement }) => {
    const wrapper = within(canvasElement).getByTestId('system-theme-logo');
    // Prima lettera P: il contesto React resta chiaro durante tutta la prova.
    const letter = wrapper.querySelector('path:nth-last-child(7)')!;
    wrapper.style.setProperty('--color12', '#F5F6FF');
    await waitFor(() =>
      expect(getComputedStyle(letter).fill).toBe('rgb(245, 246, 255)'),
    );
    wrapper.style.setProperty('--color12', '#101426');
    await waitFor(() =>
      expect(getComputedStyle(letter).fill).toBe('rgb(16, 20, 38)'),
    );
    wrapper.style.setProperty('--color12', '#F5F6FF');
    await waitFor(() =>
      expect(getComputedStyle(letter).fill).toBe('rgb(245, 246, 255)'),
    );
  },
};
