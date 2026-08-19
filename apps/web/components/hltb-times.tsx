"use client";

import type { GameDetail } from "@repo/contracts";
import { useTranslations } from "next-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDuration } from "@/lib/duration";

/**
 * Le durate di HowLongToBeat sulla scheda del gioco.
 *
 * Lo step 6 si ferma qui: mostrare il dato. Il filtro "stasera ho due ore" è lo
 * step 7 e non va anticipato — questa è la schermata che dice se il dato c'è e
 * se ci si può fidare.
 */

type Riga = {
  chiave: "main" | "plus" | "completionist" | "allStyles";
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
  const t = useTranslations("hltb");
  const duration = useDuration();

  // HLTB parte solo dopo IGDB: su un gioco non risolto non c'è niente da
  // aspettare, e annunciare durate in arrivo sarebbe una bugia.
  if (game.igdbId === null) return null;

  const tutte: Riga[] = [
    { chiave: "main", minuti: game.hltbMainMinutes, segnalazioni: game.hltbMainCount },
    { chiave: "plus", minuti: game.hltbPlusMinutes, segnalazioni: game.hltbPlusCount },
    {
      chiave: "completionist",
      minuti: game.hltbCompletionistMinutes,
      segnalazioni: game.hltbCompletionistCount,
    },
    {
      chiave: "allStyles",
      minuti: game.hltbAllStylesMinutes,
      segnalazioni: game.hltbAllStylesCount,
    },
  ];
  const righe = tutte.filter((riga) => riga.minuti !== null);

  // Un gioco che non ha una campagna non ha una durata: i suoi numeri sono ore
  // investite, e leggerli come "quanto ci metto a finirlo" è l'errore che questi
  // flag esistono per impedire.
  const senzaFine = game.hltbHasSolo === false && (game.hltbHasVersus || game.hltbHasCoop);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-2">
        {game.hltbSyncedAt === null ? (
          <p className="text-muted-foreground">{t("notFetched")}</p>
        ) : righe.length === 0 ? (
          <p className="text-muted-foreground">{t("noTimes")}</p>
        ) : (
          <>
            {senzaFine && <p className="text-muted-foreground">{t("noEnding")}</p>}
            <dl className="grid gap-1">
              {righe.map((riga) => (
                <div key={riga.chiave} className="flex flex-wrap items-baseline gap-x-2">
                  <dt className="text-muted-foreground">{t(riga.chiave)}</dt>
                  <dd className="font-medium">{duration(riga.minuti!)}</dd>
                  {riga.segnalazioni !== null && (
                    <dd className="text-muted-foreground text-sm">
                      {t("reports", { count: riga.segnalazioni })}
                      {riga.segnalazioni < POCHE_SEGNALAZIONI && ` · ${t("fewReports")}`}
                    </dd>
                  )}
                </div>
              ))}
            </dl>
          </>
        )}
      </CardContent>
    </Card>
  );
}
