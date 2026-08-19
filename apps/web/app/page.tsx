"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { GameCover } from "@/components/game-cover";
import { GameDuration } from "@/components/game-duration";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/orpc";

// Catalogo pubblico: "questi giochi Ludex li conosce". Volutamente anonimo —
// non dice chi li ha aggiunti, solo che esistono.
export default function CatalogPage() {
  const t = useTranslations("catalog");
  const { data, isPending, error } = useQuery(api.games.latest.queryOptions({ input: {} }));

  return (
    <main className="mx-auto grid max-w-4xl gap-6 p-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground">{t("subtitle")}</p>
      </header>

      {error ? (
        <p className="text-destructive">{t("error")}</p>
      ) : isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground">{t("empty")}</CardContent>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {data.map((game) => (
            <li key={game.id}>
              <Link href={`/games/${game.id}`} className="block">
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-center gap-4">
                    <GameCover imageId={game.coverImageId} name={game.name} />
                    <div className="grid gap-0.5">
                      <span className="font-medium">{game.name}</span>
                      {game.firstReleaseDate && (
                        <span className="text-muted-foreground">
                          {game.firstReleaseDate.getFullYear()}
                        </span>
                      )}
                      <GameDuration game={game} />
                      {game.igdbId === null && (
                        <span className="text-muted-foreground">{t("unresolved")}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
