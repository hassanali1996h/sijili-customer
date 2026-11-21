import { useRouter } from 'expo-router';
import { AccountSettings } from '@debt/shared';
import { LanguageControl } from '../src/components/LanguageControl';
import { supabase } from '../src/lib/supabase';

export default function SettingsScreen() {
  const router = useRouter();
  return (
    <AccountSettings
      languageControl={<LanguageControl />}
      onBack={() => router.canGoBack() ? router.back() : router.replace('/home')}
      onSignedOut={() => router.replace('/')}
      readDeletionRequest={async () => {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          router.replace('/');
          return false;
        }
        const { data, error } = await supabase.from('account_deletion_requests')
          .select('requested_at').eq('user_id', session.user.id).maybeSingle();
        if (error) throw error;
        return data !== null;
      }}
      requestDeletion={async () => {
        const { error } = await supabase.rpc('request_account_deletion');
        if (error) throw error;
      }}
      withdrawDeletion={async () => {
        const { error } = await supabase.rpc('withdraw_account_deletion_request');
        if (error) throw error;
      }}
      signOut={async () => {
        const { error } = await supabase.auth.signOut({ scope: 'local' });
        if (error) throw error;
      }}
    />
  );
}

