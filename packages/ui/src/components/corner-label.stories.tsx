import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { Bookmark, Play } from '../icons';
import { Text, Theme, XStack, YStack } from '../primitives';
import { CornerLabel } from './corner-label';
import { Badge } from './badge';

const meta = {
  title: 'Components/CornerLabel',
  component: CornerLabel,
  args: {
    children: 'Da giocare',
  },
} satisfies Meta<typeof CornerLabel>;

export default meta;
type Story = StoryObj<typeof meta>;

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

export const Floating: Story = {
  render: () => (
    <XStack gap="$4" flexWrap="wrap">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack p="$3" bg="$background" rounded="$4">
            <Cover>
              <CornerLabel floating maxW={88} icon={Play}>
                In corso
              </CornerLabel>
            </Cover>
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};

export const FloatingLongLabel: Story = {
  render: () => (
    <Cover>
      <CornerLabel floating maxW={88} icon={Bookmark}>
        Non mi interessa
      </CornerLabel>
    </Cover>
  ),
};

export const Compact: Story = {
  render: () => (
    <XStack gap="$4" flexWrap="wrap">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <XStack gap="$3" p="$3" bg="$background" rounded="$4">
            {['In corso', 'Non mi interessa'].map((label) => (
              <Cover key={label}>
                <CornerLabel floating compact maxW={96} icon={Bookmark}>
                  {label}
                </CornerLabel>
                <XStack position="absolute" b={4} l={4}>
                  <Badge variant="secondary">Remaster</Badge>
                </XStack>
              </Cover>
            ))}
          </XStack>
        </Theme>
      ))}
    </XStack>
  ),
};
