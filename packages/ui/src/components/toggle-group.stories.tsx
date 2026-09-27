import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { LayoutGrid, List, Rows3 } from '../icons';
import { Text } from '../primitives';
import {
  ToggleGroup,
  ToggleGroupItem,
  type ToggleGroupProps,
} from './toggle-group';

const meta: Meta<ToggleGroupProps> = {
  title: 'Components/ToggleGroup',
  component: ToggleGroup,
  args: {
    label: 'Vista',
    onValueChange: fn(),
  },
};

export default meta;
type Story = StoryObj<ToggleGroupProps>;

/** La scelta della vista del backlog: tre icone, ognuna col suo nome. */
function Views(args: ToggleGroupProps) {
  const [value, setValue] = useState('rows');
  return (
    <ToggleGroup
      label={args.label}
      value={value}
      onValueChange={(next) => {
        setValue(next);
        args.onValueChange(next);
      }}
    >
      <ToggleGroupItem value="rows" aria-label="Righe">
        <Rows3 size={16} color="$color12" />
      </ToggleGroupItem>
      <ToggleGroupItem value="grid" aria-label="Griglia">
        <LayoutGrid size={16} color="$color12" />
      </ToggleGroupItem>
      <ToggleGroupItem value="compact" aria-label="Compatta">
        <List size={16} color="$color12" />
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

export const Default: Story = {
  render: (args) => <Views {...args} />,
};

function Direction() {
  const [value, setValue] = useState('asc');
  return (
    <ToggleGroup label="Direzione" value={value} onValueChange={setValue}>
      <ToggleGroupItem value="asc">
        <Text fontSize={13} color="$color12">
          Crescente
        </Text>
      </ToggleGroupItem>
      <ToggleGroupItem value="desc">
        <Text fontSize={13} color="$color12">
          Decrescente
        </Text>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

/** Con il testo: per quando le icone da sole non bastano. */
export const WithText: Story = {
  render: () => <Direction />,
};

/**
 * Un clic sceglie; ripremere la vista accesa **non** la spegne, perché una
 * lista senza vista non esiste.
 */
export const Choose: Story = {
  render: (args) => <Views {...args} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const rows = canvas.getByRole('button', { name: 'Righe' });
    const grid = canvas.getByRole('button', { name: 'Griglia' });
    await expect(rows).toHaveAttribute('aria-pressed', 'true');
    await expect(grid).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(grid);
    await expect(args.onValueChange).toHaveBeenLastCalledWith('grid');
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
    await expect(rows).toHaveAttribute('aria-pressed', 'false');

    await userEvent.click(grid);
    await expect(grid).toHaveAttribute('aria-pressed', 'true');
  },
};
