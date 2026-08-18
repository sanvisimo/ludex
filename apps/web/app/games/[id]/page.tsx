"use client";

import type { GameAttribute } from "@repo/contracts";
import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { use } from "react";

import { GameCover } from "@/components/game-cover";
import { OwnershipBadges } from "@/components/ownership-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useStatusLabels } from "@/lib/labels";
import { api } from "@/lib/orpc";

const KIND_ORDER: GameAttribute["kind"][] = [
  "genre",
  "theme",
  "game_mode",
  "player_perspective",
];

function AttributeGroups({ attributes }: { attributes: GameAttribute[] }) {
  const t = useTranslations("attributeKind");

  return (
    <div className="grid gap-3">
      {KIND_ORDER.map((kind) => {
        const items = attributes.filter((a) => a.kind === kind);
        if (items.length === 0) return null;
        return (
          <div key={kind} className="grid gap-1">
            <span className="text-muted-foreground">{t(kind)}</span>
            <div className="flex flex-wrap gap-1">
              {items.map((item) => (
                <Badge key={`${item.kind}-${item.igdbId}`} variant="secondary">
                  {item.name}
                </Badge>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Pagina auth/no-auth: il gioco si vede sempre, `entry` arriva popolata solo se
// chi guarda è autenticato e ce l'ha nel backlog.
export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const t = useTranslations("game");
  const statusLabels = useStatusLabels();

  const { id } = use(params);
  const { data, isPending, error } = useQuery(api.games.byId.queryOptions({ input: { id } }));

  if (isPending) {
    return (
      <main className="mx-auto grid max-w-3xl gap-4 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto grid max-w-3xl gap-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">{t("notFoundTitle")}</h1>
        <p className="text-muted-foreground">{t("notFoundHint")}</p>
        <Button variant="outline" className="w-fit" nativeButton={false} render={<Link href="/" />}>
          {t("backToCatalog")}
        </Button>
      </main>
    );
  }

  const { game, entry } = data;
  const year = game.firstReleaseDate?.getFullYear() ?? null;

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-6">
      <header className="flex flex-wrap gap-6">
        <GameCover imageId={game.coverImageId} name={game.name} size="cover_big" />

        <div className="grid flex-1 content-start gap-3">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{game.name}</h1>
            {year && <p className="text-muted-foreground">{year}</p>}
          </div>

          {game.aggregatedRating !== null && (
            <p>
              <span className="font-medium">{Math.round(game.aggregatedRating)}</span>
              <span className="text-muted-foreground">
                {t("criticRating")}
                {game.aggregatedRatingCount
                  ? t("reviewCount", { count: game.aggregatedRatingCount })
                  : ""}
              </span>
            </p>
          )}

          {game.summary && <p className="whitespace-pre-line">{game.summary}</p>}

          {/* Il campo distingue "non ha generi" da "non ancora arricchito": senza,
              una scheda vuota sembrerebbe un gioco senza metadati. */}
          {game.igdbSyncedAt === null && (
            <p className="text-muted-foreground">
              {game.igdbId === null ? t("notLinked") : t("notEnriched")}
            </p>
          )}
        </div>
      </header>

      {game.attributes.length > 0 && (
        <Card>
          <CardContent>
            <AttributeGroups attributes={game.attributes} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{entry ? t("inBacklog") : t("notInBacklog")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {entry ? (
            <>
              <p>
                {t.rich("statusLine", {
                  status: statusLabels[entry.status],
                  value: (chunks) => <span className="font-medium">{chunks}</span>,
                })}
              </p>
              <OwnershipBadges ownerships={entry.ownerships} />
              <Button
                variant="outline"
                className="w-fit"
                nativeButton={false}
                render={<Link href="/backlog" />}
              >
                {t("goToBacklog")}
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">{t("notInBacklogHint")}</p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
