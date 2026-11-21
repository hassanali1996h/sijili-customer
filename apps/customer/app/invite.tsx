import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { palette, radii } from '@debt/shared';
import { supabase } from '../src/lib/supabase';

export default function CustomerInviteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ linkId?: string | string[] }>();
  const { t } = useTranslation();
  const linkId = Array.isArray(params.linkId) ? params.linkId[0] : params.linkId;
  const [checking, setChecking] = useState(true);
  const [status, setStatus] = useState<'sign_in' | 'not_available' | 'error'>('sign_in');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!active) return;
      if (!sessionData.session) {
        setChecking(false);
        return;
      }
      if (!linkId) {
        router.replace('/home');
        return;
      }
      const { data: invitation, error } = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(linkId)
        ? await supabase.from('customer_links').select('id').eq('id', linkId).maybeSingle()
        : { data: null, error: null };
      if (error) throw error;
      if (!active) return;
      if (invitation) router.replace('/home');
      else {
        setStatus('not_available');
        setChecking(false);
      }
    })().catch(() => {
      if (active) {
        setStatus('error');
        setChecking(false);
      }
    });
    return () => { active = false; };
  }, [linkId, retry, router]);

  async function continueWithPhone() {
    if (status === 'error') {
      setChecking(true);
      setRetry((current) => current + 1);
      return;
    }
    if (status === 'not_available') {
      const { error } = await supabase.auth.signOut({ scope: 'local' });
      if (error) {
        setStatus('error');
        return;
      }
    }
    router.replace(linkId ? { pathname: '/phone', params: { linkId } } : '/phone');
  }

  if (checking) return <View style={styles.center}><ActivityIndicator color={palette.primary} /></View>;

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.illustration}>
          <View style={styles.orbit} />
          <View style={styles.receipt}><View style={styles.receiptMark}><Text style={styles.receiptCheck}>✓</Text></View><View style={styles.receiptLine} /><View style={styles.receiptLineShort} /><View style={styles.receiptLine} /></View>
        </View>
        <Text style={styles.title}>{t(status === 'not_available' ? 'customer.inviteMismatchTitle' : 'customer.inviteWelcome')}</Text>
        <Text style={styles.body}>{t(status === 'error' ? 'common.error' : status === 'not_available' ? 'customer.inviteMismatch' : 'customer.inviteInstructions')}</Text>
        <Pressable accessibilityRole="button" onPress={() => void continueWithPhone()} style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>{t(status === 'error' ? 'customer.refresh' : status === 'not_available' ? 'customer.inviteSwitchAccount' : 'customer.inviteContinue')}</Text>
        </Pressable>
        {status === 'not_available' && <Pressable accessibilityRole="button" onPress={() => router.replace('/home')}><Text style={styles.privacyNote}>{t('common.back')}</Text></Pressable>}
        <Text style={styles.privacyNote}>{t('subscription.customerFree')}</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26, gap: 16 },
  illustration: { width: 190, height: 190, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  orbit: { position: 'absolute', width: 164, height: 164, borderRadius: 82, backgroundColor: palette.primaryTint, borderWidth: 1, borderColor: '#D5E8DE' },
  receipt: { width: 100, height: 126, borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 17, justifyContent: 'flex-end', gap: 9, transform: [{ rotate: '-5deg' }], shadowColor: '#123A30', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.12, shadowRadius: 14, elevation: 4 },
  receiptMark: { position: 'absolute', top: 14, alignSelf: 'center', width: 42, height: 42, borderRadius: 15, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
  receiptCheck: { color: palette.white, fontSize: 22, fontWeight: '900' },
  receiptLine: { height: 6, borderRadius: 3, backgroundColor: palette.line },
  receiptLineShort: { width: '70%', height: 6, borderRadius: 3, backgroundColor: palette.gold },
  title: { color: palette.ink, fontSize: 23, lineHeight: 32, fontWeight: '900', textAlign: 'center' },
  body: { maxWidth: 350, color: palette.muted, fontSize: 13, lineHeight: 22, textAlign: 'center' },
  button: { width: '100%', minHeight: 54, borderRadius: radii.control, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  pressed: { backgroundColor: palette.primaryDark },
  buttonText: { color: palette.white, fontSize: 14, fontWeight: '900' },
  privacyNote: { color: palette.muted, fontSize: 11, textAlign: 'center' },
});

