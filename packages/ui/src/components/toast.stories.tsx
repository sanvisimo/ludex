import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { XStack } from '../primitives';
import { Button } from './button';
import { Toaster, toast, type ToasterProps } from './toast';

const meta: Meta<ToasterProps> = {
  title: 'Components/Toast',
  component: Toaster,
  render: (args) => (
    <>
      <XStack gap="$3" flexWrap="wrap">
        <Button onPress={() => toast.success('Modifiche salvate')}>
          Successo
        </Button>
        <Button
          variant="destructive"
          onPress={() => toast.error('Non è stato possibile salvare')}
        >
          Errore
        </Button>
        <Button
          variant="outline"
          onPress={() =>
            toast.warning('2 account da ricollegare: non aggiornati')
          }
        >
          Avviso
        </Button>
        <Button variant="ghost" onPress={() => toast('Import avviato')}>
          Semplice
        </Button>
      </XStack>
      <Toaster {...args} />
    </>
  ),
};

export default meta;
type Story = StoryObj<ToasterProps>;

/** Un bottone per tipo: le icone sono l'unica cosa che li distingue. */
export const Default: Story = {};

/**
 * Il contratto con le schermate: `toast.success(…)` chiamato da fuori — da
 * una mutazione, non da un componente — fa comparire il messaggio, che poi
 * se ne va da solo.
 */
export const ShowAndDismiss: Story = {
  args: { duration: 1000 },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByText('Successo'));

    // Il toast sta in un portale, fuori dal canvas della storia.
    await expect(
      await screen.findByText('Modifiche salvate'),
    ).toBeInTheDocument();
    await waitFor(
      () => expect(screen.queryByText('Modifiche salvate')).toBeNull(),
      { timeout: 4000 },
    );
  },
};
