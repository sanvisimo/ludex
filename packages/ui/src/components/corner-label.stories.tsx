import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { Bookmark, Play } from '../icons';
import { Text, Theme, XStack, YStack } from '../primitives';
import { CornerLabel } from './corner-label';

const meta = {
  title: 'Components/CornerLabel',
  component: CornerLabel,
  args: {
    children: 'Da giocare',
  },
} satisfies Meta<typeof CornerLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Il contenitore fa da copertina: relativo e con il suo raggio. */
function Cover({ children }: { children: React.ReactNode }) {
  return (
    <YStack
      position="relative"
      width={104}
      height={148}
      rounded={6}
      overflow="hidden"
      bg="$color5"
    >
      {children}
    </YStack>
  );
}

export const Default: Story = {
  render: (args) => (
    <Cover>
      <CornerLabel icon={Bookmark} {...args} />
    </Cover>
  ),
};

/** Le etichette di stato più lunghe, su una copertina stretta: l'ellissi. */
export const Lengths: Story = {
  render: () => (
    <XStack gap="$3">
      <Cover>
        <CornerLabel icon={Play}>In corso</CornerLabel>
      </Cover>
      <Cover>
        <CornerLabel icon={Bookmark}>Non mi interessa</CornerLabel>
      </Cover>
    </XStack>
  ),
};

/** Chiaro e scuro affiancati, come per il Badge. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4">
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <Cover>
              <CornerLabel icon={Play}>In corso</CornerLabel>
            </Cover>
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};
