import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { Text, Theme, XStack, YStack } from '../primitives';
import { Alert, AlertDescription, AlertTitle } from './alert';

const meta = {
  title: 'Components/Alert',
  component: Alert,
  argTypes: {
    variant: {
      control: 'inline-radio',
      options: ['default', 'destructive'],
    },
  },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <Alert {...args} width={360}>
      <AlertTitle>Import in corso</AlertTitle>
      <AlertDescription>
        La libreria Steam si aggiorna in background.
      </AlertDescription>
    </Alert>
  ),
};

/** L'unico uso vero: l'errore sotto il form di login e registrazione. */
export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" width={360}>
      <AlertDescription>Email o password non validi.</AlertDescription>
    </Alert>
  ),
};

/** Chiaro e scuro affiancati: il rosso deve reggere il contrasto su entrambi. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4" width={280}>
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <Alert>
              <AlertTitle>Import in corso</AlertTitle>
              <AlertDescription>Steam, 452 giochi.</AlertDescription>
            </Alert>
            <Alert variant="destructive">
              <AlertTitle>Collegamento scaduto</AlertTitle>
              <AlertDescription>Ricollega l’account PSN.</AlertDescription>
            </Alert>
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};
