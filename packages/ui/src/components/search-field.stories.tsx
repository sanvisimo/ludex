import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';

import { Text, Theme, XStack, YStack } from '../primitives';
import {
  SearchField,
  SearchFieldGroup,
  SearchFieldItem,
  SearchFieldMessage,
} from './search-field';

// Due fonti, come nella ricerca globale: i giochi che ci sono già e quelli
// che si potrebbero aggiungere.
const nostri = [
  { id: 'hades', name: 'Hades', year: 2020 },
  { id: 'hades-ii', name: 'Hades II', year: 2025 },
];
const altrove = [
  { id: 'igdb:1', name: 'Hades: Battle Out of Hell', year: 2003 },
];

type Args = {
  onSelect: (item: string) => void;
  onSubmit: (value: string) => void;
  initial: string;
};

function Results({ query }: { query: string }) {
  const needle = query.trim().toLowerCase();
  const a = nostri.filter((game) => game.name.toLowerCase().includes(needle));
  const b = altrove.filter((game) => game.name.toLowerCase().includes(needle));

  if (a.length + b.length === 0)
    return <SearchFieldMessage>Nessun gioco</SearchFieldMessage>;

  const row = (game: { id: string; name: string; year: number }) => (
    <SearchFieldItem key={game.id} value={game.id}>
      <Text flex={1} fontSize={14} lineHeight={20} color="$color12">
        {game.name}
      </Text>
      <Text fontSize={12} color="$color11">
        {game.year}
      </Text>
    </SearchFieldItem>
  );

  return (
    <>
      {a.length > 0 && (
        <SearchFieldGroup label="In Ludex">{a.map(row)}</SearchFieldGroup>
      )}
      {b.length > 0 && (
        <SearchFieldGroup label="Su IGDB">{b.map(row)}</SearchFieldGroup>
      )}
    </>
  );
}

function itemsFor(query: string) {
  const needle = query.trim().toLowerCase();
  return [...nostri, ...altrove]
    .filter((game) => game.name.toLowerCase().includes(needle))
    .map((game) => game.id);
}

const meta: Meta<Args> = {
  title: 'Components/SearchField',
  args: { onSelect: fn(), onSubmit: fn(), initial: '' },
  render: function Render({ onSelect, onSubmit, initial }) {
    const [value, setValue] = useState(initial);
    return (
      <YStack width={360}>
        <SearchField
          aria-label="Cerca un gioco"
          placeholder="Cerca un gioco"
          clearLabel="Svuota"
          value={value}
          onValueChange={setValue}
          options={itemsFor(value)}
          onSelect={onSelect}
          onSubmit={onSubmit}
          minLength={2}
        >
          <Results query={value} />
        </SearchField>
      </YStack>
    );
  },
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

/** Chiaro e scuro affiancati, col testo scritto e la tendina chiusa. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4" width={280}>
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <SearchField
              aria-label={`Cerca ${name}`}
              clearLabel={`Svuota ${name}`}
              value="Hades"
              onValueChange={() => {}}
              options={[]}
              onSelect={() => {}}
              onSubmit={() => {}}
            />
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};

/**
 * Scrivere apre la tendina, a gruppi; Invio senza aver scelto una voce
 * cerca, e la chiude.
 */
export const TypeAndSubmit: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox');

    // Sotto i due caratteri la tendina non si apre.
    await userEvent.type(input, 'h');
    await expect(input).toHaveAttribute('aria-expanded', 'false');

    await userEvent.type(input, 'ades');
    // La tendina sta in un portale, fuori dal canvas della storia.
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(3));
    await expect(
      screen.getByRole('group', { name: 'Su IGDB' }),
    ).toBeInTheDocument();

    await userEvent.keyboard('{Enter}');
    await expect(args.onSubmit).toHaveBeenCalledWith('hades');
    await expect(args.onSelect).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  },
};

/**
 * Da tastiera: la freccia giù entra nella lista, Invio sceglie la voce
 * evidenziata; la freccia su oltre la prima torna al campo. Esc chiude.
 */
export const Keyboard: Story = {
  args: { initial: 'hades' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox');
    await userEvent.click(input);
    await expect(input).toHaveAttribute('aria-expanded', 'true');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    const activeId = input.getAttribute('aria-activedescendant')!;
    await expect(document.getElementById(activeId)).toHaveTextContent(
      'Hades II',
    );

    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    await expect(input).not.toHaveAttribute('aria-activedescendant');

    await userEvent.keyboard('{Escape}');
    await expect(input).toHaveAttribute('aria-expanded', 'false');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await expect(args.onSelect).toHaveBeenCalledWith('hades');
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** Un clic su una voce la sceglie senza togliere il fuoco al campo. */
export const Click: Story = {
  args: { initial: 'hades' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox');
    await userEvent.click(input);

    await userEvent.click(
      await screen.findByRole('option', { name: /Battle Out of Hell/ }),
    );
    await expect(args.onSelect).toHaveBeenCalledWith('igdb:1');
    await expect(input).toHaveFocus();
  },
};

/** La x svuota il campo. */
export const Clear: Story = {
  args: { initial: 'hades' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Svuota' }));
    await expect(canvas.getByRole('combobox')).toHaveValue('');
  },
};
