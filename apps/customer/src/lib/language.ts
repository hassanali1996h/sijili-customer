import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { getDeviceLanguage, isAppLanguage, setAppLanguage, type AppLanguage } from '@debt/shared';

const LANGUAGE_KEY = 'debt-ledger-language';

async function readLanguage(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return typeof localStorage === 'undefined' ? null : localStorage.getItem(LANGUAGE_KEY);
  }
  return SecureStore.getItemAsync(LANGUAGE_KEY);
}

async function saveLanguage(language: AppLanguage): Promise<void> {
  if (Platform.OS === 'web') {
    if (typeof localStorage !== 'undefined') localStorage.setItem(LANGUAGE_KEY, language);
    return;
  }
  await SecureStore.setItemAsync(LANGUAGE_KEY, language);
}

export async function restoreLanguage(): Promise<void> {
  let saved: string | null = null;
  try {
    saved = await readLanguage();
  } catch {
    // Keep language initialization available if local storage is unavailable.
  }
  await setAppLanguage(isAppLanguage(saved) ? saved : getDeviceLanguage());
}

export async function toggleLanguage(currentLanguage: string): Promise<void> {
  const nextLanguage: AppLanguage = currentLanguage.startsWith('ckb') ? 'ar' : 'ckb';
  await setAppLanguage(nextLanguage);
  try {
    await saveLanguage(nextLanguage);
  } catch {
    // The in-memory language change still applies for this session.
  }
}

