import {
  adminUsersDefaultSort,
  AdminUsersSortSchema,
  type AdminUser,
  type AdminUsersSort,
} from '@repo/contracts';
import {
  Badge,
  Button,
  ClearableInput,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Input,
  Label,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  toast,
  XStack,
  YStack,
} from '@repo/ui';
import { ChevronDown } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createFileRoute,
  useNavigate,
  useRouter,
} from '@tanstack/react-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { useFormatter, useTranslations } from 'use-intl';

import {
  AdminTable,
  CellText,
  type AdminColumn,
} from '@/components/admin/admin-table';
import { useApiErrorMessage } from '@/lib/api-error';
import { api, client } from '@/lib/orpc';
import { takeLinkClick } from '@/src/link-click';
import { useSession } from '@/src/use-session';

const PAGE_SIZE = 25;
const BAN_DAYS = [1, 7, 30, 365] as const;

type Search = { q?: string; page?: number } & Partial<AdminUsersSort>;
type ConfirmAction = 'makeAdmin' | 'removeAdmin' | 'revoke';
type Confirmation = { action: ConfirmAction; user: AdminUser; open: boolean };
type CloseAutoFocus = ComponentProps<typeof DialogContent>['onCloseAutoFocus'];

export const Route = createFileRoute('/_app/admin/users')({
  validateSearch: (search: Record<string, unknown>): Search => ({
    ...AdminUsersSortSchema.safeParse(search).data,
    q:
      typeof search.q === 'string'
        ? search.q.trim().slice(0, 100) || undefined
        : undefined,
    page:
      typeof search.page === 'number' &&
      Number.isSafeInteger(search.page * PAGE_SIZE) &&
      Number.isInteger(search.page) &&
      search.page > 1
        ? search.page
        : undefined,
  }),
  component: UsersSection,
});

function UsersSection() {
  const t = useTranslations('admin.users');
  const tSearch = useTranslations('search');
  const tBacklog = useTranslations('backlog');
  const format = useFormatter();
  const {
    q,
    page = 1,
    sort = adminUsersDefaultSort.sort,
    direction = adminUsersDefaultSort.direction,
  } = Route.useSearch();
  const sorting = { sort, direction };
  const router = useRouter();
  const navigate = useNavigate({ from: Route.fullPath });
  const errorMessage = useApiErrorMessage();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const me = session?.user.id;
  const [banning, setBanning] = useState<AdminUser | null>(null);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const dialogOrigin = useRef('');
  const closeConfirmation = useCallback(() => {
    // Il contenuto resta montato durante l’uscita per conservare il focus fino alla chiusura.
    setConfirmation((current) => current && { ...current, open: false });
  }, []);
  const restoreFocus: CloseAutoFocus = (event) => {
    const trigger = document.getElementById(dialogOrigin.current);
    if (!trigger) return;
    event.cancel();
    trigger.focus();
  };

  function openAction(
    action: ConfirmAction | 'ban',
    user: AdminUser,
    triggerId: string,
  ) {
    dialogOrigin.current = triggerId;
    if (action === 'ban') setBanning(user);
    else setConfirmation({ action, user, open: true });
  }

  const [text, setText] = useState(q ?? '');
  useEffect(() => setText(q ?? ''), [q]);
  useEffect(() => {
    const value = text.trim() || undefined;
    if (value === q) return;
    const timer = setTimeout(
      () =>
        void navigate({
          search: (prev) => ({ ...prev, q: value, page: undefined }),
          replace: true,
        }),
      300,
    );
    return () => clearTimeout(timer);
  }, [text, q, navigate]);

  const users = useQuery(
    api.admin.users.list.queryOptions({
      input: { q, sorting, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE },
    }),
  );

  const total = users.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  useEffect(() => {
    if (users.isSuccess && page > pageCount) {
      void navigate({
        search: (prev) => ({
          ...prev,
          page: pageCount > 1 ? pageCount : undefined,
        }),
        replace: true,
      });
    }
  }, [navigate, page, pageCount, users.isSuccess]);

  const goToPage = (target: number) =>
    void navigate({
      search: (prev) => ({ ...prev, page: target > 1 ? target : undefined }),
    });

  const act = useMutation({
    mutationFn: async ({
      action,
      user,
    }: {
      action: ConfirmAction | 'unban';
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

  useEffect(() => {
    // Il pulsante della riga deve essere di nuovo abilitato prima che torni il focus.
    if (act.isSuccess && act.data !== 'unban') closeConfirmation();
  }, [act.data, act.isSuccess, closeConfirmation]);

  const date = (value: Date) =>
    format.dateTime(value, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });

  const columns: AdminColumn<AdminUser>[] = [
    {
      key: 'account',
      header: t('account'),
      flex: 2,
      minWidth: 220,
      render: (user) => (
        <YStack flex={1} minW={0} gap={4}>
          <XStack gap={8} items="center" flexWrap="wrap">
            <Text
              fontSize={14}
              lineHeight="20px"
              fontWeight="600"
              style={{ overflowWrap: 'anywhere' }}
            >
              {user.name}
            </Text>
            {user.id === me ? (
              <Badge variant="secondary">{t('you')}</Badge>
            ) : null}
          </XStack>
          <CellText muted>{user.email}</CellText>
          {user.role === 'admin' ? (
            <Badge self="flex-start">{t('admin')}</Badge>
          ) : (
            <CellText muted>{t('member')}</CellText>
          )}
        </YStack>
      ),
    },
    {
      key: 'joined',
      header: t('joined'),
      width: 96,
      render: (user) => <CellText muted>{date(user.createdAt)}</CellText>,
    },
    {
      key: 'lastSeen',
      header: t('lastSeen'),
      width: 120,
      render: (user) => (
        <CellText muted>
          {user.lastSeenAt ? date(user.lastSeenAt) : t('never')}
        </CellText>
      ),
    },
    {
      key: 'games',
      header: t('games'),
      width: 62,
      align: 'end',
      render: (user) => <CellText>{format.number(user.games)}</CellText>,
    },
    {
      key: 'accounts',
      header: t('accounts'),
      width: 72,
      align: 'end',
      render: (user) => <CellText>{format.number(user.accounts)}</CellText>,
    },
    {
      key: 'state',
      header: t('state'),
      width: 170,
      render: (user) =>
        user.banned ? (
          <YStack gap={4}>
            <Badge variant="error" self="flex-start">
              {t('banned')}
            </Badge>
            <CellText muted>
              {user.banExpires
                ? t('banUntil', { date: date(user.banExpires) })
                : t('banForever')}
            </CellText>
          </YStack>
        ) : (
          <CellText>{t('allowed')}</CellText>
        ),
    },
    {
      key: 'actions',
      header: t('actions'),
      width: 110,
      align: 'end',
      render: (user) => {
        const isMe = user.id === me;
        const triggerId = `admin-user-actions-${user.id}`;
        return (
          <DropdownMenu align="end">
            <DropdownMenuTrigger
              render={
                <Button
                  id={triggerId}
                  size="sm"
                  variant="outline"
                  aria-label={t('actionsFor', { name: user.name })}
                  disabled={act.isPending}
                >
                  {t('actions')}
                  <ChevronDown size={14} />
                </Button>
              }
            />
            <DropdownMenuContent>
              {user.role === 'admin' ? (
                isMe ? null : (
                  <DropdownMenuItem
                    onClick={() => openAction('removeAdmin', user, triggerId)}
                  >
                    {t('removeAdmin')}
                  </DropdownMenuItem>
                )
              ) : (
                <DropdownMenuItem
                  onClick={() => openAction('makeAdmin', user, triggerId)}
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
                <DropdownMenuItem
                  destructive
                  onClick={() => openAction('ban', user, triggerId)}
                >
                  {t('ban')}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => openAction('revoke', user, triggerId)}
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
      <Text
        render="h2"
        fontSize={22}
        lineHeight="28px"
        fontFamily="heading"
        fontWeight="600"
      >
        {t('title')}
      </Text>
      <XStack
        gap={8}
        px={12}
        py={10}
        items="center"
        justify="space-between"
        flexWrap="wrap"
        bg="color2"
        rounded={12}
        borderWidth={1}
        borderColor="border-color"
      >
        <YStack width="280px max-sm:100%" minW={0}>
          <ClearableInput
            value={text}
            onChangeText={setText}
            placeholder={t('search')}
            aria-label={t('search')}
            clearLabel={tSearch('clear')}
            maxLength={100}
          />
        </YStack>
        {users.data ? (
          <Text fontSize={12} color="color11" role="status">
            {t('count', { count: total })}
          </Text>
        ) : null}
      </XStack>

      {users.isError ? (
        <EmptyState title={t('loadFailed')} />
      ) : page <= pageCount && users.data?.rows.length === 0 ? (
        <EmptyState title={t(q ? 'emptyFiltered' : 'empty')} />
      ) : (
        <AdminTable
          label={t('title')}
          columns={columns}
          rows={page <= pageCount ? users.data?.rows : undefined}
          rowKey={(user) => user.id}
          serverSort={{
            value: sorting,
            keys: AdminUsersSortSchema.shape.sort.options,
            onChange: (next) =>
              void navigate({
                search: (prev) => ({ ...prev, ...next, page: undefined }),
              }),
          }}
        />
      )}

      {users.isSuccess && pageCount > 1 && page <= pageCount ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          href={(target) =>
            router.buildLocation({
              from: Route.fullPath,
              to: Route.fullPath,
              search: (prev) => ({
                ...prev,
                page: target > 1 ? target : undefined,
              }),
            }).href
          }
          onNavigate={(target, event) => {
            if (takeLinkClick(event)) goToPage(target);
          }}
          label={tBacklog('pages')}
          previousLabel={tBacklog('previousPage')}
          nextLabel={tBacklog('nextPage')}
          goToLabel={tBacklog('goToPage')}
          onGoTo={goToPage}
        />
      ) : null}

      <Dialog
        open={confirmation?.open ?? false}
        onOpenChange={(open) => !open && !act.isPending && closeConfirmation()}
      >
        <DialogContent onCloseAutoFocus={restoreFocus} size="compact">
          {confirmation ? (
            <>
              <DialogHeader>
                <DialogTitle>{t(confirmation.action)}</DialogTitle>
                <DialogDescription style={{ overflowWrap: 'anywhere' }}>
                  {t('actionOn', {
                    name: confirmation.user.name,
                    email: confirmation.user.email,
                  })}
                </DialogDescription>
              </DialogHeader>
              <Text fontSize={14} lineHeight="20px">
                {t(`effect.${confirmation.action}`)}
              </Text>
              <DialogFooter>
                <Button
                  variant="outline"
                  disabled={act.isPending}
                  onPress={closeConfirmation}
                >
                  {t('cancel')}
                </Button>
                <Button
                  variant={
                    confirmation.action === 'revoke' ? 'destructive' : 'default'
                  }
                  disabled={act.isPending}
                  onPress={() => act.mutate(confirmation)}
                >
                  {t(confirmation.action)}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <BanDialog
        user={banning}
        onCloseAutoFocus={restoreFocus}
        onOpenChange={(open) => !open && setBanning(null)}
      />
    </YStack>
  );
}

function BanDialog({
  user,
  onCloseAutoFocus,
  onOpenChange,
}: {
  user: AdminUser | null;
  onCloseAutoFocus: CloseAutoFocus;
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
      <DialogContent onCloseAutoFocus={onCloseAutoFocus}>
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
              <SelectTrigger width="100%" aria-label={t('banExpires')}>
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
