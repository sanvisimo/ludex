import type { GameDetail } from '@repo/contracts';
import { Badge, BrandIcon, Theme, XStack, YStack } from '@repo/ui';
import { useTranslations } from 'use-intl';

import { DetailTitle, Muted, Strong } from '@/components/detail-text';
import { useDuration } from '@/lib/duration';

type Riga = {
  chiave: 'main' | 'plus' | 'completionist' | 'allStyles';
  minuti: number | null;
  segnalazioni: number | null;
};

/**
 * Sotto questa soglia la media è di pochi giocatori e va detto: HLTB pubblica
 * durate calcolate anche su tre segnalazioni, e a colpo d'occhio sembrano solide
 * quanto quelle costruite su migliaia.
 */
const POCHE_SEGNALAZIONI = 30;

export function HltbTimes({ game }: { game: GameDetail }) {
  const t = useTranslations('hltb');
  const duration = useDuration();

  // HLTB parte solo dopo IGDB: su un gioco non risolto non c'è niente da
  // aspettare, e annunciare durate in arrivo sarebbe una bugia.
  if (game.igdbId === null) return null;

  const tutte: Riga[] = [
    {
      chiave: 'main',
      minuti: game.hltbMainMinutes,
      segnalazioni: game.hltbMainCount,
    },
    {
      chiave: 'plus',
      minuti: game.hltbPlusMinutes,
      segnalazioni: game.hltbPlusCount,
    },
    {
      chiave: 'completionist',
      minuti: game.hltbCompletionistMinutes,
      segnalazioni: game.hltbCompletionistCount,
    },
    {
      chiave: 'allStyles',
      minuti: game.hltbAllStylesMinutes,
      segnalazioni: game.hltbAllStylesCount,
    },
  ];
  const righe = tutte.filter((riga) => riga.minuti !== null);

  // Un gioco che non ha una campagna né la co-op non ha una durata: i suoi
  // numeri sono ore investite, e leggerli come "quanto ci metto a finirlo" è
  // l'errore che questi flag esistono per impedire. Un gioco solo co-op una
  // fine ce l'ha.
  const senzaFine =
    game.hltbHasSolo === false &&
    game.hltbHasCoop !== true &&
    game.hltbHasVersus === true;

  return (
    <YStack gap={14}>
      <XStack items="center" gap={8}>
        <BrandIcon brand="hltb" size={24} />
        <DetailTitle>{t('title')}</DetailTitle>
      </XStack>
      {game.hltbSyncedAt === null ? (
        <Muted>{t('notFetched')}</Muted>
      ) : righe.length === 0 ? (
        <Muted>{t('noTimes')}</Muted>
      ) : (
        <>
          {senzaFine && (
            <Theme name="amber">
              <Muted p={12} rounded={10} bg="$color3" color="$color12">
                {t('noEnding')}
              </Muted>
            </Theme>
          )}
          <YStack gap={10}>
            {righe.map((riga) => {
              const blue = riga.chiave === 'main';
              const neutral = riga.chiave === 'allStyles';
              return (
                <Theme key={riga.chiave} name={blue ? 'blue' : undefined}>
                  <XStack
                    render="dl"
                    m={0}
                    items="center"
                    gap={12}
                    p={14}
                    rounded={12}
                    bg={blue || neutral ? '$color3' : '$selectionBackground'}
                    borderLeftWidth={3}
                    borderColor={
                      blue
                        ? '$color9'
                        : neutral
                          ? '$color7'
                          : '$selectionBorder'
                    }
                  >
                    <YStack render="dt" flex={1} minW={0} gap={5}>
                      <Strong fontSize={13}>{t(riga.chiave)}</Strong>
                      {riga.segnalazioni !== null && (
                        <Muted
                          fontSize={12}
                          lineHeight={18}
                          color={blue ? '$color12' : '$color11'}
                        >
                          {t('reports', { count: riga.segnalazioni })}
                        </Muted>
                      )}
                      {riga.segnalazioni !== null &&
                        riga.segnalazioni < POCHE_SEGNALAZIONI && (
                          <Badge
                            variant="warning"
                            self="flex-start"
                            height="auto"
                            py={2}
                          >
                            {t('fewReports')}
                          </Badge>
                        )}
                    </YStack>
                    <Strong
                      render="dd"
                      fontFamily="$heading"
                      fontSize={26}
                      lineHeight={32}
                      shrink={0}
                      color={
                        blue
                          ? '$color12'
                          : neutral
                            ? '$color12'
                            : '$selectionColor'
                      }
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {duration(riga.minuti!)}
                    </Strong>
                  </XStack>
                </Theme>
              );
            })}
          </YStack>
          <Muted fontSize={13}>
            {[
              game.hltbHasSolo && t('solo'),
              game.hltbHasCoop && t('coop'),
              game.hltbHasVersus && t('versus'),
            ]
              .filter(Boolean)
              .join(' · ')}
          </Muted>
        </>
      )}
    </YStack>
  );
}
