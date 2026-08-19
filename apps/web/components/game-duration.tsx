'use client';

import type { Game } from '@repo/contracts';
import { useTranslations } from 'next-intl';

import { useDuration } from '@/lib/duration';

/**
 * La durata della storia principale, per le liste.
 *
 * Nelle card sta una riga sola e sta questa: "quanto mi ci vuole" è la domanda
 * a cui il progetto serve a rispondere, e il resto dei tempi è roba da scheda.
 *
 * Non rende nulla in due casi, ed è la parte che conta:
 *
 * - **durata mancante**: il gioco non è ancora passato per HLTB, o HLTB non lo
 *   conosce. Una riga vuota direbbe "zero", che è un'altra cosa.
 * - **gioco senza campagna**: `hltbHasSolo` a false vuol dire che quel numero è
 *   tempo investito e non una durata — Counter-Strike 2 riporta 143 ore di
 *   "storia principale". Su una card non c'è spazio per spiegarlo, e mostrarlo
 *   senza spiegazione sarebbe peggio che tacere. La scheda del gioco lo dice.
 */
export function GameDuration({
  game,
}: {
  game: Pick<Game, 'hltbMainMinutes' | 'hltbHasSolo'>;
}) {
  const t = useTranslations('hltb');
  const duration = useDuration();

  if (game.hltbMainMinutes === null || game.hltbHasSolo === false) return null;

  return (
    <span className="text-muted-foreground">
      {t('cardMain', { duration: duration(game.hltbMainMinutes) })}
    </span>
  );
}
