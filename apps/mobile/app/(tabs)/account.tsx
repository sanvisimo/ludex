import {
  Button,
  ScrollView,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import { ExternalLink } from '@repo/ui/icons';
import { useQueryClient } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';

import { authClient } from '../../lib/auth';
import type { LocaleChoice, ThemeChoice } from '../../lib/preferences';
import { usePreferences } from '../../lib/preferences';
import { openOnWeb } from '../../lib/web-links';

export default function Account() {
  const t = useTranslations('account');
  const tTheme = useTranslations('theme');
  const tLocale = useTranslations('locale');
  const tLegal = useTranslations('legal');
  const queryClient = useQueryClient();
  const { data: session } = authClient.useSession();
  const { theme, setTheme, locale, setLocale } = usePreferences();

  const themes: Record<ThemeChoice, string> = {
    system: tTheme('system'),
    light: tTheme('light'),
    dark: tTheme('dark'),
  };
  const locales: Record<LocaleChoice, string> = {
    system: tLocale('system'),
    it: tLocale('it'),
    en: tLocale('en'),
  };

  async function signOut() {
    await authClient.signOut();
    queryClient.clear();
  }

  return (
    <ScrollView flex={1} bg="$background" contentContainerStyle={{ p: 20 }}>
      <YStack gap={24}>
        <YStack gap={4}>
          <Text fontSize={20} fontWeight="700" color="$color12">
            {session?.user.name}
          </Text>
          <Text color="$color11">{session?.user.email}</Text>
        </YStack>

        <Section title={t('preferences')}>
          <Choice
            label={tTheme('label')}
            items={themes}
            value={theme}
            onChange={setTheme}
          />
          <Choice
            label={tLocale('label')}
            items={locales}
            value={locale}
            onChange={setLocale}
          />
        </Section>

        <Section title={t('onWeb')}>
          <WebRow label={t('profile')} path="/account/profile" />
          <WebRow label={t('libraries')} path="/account/libraries" />
          <WebRow label={t('deleteAccount')} path="/account/profile" />
        </Section>

        <XStack gap={16}>
          <Text color="$color11" onPress={() => openOnWeb('/privacy')}>
            {tLegal('privacy')}
          </Text>
          <Text color="$color11" onPress={() => openOnWeb('/terms')}>
            {tLegal('terms')}
          </Text>
        </XStack>

        <Button variant="outline" onPress={signOut}>
          {t('signOut')}
        </Button>
      </YStack>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <YStack gap={8}>
      <Text fontSize={12} fontWeight="600" color="$color11">
        {title.toUpperCase()}
      </Text>
      {children}
    </YStack>
  );
}

function Choice<T extends string>({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: Record<T, string>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <XStack items="center" justify="space-between" gap={12}>
      <Text color="$color12">{label}</Text>
      <Select
        items={items}
        value={value}
        onValueChange={(next: string) => onChange(next as T)}
      >
        <SelectTrigger width={180}>
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
    </XStack>
  );
}

function WebRow({ label, path }: { label: string; path: string }) {
  return (
    <Button
      variant="outline"
      justify="space-between"
      onPress={() => openOnWeb(path)}
    >
      <Text color="$color12">{label}</Text>
      <ExternalLink size={16} />
    </Button>
  );
}
