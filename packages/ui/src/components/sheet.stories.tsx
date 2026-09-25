import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { YStack } from '../primitives';
import { Button } from './button';
import { NavItem } from './nav-item';
import { Sheet, type SheetProps } from './sheet';

// Annotato e non inferito, come per il Dialog.
const meta: Meta<SheetProps> = {
  title: 'Components/Sheet',
  component: Sheet,
};

export default meta;
type Story = StoryObj<SheetProps>;

/** Il caso per cui nasce: la navigazione sulle finestre strette. */
export const Default: Story = {
  render: function Render() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button variant="outline" onPress={() => setOpen(true)}>
          Menu
        </Button>
        <Sheet open={open} onOpenChange={setOpen} label="Navigazione">
          <YStack gap={4}>
            <NavItem href="#catalogo" active>
              Catalogo
            </NavItem>
            <NavItem href="#backlog">Il mio backlog</NavItem>
            <NavItem href="#account">Account</NavItem>
          </YStack>
        </Sheet>
      </>
    );
  },
};

/**
 * Il bottone lo apre, col suo nome, e il focus ci entra; Esc lo chiude, il
 * foglio sparisce dal DOM e il focus torna sul bottone.
 */
export const OpenAndClose: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByText('Menu'));
    // Il foglio sta in un portale, fuori dal canvas della storia.
    const sheet = await screen.findByRole('dialog', { name: 'Navigazione' });
    await waitFor(() => expect(sheet).toBeVisible());
    await waitFor(() =>
      expect(sheet).toContainElement(document.activeElement as HTMLElement),
    );
    // Il primo Tab porta alla prima voce, dentro il foglio.
    await userEvent.tab();
    await expect(
      within(sheet).getByRole('link', { name: 'Catalogo' }),
    ).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Navigazione' })).toBeNull(),
    );
    await expect(
      within(canvasElement).getByText('Menu').closest('button'),
    ).toHaveFocus();
  },
};
