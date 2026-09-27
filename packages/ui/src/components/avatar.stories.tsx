import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, within } from 'storybook/test';

import { Text, Theme, XStack, YStack } from '../primitives';
import { Avatar, initials } from './avatar';

const meta = {
  title: 'Components/Avatar',
  component: Avatar,
  args: {
    name: 'Simone Rossi',
  },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Senza immagine, com'è quasi sempre: le iniziali. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText('SR')).toBeInTheDocument();
    // Un nome solo dà una lettera, e gli spazi in più non contano.
    await expect(initials('  Ada ')).toBe('A');
    await expect(initials('Anna Maria Rossi')).toBe('AM');
  },
};

/** La misura della barra (32) e quella più piccola di una riga. */
export const Sizes: Story = {
  render: (args) => (
    <XStack gap="$3" items="center">
      <Avatar {...args} size={24} />
      <Avatar {...args} size={32} />
      <Avatar {...args} size={40} />
    </XStack>
  ),
};

/** Chiaro e scuro affiancati: il contrasto delle iniziali lo misura axe. */
export const Themes: Story = {
  render: (args) => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4">
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <XStack gap="$2" items="center">
              <Avatar {...args} />
              <Text color="$color12">{args.name}</Text>
            </XStack>
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};
