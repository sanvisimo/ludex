import type { GameDetail, GameScore } from '@repo/contracts';
import { useQuery } from '@tanstack/react-query';
import { BrandIcon, XStack, YStack } from '@repo/ui';
import { useTranslations } from 'use-intl';

import { DetailTitle, Muted, Strong } from '@/components/detail-text';
import { api } from '@/lib/orpc';

/**
 * I voti della critica, fonte per fonte e per piattaforma: la sezione del
 * dialog «Dettagli» della pagina del gioco (12d).
 *
 * Si mostrano **tutti**, con la fonte scritta accanto, e non solo quello che ha
 * vinto la precedenza: OpenCritic e Metacritic non stanno sulla stessa scala —
 * il primo pesa i critici di punta e tende a stare qualche punto sotto — e un
 * numero solo, senza dire di chi è, li farebbe sembrare confrontabili.
 *
 * I voti per piattaforma stanno sotto e in piccolo, ma ci stanno: è la ragione
 * per cui questa tabella esiste. Su Mafia il voto pubblicato è 66, che è il
 * port Xbox, mentre il PC vale 88 — e chi guarda la scheda deve poterlo vedere,
 * non doverlo indovinare.
 */

/** L'ordine in cui si leggono, che è quello della precedenza lato server. */
const ORDINE: GameScore['source'][] = ['opencritic', 'metacritic', 'igdb'];

function Complessivo({ voto }: { voto: GameScore }) {
  const t = useTranslations('critic');

  const dettagli = [
    voto.reviewCount !== null
      ? t('reviews', { count: voto.reviewCount })
      : null,
    // `tier` e `sentiment` sono i due modi in cui le fonti dicono a parole ciò
    // che il numero dice a cifre. Sono vocabolari loro e non si traducono: che
    // sia scritto "Mighty" è parte dell'informazione.
    voto.tier,
    voto.sentiment,
    voto.percentRecommended !== null
      ? t('recommended', { percent: Math.round(voto.percentRecommended) })
      : null,
  ].filter(Boolean);

  return (
    <XStack flexWrap="wrap" items="center" columnGap={8}>
      {/* L'icona dentro il `dt`: in un `dl` le righe portano solo `dt` e `dd`. */}
      <XStack render="dt" items="center" gap={8}>
        <BrandIcon brand={voto.source} size={16} />
        <Muted>{t(voto.source)}</Muted>
      </XStack>
      <Strong render="dd">{Math.round(voto.score)}</Strong>
      {dettagli.length > 0 && (
        <Muted render="dd" fontSize={13}>
          {dettagli.join(' · ')}
        </Muted>
      )}
    </XStack>
  );
}

export function CriticScores({ game }: { game: GameDetail }) {
  const t = useTranslations('critic');
  const { data: platforms } = useQuery({
    ...api.platforms.list.queryOptions(),
    staleTime: Infinity,
  });

  // Come per le durate: su un gioco non collegato a IGDB non c'è niente in
  // arrivo, e annunciare voti che non verranno sarebbe una bugia.
  if (game.igdbId === null) return null;

  const complessivi = ORDINE.map((source) =>
    game.scores.find(
      (voto) => voto.source === source && voto.platformSlug === null,
    ),
  ).filter((voto): voto is GameScore => voto !== undefined);

  const perPiattaforma = game.scores
    .filter((voto) => voto.platformSlug !== null)
    .sort((a, b) => b.score - a.score);

  const nameBySlug = new Map((platforms ?? []).map((p) => [p.slug, p.name]));

  return (
    <YStack gap={12}>
      <DetailTitle>{t('title')}</DetailTitle>
      {complessivi.length === 0 ? (
        <Muted>{t('none')}</Muted>
      ) : (
        <YStack render="dl" gap={4} m={0}>
          {complessivi.map((voto) => (
            <Complessivo key={voto.source} voto={voto} />
          ))}
        </YStack>
      )}

      {perPiattaforma.length > 0 && (
        <YStack gap={4}>
          <Muted fontSize={13}>{t('byPlatform')}</Muted>
          <YStack render="dl" gap={4} m={0}>
            {perPiattaforma.map((voto) => (
              <XStack
                key={`${voto.source}-${voto.platformSlug}`}
                flexWrap="wrap"
                items="baseline"
                columnGap={8}
              >
                <Muted render="dt" fontSize={13}>
                  {nameBySlug.get(voto.platformSlug!) ?? voto.platformSlug}
                </Muted>
                <Strong render="dd" fontSize={13}>
                  {Math.round(voto.score)}
                </Strong>
                {/* Positive, miste e negative: le dà solo Metacritic. */}
                {voto.positiveCount !== null && (
                  <Muted render="dd" fontSize={13}>
                    {t('split', {
                      positive: voto.positiveCount,
                      mixed: voto.neutralCount ?? 0,
                      negative: voto.negativeCount ?? 0,
                    })}
                  </Muted>
                )}
                {voto.positiveCount === null && voto.reviewCount !== null && (
                  <Muted render="dd" fontSize={13}>
                    {t('reviews', { count: voto.reviewCount })}
                  </Muted>
                )}
              </XStack>
            ))}
          </YStack>
        </YStack>
      )}
    </YStack>
  );
}
