import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { YStack } from '../primitives';
import { Button } from './button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  type DialogProps,
} from './dialog';
import { Input } from './input';
import { Label } from './label';

// Annotato e non inferito, come per l'Input (TS7056).
const meta: Meta<DialogProps> = {
  title: 'Components/Dialog',
  component: Dialog,
};

export default meta;
type Story = StoryObj<DialogProps>;

export const Default: Story = {
  render: () => (
    <Dialog>
      <DialogTrigger render={<Button>Aggiungi gioco</Button>} />
      <DialogContent closeLabel="Chiudi">
        <DialogHeader>
          <DialogTitle>Aggiungi un gioco</DialogTitle>
          <DialogDescription>
            Cercalo su IGDB e scegli la piattaforma.
          </DialogDescription>
        </DialogHeader>
        <YStack gap="$2">
          <Label htmlFor="titolo">Titolo</Label>
          <Input id="titolo" placeholder="Hollow Knight" />
        </YStack>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Annulla</Button>} />
          <Button>Aggiungi</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  ),
};

export const Controlled: Story = {
  render: function Render() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button variant="outline" onPress={() => setOpen(true)}>
          Rimuovi Hollow Knight
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent closeLabel="Chiudi" size="compact">
            <DialogHeader>
              <DialogTitle>Rimuovere Hollow Knight?</DialogTitle>
              <DialogDescription>
                Perderai il voto e le note. Il gioco tornerà al prossimo import
                di Steam.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onPress={() => setOpen(false)}>
                Nascondi
              </Button>
              <Button variant="destructive" onPress={() => setOpen(false)}>
                Rimuovi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  },
};

export const OpenAndClose: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByText('Aggiungi gioco'));
    const dialog = await screen.findByRole('dialog', {
      name: 'Aggiungi un gioco',
    });
    await waitFor(() => expect(dialog).toBeVisible());

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(canvas.getByText('Aggiungi gioco'));
    await userEvent.click(await screen.findByLabelText('Chiudi'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  },
};

export const LongForm: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <Button onPress={() => setOpen(true)}>Apri modulo lungo</Button>
        <DialogContent closeLabel="Chiudi" size="wide" maxH={360}>
          <form onSubmit={(event) => event.preventDefault()}>
            <YStack gap={20}>
              <DialogHeader>
                <DialogTitle>Modifica la tua libreria</DialogTitle>
                <DialogDescription>
                  Un modulo con molti campi.
                </DialogDescription>
              </DialogHeader>
              {Array.from({ length: 12 }, (_, index) => (
                <YStack key={index} gap={6}>
                  <Label htmlFor={`campo-${index}`}>Campo {index + 1}</Label>
                  <Input id={`campo-${index}`} />
                </YStack>
              ))}
              <DialogFooter>
                <DialogClose
                  render={<Button variant="outline">Annulla</Button>}
                />
                <Button type="submit">Salva</Button>
              </DialogFooter>
            </YStack>
          </form>
        </DialogContent>
      </Dialog>
    );
  },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', {
      name: 'Apri modulo lungo',
    });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole('dialog', {
      name: 'Modifica la tua libreria',
    });
    await waitFor(() => expect(dialog).toBeVisible());
    const close = within(dialog).getByRole('button', { name: 'Chiudi' });
    const save = within(dialog).getByRole('button', { name: 'Salva' });
    const scroller = dialog.querySelector('form')!.parentElement!;
    const checkActions = () => {
      const bounds = dialog.getBoundingClientRect();
      for (const action of [close, save]) {
        const rect = action.getBoundingClientRect();
        expect(rect.top).toBeGreaterThanOrEqual(bounds.top);
        expect(rect.bottom).toBeLessThanOrEqual(bounds.bottom);
      }
    };
    await waitFor(checkActions);
    scroller.scrollTop = scroller.scrollHeight;
    await waitFor(checkActions);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await expect(trigger).toHaveFocus();
  },
};
