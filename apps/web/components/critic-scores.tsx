import type { GameDetail, GameScore } from '@repo/contracts';
import { useQuery } from '@tanstack/react-query';
import { BrandIcon, PlatformIcon, XStack, YStack } from '@repo/ui';
import { useTranslations } from 'use-intl';

import { CriticScoreBadge } from '@/components/critic-score-badge';
import { DetailTitle, Muted, Strong } from '@/components/detail-text';
import { api } from '@/lib/orpc';
import { platformIconUrl } from '@/lib/platform-icons';
import { ExternalLink } from '@/src/components/external-link';

const SOURCES: GameScore['source'][] = ['opencritic', 'metacritic', 'igdb'];

function ScoreDetails({ score }: { score: GameScore }) {
  const t = useTranslations('critic');
  const details = [
    score.reviewCount !== null
      ? t('reviews', { count: score.reviewCount })
      : null,
    // Tier e sentiment sono le classificazioni originali delle fonti.
    score.tier,
    score.sentiment,
    score.percentRecommended !== null
      ? t('recommended', { percent: Math.round(score.percentRecommended) })
      : null,
  ].filter(Boolean);

  return details.length > 0 ? (
    <Muted fontSize={12} lineHeight={18}>
      {details.join(' · ')}
    </Muted>
  ) : null;
}

export function CriticScores({ game }: { game: GameDetail }) {
  const t = useTranslations('critic');
  const { data: platforms } = useQuery({
    ...api.platforms.list.queryOptions(),
    staleTime: Infinity,
  });

  // L'arricchimento non parte finché il gioco non è collegato a IGDB.
  if (game.igdbId === null) return null;

  const nameBySlug = new Map((platforms ?? []).map((p) => [p.slug, p.name]));

  return (
    <YStack gap={14}>
      <DetailTitle>{t('title')}</DetailTitle>
      {game.scores.length === 0 && <Muted>{t('none')}</Muted>}
      {SOURCES.map((source) => {
        const scores = game.scores.filter((score) => score.source === source);
        if (scores.length === 0) return null;
        const overall = scores.find((score) => score.platformSlug === null);
        const byPlatform = scores
          .filter((score) => score.platformSlug !== null)
          .sort((a, b) => b.score - a.score);
        const href = game.links[source];

        return (
          <YStack
            key={source}
            p={16}
            gap={16}
            rounded={16}
            bg="$color3"
            borderWidth={1}
            borderColor="$borderColor"
            $max-sm={{ p: 12 }}
          >
            <XStack items="center" gap={12}>
              <BrandIcon brand={source} size={32} />
              <YStack flex={1} minW={0} gap={4}>
                <Strong>
                  {/* OpenCritic richiede il nome come link vicino al voto. */}
                  {href ? (
                    <ExternalLink href={href} strong>
                      {t(source)}
                    </ExternalLink>
                  ) : (
                    t(source)
                  )}
                </Strong>
                {overall && <ScoreDetails score={overall} />}
              </YStack>
              {overall && <CriticScoreBadge score={overall.score} />}
            </XStack>
            {byPlatform.length > 0 && (
              <YStack gap={10}>
                <Muted fontSize={12}>{t('byPlatform')}</Muted>
                <YStack render="dl" m={0} gap={0}>
                  {byPlatform.map((score, index) => {
                    const slug = score.platformSlug!;
                    const name = nameBySlug.get(slug) ?? slug;
                    const icon = platformIconUrl(slug);
                    return (
                      <XStack
                        key={slug}
                        gap={12}
                        py={12}
                        items="center"
                        borderTopWidth={index === 0 ? 0 : 1}
                        borderColor="$borderColor"
                      >
                        <YStack render="dt" flex={1} minW={0} gap={5}>
                          <XStack items="center" gap={8}>
                            {icon && (
                              <PlatformIcon src={icon} label={name} size={28} />
                            )}
                            <Strong
                              flex={1}
                              minW={0}
                              style={{ overflowWrap: 'anywhere' }}
                            >
                              {name}
                            </Strong>
                          </XStack>
                          <ScoreDetails score={score} />
                          {score.positiveCount !== null && (
                            <Muted fontSize={12} lineHeight={18}>
                              {t('split', {
                                positive: score.positiveCount,
                                mixed: score.neutralCount ?? 0,
                                negative: score.negativeCount ?? 0,
                              })}
                            </Muted>
                          )}
                        </YStack>
                        <XStack render="dd" m={0}>
                          <CriticScoreBadge score={score.score} compact />
                        </XStack>
                      </XStack>
                    );
                  })}
                </YStack>
              </YStack>
            )}
          </YStack>
        );
      })}
    </YStack>
  );
}
