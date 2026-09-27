import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';
import { expect, fn, userEvent, within } from 'storybook/test';

import { Text, YStack } from '../primitives';
import { Slider, type SliderProps } from './slider';

const meta: Meta<SliderProps> = {
  title: 'Components/Slider',
  component: Slider,
  args: {
    min: 0,
    max: 100,
    step: 1,
    defaultValue: [60],
    thumbLabels: ['Voto minimo della critica'],
    onValueChange: fn(),
    width: 280,
  },
};

export default meta;
type Story = StoryObj<SliderProps>;

/** Una maniglia: il voto minimo della critica. */
export const Single: Story = {};

/** Due maniglie: la durata, da… a…, col tratto acceso fra le due. */
export const Range: Story = {
  args: {
    max: 200,
    defaultValue: [4, 40],
    thumbLabels: ['Durata minima', 'Durata massima'],
  },
};

function Hours() {
  const [value, setValue] = useState([2, 20]);
  return (
    <YStack gap="$2" width={280}>
      <Text fontSize={13} color="$color11">
        {value[0]} – {value[1]} h
      </Text>
      <Slider
        min={0}
        max={100}
        step={0.5}
        value={value}
        onValueChange={setValue}
        thumbLabels={['Durata minima', 'Durata massima']}
      />
    </YStack>
  );
}

/** Come lo usa il pannello: il valore scritto accanto, in ore. */
export const WithValue: Story = {
  render: () => <Hours />,
};

export const Disabled: Story = { args: { disabled: true } };

/**
 * La tastiera: il Tab arriva sulla maniglia, la freccia la sposta di un
 * passo, Home la porta al minimo. Ogni maniglia ha il suo nome.
 */
export const Keyboard: Story = {
  args: {
    defaultValue: [4, 40],
    thumbLabels: ['Durata minima', 'Durata massima'],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const [low, high] = canvas.getAllByRole('slider');
    await expect(low).toHaveAccessibleName('Durata minima');
    await expect(high).toHaveAccessibleName('Durata massima');

    await userEvent.tab();
    await expect(low).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    await expect(args.onValueChange).toHaveBeenLastCalledWith([5, 40]);
    await userEvent.keyboard('{Home}');
    await expect(args.onValueChange).toHaveBeenLastCalledWith([0, 40]);
  },
};
