import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { YStack } from '../primitives';
import { Button } from './button';
import { NavItem } from './nav-item';
import { Sheet, type SheetProps } from './sheet';

const meta: Meta<SheetProps> = {
  title: 'Components/Sheet',
  component: Sheet,
};

export default meta;
type Story = StoryObj<SheetProps>;

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

export const OpenAndClose: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole('button', { name: 'Menu' });
    await userEvent.click(trigger);
    const sheet = await screen.findByRole('dialog', { name: 'Navigazione' });
    await waitFor(() => expect(sheet).toBeVisible());
    await waitFor(() =>
      expect(sheet).toContainElement(document.activeElement as HTMLElement),
    );
    await userEvent.tab();
    await expect(
      within(sheet).getByRole('link', { name: 'Catalogo' }),
    ).toHaveFocus();
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Navigazione' })).toBeNull(),
    );
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
