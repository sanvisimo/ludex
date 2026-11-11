import type { HiddenItem, UnresolvedImport } from '@repo/contracts';
import { Button, YStack, toast } from '@repo/ui';
import { Eye, Link2 } from '@repo/ui/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { HiddenGameRow } from '@/components/hidden-game-row';
import { UnresolvedRow } from '@/components/unresolved-row';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';

export function HiddenList({
  items,
  onResolve,
}: {
  items: HiddenItem[];
  onResolve: (entry: UnresolvedImport) => void;
}) {
  const t = useTranslations('account.unresolved');
  const tReview = useTranslations('account.review');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const unhide = useMutation({
    mutationFn: (id: string) => client.imports.setHidden({ id, kind: null }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: api.imports.key() }),
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('hideFailed') })),
  });
  return (
    <YStack render="ul" p={0} m={0} gap={10}>
      {items.map((item) =>
        item.type === 'import' ? (
          <UnresolvedRow
            key={item.entry.id}
            entry={item.entry}
            badge={tReview('importItem')}
          >
            <Button
              size="sm"
              variant="outline"
              onClick={() => onResolve(item.entry)}
            >
              <Link2 size={16} color="$color12" />
              {t('resolve')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => unhide.mutate(item.entry.id)}
              disabled={unhide.isPending}
            >
              <Eye size={16} color="$color12" />
              {tReview('restoreImport')}
            </Button>
          </UnresolvedRow>
        ) : (
          <HiddenGameRow key={item.entry.id} entry={item.entry} />
        ),
      )}
    </YStack>
  );
}
