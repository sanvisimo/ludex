import { Text, Theme, XStack } from '@repo/ui';

export function CriticScoreBadge({
  score,
  compact = false,
}: {
  score: number;
  compact?: boolean;
}) {
  const value = Math.round(score);
  const tone = value >= 75 ? 'green' : value >= 50 ? 'amber' : 'red';

  return (
    <Theme name={tone}>
      <XStack
        bg="$color3"
        borderWidth={1}
        borderColor="$color6"
        rounded={compact ? 10 : 14}
        px={compact ? 10 : 14}
        py={compact ? 6 : 10}
        minW={compact ? 72 : 90}
        items="baseline"
        justify="center"
        gap={3}
        shrink={0}
      >
        <Text
          fontFamily="$heading"
          fontSize={compact ? 20 : 28}
          lineHeight={compact ? 26 : 34}
          fontWeight="600"
          color="$color12"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {value}
        </Text>
        <Text fontSize={11} lineHeight={16} color="$color12">
          /100
        </Text>
      </XStack>
    </Theme>
  );
}
