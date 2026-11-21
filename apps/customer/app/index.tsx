import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { palette, radii } from '@debt/shared';
import { supabase } from '../src/lib/supabase';
import { LanguageControl } from '../src/components/LanguageControl';

export default function WelcomeScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setChecking(false);
      if (data.session) router.replace('/home');
    }).catch(() => alive && setChecking(false));
    return () => { alive = false; };
  }, [router]);

  if (checking) return <View style={styles.center}><ActivityIndicator color={palette.primary} /></View>;
  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.topbar}>
        <View style={styles.brand}>
          <View style={styles.brandMark}><View style={styles.brandMarkInner} /></View>
          <Text style={styles.brandText}>{t('app.customerName')}</Text>
        </View>
        <LanguageControl />
      </View>

      <View style={styles.content}>
        <View style={styles.illustration}>
          <View style={styles.orbit} />
          <View style={styles.receipt}>
            <View style={styles.receiptHeader}><Text style={styles.receiptCheck}>✓</Text></View>
            <View style={styles.receiptLineLong} />
            <View style={styles.receiptLine} />
            <View style={styles.receiptLineShort} />
            <View style={styles.receiptRule} />
            <View style={styles.receiptLine} />
          </View>
          <View style={styles.sparkle}><Text style={styles.sparkleText}>✦</Text></View>
        </View>

        <View style={styles.copy}>
          <Text style={styles.eyebrow}>{t('app.welcome')}</Text>
          <Text style={styles.title}>{t('customer.reviewRequest')}</Text>
          <Text style={styles.subtitle}>{t('customer.shellNote')}</Text>
        </View>

        <View style={styles.bottom}>
          <Pressable style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]} onPress={() => router.push('/phone')}>
            <Text style={styles.buttonText}>{t('app.continue')}</Text>
            <Text style={styles.arrow}>‹</Text>
          </Pressable>
          <View style={styles.trustRow}>
            <View style={styles.trustDot} />
            <Text style={styles.trustText}>{t('subscription.customerFree')}</Text>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  topbar: { minHeight: 56, paddingHorizontal: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandMark: { width: 30, height: 30, borderRadius: 10, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
  brandMarkInner: { width: 11, height: 16, borderRadius: 4, borderWidth: 2, borderColor: palette.white },
  brandText: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  content: { flex: 1, justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 14, paddingBottom: 26 },
  illustration: { height: 270, alignItems: 'center', justifyContent: 'center' },
  orbit: { position: 'absolute', width: 218, height: 218, borderRadius: 110, backgroundColor: palette.primaryTint, borderWidth: 1, borderColor: '#D5E8DE' },
  receipt: { width: 145, height: 175, borderRadius: 22, backgroundColor: palette.white, padding: 22, justifyContent: 'center', gap: 10, transform: [{ rotate: '5deg' }], shadowColor: '#123A30', shadowOffset: { width: 0, height: 14 }, shadowOpacity: 0.12, shadowRadius: 18, elevation: 5 },
  receiptHeader: { width: 32, height: 32, borderRadius: 16, backgroundColor: palette.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  receiptCheck: { color: palette.primary, fontSize: 18, fontWeight: '900' },
  receiptLineLong: { width: 82, height: 7, borderRadius: 4, backgroundColor: '#C7D9CE' },
  receiptLine: { width: 65, height: 6, borderRadius: 3, backgroundColor: '#E4EAE5' },
  receiptLineShort: { width: 46, height: 6, borderRadius: 3, backgroundColor: '#E4EAE5' },
  receiptRule: { height: 1, backgroundColor: palette.line, marginVertical: 2 },
  sparkle: { position: 'absolute', top: 39, left: '19%', width: 38, height: 38, borderRadius: 19, backgroundColor: palette.goldTint, alignItems: 'center', justifyContent: 'center' },
  sparkleText: { color: '#B17C2F', fontSize: 21 },
  copy: { gap: 12, paddingHorizontal: 2 },
  eyebrow: { color: palette.primary, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  title: { color: palette.ink, fontSize: 30, lineHeight: 41, fontWeight: '900', textAlign: 'center' },
  subtitle: { color: palette.muted, fontSize: 16, lineHeight: 26, textAlign: 'center', paddingHorizontal: 8 },
  bottom: { gap: 16 },
  button: { minHeight: 58, borderRadius: radii.control, backgroundColor: palette.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  buttonPressed: { backgroundColor: palette.primaryDark, transform: [{ scale: 0.99 }] },
  buttonText: { color: palette.white, fontSize: 16, fontWeight: '800' },
  arrow: { color: palette.white, fontSize: 24, lineHeight: 26 },
  trustRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 6 },
  trustDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: palette.primary },
  trustText: { color: palette.muted, fontSize: 12, textAlign: 'center' },
});

