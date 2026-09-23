import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import { ChevronDown, Search, X } from '../icons';
import { Text, Theme, XStack, YStack } from '../primitives';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  type InputGroupProps,
} from './input-group';

// Annotato e non inferito, come per l'Input (TS7056).
const meta: Meta<InputGroupProps> = {
  title: 'Components/InputGroup',
  component: InputGroup,
  decorators: [
    (Story) => (
      <YStack width={320}>
        <Story />
      </YStack>
    ),
  ],
};

export default meta;
type Story = StoryObj<InputGroupProps>;

/** La forma del Combobox: il campo, poi la x e la freccia dentro il bordo. */
export const Default: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput aria-label="Piattaforma" placeholder="PlayStation 5" />
      <InputGroupAddon align="inline-end">
        <InputGroupButton aria-label="Svuota">
          <X size={12} />
        </InputGroupButton>
        <InputGroupButton aria-label="Apri l’elenco">
          <ChevronDown size={14} />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
};

/** L'addon prima del campo: sta a sinistra anche se è scritto dopo. */
export const AddonStart: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput aria-label="Cerca" placeholder="Cerca nel backlog" />
      <InputGroupAddon align="inline-start" pl={8}>
        <Search size={14} color="$color11" />
      </InputGroupAddon>
    </InputGroup>
  ),
};

/** Chiaro e scuro affiancati. */
export const Themes: Story = {
  render: () => (
    <XStack gap="$4" items="flex-start">
      {(['dark', 'light'] as const).map((name) => (
        <Theme key={name} name={name}>
          <YStack gap="$2" bg="$background" p="$3" rounded="$4" width={240}>
            <Text color="$color11" fontSize={12}>
              {name === 'dark' ? 'Dark' : 'Light'}
            </Text>
            <InputGroup>
              <InputGroupInput aria-label={`Piattaforma ${name}`} />
              <InputGroupAddon align="inline-end">
                <InputGroupButton aria-label={`Apri l’elenco ${name}`}>
                  <ChevronDown size={14} />
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </YStack>
        </Theme>
      ))}
    </XStack>
  ),
};

/**
 * Il bottone dentro il gruppo funziona senza rubare il campo: la x svuota ciò
 * che si è scritto.
 */
export const Clear: Story = {
  render: function Render() {
    const [value, setValue] = useState('');
    return (
      <InputGroup>
        <InputGroupInput
          aria-label="Piattaforma"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <InputGroupAddon align="inline-end">
          <InputGroupButton aria-label="Svuota" onPress={() => setValue('')}>
            <X size={12} />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText('Piattaforma');
    await userEvent.type(input, 'Switch');
    await expect(input).toHaveValue('Switch');
    await userEvent.click(canvas.getByLabelText('Svuota'));
    await expect(input).toHaveValue('');
  },
};
