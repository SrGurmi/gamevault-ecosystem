import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { supabase } from '@/lib/supabase';
import { registerForPushNotificationsAsync, saveDeviceToken } from '@/src/services/notifications';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  // SDK 53: subscription object has its own .remove() method
  const notificationListener = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    const setupNotificationsForUser = async (userId: string) => {
      try {
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await saveDeviceToken(userId, token);
        }

        // Only add listener once
        if (!notificationListener.current) {
          notificationListener.current = Notifications.addNotificationResponseReceivedListener(response => {
            console.log('Notification response:', response);
          });
        }
      } catch (err) {
        console.error('Notification setup error:', err);
      }
    };

    // Setup on mount if already logged in
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setupNotificationsForUser(user.id);
    });

    // Re-setup whenever auth state changes (login)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
        setupNotificationsForUser(session.user.id);
      }
    });

    return () => {
      subscription.unsubscribe();
      // Use .remove() on the subscription — works in both Expo Go and dev builds
      notificationListener.current?.remove();
    };
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
      </Stack>
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}
