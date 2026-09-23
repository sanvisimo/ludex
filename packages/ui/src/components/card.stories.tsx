import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { Text, Theme, XStack, YStack } from '../primitives';
import { Badge } from './badge';
import { Button } from './button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from './card';

const meta = {
  title: 'Components/Card',
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card width={360}>
      <CardHeader>
        <CardTitle>Aggiornamento automatico</CardTitle>
        <CardDescription>
          Reimporta le librerie collegate ogni pochi giorni.
        </CardDescription>
      </CardHeader>
      <CardContent gap="$3">
        <Text color="$color12" fontSize={14}>
          PSN ogni tre giorni, gli altri negozi ogni sette.
        </Text>
        <Button variant="outline" self="flex-start">
          Aggiorna adesso
        </Button>
      </CardContent>
    </Card>
  ),
};

/** Solo contenuto, senza intestazione: la forma delle righe in home. */
export const ContentOnly: Story = {
  render: () => (
    <Card width={360}>
      <CardContent>
        <Text color="$color11" fontSize={14}>
          Nessun gioco nel backlog.
        </Text>
      </CardContent>
    </Card>
  ),
};

/** La scheda che è un link: si schiarisce al passaggio del mouse. */
export const Interactive: Story = {
  render: () => (
    <YStack gap="$2" width={360}>
      {['Hollow Knight', 'Disco Elysium'].map((name) => (
        <Card key={name} interactive>
          <CardContent gap="$1">
            <Text color="$color12" fontSize={14} fontWeight="500">
              {name}
            </Text>
            <Badge variant="secondary">PC · Steam</Badge>
          </CardContent>
        </Card>
      ))}
    </YStack>
  ),
};

/** Chiaro e scuro affiancati: la scheda deve staccarsi dal fondo in entrambi. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4">
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <Card width={260}>
              <CardHeader>
                <CardTitle>Voti della critica</CardTitle>
                <CardDescription>OpenCritic · Metacritic</CardDescription>
              </CardHeader>
              <CardContent>
                <Text color="$color12" fontSize={14}>
                  88 su PC
                </Text>
              </CardContent>
            </Card>
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};
