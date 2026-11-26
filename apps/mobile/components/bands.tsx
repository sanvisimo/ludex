import { Text, XStack, YStack } from '@repo/ui';
import { ChevronRight } from '@repo/ui/icons';
import type { ReactNode } from 'react';
import { ScrollView as HorizontalScroll } from 'react-native';

/** Una fascia: il titolo che apre la lista e le card che scorrono di lato. */
export function Band({
  icon,
  note,
  title,
  count,
  onOpen,
  children,
}: {
  icon?: ReactNode;
  note?: string;
  title: string;
  count: number | undefined;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <YStack gap={10}>
      <XStack role="link" onPress={onOpen} items="center" gap={8} px={16}>
        {icon}
        <Text
          flex={1}
          fontFamily="heading"
          fontSize={18}
          lineHeight="24px"
          fontWeight="600"
          color="color12"
          numberOfLines={1}
        >
          {title}
        </Text>
        {note ? (
          <Text fontSize={12} color="accent11">
            {note}
          </Text>
        ) : null}
        {count !== undefined ? <Text color="color11">{count}</Text> : null}
        <ChevronRight size={18} color="color11" />
      </XStack>
      <HorizontalScroll
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 12 }}
      >
        {children}
      </HorizontalScroll>
    </YStack>
  );
}

export function BandSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <YStack gap={20}>
      <Text px={16} fontSize={12} fontWeight="600" color="color11">
        {title.toUpperCase()}
      </Text>
      {children}
    </YStack>
  );
}
