import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { expect, userEvent, within } from 'storybook/test';

import { Text, YStack } from '../primitives';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
  type AccordionProps,
} from './accordion';
import { Badge } from './badge';

const meta: Meta<AccordionProps> = {
  title: 'Components/Accordion',
  component: Accordion,
};

export default meta;
type Story = StoryObj<AccordionProps>;

/** La forma del pannello dei filtri: sezioni, e il numero di criteri accesi. */
export const Default: Story = {
  render: () => (
    <YStack width={320}>
      <Accordion defaultValue={['platforms']}>
        <AccordionItem value="platforms">
          <AccordionTrigger hint={<Badge variant="secondary">2</Badge>}>
            Piattaforme
          </AccordionTrigger>
          <AccordionContent>
            <Text fontSize={14} color="$color11">
              PC, PlayStation 5
            </Text>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="genres">
          <AccordionTrigger>Generi</AccordionTrigger>
          <AccordionContent>
            <Text fontSize={14} color="$color11">
              Avventura, GDR, Strategia
            </Text>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="duration">
          <AccordionTrigger>Durata</AccordionTrigger>
          <AccordionContent>
            <Text fontSize={14} color="$color11">
              2 – 20 h
            </Text>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </YStack>
  ),
};

/**
 * Aprire una sezione non chiude le altre: il pannello è a più sezioni
 * aperte. Il titolo è un bottone con `aria-expanded`.
 */
export const OpenMany: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const platforms = canvas.getByRole('button', { name: /Piattaforme/ });
    const genres = canvas.getByRole('button', { name: 'Generi' });
    await expect(platforms).toHaveAttribute('aria-expanded', 'true');
    await expect(genres).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(genres);
    await expect(genres).toHaveAttribute('aria-expanded', 'true');
    await expect(platforms).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.getByText('Avventura, GDR, Strategia')).toBeVisible();
  },
};

/** Da tastiera: Tab sul titolo, Invio lo apre. */
export const Keyboard: Story = {
  ...Default,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const platforms = canvas.getByRole('button', { name: /Piattaforme/ });

    await userEvent.tab();
    await expect(platforms).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    await expect(platforms).toHaveAttribute('aria-expanded', 'false');
  },
};
