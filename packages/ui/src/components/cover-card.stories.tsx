import type { Meta, StoryObj } from '@storybook/react-native-web-vite';

import { Text, XStack, YStack } from '../primitives';
import { CornerLabel } from './corner-label';
import { CoverCard, RankLabel } from './cover-card';
import { CriticScoreBadge } from './game-detail';

const meta = {
  title: 'Components/CoverCard',
  component: CoverCard,
  args: {
    cover: <YStack height={260} bg="color5" />,
    title: (
      <Text fontSize={14} fontWeight="600" color="color12" numberOfLines={2}>
        The Outer Worlds 2
      </Text>
    ),
  },
} satisfies Meta<typeof CoverCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithStatusAndRank: Story = {
  render: (args) => (
    <XStack gap={12}>
      <CoverCard
        {...args}
        cover={
          <YStack height={260} bg="color5">
            <CornerLabel floating>In corso</CornerLabel>
          </YStack>
        }
        overlay={<RankLabel rank={3} label="Posizione 3" />}
        meta={
          <>
            <Text fontSize={12} color="color11">
              2025 · 19 h
            </Text>
            <CriticScoreBadge score={82} compact />
          </>
        }
      />
    </XStack>
  ),
};
