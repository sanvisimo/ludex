import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
  XStack,
  YStack,
  Text,
} from '@repo/ui';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { useCaptcha } from '../components/captcha';
import { GuestScreen, TextLink } from '../components/guest-screen';
import { authClient } from '../lib/auth';
import { useAuthErrorMessage } from '../lib/auth-error';
import { openOnWeb } from '../lib/web-links';

export default function Login() {
  const t = useTranslations('login');
  const authErrorMessage = useAuthErrorMessage();
  const queryClient = useQueryClient();
  const captcha = useCaptcha();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email(
      { email, password },
      { headers: captcha.headers },
    );
    setPending(false);
    // Il token del CAPTCHA vale una volta, riuscito o no.
    captcha.reset();
    if (error) {
      setError(authErrorMessage(error, t('failed')));
      return;
    }
    // La cache può avere ancora i dati di chi c'era prima, se la sua sessione è
    // finita senza passare da «Esci».
    queryClient.clear();
  }

  return (
    <GuestScreen title={t('title')}>
      <YStack gap={8}>
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </YStack>
      <YStack gap={8}>
        <XStack justify="space-between" items="baseline">
          <Label htmlFor="password">{t('password')}</Label>
          <TextLink onPress={() => openOnWeb('/forgot-password')}>
            {t('forgot')}
          </TextLink>
        </XStack>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </YStack>

      {captcha.widget}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Button onPress={submit} disabled={pending || !captcha.ready}>
        {pending ? t('pending') : t('submit')}
      </Button>

      <XStack gap={6} justify="center">
        <Text color="$color11">{t('noAccount')}</Text>
        <TextLink onPress={() => router.replace('/register')}>
          {t('toRegister')}
        </TextLink>
      </XStack>
    </GuestScreen>
  );
}
