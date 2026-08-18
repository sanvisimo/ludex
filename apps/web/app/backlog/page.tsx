"use client";

import type { BacklogStatus } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";

import { AddGameDialog } from "@/components/add-game-dialog";
import { OwnershipBadges } from "@/components/ownership-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { statusItems, statusOptions } from "@/lib/labels";
import { api, client } from "@/lib/orpc";

export default function BacklogPage() {
  const queryClient = useQueryClient();
  const backlog = useQuery(api.backlog.list.queryOptions());

  async function refresh() {
    await queryClient.invalidateQueries({ queryKey: api.backlog.list.key() });
  }

  const setStatus = useMutation({
    mutationFn: (input: { id: string; status: BacklogStatus }) =>
      client.backlog.setStatus(input),
    onSuccess: refresh,
    onError: () => toast.error("Non sono riuscito a cambiare lo stato"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => client.backlog.remove({ id }),
    onSuccess: async () => {
      await refresh();
      toast.success("Rimosso dal backlog");
    },
    onError: () => toast.error("Non sono riuscito a rimuovere il gioco"),
  });

  return (
    <main className="mx-auto grid max-w-4xl gap-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="grid gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">Il mio backlog</h1>
          <p className="text-muted-foreground">
            {backlog.data
              ? `${backlog.data.length} ${backlog.data.length === 1 ? "gioco" : "giochi"}`
              : " "}
          </p>
        </div>
        <AddGameDialog />
      </header>

      {backlog.error ? (
        <p className="text-destructive">Non riesco a caricare il backlog.</p>
      ) : backlog.isPending ? (
        <div className="grid gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      ) : backlog.data.length === 0 ? (
        <Card>
          <CardContent className="grid gap-2">
            <p className="font-medium">Il backlog è vuoto.</p>
            <p className="text-muted-foreground">
              Aggiungi il primo gioco: cerca il titolo, scegli su che piattaforma ce
              l&apos;hai, e comparirà qui.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="grid gap-2">
          {backlog.data.map((entry) => (
            <li key={entry.id}>
              <Card>
                <CardContent className="grid gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <Link
                      href={`/games/${entry.game.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {entry.game.name}
                    </Link>
                    <OwnershipBadges ownerships={entry.ownerships} />
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      items={statusItems}
                      value={entry.status}
                      onValueChange={(next) =>
                        setStatus.mutate({ id: entry.id, status: next as BacklogStatus })
                      }
                    >
                      <SelectTrigger className="w-44">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {statusOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-auto"
                      onClick={() => remove.mutate(entry.id)}
                      disabled={remove.isPending}
                    >
                      Rimuovi
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
