"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use } from "react";

import { OwnershipBadges } from "@/components/ownership-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { statusLabels } from "@/lib/labels";
import { api } from "@/lib/orpc";

// Pagina auth/no-auth: il gioco si vede sempre, `entry` arriva popolata solo se
// chi guarda è autenticato e ce l'ha nel backlog.
export default function GamePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data, isPending, error } = useQuery(api.games.byId.queryOptions({ input: { id } }));

  if (isPending) {
    return (
      <main className="mx-auto grid max-w-2xl gap-4 p-6">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-32 w-full rounded-xl" />
      </main>
    );
  }

  if (error) {
    return (
      <main className="mx-auto grid max-w-2xl gap-4 p-6">
        <h1 className="text-2xl font-semibold tracking-tight">Gioco non trovato</h1>
        <p className="text-muted-foreground">
          Questo gioco non esiste, o è stato rimosso dal catalogo.
        </p>
        <Button variant="outline" className="w-fit" nativeButton={false} render={<Link href="/" />}>
          Torna al catalogo
        </Button>
      </main>
    );
  }

  const { game, entry } = data;

  return (
    <main className="mx-auto grid max-w-2xl gap-6 p-6">
      <header className="grid gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{game.name}</h1>
        <div className="flex flex-wrap gap-2">
          {game.igdbId === null ? (
            <Badge variant="secondary">Non ancora risolto su IGDB</Badge>
          ) : (
            <Badge variant="secondary">IGDB {game.igdbId}</Badge>
          )}
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{entry ? "Nel tuo backlog" : "Non ce l'hai"}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          {entry ? (
            <>
              <p>
                Stato: <span className="font-medium">{statusLabels[entry.status]}</span>
              </p>
              <OwnershipBadges ownerships={entry.ownerships} />
              <Button
                variant="outline"
                className="w-fit"
                nativeButton={false}
                render={<Link href="/backlog" />}
              >
                Vai al backlog
              </Button>
            </>
          ) : (
            <p className="text-muted-foreground">
              Questo gioco non è nel tuo backlog. Puoi aggiungerlo dalla pagina del
              backlog.
            </p>
          )}
        </CardContent>
      </Card>

      {/* I metadata (durata, voti, generi) arrivano allo step 3 con l'enrichment. */}
      <p className="text-muted-foreground">
        Durata, voti e generi arriveranno quando sarà pronto il recupero dati esterni.
      </p>
    </main>
  );
}
