"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/orpc";

// Catalogo pubblico: "questi giochi Ludex li conosce". Volutamente anonimo —
// non dice chi li ha aggiunti, solo che esistono.
export default function CatalogPage() {
  const { data, isPending, error } = useQuery(api.games.latest.queryOptions({ input: {} }));

  return (
    <main className="mx-auto grid max-w-4xl gap-6 p-6">
      <header className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Ultimi giochi inseriti</h1>
        <p className="text-muted-foreground">Il catalogo che Ludex conosce finora.</p>
      </header>

      {error ? (
        <p className="text-destructive">Non riesco a caricare il catalogo.</p>
      ) : isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      ) : data.length === 0 ? (
        <Card>
          <CardContent className="text-muted-foreground">
            Ancora nessun gioco. Il catalogo si riempie man mano che vengono aggiunti.
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {data.map((game) => (
            <li key={game.id}>
              <Link href={`/games/${game.id}`} className="block">
                <Card className="transition-colors hover:bg-muted/50">
                  <CardContent className="flex items-baseline justify-between gap-4">
                    <span className="font-medium">{game.name}</span>
                    {game.igdbId === null && (
                      <span className="shrink-0 text-muted-foreground">non risolto</span>
                    )}
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
