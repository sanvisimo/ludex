import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, within } from 'storybook/test';

import { House, Library, User } from '../icons';
import { Separator, Text, Theme, XStack, YStack } from '../primitives';
import { NavItem } from './nav-item';

const meta = {
  title: 'Components/NavItem',
  component: NavItem,
  args: {
    href: '#backlog',
    children: 'Il mio backlog',
  },
} satisfies Meta<typeof NavItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * La barra com'è: una voce attiva, le altre no, e il separatore fra le pagine
 * e l'account. Il separatore è quello di Tamagui così com'è.
 */
export const Navigation: Story = {
  render: () => (
    <YStack width={224} gap={4}>
      <NavItem href="#catalogo" icon={<House size={16} />}>
        Catalogo
      </NavItem>
      <NavItem href="#backlog" icon={<Library size={16} />} active>
        Il mio backlog
      </NavItem>
      <Separator my={8} />
      <NavItem href="#account" icon={<User size={16} />}>
        Account
      </NavItem>
    </YStack>
  ),
  // È un link vero, e la pagina aperta lo dice anche a chi non la vede.
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const attiva = canvas.getByRole('link', { name: 'Il mio backlog' });
    await expect(attiva).toHaveAttribute('href', '#backlog');
    await expect(attiva).toHaveAttribute('aria-current', 'page');
    // Un `<a>` è sottolineato di suo: una voce della barra no.
    await expect(getComputedStyle(attiva).textDecorationLine).toBe('none');
    await expect(
      canvas.getByRole('link', { name: 'Catalogo' }),
    ).not.toHaveAttribute('aria-current');
  },
};

/**
 * Una voce con un numero a destra, come le sezioni dell'account. Il numero fa
 * parte del nome del link; in una fila (il telefono) resta accanto all'etichetta.
 */
export const WithCount: Story = {
  render: () => (
    <YStack width={224} gap={4}>
      <NavItem href="#profilo" icon={<User size={16} />}>
        Profilo
      </NavItem>
      <NavItem
        href="#da-sistemare"
        icon={<Library size={16} />}
        trailing="26"
        active
      >
        Da sistemare
      </NavItem>
    </YStack>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('link', { name: 'Da sistemare 26' }),
    ).toHaveAttribute('aria-current', 'page');
  },
};

/** Chiaro e scuro affiancati: la voce attiva deve staccarsi in tutti e due. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap={4} bg="$background" p="$3" rounded="$4" width={224}>
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <NavItem href="#catalogo" icon={<House size={16} />}>
              Catalogo
            </NavItem>
            <NavItem href="#backlog" icon={<Library size={16} />} active>
              Il mio backlog
            </NavItem>
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};
