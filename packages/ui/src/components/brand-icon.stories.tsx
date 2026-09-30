import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, within } from 'storybook/test';

import { Text, Theme, XStack, YStack } from '../primitives';
import { BrandIcon, brandTitle, brandValues } from './brand-icon';

const meta = {
  title: 'Components/BrandIcon',
  component: BrandIcon,
  args: { brand: 'steam' },
} satisfies Meta<typeof BrandIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Da sola è decorativa: il nome lo porta chi le sta accanto. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const svg = canvasElement.querySelector('svg');
    await expect(svg).toHaveAttribute('aria-hidden', 'true');
  },
};

/** Col nome, quando fa da link senza testo vicino: è un'immagine che si legge. */
export const Labelled: Story = {
  args: { brand: 'gog', label: 'Apri su GOG' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole('img', { name: 'Apri su GOG' }),
    ).toBeInTheDocument();
  },
};

/** Tutti i marchi, chiaro e scuro: le tessere nere devono restare visibili. */
export const All: Story = {
  render: () => (
    <XStack gap="$4">
      {(['light', 'dark'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack bg="$background" p="$4" gap="$2" rounded="$4">
            {brandValues.map((brand) => (
              <XStack key={brand} items="center" gap="$2">
                <BrandIcon brand={brand} />
                <Text color="$color12">{brandTitle(brand)}</Text>
              </XStack>
            ))}
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};
