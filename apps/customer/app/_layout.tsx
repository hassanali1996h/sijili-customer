import '@debt/shared';
import { Stack, useRouter } from 'expo-router';
import { I18nManager, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import * as Notifications from 'expo-notifications';
import { palette } from '@debt/shared';
import { restoreLanguage } from '../src/lib/language';

I18nManager.allowRTL(true);
I18nManager.forceRTL(true);

export default function RootLayout() {
  const router = useRouter();
  const [languageReady, setLanguageReady] = useState(false);

  useEffect(() => {
    let active = true;
    void restoreLanguage().finally(() => {
      if (active) setLanguageReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!languageReady || Platform.OS === 'web') return;
    const handled = new Set<string>();
    const openApp = (response: Notifications.NotificationResponse | null) => {
      const data = response?.notification.request.content.data;
      const identifier = response?.notification.request.identifier;
      if (!identifier || handled.has(identifier) || typeof data?.eventType !== 'string') return;
      handled.add(identifier);
      router.replace('/');
      void Notifications.clearLastNotificationResponseAsync();
    };
    const subscription = Notifications.addNotificationResponseReceivedListener(openApp);
    void Notifications.getLastNotificationResponseAsync().then(openApp).catch(() => {});
    return () => subscription.remove();
  }, [languageReady, router]);

  if (!languageReady) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background }}><ActivityIndicator color={palette.primary} /></View>;
  }

  return (
    <>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: palette.background } }} />
    </>
  );
}

