import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, fn, screen, userEvent, waitFor, within } from 'storybook/test';

import { EyeOff, Library, SunMoon, Trash2, User } from '../icons';
import { XStack } from '../primitives';
import { Button } from './button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './dialog';
import { Input } from './input';
import { Label } from './label';
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

export const WithIcons: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost">Menu</Button>} />
      <DropdownMenuContent width={208}>
        <DropdownMenuItem icon={<Library size={16} />}>
          Backlog
        </DropdownMenuItem>
        <DropdownMenuItem icon={<User size={16} />}>Account</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Menu'));
    const item = await screen.findByRole('menuitem', { name: 'Backlog' });
    const icon = item.querySelector('svg')!.getBoundingClientRect();
    const label = within(item).getByText('Backlog').getBoundingClientRect();
    await expect(icon.right).toBeLessThan(label.left);
    await expect(icon.top + icon.height / 2).toBeCloseTo(
      label.top + label.height / 2,
      0,
    );
  },
};

export const Destructive: Story = {
  render: ({ onHide }) => (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost">Menu</Button>} />
      <DropdownMenuContent width={208}>
        <DropdownMenuItem icon={<User size={16} />}>Rinomina</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          destructive
          icon={<Trash2 size={16} color="red11" />}
          onClick={() => onHide('delete')}
        >
          Elimina
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Menu'));
    const item = await screen.findByRole('menuitem', { name: 'Elimina' });
    await expect(item.querySelector('svg')).not.toBeNull();
    // Rosso, e diverso dalle voci normali: non si indovina da un colore
    // preciso, ma il testo non deve avere il colore del testo ordinario.
    const normal = await screen.findByRole('menuitem', { name: 'Rinomina' });
    await expect(
      getComputedStyle(within(item).getByText('Elimina')).color,
    ).not.toBe(getComputedStyle(within(normal).getByText('Rinomina')).color);
    await userEvent.click(item);
    await expect(args.onHide).toHaveBeenCalledWith('delete');
  },
};

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

export const Choose: Story = {
  ...Default,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Nascondi'));

    const item = await screen.findByRole('menuitem', { name: 'DLC' });

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

export const OpensDialog: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button variant="ghost">Azioni</Button>}
          />
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setOpen(true)}>
              Rinomina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent closeLabel="Chiudi">
            <DialogHeader>
              <DialogTitle>Rinomina la lista</DialogTitle>
            </DialogHeader>
            <Label htmlFor="nome-lista">Nome</Label>
            <Input id="nome-lista" defaultValue="La mia lista" autoFocus />
            <Button onPress={() => setOpen(false)}>Salva</Button>
          </DialogContent>
        </Dialog>
      </>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Azioni' }));
    await userEvent.click(
      await screen.findByRole('menuitem', { name: 'Rinomina' }),
    );
    const input = await screen.findByRole('textbox', { name: 'Nome' });
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
    // Lascia finire anche il ripristino del focus del menu dopo lo smontaggio.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
    await expect(input).toHaveFocus();
    await userEvent.tab();
    const dialog = screen.getByRole('dialog', { name: 'Rinomina la lista' });
    await expect(dialog.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  },
};
