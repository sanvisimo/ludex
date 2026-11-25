import type { Meta, StoryObj } from '@storybook/react-native-web-vite';
import { useState } from 'react';

import { YStack } from '../primitives';
import {
  CopyTile,
  CriticScoreBadge,
  CriticScoreRow,
  DetailPanel,
  DetailPanelTitle,
  DurationTiles,
  RatingStars,
} from './game-detail';

const meta = {
  title: 'Components/GameDetail',
  component: DetailPanel,
  args: { children: null },
} satisfies Meta<typeof DetailPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const ratingLabels = {
  value: (value: number) => `Vota ${value} su 5`,
  none: 'non votato',
  of: (value: number) => `${value} su 5`,
  clear: 'Togli il voto',
};

export const DurationAndCritics: Story = {
  render: () => (
    <YStack width={320}>
      <DetailPanel>
        <DetailPanelTitle>Quanto dura</DetailPanelTitle>
        <DurationTiles
          tiles={[
            {
              key: 'main',
              label: 'Storia principale',
              value: '59 h',
              main: true,
            },
            { key: 'plus', label: 'Storia + extra', value: '117 h' },
            { key: 'completionist', label: 'Completista', value: '248 h' },
          ]}
        />
        <DetailPanelTitle>Voti della critica</DetailPanelTitle>
        <CriticScoreRow
          brand="opencritic"
          name="OpenCritic"
          tier="Mighty"
          score={95}
          noScoreLabel="nessun voto"
          href="https://opencritic.com"
          title="Apri su OpenCritic"
        />
        <CriticScoreRow
          brand="metacritic"
          name="Metacritic"
          score={null}
          noScoreLabel="nessun voto"
        />
      </DetailPanel>
    </YStack>
  ),
};

export const ScoreBadges: Story = {
  render: () => (
    <YStack gap={8} items="flex-start">
      <CriticScoreBadge score={91} />
      <CriticScoreBadge score={62} compact />
      <CriticScoreBadge score={38} compact />
    </YStack>
  ),
};

export const Copy: Story = {
  render: () => (
    <YStack width={320}>
      <CopyTile
        brand="nintendo"
        storeName="Nintendo eShop"
        platformName="Nintendo Switch"
        details="sanvisimo · Fisico"
        played="242 h giocate"
        dates="ultima volta 5 gen 2025"
        href="https://www.nintendo.com"
        title="Apri su Nintendo eShop"
      />
    </YStack>
  ),
};

function Stars({ size }: { size: 'sm' | 'md' }) {
  const [value, setValue] = useState<number | null>(3.5);
  return (
    <RatingStars
      value={value}
      onChange={setValue}
      labels={ratingLabels}
      size={size}
    />
  );
}

export const Rating: Story = {
  render: () => (
    <YStack gap={16}>
      <Stars size="md" />
      <Stars size="sm" />
    </YStack>
  ),
};
