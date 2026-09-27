import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { EyeOff, Gamepad2, SearchX } from '../icons';
import { YStack } from '../primitives';
import { Button } from './button';
import { EmptyState, type EmptyStateProps } from './empty-state';

const meta: Meta<EmptyStateProps> = {
  title: 'Components/EmptyState',
  component: EmptyState,
  decorators: [
    (Story) => (
      <YStack width={560}>
        <Story />
      </YStack>
    ),
  ],
};

export default meta;
type Story = StoryObj<EmptyStateProps>;

/** Il backlog vuoto: nessun gioco, ancora. */
export const Empty: Story = {
  args: {
    icon: <Gamepad2 size={24} color="$color11" />,
    title: 'Il backlog è vuoto',
    description:
      'Aggiungi un gioco a mano o collega una libreria dalla pagina Account.',
  },
};

/** Nessun gioco passa i filtri: l'unico caso con una via d'uscita. */
export const NoMatch: Story = {
  args: {
    icon: <SearchX size={24} color="$color11" />,
    title: 'Nessun gioco corrisponde ai filtri',
    description: 'Prova ad allargare la ricerca o a togliere qualche filtro.',
    action: <Button variant="outline">Azzera i filtri</Button>,
  },
};

/** Solo il titolo: nessun nascosto. */
export const TitleOnly: Story = {
  args: {
    icon: <EyeOff size={24} color="$color11" />,
    title: 'Nessun gioco nascosto',
  },
};
