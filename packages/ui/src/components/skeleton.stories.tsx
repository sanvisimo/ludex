import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { Text, Theme, XStack, YStack } from '../primitives';
import { Skeleton } from './skeleton';

const meta = {
  title: 'Components/Skeleton',
  component: Skeleton,
  args: {
    height: 36,
    width: 280,
  },
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Le forme che le schermate usano davvero: il titolo della pagina gioco, le
 * righe del backlog, la scheda dell'account.
 */
export const Shapes: Story = {
  render: () => (
    <YStack gap="$3" width={360}>
      <Skeleton height={36} width={256} />
      <Skeleton height={64} rounded={12} />
      <Skeleton height={64} rounded={12} />
      <Skeleton height={128} rounded={12} />
    </YStack>
  ),
};

/** Chiaro e scuro affiancati: sul chiaro un grigio troppo tenue sparisce. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4" width={240}>
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <Skeleton height={24} width={160} />
            <Skeleton height={48} rounded={12} />
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};
