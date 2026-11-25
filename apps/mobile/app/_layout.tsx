import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { SpaceGrotesk_600SemiBold } from '@expo-google-fonts/space-grotesk/600SemiBold';
import { SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk/700Bold';
import { config, TamaguiProvider, Toaster, useTheme } from '@repo/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { IntlProvider } from 'use-intl';

import en from '../messages/en.json';
import it from '../messages/it.json';
import { authClient } from '../lib/auth';
import { PreferencesProvider, usePreferences } from '../lib/preferences';

const messages = { it, en };
const queryClient = new QueryClient();

// La schermata iniziale resta finché caratteri e sessione non sono arrivati:
// senza, il primo disegno sarebbe col carattere di sistema, o l'accesso per un
// istante anche a chi è già dentro.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  // Le chiavi sono i nomi delle famiglie, e devono essere **quelli** di `face`
  // in `packages/ui/src/fonts.ts`.
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
  });
  // Se un file non si carica si va avanti lo stesso: meglio un carattere
  // sbagliato di una schermata iniziale che non se ne va.
  if (!fontsLoaded && fontError === null) return null;

  return (
    <SafeAreaProvider>
      <PreferencesProvider>
        <Providers />
      </PreferencesProvider>
    </SafeAreaProvider>
  );
}

function Providers() {
  const { dark, resolvedLocale } = usePreferences();
  return (
    <TamaguiProvider config={config} defaultTheme={dark ? 'dark' : 'light'}>
      <IntlProvider locale={resolvedLocale} messages={messages[resolvedLocale]}>
        <QueryClientProvider client={queryClient}>
          <StatusBar style={dark ? 'light' : 'dark'} />
          <Routes />
          <Toaster />
        </QueryClientProvider>
      </IntlProvider>
    </TamaguiProvider>
  );
}

function Routes() {
  const theme = useTheme();
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isPending) void SplashScreen.hideAsync();
  }, [isPending]);

  if (isPending) return null;
  const signedIn = session !== null;

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.background?.val },
      }}
    >
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="login" />
        <Stack.Screen name="register" />
        <Stack.Screen name="check-email" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="games/[slug]"
          options={{
            headerShown: true,
            title: '',
            headerStyle: { backgroundColor: theme.background?.val },
            headerTintColor: theme.color12?.val,
            headerShadowVisible: false,
          }}
        />
        <Stack.Screen
          name="info"
          options={{
            headerShown: true,
            headerStyle: { backgroundColor: theme.background?.val },
            headerTintColor: theme.color12?.val,
            headerShadowVisible: false,
          }}
        />
      </Stack.Protected>
    </Stack>
  );
}
