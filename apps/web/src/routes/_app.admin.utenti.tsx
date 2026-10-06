import type { AdminUser } from '@repo/contracts';
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { ChevronDown } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import {
  AdminTable,
  CellText,
  type AdminColumn,
} from '@/components/admin/admin-table';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';
import { useSession } from '@/src/use-session';

type Search = { q?: string };

export const Route = createFileRoute('/_app/admin/utenti')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    q: typeof search.q === 'string' && search.q ? search.q : undefined,
  }),
  component: UsersSection,
});

/** Le scadenze del ban che si propongono: senza, è per sempre. */
const BAN_DAYS = [1, 7, 30, 365] as const;

/**
 * Gli utenti (11a, frame 7 del wireframe): chi c'è, quanto usa Ludex, e i
 * gesti del plugin `admin` di Better Auth — ruolo, ban, sessioni. Niente
 * cancellazione (step 16) e niente impersonazione.
 *
 * Sulla propria riga «Togli admin» e «Banna» non ci sono: il server li
 * rifiuterebbe comunque, e il proprio ruolo non si toglie, o si resterebbe
 * senza admin.
 */
function UsersSection() {
  const t = useTranslations('admin.users');
  const format = useFormatter();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const me = session?.user.id;
  const [banning, setBanning] = useState<AdminUser | null>(null);

  const [text, setText] = useState(search.q ?? '');
  useEffect(() => setText(search.q ?? ''), [search.q]);
  useEffect(() => {
    const value = text.trim() || undefined;
    if (value === search.q) return;
    const timer = setTimeout(
      () => void navigate({ search: { q: value }, replace: true }),
      300,
    );
    return () => clearTimeout(timer);
  }, [text, search.q, navigate]);

  const users = useQuery(
    api.admin.users.list.queryOptions({
      input: { q: search.q, limit: 100 },
    }),
  );

  // Una mutazione sola per i gesti del menu: cambiano tutti la stessa lista.
  const act = useMutation({
    mutationFn: async ({
      action,
      user,
    }: {
      action: 'makeAdmin' | 'removeAdmin' | 'unban' | 'revoke';
      user: AdminUser;
    }) => {
      if (action === 'makeAdmin' || action === 'removeAdmin')
        await client.admin.users.setRole({
          userId: user.id,
          role: action === 'makeAdmin' ? 'admin' : 'user',
        });
      else if (action === 'unban')
        await client.admin.users.unban({ userId: user.id });
      else await client.admin.users.revokeSessions({ userId: user.id });
      return action;
    },
    onSuccess: async (action) => {
      await queryClient.invalidateQueries({
        queryKey: api.admin.users.key(),
      });
      toast.success(
        action === 'unban'
          ? t('unbanned')
          : action === 'revoke'
            ? t('revoked')
            : t('roleChanged'),
      );
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  const date = (value: Date) =>
    format.dateTime(value, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const columns: AdminColumn<AdminUser>[] = [
    {
      key: 'name',
      header: t('name'),
      flex: 1,
      render: (user) => (
        <>
          <CellText>{user.name}</CellText>
          {user.id === me ? (
            <Badge variant="secondary">{t('you')}</Badge>
          ) : null}
        </>
      ),
    },
    {
      key: 'email',
      header: t('email'),
      flex: 1.5,
      render: (user) => <CellText muted>{user.email}</CellText>,
    },
    {
      key: 'joined',
      header: t('joined'),
      width: 96,
      render: (user) => <CellText muted>{date(user.createdAt)}</CellText>,
    },
    {
      key: 'games',
      header: t('games'),
      width: 56,
      render: (user) => <CellText>{user.games}</CellText>,
    },
    {
      key: 'accounts',
      header: t('accounts'),
      width: 64,
      render: (user) => <CellText>{user.accounts}</CellText>,
    },
    {
      key: 'state',
      header: t('state'),
      width: 170,
      render: (user) => (
        <>
          {user.role === 'admin' ? <Badge>{t('admin')}</Badge> : null}
          {user.banned ? (
            <Badge variant="error">
              {user.banExpires
                ? t('bannedUntil', { date: date(user.banExpires) })
                : t('banned')}
            </Badge>
          ) : null}
        </>
      ),
    },
    {
      key: 'actions',
      header: '',
      width: 110,
      render: (user) => {
        const isMe = user.id === me;
        return (
          <DropdownMenu align="end">
            <DropdownMenuTrigger
              render={
                <Button size="sm" variant="outline" disabled={act.isPending}>
                  {t('actions')}
                  <ChevronDown size={14} />
                </Button>
              }
            />
            <DropdownMenuContent>
              {user.role === 'admin' ? (
                isMe ? null : (
                  <DropdownMenuItem
                    onClick={() => act.mutate({ action: 'removeAdmin', user })}
                  >
                    {t('removeAdmin')}
                  </DropdownMenuItem>
                )
              ) : (
                <DropdownMenuItem
                  onClick={() => act.mutate({ action: 'makeAdmin', user })}
                >
                  {t('makeAdmin')}
                </DropdownMenuItem>
              )}
              {user.banned ? (
                <DropdownMenuItem
                  onClick={() => act.mutate({ action: 'unban', user })}
                >
                  {t('unban')}
                </DropdownMenuItem>
              ) : isMe ? null : (
                <DropdownMenuItem onClick={() => setBanning(user)}>
                  {t('ban')}
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => act.mutate({ action: 'revoke', user })}
              >
                {t('revoke')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
      },
    },
  ];

  return (
    <YStack gap={16}>
      <XStack gap={12} items="center" flexWrap="wrap">
        <Text render="h2" fontSize={18} lineHeight={24} fontWeight="600">
          {t('title')}
        </Text>
        <Input
          width={280}
          value={text}
          onChangeText={setText}
          placeholder={t('search')}
          aria-label={t('search')}
        />
      </XStack>

      {users.isPending ? (
        <Skeleton height={200} width="100%" rounded={12} />
      ) : users.isError ? (
        <EmptyState title={t('loadFailed')} />
      ) : users.data.rows.length === 0 ? (
        <EmptyState title={t('empty')} />
      ) : (
        <AdminTable
          label={t('title')}
          columns={columns}
          rows={users.data.rows}
          rowKey={(user) => user.id}
        />
      )}

      <BanDialog
        user={banning}
        onOpenChange={(open) => !open && setBanning(null)}
      />
    </YStack>
  );
}

/** «Banna»: il motivo, facoltativo, e una scadenza, o per sempre. */
function BanDialog({
  user,
  onOpenChange,
}: {
  user: AdminUser | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('admin.users');
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const [reason, setReason] = useState('');
  const [days, setDays] = useState<string>('forever');

  useEffect(() => {
    setReason('');
    setDays('forever');
  }, [user]);

  const ban = useMutation({
    mutationFn: () =>
      client.admin.users.ban({
        userId: user!.id,
        reason: reason.trim() || undefined,
        expiresInDays: days === 'forever' ? undefined : Number(days),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: api.admin.users.key() });
      toast.success(t('banned_'));
      onOpenChange(false);
    },
    onError: (error) =>
      toast.error(errorMessage(error, { fallback: t('failed') })),
  });

  const options = Object.fromEntries([
    ['forever', t('banForever')],
    ...BAN_DAYS.map((n) => [String(n), t('banDays', { count: n })]),
  ]);

  return (
    <Dialog open={user !== null} onOpenChange={onOpenChange}>
      <DialogContent maxW={480}>
        <DialogHeader>
          <DialogTitle>{t('banTitle', { name: user?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('banHint')}</DialogDescription>
        </DialogHeader>

        <YStack gap={12}>
          <YStack gap={6}>
            <Label htmlFor="ban-reason">{t('banReason')}</Label>
            <Input
              id="ban-reason"
              value={reason}
              onChangeText={setReason}
              maxLength={200}
            />
          </YStack>
          <YStack gap={6}>
            <Label>{t('banExpires')}</Label>
            <Select items={options} value={days} onValueChange={setDays}>
              <SelectTrigger width="100%">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(options).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </YStack>
        </YStack>

        <DialogFooter>
          <Button
            variant="outline"
            onPress={() => onOpenChange(false)}
            disabled={ban.isPending}
          >
            {t('cancel')}
          </Button>
          <Button
            variant="destructive"
            onPress={() => ban.mutate()}
            disabled={ban.isPending}
          >
            {t('banConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
