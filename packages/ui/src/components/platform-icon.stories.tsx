import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, within } from 'storybook/test';

import { Theme, XStack, YStack } from '../primitives';
import { PlatformIcon } from './platform-icon';

// Un'icona disegnata qui: i file veri stanno nell'app, non nel pacchetto.
const pad = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="7" width="20" height="10" rx="5" fill="#222"/></svg>',
)}`;

const meta = {
  title: 'Components/PlatformIcon',
  component: PlatformIcon,
  args: { src: pad, label: 'PlayStation 4' },
} satisfies Meta<typeof PlatformIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** È un'immagine col nome della piattaforma: a vista c'è solo il disegno. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('img', { name: 'PlayStation 4' }),
    ).toBeInTheDocument();
  },
};

/** Un'icona scura resta leggibile anche sul tema scuro: il cerchio è chiaro. */
export const Themes: Story = {
  render: (args) => (
    <XStack gap="$4">
      {(['light', 'dark'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack bg="$background" p="$4" rounded="$4">
            <PlatformIcon {...args} size={32} />
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};
