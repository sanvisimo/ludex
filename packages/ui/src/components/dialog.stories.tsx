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

/** La forma di «Aggiungi gioco»: trigger, intestazione, un campo, la fascia. */
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

/**
 * Aperta da fuori, com'è la maggior parte degli usi: `open` legato a una riga
 * scelta (`entry !== null`), senza trigger. Parte aperta, così la si vede —
 * e la si fotografa — senza cliccare.
 */
export const Controlled: Story = {
  render: function Render() {
    const [open, setOpen] = useState(true);
    return (
      <>
        <Button variant="outline" onPress={() => setOpen(true)}>
          Rimuovi Hollow Knight
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent closeLabel="Chiudi">
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

/**
 * Il comportamento: il trigger apre una finestra col suo nome (dal titolo),
 * Esc la chiude, la x la chiude.
 */
export const OpenAndClose: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByText('Aggiungi gioco'));
    // Il pannello sta in un portale, fuori dal canvas della storia.
    const dialog = await screen.findByRole('dialog', {
      name: 'Aggiungi un gioco',
    });
    // Entra in dissolvenza: visibile a transizione finita, non subito.
    await waitFor(() => expect(dialog).toBeVisible());

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    await userEvent.click(canvas.getByText('Aggiungi gioco'));
    await userEvent.click(await screen.findByLabelText('Chiudi'));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  },
};
