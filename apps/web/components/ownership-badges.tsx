"use client";

import type { Ownership } from "@repo/contracts";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { useStoreLabels } from "@/lib/labels";
import { api } from "@/lib/orpc";

// Le righe di possesso portano lo slug della piattaforma, non il nome: il nome
// vive nella tabella di riferimento. Lo si risolve qui invece di gonfiare il
// contratto, tanto la lista è in cache e non cambia mai durante la sessione.
export function OwnershipBadges({ ownerships }: { ownerships: Ownership[] }) {
  const storeLabels = useStoreLabels();
  const { data: platforms } = useQuery({
    ...api.platforms.list.queryOptions(),
    staleTime: Infinity,
  });

  const nameBySlug = new Map((platforms ?? []).map((p) => [p.slug, p.name]));

  return (
    <div className="flex flex-wrap gap-1">
      {ownerships.map((ownership) => (
        <Badge key={ownership.id} variant="secondary">
          {nameBySlug.get(ownership.platformSlug) ?? ownership.platformSlug}
          {ownership.store ? ` · ${storeLabels[ownership.store]}` : ""}
        </Badge>
      ))}
    </div>
  );
}
