"use client";

import { useSession } from "@repo/auth/client";
import type { UnresolvedImport } from "@repo/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFormatter, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { ResolveImportDialog } from "@/components/resolve-import-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiErrorMessage } from "@/lib/api-error";
import { api, client } from "@/lib/orpc";

export default function AccountPage() {
  const t = useTranslations("account");
  const format = useFormatter();
  const errorMessage = useApiErrorMessage();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: session, isPending: sessionPending } = useSession();
  const [profile, setProfile] = useState("");
  const [resolving, setResolving] = useState<UnresolvedImport | null>(null);

  const accounts = useQuery({
    ...api.accounts.list.queryOptions(),
    // Durante l'import la pagina si aggiorna da sola: il job dura decine di
    // secondi e lasciare l'utente a premere F5 sarebbe scortese.
    refetchInterval: (query) => (query.state.data?.some((row) => row.syncing) ? 3000 : false),
  });

  const unresolved = useQuery(api.imports.unresolved.queryOptions());

  const steam = accounts.data?.find((row) => row.store === "steam") ?? null;
  const syncing = steam?.syncing ?? false;

  // Finito l'import, backlog e scarti sono cambiati sotto i piedi.
  useEffect(() => {
    if (syncing) return;
    void queryClient.invalidateQueries({ queryKey: api.imports.unresolved.key() });
    void queryClient.invalidateQueries({ queryKey: api.backlog.list.key() });
  }, [syncing, queryClient]);

  async function refreshAccounts() {
    await queryClient.invalidateQueries({ queryKey: api.accounts.list.key() });
  }

  const link = useMutation({
    mutationFn: () => client.accounts.linkSteam({ profile: profile.trim() }),
    onSuccess: async () => {
      setProfile("");
      await refreshAccounts();
      toast.success(t("steam.linked"));
    },
    onError: (error) => toast.error(errorMessage(error, { fallback: t("steam.linkFailed") })),
  });

  const unlink = useMutation({
    mutationFn: () => client.accounts.unlinkSteam(),
    onSuccess: async () => {
      await Promise.all([
        refreshAccounts(),
        queryClient.invalidateQueries({ queryKey: api.imports.unresolved.key() }),
      ]);
      toast.success(t("steam.unlinked"));
    },
    onError: (error) => toast.error(errorMessage(error, { fallback: t("steam.unlinkFailed") })),
  });

  const sync = useMutation({
    mutationFn: () => client.accounts.syncSteam(),
    onSuccess: async () => {
      await refreshAccounts();
      toast.success(t("steam.syncStarted"));
    },
    onError: (error) =>
      toast.error(
        errorMessage(error, {
          fallback: t("steam.syncFailed"),
          // Lo stesso codice dice cose diverse a seconda di cosa si stava
          // facendo: qui un conflitto è "c'è già un import in corso".
          CONFLICT: t("steam.alreadySyncing"),
        }),
      ),
  });

  const dismiss = useMutation({
    mutationFn: (id: string) => client.imports.dismiss({ id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: api.imports.unresolved.key() }),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t("unresolved.dismissFailed") })),
  });

  // La pagina non ha senso da anonimo: parla dell'account di chi la guarda.
  useEffect(() => {
    if (!sessionPending && !session) router.replace("/login");
  }, [sessionPending, session, router]);

  if (sessionPending || !session) {
    return (
      <main className="mx-auto grid max-w-4xl gap-6 p-6">
        <Skeleton className="h-32 w-full rounded-xl" />
      </main>
    );
  }

  return (
    <main className="mx-auto grid max-w-4xl gap-6 p-6">
      <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>

      <Card>
        <CardHeader>
          <CardTitle>{t("profile.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-1">
          <p className="font-medium">{session.user.name}</p>
          <p className="text-muted-foreground">{session.user.email}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("steam.title")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4">
          {accounts.isPending ? (
            <Skeleton className="h-9 w-full rounded-lg" />
          ) : steam ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="secondary">{steam.externalAccountId}</Badge>
                <span className="text-muted-foreground">
                  {syncing
                    ? t("steam.syncing")
                    : steam.lastSyncAt
                      ? t("steam.lastSync", { when: format.relativeTime(steam.lastSyncAt) })
                      : t("steam.neverSynced")}
                </span>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button onClick={() => sync.mutate()} disabled={syncing || sync.isPending}>
                  {t("steam.sync")}
                </Button>
                <Button variant="ghost" onClick={() => unlink.mutate()} disabled={unlink.isPending}>
                  {t("steam.unlink")}
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-2">
                <Label htmlFor="profilo">{t("steam.profileLabel")}</Label>
                <div className="flex flex-wrap gap-2">
                  <Input
                    id="profilo"
                    className="min-w-64 flex-1"
                    value={profile}
                    onChange={(event) => setProfile(event.target.value)}
                    placeholder="https://steamcommunity.com/id/…"
                  />
                  <Button
                    onClick={() => link.mutate()}
                    disabled={profile.trim().length === 0 || link.isPending}
                  >
                    {t("steam.link")}
                  </Button>
                </div>
              </div>
              <p className="text-muted-foreground">{t("steam.hint")}</p>
            </>
          )}
        </CardContent>
      </Card>

      {(unresolved.data?.length ?? 0) > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("unresolved.title", { count: unresolved.data?.length ?? 0 })}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3">
            <p className="text-muted-foreground">{t("unresolved.description")}</p>
            <ul className="grid gap-2">
              {unresolved.data?.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 ring-1 ring-foreground/10"
                >
                  <div className="grid flex-1 gap-0.5">
                    <span className="font-medium">{entry.name}</span>
                    <span className="text-muted-foreground">
                      {entry.store} · {entry.externalId}
                      {entry.playtimeMinutes
                        ? ` · ${t("unresolved.hours", {
                            hours: Math.round(entry.playtimeMinutes / 60),
                          })}`
                        : ""}
                    </span>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setResolving(entry)}>
                    {t("unresolved.resolve")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => dismiss.mutate(entry.id)}
                    disabled={dismiss.isPending}
                  >
                    {t("unresolved.dismiss")}
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ResolveImportDialog
        entry={resolving}
        onOpenChange={(open) => {
          if (!open) setResolving(null);
        }}
      />
    </main>
  );
}
