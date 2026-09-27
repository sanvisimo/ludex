import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, within } from 'storybook/test';

import { Theme, XStack, YStack } from '../primitives';
import { Logo, Wordmark } from './logo';

const meta = {
  title: 'Components/Logo',
  component: Wordmark,
} satisfies Meta<typeof Wordmark>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Simbolo e nome, come in cima alla barra. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText('Ludex')).toBeInTheDocument();
    // Il simbolo è decorativo: il nome accanto basta.
    const svg = canvasElement.querySelector('svg');
    await expect(svg).toHaveAttribute('aria-hidden', 'true');
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

/** Chiaro e scuro: il simbolo non cambia, il nome sì. */
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
