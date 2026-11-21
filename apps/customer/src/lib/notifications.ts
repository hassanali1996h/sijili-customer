import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export type PushRegistrationStatus = 'registered' | 'permission_needed' | 'permission_denied' | 'missing_project_id' | 'web_unsupported' | 'error';

async function register(channelName: string, requestPermission: boolean): Promise<PushRegistrationStatus> {
  if (Platform.OS === 'web') return 'web_unsupported';
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return 'web_unsupported';

  const projectId = Constants.easConfig?.projectId ?? Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return 'missing_project_id';

  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: channelName,
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#176B55',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      if (!requestPermission) return 'permission_needed';
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return 'permission_denied';

    const token = await Notifications.getExpoPushTokenAsync({ projectId });
    const platform = Platform.OS === 'ios' ? 'ios' : 'android';
    const { error } = await supabase.rpc('register_push_token', { p_token: token.data, p_platform: platform });
    return error ? 'error' : 'registered';
  } catch {
    return 'error';
  }
}

export function syncGrantedPushToken(channelName: string): Promise<PushRegistrationStatus> {
  return register(channelName, false);
}

export function requestAndRegisterPushToken(channelName: string): Promise<PushRegistrationStatus> {
  return register(channelName, true);
}

