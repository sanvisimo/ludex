import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { Text, XStack, YStack } from '../primitives';
import { Button } from './button';
import { Checkbox } from './checkbox';
import { Drawer, type DrawerProps } from './drawer';
import { Label } from './label';

// Annotato e non inferito, come per il Dialog.
const meta: Meta<DrawerProps> = {
  title: 'Components/Drawer',
  component: Drawer,
};

export default meta;
type Story = StoryObj<DrawerProps>;

const sections = [
  'Store',
  'Tipo',
  'Generi',
  'Temi',
  'Modalità',
  'Prospettiva',
  'Durata',
  'Voto mio',
  'Uscita',
  'Altro',
];

/**
 * Il caso per cui nasce: il pannello dei filtri, più lungo dello schermo,
 * che scorre dentro il drawer.
 */
export const Default: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="outline" onPress={() => setOpen(true)}>
          Filtri
        </Button>
        <Drawer
          open={open}
          onOpenChange={setOpen}
          title="Filtri"
          closeLabel="Chiudi"
        >
          <YStack gap={8}>
            {['PC (Windows)', 'Sony PlayStation 4', 'Sony PlayStation 5'].map(
              (name, index) => (
                <XStack key={name} items="center" gap={8}>
                  <Checkbox id={`platform-${index}`} />
                  <Label htmlFor={`platform-${index}`}>{name}</Label>
                </XStack>
              ),
            )}
          </YStack>
          {sections.map((name) => (
            <YStack key={name} py={12} gap={4}>
              <Text fontSize={14} fontWeight="500" color="$color12">
                {name}
              </Text>
              <Text fontSize={14} color="$color11">
                Le voci della sezione.
              </Text>
            </YStack>
          ))}
        </Drawer>
      </>
    );
  },
};

/**
 * Il bottone lo apre, col titolo come nome, e il focus ci entra; Esc lo
 * chiude, il drawer sparisce dal DOM e il focus torna sul bottone.
 */
export const OpenAndClose: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByText('Filtri').closest('button');
    await userEvent.click(trigger!);
    // Il drawer sta in un portale, fuori dal canvas della storia.
    const drawer = await screen.findByRole('dialog', { name: 'Filtri' });
    await waitFor(() => expect(drawer).toBeVisible());
    await waitFor(() =>
      expect(drawer).toContainElement(document.activeElement as HTMLElement),
    );
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Filtri' })).toBeNull(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** La x in cima lo chiude, col nome che le dà l'app. */
export const CloseButton: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText('Filtri'));
    const drawer = await screen.findByRole('dialog', { name: 'Filtri' });
    await userEvent.click(
      within(drawer).getByRole('button', { name: 'Chiudi' }),
    );
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Filtri' })).toBeNull(),
    );
  },
};
