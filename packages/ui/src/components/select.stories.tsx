import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';

import { Text, Theme, XStack, YStack } from '../primitives';
import { Label } from './label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  type SelectProps,
} from './select';

const statusLabels = {
  backlog: 'Da giocare',
  playing: 'In corso',
  played: 'Giocato',
  dropped: 'Abbandonato',
  excluded: 'Escluso',
};

// Annotato e non inferito, come per l'Input (TS7056).
const meta: Meta<SelectProps> = {
  title: 'Components/Select',
  component: Select,
  args: {
    onValueChange: fn(),
  },
};

export default meta;
type Story = StoryObj<SelectProps>;

/** Lo stato del gioco, con l'etichetta sopra come nella modifica. */
export const Default: Story = {
  render: function Render(args) {
    const [value, setValue] = useState('backlog');
    return (
      <YStack gap="$2" width={240}>
        <Label htmlFor="stato">Stato</Label>
        <Select
          items={statusLabels}
          value={value}
          onValueChange={(next) => {
            args.onValueChange?.(next);
            setValue(next);
          }}
        >
          <SelectTrigger id="stato" width="100%">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(statusLabels).map(([key, label]) => (
              <SelectItem key={key} value={key}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </YStack>
    );
  },
};

/**
 * Una voce fissa seguita da un `.map()`: è la forma di «Nessun negozio» e
 * «Nessun supporto», ed è il motivo per cui gli `index` li conta
 * `SelectContent` e non chi scrive.
 */
export const FixedPlusMapped: Story = {
  render: () => (
    <Select
      items={{ none: 'Nessun negozio', steam: 'Steam', gog: 'GOG' }}
      defaultValue="none"
    >
      <SelectTrigger aria-label="Negozio" width={160}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Nessun negozio</SelectItem>
        {['steam', 'gog'].map((store) => (
          <SelectItem key={store} value={store}>
            {store === 'steam' ? 'Steam' : 'GOG'}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  ),
};

/** Chiaro e scuro affiancati, a tendina chiusa. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4">
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <Select items={statusLabels} defaultValue="playing">
              <SelectTrigger aria-label={`Stato ${name}`} width={180}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(statusLabels).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};

/**
 * Il comportamento: il bottone mostra l'etichetta **prima** di aprirsi (è ciò
 * che fa `items`), il clic apre la tendina, scegliere una voce chiama
 * `onValueChange` col valore e aggiorna il bottone.
 */
export const Choose: Story = {
  ...Default,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('combobox');
    await expect(trigger).toHaveTextContent('Da giocare');

    await userEvent.click(trigger);
    // La tendina sta in un portale, fuori dal canvas della storia.
    const option = await screen.findByRole('option', { name: 'In corso' });
    await userEvent.click(option);

    await expect(args.onValueChange).toHaveBeenCalledWith('playing');
    await waitFor(() => expect(trigger).toHaveTextContent('In corso'));
  },
};
