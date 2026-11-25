import type { Medium, Store, UserTag, UserTagKind } from '@repo/contracts';
import { mediumValues, storeValues, userTagKindValues } from '@repo/contracts';
import {
  Button,
  Input,
  ScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Text,
  Textarea,
  XStack,
  YStack,
  toast,
} from '@repo/ui';
import { Plus, X } from '@repo/ui/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useTranslations } from 'use-intl';

import { CopyCard } from '../../../components/game-sections';
import { api, client } from '../../../lib/orpc';

type TagDraft = { kind: UserTagKind; name: string };
const NONE = 'none';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap={10}>
      <Text fontFamily="heading" fontSize={17} fontWeight="700" color="color12">
        {title}
      </Text>
      {children}
    </YStack>
  );
}

function Choice<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <Select
      items={items}
      value={value}
      onValueChange={(next: string) => onChange(next as T)}
    >
      <SelectTrigger width="100%" self="stretch" height={44} minH={44}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {(Object.keys(items) as T[]).map((key) => (
          <SelectItem key={key} value={key}>
            {items[key]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Note, tag, categorie e copie di una voce, senza uscire dall'app. */
export default function EditEntry() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const t = useTranslations('edit');
  const tStore = useTranslations('store');
  const tMedium = useTranslations('medium');
  const queryClient = useQueryClient();
  const page = useQuery(api.games.bySlug.queryOptions({ input: { slug } }));
  const platforms = useQuery(api.platforms.list.queryOptions());
  const vocabulary = useQuery(api.tags.list.queryOptions());
  const entry = page.data?.entry ?? null;

  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<TagDraft[]>([]);
  const [newTag, setNewTag] = useState<Record<UserTagKind, string>>({
    tag: '',
    category: '',
  });
  const [platform, setPlatform] = useState('');
  const [store, setStore] = useState<Store | typeof NONE>(NONE);
  const [medium, setMedium] = useState<Medium | typeof NONE>(NONE);

  useEffect(() => {
    if (!entry) return;
    setNotes(entry.notes ?? '');
    setTags(entry.tags.map((tag) => ({ kind: tag.kind, name: tag.name })));
    // Solo all'arrivo della voce: dopo, il modulo è di chi lo compila.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: api.backlog.list.key() }),
      queryClient.invalidateQueries({ queryKey: api.games.bySlug.key() }),
      queryClient.invalidateQueries({ queryKey: api.tags.list.key() }),
    ]);
  const save = useMutation({
    mutationFn: (id: string) =>
      client.backlog.update({ id, notes: notes.trim() || null, tags }),
    onSuccess: async () => {
      await refresh();
      router.back();
    },
    onError: () => toast.error(t('saveFailed')),
  });
  const addCopy = useMutation({
    mutationFn: (id: string) =>
      client.backlog.addOwnership({
        id,
        ownership: {
          platformSlug: platform,
          store: store === NONE ? null : store,
          medium: medium === NONE ? null : medium,
        },
      }),
    onSuccess: async () => {
      await refresh();
      setPlatform('');
      setStore(NONE);
      setMedium(NONE);
    },
    onError: () => toast.error(t('saveFailed')),
  });
  const removeCopy = useMutation({
    mutationFn: (input: { id: string; ownershipId: string }) =>
      client.backlog.removeOwnership(input),
    onSuccess: refresh,
    onError: () => toast.error(t('saveFailed')),
  });

  if (!entry)
    return (
      <YStack flex={1} bg="background" p={20} gap={16}>
        <Stack.Screen options={{ title: t('title') }} />
        {page.isPending ? (
          <Skeleton height={120} width="100%" rounded={12} />
        ) : (
          <Text color="color11">{t('notInBacklog')}</Text>
        )}
      </YStack>
    );

  const platformItems = Object.fromEntries(
    (platforms.data ?? []).map((item) => [item.slug, item.name]),
  );
  const platformName = (platformSlug: string) =>
    platformItems[platformSlug] ?? platformSlug;
  const storeItems = {
    [NONE]: t('noStore'),
    ...Object.fromEntries(storeValues.map((value) => [value, tStore(value)])),
  } as Record<Store | typeof NONE, string>;
  const mediumItems = {
    [NONE]: t('noMedium'),
    ...Object.fromEntries(mediumValues.map((value) => [value, tMedium(value)])),
  } as Record<Medium | typeof NONE, string>;

  const toggle = (tag: TagDraft) =>
    setTags((current) =>
      current.some((item) => item.kind === tag.kind && item.name === tag.name)
        ? current.filter(
            (item) => !(item.kind === tag.kind && item.name === tag.name),
          )
        : [...current, tag],
    );

  return (
    <YStack flex={1} bg="background">
      <Stack.Screen
        options={{
          title: t('title'),
          headerRight: () => (
            <Button
              size="sm"
              disabled={save.isPending}
              onPress={() => save.mutate(entry.id)}
            >
              {save.isPending ? t('saving') : t('save')}
            </Button>
          ),
        }}
      />
      <ScrollView
        flex={1}
        contentContainerStyle={{ padding: 20, gap: 28, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Section title={t('notes')}>
          <Textarea
            value={notes}
            onChangeText={setNotes}
            placeholder={t('notesPlaceholder')}
            minH={110}
          />
        </Section>

        {userTagKindValues.map((kind) => {
          const known: UserTag[] = (vocabulary.data ?? []).filter(
            (tag) => tag.kind === kind,
          );
          const names = [
            ...new Set([
              ...known.map((tag) => tag.name),
              ...tags.filter((tag) => tag.kind === kind).map((tag) => tag.name),
            ]),
          ];
          return (
            <Section
              key={kind}
              title={t(kind === 'tag' ? 'tags' : 'categories')}
            >
              <XStack flexWrap="wrap" gap={8}>
                {names.map((name) => {
                  const on = tags.some(
                    (tag) => tag.kind === kind && tag.name === name,
                  );
                  return (
                    <Button
                      key={name}
                      size="sm"
                      variant={on ? 'selection' : 'outline'}
                      aria-pressed={on}
                      onPress={() => toggle({ kind, name })}
                    >
                      {name}
                    </Button>
                  );
                })}
              </XStack>
              <XStack gap={8}>
                <Input
                  flex={1}
                  value={newTag[kind]}
                  onChangeText={(value) =>
                    setNewTag((current) => ({ ...current, [kind]: value }))
                  }
                  placeholder={t(kind === 'tag' ? 'newTag' : 'newCategory')}
                />
                <Button
                  size="icon"
                  variant="outline"
                  aria-label={t('add')}
                  disabled={newTag[kind].trim() === ''}
                  onPress={() => {
                    const name = newTag[kind].trim();
                    if (
                      !tags.some(
                        (tag) => tag.kind === kind && tag.name === name,
                      )
                    )
                      setTags((current) => [...current, { kind, name }]);
                    setNewTag((current) => ({ ...current, [kind]: '' }));
                  }}
                >
                  <Plus size={16} />
                </Button>
              </XStack>
            </Section>
          );
        })}

        <Section title={t('copies')}>
          {entry.ownerships.map((copy) => (
            <XStack key={copy.id} items="center" gap={8}>
              <YStack flex={1}>
                <CopyCard
                  copy={copy}
                  platformName={platformName(copy.platformSlug)}
                />
              </YStack>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t('removeCopy')}
                disabled={removeCopy.isPending || entry.ownerships.length === 1}
                onPress={() =>
                  Alert.alert(t('removeCopyTitle'), t('removeCopyText'), [
                    { text: t('cancel'), style: 'cancel' },
                    {
                      text: t('removeCopy'),
                      style: 'destructive',
                      onPress: () =>
                        removeCopy.mutate({
                          id: entry.id,
                          ownershipId: copy.id,
                        }),
                    },
                  ])
                }
              >
                <X size={18} />
              </Button>
            </XStack>
          ))}

          <YStack
            gap={10}
            p={12}
            rounded={12}
            borderWidth={1}
            borderStyle="dashed"
            borderColor="borderColor"
          >
            <Text fontWeight="600" color="color12">
              {t('addCopy')}
            </Text>
            <Choice
              items={{ '': t('choosePlatform'), ...platformItems }}
              value={platform}
              onChange={setPlatform}
            />
            <Choice items={storeItems} value={store} onChange={setStore} />
            <Choice items={mediumItems} value={medium} onChange={setMedium} />
            <Button
              disabled={platform === '' || addCopy.isPending}
              onPress={() => addCopy.mutate(entry.id)}
            >
              <Plus size={16} />
              {t('addCopy')}
            </Button>
          </YStack>
        </Section>
      </ScrollView>
    </YStack>
  );
}
