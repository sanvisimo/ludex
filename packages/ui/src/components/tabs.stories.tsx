import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Text, Theme, XStack, YStack } from '../primitives';
import { Tabs, TabsTab } from './tabs';

const meta = {
  title: 'Components/Tabs',
  component: Tabs,
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

const KINDS = [
  { value: 'app', label: 'App', count: 11 },
  { value: 'dlc', label: 'DLC', count: 0 },
  { value: 'extra', label: 'Contenuto extra', count: 6 },
  { value: 'trial', label: 'Versione di prova', count: 1 },
  { value: 'unwanted', label: 'Non interessato', count: 17 },
];

function Demo({ width }: { width?: number }) {
  const [value, setValue] = useState('app');
  return (
    <YStack width={width} gap="$3">
      <Tabs value={value} onValueChange={setValue} label="Tipo di voce">
        {KINDS.map((kind) => (
          <TabsTab key={kind.value} value={kind.value} count={kind.count}>
            {kind.label}
          </TabsTab>
        ))}
      </Tabs>
      <Text color="$color11" fontSize={13}>
        Aperto: {value}
      </Text>
    </YStack>
  );
}

export const Default: Story = {
  args: {
    value: 'app',
    onValueChange: () => {},
    label: 'Tipo',
    children: null,
  },
  render: () => <Demo />,
};

/**
 * Dove non stanno — un telefono — scorrono: la riga è più larga di chi la
 * contiene, e la pagina non si allarga. Senza barra.
 */
export const Narrow: Story = {
  args: {
    value: 'app',
    onValueChange: () => {},
    label: 'Tipo',
    children: null,
  },
  render: () => <Demo width={320} />,
};

/** Il ruolo, il tab acceso e la tastiera: frecce, Home e Fine. */
export const Keyboard: Story = {
  args: {
    value: 'app',
    onValueChange: () => {},
    label: 'Tipo',
    children: null,
  },
  render: () => <Demo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tabs = canvas.getAllByRole('tab');
    await expect(canvas.getByRole('tablist')).toHaveAccessibleName(
      'Tipo di voce',
    );
    await expect(tabs).toHaveLength(5);
    // Il nome del tab comprende il numero, letto dopo l'etichetta.
    await expect(tabs[0]).toHaveAccessibleName('App 11');
    await expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    // Nella sequenza del Tab c'è solo quello acceso.
    await expect(tabs[0]).toHaveAttribute('tabindex', '0');
    await expect(tabs[1]).toHaveAttribute('tabindex', '-1');

    tabs[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    await expect(tabs[1]).toHaveFocus();

    await userEvent.keyboard('{End}');
    await expect(tabs[4]).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{ArrowRight}');
    await expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Home}');
    await expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
  },
};

/** Chiaro e scuro affiancati: la sottolineatura e il numero si leggono in tutti e due. */
export const Themes: Story = {
  args: {
    value: 'app',
    onValueChange: () => {},
    label: 'Tipo',
    children: null,
  },
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack bg="$background" p="$3" rounded="$4" gap="$2">
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <Demo width={420} />
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};
