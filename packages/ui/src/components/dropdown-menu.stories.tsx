import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';

import { EyeOff, SunMoon } from '../icons';
import { XStack } from '../primitives';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './dropdown-menu';

type Args = { onHide: (kind: string) => void };

const meta: Meta<Args> = {
  title: 'Components/DropdownMenu',
  args: { onHide: fn() },
};

export default meta;
type Story = StoryObj<Args>;

/**
 * Il «Nascondi come…» degli scarti: un gruppo con etichetta, un separatore,
 * e una voce fuori dal gruppo.
 */
export const Default: Story = {
  render: ({ onHide }) => (
    <XStack width={320} justify="flex-end">
      <DropdownMenu align="end">
        <DropdownMenuTrigger
          render={
            <Button size="sm" variant="ghost">
              <EyeOff size={14} />
              Nascondi
            </Button>
          }
        />
        <DropdownMenuContent width={208}>
          <DropdownMenuGroup>
            <DropdownMenuLabel>Non è un gioco</DropdownMenuLabel>
            {['App', 'Contenuto extra', 'Versione di prova', 'DLC'].map(
              (kind) => (
                <DropdownMenuItem key={kind} onClick={() => onHide(kind)}>
                  {kind}
                </DropdownMenuItem>
              ),
            )}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => onHide('unwanted')}>
            Non mi interessa
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </XStack>
  ),
};

/** Il selettore del tema: tre voci radio, la scelta ha la spunta. */
export const Radio: Story = {
  render: function Render() {
    const [theme, setTheme] = useState('system');
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon" aria-label="Tema">
              <SunMoon size={16} />
            </Button>
          }
        />
        <DropdownMenuContent width={144}>
          <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
            <DropdownMenuRadioItem value="light">Chiaro</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">Scuro</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              Sistema
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  },
};

/**
 * Il comportamento: il trigger apre, una voce chiama il suo `onClick` e il
 * menu si chiude. È la traduzione `onClick` → `onSelect` che qui si verifica.
 */
export const Choose: Story = {
  ...Default,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Nascondi'));

    // Il menu sta in un portale, fuori dal canvas della storia.
    const item = await screen.findByRole('menuitem', { name: 'DLC' });

    // `align="end"`: il bordo destro del menu coincide con quello del bottone.
    const trigger = canvas.getByText('Nascondi').closest('button')!;
    await waitFor(() =>
      expect(
        screen.getByRole('menu').getBoundingClientRect().right,
      ).toBeCloseTo(trigger.getBoundingClientRect().right, 0),
    );
    await userEvent.click(item);

    await expect(args.onHide).toHaveBeenCalledWith('DLC');
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  },
};

/** La radio: scegliere «Scuro» sposta la spunta, e riaprendo la si ritrova. */
export const ChooseRadio: Story = {
  ...Radio,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByLabelText('Tema'));
    await userEvent.click(
      await screen.findByRole('menuitemradio', { name: 'Scuro' }),
    );
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());

    await userEvent.click(canvas.getByLabelText('Tema'));
    await expect(
      await screen.findByRole('menuitemradio', { name: 'Scuro' }),
    ).toHaveAttribute('aria-checked', 'true');
  },
};
