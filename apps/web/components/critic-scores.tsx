'use client';

import type { GameDetail, GameScore } from '@repo/contracts';
import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/orpc';

/**
 * I voti della critica sulla scheda del gioco.
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
    voto.reviewCount !== null ? t('reviews', { count: voto.reviewCount }) : null,
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
    <div className="flex flex-wrap items-baseline gap-x-2">
      <dt className="text-muted-foreground">{t(voto.source)}</dt>
      <dd className="font-medium">{Math.round(voto.score)}</dd>
      {dettagli.length > 0 && (
        <dd className="text-muted-foreground text-sm">
          {dettagli.join(' · ')}
        </dd>
      )}
    </div>
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
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3">
        {complessivi.length === 0 ? (
          <p className="text-muted-foreground">{t('none')}</p>
        ) : (
          <dl className="grid gap-1">
            {complessivi.map((voto) => (
              <Complessivo key={voto.source} voto={voto} />
            ))}
          </dl>
        )}

        {perPiattaforma.length > 0 && (
          <div className="grid gap-1">
            <span className="text-muted-foreground text-sm">
              {t('byPlatform')}
            </span>
            <dl className="grid gap-1 text-sm">
              {perPiattaforma.map((voto) => (
                <div
                  key={`${voto.source}-${voto.platformSlug}`}
                  className="flex flex-wrap items-baseline gap-x-2"
                >
                  <dt className="text-muted-foreground">
                    {nameBySlug.get(voto.platformSlug!) ?? voto.platformSlug}
                  </dt>
                  <dd className="font-medium">{Math.round(voto.score)}</dd>
                  {voto.reviewCount !== null && (
                    <dd className="text-muted-foreground">
                      {t('reviews', { count: voto.reviewCount })}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
