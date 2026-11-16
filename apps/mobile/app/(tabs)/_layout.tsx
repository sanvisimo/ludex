import { useTheme } from '@repo/ui';
import { CircleUser, Heart, Library, ListMusic } from '@repo/ui/icons';
import { Tabs } from 'expo-router';
import { useTranslations } from 'use-intl';

export default function TabsLayout() {
  const t = useTranslations('tabs');
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: theme.background?.val },
        headerTintColor: theme.color12?.val,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: theme.background?.val },
        tabBarStyle: {
          backgroundColor: theme.background?.val,
          borderTopColor: theme.borderColor?.val,
        },
        tabBarActiveTintColor: theme.accent11?.val,
        tabBarInactiveTintColor: theme.color11?.val,
      }}
    >
      <Tabs.Screen
        name="backlog"
        options={{
          title: t('backlog'),
          tabBarIcon: ({ focused, size }) => (
            <Library color={focused ? '$accent11' : '$color11'} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="playlist"
        options={{
          title: t('playlist'),
          tabBarIcon: ({ focused, size }) => (
            <ListMusic color={focused ? '$accent11' : '$color11'} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="wishlist"
        options={{
          title: t('wishlist'),
          tabBarIcon: ({ focused, size }) => (
            <Heart color={focused ? '$accent11' : '$color11'} size={size} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('account'),
          tabBarIcon: ({ focused, size }) => (
            <CircleUser
              color={focused ? '$accent11' : '$color11'}
              size={size}
            />
          ),
        }}
      />
    </Tabs>
  );
}
