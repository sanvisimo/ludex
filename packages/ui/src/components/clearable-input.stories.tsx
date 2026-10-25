import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { Text, Theme, XStack, YStack } from '../primitives';
import { ClearableInput } from './clearable-input';

type Args = { initial: string };

function Controlled({ initial, label }: { initial: string; label: string }) {
  const [value, setValue] = useState(initial);
  return (
    <ClearableInput
      value={value}
      onChangeText={setValue}
      placeholder="Cerca nel backlog"
      aria-label={label}
      clearLabel={`Svuota ${label}`}
    />
  );
}

const meta: Meta<Args> = {
  title: 'Components/ClearableInput',
  args: { initial: '' },
  render: ({ initial }) => <Controlled initial={initial} label="Cerca" />,
  decorators: [
    (Story) => (
      <YStack width={320}>
        <Story />
      </YStack>
    ),
  ],
};

export default meta;
type Story = StoryObj<Args>;

/** Vuoto non ha la x; scrivendo compare. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole('button')).toBeNull();
    await userEvent.type(canvas.getByRole('textbox'), 'hades');
    await expect(
      canvas.getByRole('button', { name: 'Svuota Cerca' }),
    ).toBeVisible();
  },
};

/** La x svuota il campo e gli ridà il fuoco. */
export const Clear: Story = {
  args: { initial: 'hades' },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Svuota Cerca' }));
    const input = canvas.getByRole('textbox');
    await expect(input).toHaveValue('');
    await expect(input).toHaveFocus();
    await expect(canvas.queryByRole('button')).toBeNull();
  },
};

/** Chiaro e scuro affiancati, col testo e quindi con la x. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4" width={240}>
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <Controlled initial="hades" label={`Cerca ${name}`} />
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};
