import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { X } from '../icons';
import { Text, Theme, XStack, YStack } from '../primitives';
import { Badge } from './badge';
import { Button } from './button';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: {
    children: 'PS5',
  },
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['default', 'secondary', 'outline'],
    },
  },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Variants: Story = {
  render: () => (
    <XStack gap="$3" items="center" flexWrap="wrap">
      <Badge>Default</Badge>
      <Badge variant="secondary">Secondary</Badge>
      <Badge variant="outline">Outline</Badge>
    </XStack>
  ),
};

/**
 * Il caso di `ownership-badges`: la x di rimozione dentro il badge. È un
 * bottone di sola icona, quindi l'`aria-label` va messo a mano — axe non se ne
 * accorgerebbe, perché il glifo gli basta come nome.
 */
export const WithRemove: Story = {
  render: () => (
    <XStack gap="$3" items="center" flexWrap="wrap">
      <Badge variant="secondary" pr={2}>
        PC · Steam
        <Button
          variant="ghost"
          size="icon-xs"
          height={16}
          width={16}
          rounded={999}
          aria-label="Rimuovi PC · Steam"
        >
          <X size={12} />
        </Button>
      </Badge>
      <Badge variant="secondary" pr={2}>
        PS5 · PSN · PS Plus
        <Button
          variant="ghost"
          size="icon-xs"
          height={16}
          width={16}
          rounded={999}
          aria-label="Rimuovi PS5 · PSN · PS Plus"
        >
          <X size={12} />
        </Button>
      </Badge>
    </XStack>
  ),
};

/** Chiaro e scuro affiancati, come per il Button. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4">
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <XStack gap="$2">
              <Badge>Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
            </XStack>
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};
