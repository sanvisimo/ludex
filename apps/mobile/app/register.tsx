import {
  Alert,
  AlertDescription,
  Button,
  Input,
  Label,
  Text,
  XStack,
  YStack,
} from '@repo/ui';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';

import { useCaptcha } from '../components/captcha';
import { GuestScreen, TextLink } from '../components/guest-screen';
import { authClient } from '../lib/auth';
import { useAuthErrorMessage } from '../lib/auth-error';
import { webUrl } from '../lib/env';

export default function Register() {
  const t = useTranslations('register');
  const authErrorMessage = useAuthErrorMessage();
  const captcha = useCaptcha();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setPending(true);
    setError(null);
    const { error } = await authClient.signUp.email(
      {
        name,
        email,
        password,
        // Il link dell'email si apre nel browser: la verifica è del sito.
        callbackURL: `${webUrl}/email-link?step=signup`,
      },
      { headers: captcha.headers },
    );
    setPending(false);
    captcha.reset();
    if (error) {
      setError(authErrorMessage(error, t('failed')));
      return;
    }
    // La registrazione non apre una sessione: si entra dopo il link.
    router.replace({ pathname: '/check-email', params: { email } });
  }

  return (
    <GuestScreen title={t('title')}>
      <YStack gap={8}>
        <Label htmlFor="name">{t('name')}</Label>
        <Input
          id="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </YStack>
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
        <Label htmlFor="password">{t('password')}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Text color="$color11">{t('passwordHint')}</Text>
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
        <Text color="$color11">{t('hasAccount')}</Text>
        <TextLink onPress={() => router.replace('/login')}>
          {t('toLogin')}
        </TextLink>
      </XStack>
    </GuestScreen>
  );
}
