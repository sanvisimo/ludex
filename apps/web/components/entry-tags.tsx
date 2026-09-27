import type { UserTag } from '@repo/contracts';
import { Badge, XStack } from '@repo/ui';

/**
 * Categorie e tag personali di una riga di backlog.
 *
 * Le categorie stanno davanti e con più risalto: raggruppano, mentre i tag
 * qualificano. È l'unico posto dove la distinzione fra i due `kind` si vede.
 */
export function EntryTags({ tags }: { tags: UserTag[] }) {
  if (tags.length === 0) return null;

  const categories = tags.filter((tag) => tag.kind === 'category');
  const plain = tags.filter((tag) => tag.kind === 'tag');

  return (
    <XStack flexWrap="wrap" gap={4}>
      {categories.map((tag) => (
        <Badge key={tag.id}>{tag.name}</Badge>
      ))}
      {plain.map((tag) => (
        <Badge key={tag.id} variant="outline">
          {tag.name}
        </Badge>
      ))}
    </XStack>
  );
}
