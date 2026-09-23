import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';

import { Text, Theme, XStack, YStack } from '../primitives';
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from './combobox';
import { Label } from './label';

const platforms = [
  { slug: 'pc_windows', name: 'PC (Windows)' },
  { slug: 'ps4', name: 'PlayStation 4' },
  { slug: 'ps5', name: 'PlayStation 5' },
  { slug: 'switch', name: 'Nintendo Switch' },
  { slug: 'switch_2', name: 'Nintendo Switch 2' },
  { slug: 'xbox_series', name: 'Xbox Series X|S' },
  { slug: 'xbox_one', name: 'Xbox One' },
  { slug: 'steam_deck', name: 'Steam Deck' },
];
const slugs = platforms.map((platform) => platform.slug);
const nameBySlug = new Map(platforms.map((p) => [p.slug, p.name]));
const label = (slug: string) => nameBySlug.get(slug) ?? slug;

type Args = {
  onValueChange: (value: string | null) => void;
  initial: string | null;
  showClear: boolean;
};

const meta: Meta<Args> = {
  title: 'Components/Combobox',
  args: { onValueChange: fn(), initial: null, showClear: false },
  render: function Render({ onValueChange, initial, showClear }) {
    const [value, setValue] = useState<string | null>(initial);
    return (
      <YStack gap="$2" width={280}>
        <Label htmlFor="piattaforma">Piattaforma</Label>
        <Combobox
          items={slugs}
          value={value}
          onValueChange={(next) => {
            onValueChange(next);
            setValue(next);
          }}
          itemToStringLabel={label}
        >
          <ComboboxInput
            id="piattaforma"
            aria-label="Piattaforma"
            placeholder="Scegli una piattaforma"
            showClear={showClear}
            triggerLabel="Apri l’elenco"
            clearLabel="Svuota"
          />
          <ComboboxContent>
            <ComboboxEmpty>Nessuna piattaforma</ComboboxEmpty>
            <ComboboxList>
              {(slug) => (
                <ComboboxItem key={slug} value={slug}>
                  {label(slug)}
                </ComboboxItem>
              )}
            </ComboboxList>
          </ComboboxContent>
        </Combobox>
      </YStack>
    );
  },
};

export default meta;
type Story = StoryObj<Args>;

export const Default: Story = {};

/** Con una scelta già fatta e la x per svuotarla. */
export const WithValue: Story = {
  args: { initial: 'ps5', showClear: true },
};

/** Chiaro e scuro affiancati, a tendina chiusa. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4" width={240}>
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <Combobox
              items={slugs}
              value="switch"
              onValueChange={() => {}}
              itemToStringLabel={label}
            >
              <ComboboxInput
                aria-label={`Piattaforma ${name}`}
                triggerLabel={`Apri l’elenco ${name}`}
              />
              <ComboboxContent>
                <ComboboxList>
                  {(slug) => (
                    <ComboboxItem key={slug} value={slug}>
                      {label(slug)}
                    </ComboboxItem>
                  )}
                </ComboboxList>
              </ComboboxContent>
            </Combobox>
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};

/** Scrivere filtra; un clic su una voce la sceglie e il campo ne mostra il nome. */
export const FilterAndClick: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox');

    await userEvent.type(input, 'switch');
    // La tendina sta in un portale, fuori dal canvas della storia.
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(2));

    // Sotto il campo e larga quanto lui (meno padding e bordo della tendina),
    // anche se sta in un portale.
    const group = input.closest('[role="group"]')!.getBoundingClientRect();
    await waitFor(() => {
      const list = screen.getByRole('listbox').getBoundingClientRect();
      expect(list.top).toBeGreaterThanOrEqual(group.bottom);
      expect(list.width).toBeCloseTo(group.width - 10, -1);
    });

    await userEvent.click(
      screen.getByRole('option', { name: 'Nintendo Switch 2' }),
    );
    await expect(args.onValueChange).toHaveBeenCalledWith('switch_2');
    await expect(input).toHaveValue('Nintendo Switch 2');
    await expect(input).toHaveFocus();
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
  },
};

/**
 * Da tastiera: freccia giù apre, le frecce spostano la voce evidenziata
 * (`aria-activedescendant`), Invio sceglie. Esc chiude senza scegliere e
 * rimette nel campo la voce di prima.
 */
export const Keyboard: Story = {
  args: { initial: 'ps4' },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole('combobox');
    await userEvent.click(input);

    await userEvent.keyboard('{ArrowDown}');
    await expect(input).toHaveAttribute('aria-expanded', 'true');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    const activeId = input.getAttribute('aria-activedescendant')!;
    await expect(document.getElementById(activeId)).toHaveTextContent(
      'PlayStation 5',
    );
    await userEvent.keyboard('{Enter}');
    await expect(args.onValueChange).toHaveBeenCalledWith('ps5');
    await expect(input).toHaveValue('PlayStation 5');

    await userEvent.type(input, 'xbox');
    await userEvent.keyboard('{Escape}');
    await expect(input).toHaveAttribute('aria-expanded', 'false');
    await expect(input).toHaveValue('PlayStation 5');
  },
};

/** Un filtro che non trova niente dice perché la lista è vuota. */
export const Empty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('combobox'), 'dreamcast');
    await expect(
      await screen.findByText('Nessuna piattaforma'),
    ).toBeInTheDocument();
  },
};
