import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from '../../lib/supabase';

// Configure how notifications appear when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) {
    console.warn('Las notificaciones push solo funcionan en dispositivos físicos');
    return null;
  }

  // Request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.warn('No se concedieron permisos para notificaciones push');
    return null;
  }

  // Get Expo push token.
  // In Expo Go there is no EAS projectId – skip silently to avoid the red error.
  // To enable real push notifications, add EXPO_PUBLIC_PROJECT_ID=<eas-project-id> to .env
  const projectId = process.env.EXPO_PUBLIC_PROJECT_ID;
  if (!projectId) {
    console.log('ℹ️ Sin EXPO_PUBLIC_PROJECT_ID – push notifications desactivadas en Expo Go');
    return null;
  }

  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  const token = tokenData.data;

  // Configure Android channel
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'GameVault',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#10b981',
    });
  }

  return token;
}

export async function saveDeviceToken(userId: string, token: string): Promise<void> {
  const { error } = await supabase
    .from('device_tokens')
    .upsert(
      { user_id: userId, token, platform: Platform.OS, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,token' }
    );

  if (error) {
    console.error('Error guardando token del dispositivo:', error);
  }
}

export async function removeDeviceToken(userId: string, token: string): Promise<void> {
  await supabase
    .from('device_tokens')
    .delete()
    .match({ user_id: userId, token });
}
