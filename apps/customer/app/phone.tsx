import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { PhoneAuth } from '@debt/shared';
import { LanguageControl } from '../src/components/LanguageControl';
import { isPreviewMode, isSupabaseConfigured, supabase } from '../src/lib/supabase';

export default function PhoneAuthScreen() {
  const router = useRouter();
  const { linkId } = useLocalSearchParams<{ linkId?: string }>();
  const { t } = useTranslation();
  return (
    <PhoneAuth
      languageControl={<LanguageControl />}
      signInAvailable={isSupabaseConfigured}
      previewMode={isPreviewMode}
      note={t('subscription.customerFree')}
      onBack={() => router.canGoBack() ? router.back() : router.replace('/')}
      onVerified={() => router.replace(linkId ? { pathname: '/invite', params: { linkId } } : '/home')}
      onPreviewContinue={() => router.replace('/home')}
      sendOtp={async (phone) => {
        const { error } = await supabase.auth.signInWithOtp({ phone });
        if (error) throw error;
      }}
      verifyOtp={async (phone, token) => {
        const { data, error } = await supabase.auth.verifyOtp({ phone, token, type: 'sms' });
        if (error) throw error;
        if (!data.session) throw new Error('Missing session');
      }}
    />
  );
}

