import type { GameDetail } from '@repo/contracts';
import { XStack, YStack } from '@repo/ui';
import { useTranslations } from 'use-intl';

import { DetailTitle, Muted, Strong } from '@/components/detail-text';
import { useDuration } from '@/lib/duration';

/**
 * Le durate di HowLongToBeat, tutte e quattro con le segnalazioni: la sezione
 * del dialog «Dettagli» della pagina del gioco (12d), dove sulla pagina c'è
 * solo il riepilogo.
 *
 * Lo step 6 si ferma qui: mostrare il dato. Filtrare per durata è lo step 7 e
 * vive sul backlog — questa resta la schermata che dice se il dato c'è e se ci
 * si può fidare.
 */

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

  // Un gioco che non ha una campagna non ha una durata: i suoi numeri sono ore
  // investite, e leggerli come "quanto ci metto a finirlo" è l'errore che questi
  // flag esistono per impedire.
  const senzaFine =
    game.hltbHasSolo === false && (game.hltbHasVersus || game.hltbHasCoop);

  return (
    <YStack gap={8}>
      <DetailTitle>{t('title')}</DetailTitle>
      {game.hltbSyncedAt === null ? (
        <Muted>{t('notFetched')}</Muted>
      ) : righe.length === 0 ? (
        <Muted>{t('noTimes')}</Muted>
      ) : (
        <>
          {senzaFine && <Muted>{t('noEnding')}</Muted>}
          <YStack render="dl" gap={4} m={0}>
            {righe.map((riga) => (
              <XStack
                key={riga.chiave}
                flexWrap="wrap"
                items="baseline"
                columnGap={8}
              >
                <Muted render="dt">{t(riga.chiave)}</Muted>
                <Strong render="dd">{duration(riga.minuti!)}</Strong>
                {riga.segnalazioni !== null && (
                  <Muted render="dd" fontSize={13}>
                    {t('reports', { count: riga.segnalazioni })}
                    {riga.segnalazioni < POCHE_SEGNALAZIONI &&
                      ` · ${t('fewReports')}`}
                  </Muted>
                )}
              </XStack>
            ))}
          </YStack>
          {/* Solo, coop, versus: che tipo di tempi ha senso leggere. */}
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
