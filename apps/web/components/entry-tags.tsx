import type { UserTag } from '@repo/contracts';
import { Badge, XStack } from '@repo/ui';

import { BadgeLink } from '@/components/badge-link';
import { useBacklogHref } from '@/lib/backlog-filter';

/**
 * Categorie e tag personali di una riga di backlog.
 *
 * Le categorie stanno davanti e con più risalto: raggruppano, mentre i tag
 * qualificano. È l'unico posto dove la distinzione fra i due `kind` si vede.
 *
 * Con `linked` ogni badge porta a `/backlog` filtrato per quel tag: sulla
 * pagina del gioco sì, nelle card no, perché stanno già dentro un link.
 */
export function EntryTags({
  tags,
  linked = false,
}: {
  tags: UserTag[];
  linked?: boolean;
}) {
  const backlogHref = useBacklogHref();
  if (tags.length === 0) return null;

  const categories = tags.filter((tag) => tag.kind === 'category');
  const plain = tags.filter((tag) => tag.kind === 'tag');
  const badge = (tag: UserTag, variant: 'default' | 'outline') =>
    linked ? (
      <BadgeLink
        key={tag.id}
        variant={variant}
        href={backlogHref({ tags: [tag.id] })}
      >
        {tag.name}
      </BadgeLink>
    ) : (
      <Badge key={tag.id} variant={variant}>
        {tag.name}
      </Badge>
    );

  return (
    <XStack flexWrap="wrap" gap={4}>
      {categories.map((tag) => badge(tag, 'default'))}
      {plain.map((tag) => badge(tag, 'outline'))}
    </XStack>
  );
}
