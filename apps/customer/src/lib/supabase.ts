import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const previewOnly = process.env.EXPO_PUBLIC_DEBT_LEDGER_PREVIEW === '1';
export const isPreviewMode = previewOnly;
const supabaseUrl = previewOnly ? undefined : process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = previewOnly
  ? undefined
  : process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey
  && !supabaseUrl.includes('YOUR_PROJECT') && !supabaseAnonKey.includes('YOUR_SUPABASE'));

const secureStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(supabaseUrl ?? 'https://example.supabase.co', supabaseAnonKey ?? 'placeholder-anon-key', {
  auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

