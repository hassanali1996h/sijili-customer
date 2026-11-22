import React, { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { normalizeIraqiPhone, normalizePhoneOtp } from './phone';
import { palette, radii } from './theme';

type Props = {
  languageControl: ReactNode;
  signInAvailable: boolean;
  previewMode?: boolean;
  note: string;
  onBack: () => void;
  sendOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  onVerified: () => void;
  onPreviewContinue?: () => void;
};

const RESEND_DELAY_MS = 30_000;

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? error.code : undefined;
}

function isRateLimited(code: unknown) {
  return code === 'over_sms_send_rate_limit' || code === 'over_request_rate_limit';
}

export function PhoneAuth({ languageControl, signInAvailable, previewMode = false, note, onBack, sendOtp, verifyOtp, onVerified, onPreviewContinue }: Props) {
  const { t } = useTranslation();
  const [phone, setPhone] = useState('+964');
  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const pending = useRef(false);
  const mounted = useRef(false);
  const retryAfter = useRef(new Map<string, number>());
  const normalizedPhone = normalizeIraqiPhone(phone);
  const secondsLeft = normalizedPhone
    ? Math.max(0, Math.ceil(((retryAfter.current.get(normalizedPhone) ?? 0) - Date.now()) / 1000))
    : 0;
  const coolingDown = secondsLeft > 0;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    if (!coolingDown) return;
    const timer = setInterval(() => setTick((tick) => tick + 1), 250);
    return () => clearInterval(timer);
  }, [coolingDown]);

  async function submit(action: () => Promise<void>, onError: (error: unknown) => void) {
    if (pending.current || !signInAvailable) return;
    pending.current = true;
    setBusy(true);
    setErrorKey(null);
    try {
      await action();
    } catch (error) {
      if (mounted.current) onError(error);
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }

  async function sendCode() {
    if (pending.current) return;
    if (!normalizedPhone) {
      setErrorKey('auth.invalidPhone');
      return;
    }
    if ((retryAfter.current.get(normalizedPhone) ?? 0) > Date.now()) return;

    await submit(async () => {
      await sendOtp(normalizedPhone);
      if (!mounted.current) return;
      retryAfter.current.set(normalizedPhone, Date.now() + RESEND_DELAY_MS);
      setPhone(normalizedPhone);
      setCode('');
      setSent(true);
    }, (error) => {
      if (isRateLimited(errorCode(error))) {
        retryAfter.current.set(normalizedPhone, Date.now() + RESEND_DELAY_MS);
        setErrorKey('auth.rateLimited');
        return;
      }
      setErrorKey('auth.sendFailed');
    });
  }

  async function verifyCode() {
    if (pending.current || !sent || !normalizedPhone) return;
    const normalizedCode = normalizePhoneOtp(code);
    if (!normalizedCode) {
      setErrorKey('auth.invalidCode');
      return;
    }

    await submit(async () => {
      await verifyOtp(normalizedPhone, normalizedCode);
      if (mounted.current) onVerified();
    }, (error) => {
      const code = errorCode(error);
      setErrorKey(isRateLimited(code) ? 'auth.rateLimited' : code === 'otp_expired' ? 'auth.expiredCode' : 'auth.verifyFailed');
    });
  }

  function goBack() {
    if (pending.current) return;
    if (!sent) {
      onBack();
      return;
    }
    setCode('');
    setErrorKey(null);
    setSent(false);
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.topbar}>
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} disabled={busy} onPress={goBack} style={styles.backButton}>
              <Text style={styles.backText}>‹</Text>
            </Pressable>
            <View style={styles.progressTrack}><View style={[styles.progressFill, sent && styles.progressComplete]} /></View>
            {languageControl}
          </View>

          <View style={styles.copy}>
            <View style={styles.iconCircle}><Text style={styles.iconText}>{sent ? '✓' : '↗'}</Text></View>
            <Text style={styles.eyebrow}>{t('auth.phone')}</Text>
            <Text style={styles.title}>{sent ? t('auth.code') : t('app.welcome')}</Text>
            <Text style={styles.subtitle}>{sent ? t('auth.codeSent') : t('auth.phoneHint')}</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>{t('auth.phone')}</Text>
              <TextInput
                value={phone}
                onChangeText={(value) => { setPhone(value); setErrorKey(null); }}
                keyboardType="phone-pad"
                autoComplete="tel"
                textContentType="telephoneNumber"
                textAlign="left"
                style={[styles.input, styles.ltrInput]}
                placeholder="+964 750 000 0000"
                placeholderTextColor="#AAB4AD"
                editable={signInAvailable && !sent && !busy}
                maxLength={24}
                returnKeyType="done"
                onSubmitEditing={() => !sent && void sendCode()}
              />
              <Text style={styles.hint}>{t('auth.phoneHint')}</Text>
            </View>
            {sent && (
              <View style={styles.field}>
                <Text style={styles.label}>{t('auth.code')}</Text>
                <TextInput
                  value={code}
                  onChangeText={(value) => { setCode(value); setErrorKey(null); }}
                  keyboardType="number-pad"
                  textAlign="center"
                  style={[styles.input, styles.codeInput]}
                  placeholder="••••••"
                  placeholderTextColor="#AAB4AD"
                  maxLength={9}
                  autoComplete="one-time-code"
                  textContentType="oneTimeCode"
                  editable={!busy}
                  returnKeyType="done"
                  onSubmitEditing={() => void verifyCode()}
                />
              </View>
            )}
          </View>

          <View style={styles.bottom}>
            {!signInAvailable && !previewMode && <Text accessibilityRole="alert" style={styles.hint}>{t('auth.previewSignInUnavailable')}</Text>}
            {previewMode && onPreviewContinue && (
              <Pressable accessibilityRole="button" onPress={onPreviewContinue} style={({ pressed }) => [styles.previewButton, pressed && styles.buttonPressed]}>
                <Text style={styles.previewButtonText}>{t('auth.previewContinue')}</Text>
              </Pressable>
            )}
            {errorKey && <Text accessibilityRole="alert" style={styles.error}>{t(errorKey)}</Text>}
            <Pressable
              accessibilityRole="button"
              disabled={!signInAvailable || busy || (!sent && coolingDown)}
              onPress={() => sent ? void verifyCode() : void sendCode()}
              style={({ pressed }) => [styles.button, pressed && styles.buttonPressed, (!signInAvailable || busy || (!sent && coolingDown)) && styles.buttonDisabled]}
            >
              {busy ? <ActivityIndicator color={palette.white} /> : <Text style={styles.buttonText}>{sent ? t('auth.verify') : t('auth.sendCode')}</Text>}
            </Pressable>
            {coolingDown ? (
              <Text style={styles.resend}>{t('auth.resendWait', { seconds: secondsLeft })}</Text>
            ) : sent && (
              <Pressable accessibilityRole="button" disabled={busy} onPress={() => void sendCode()}>
                <Text style={styles.resend}>{t('auth.resend')}</Text>
              </Pressable>
            )}
            <Text style={styles.privacyNote}>{note}</Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 23, paddingTop: 8, paddingBottom: 26, gap: 30 },
  topbar: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  backText: { color: palette.ink, fontSize: 28, lineHeight: 32 },
  progressTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#DDE4DE', overflow: 'hidden' },
  progressFill: { width: '45%', height: '100%', borderRadius: 3, backgroundColor: palette.primary },
  progressComplete: { width: '100%' },
  copy: { gap: 10, paddingTop: 22 },
  iconCircle: { width: 58, height: 58, borderRadius: 20, backgroundColor: palette.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  iconText: { color: palette.primary, fontSize: 25, fontWeight: '800' },
  eyebrow: { color: palette.primary, fontSize: 12, fontWeight: '800' },
  title: { color: palette.ink, fontSize: 29, lineHeight: 38, fontWeight: '900' },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 22 },
  form: { gap: 20 },
  field: { gap: 9 },
  label: { color: palette.ink, fontSize: 13, fontWeight: '800' },
  input: { minHeight: 58, borderWidth: 1, borderColor: palette.line, borderRadius: radii.control, backgroundColor: palette.surface, paddingHorizontal: 16, color: palette.ink, fontSize: 17 },
  ltrInput: { writingDirection: 'ltr' },
  codeInput: { fontSize: 24, letterSpacing: 8, fontWeight: '800' },
  hint: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  bottom: { marginTop: 'auto', gap: 13 },
  button: { minHeight: 58, borderRadius: radii.control, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  buttonPressed: { backgroundColor: palette.primaryDark },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: palette.white, fontSize: 15, fontWeight: '800' },
  previewButton: { minHeight: 52, borderRadius: radii.control, borderWidth: 1, borderColor: palette.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18 },
  previewButtonText: { color: palette.primary, fontSize: 14, fontWeight: '800' },
  resend: { textAlign: 'center', paddingVertical: 8, color: palette.primary, fontSize: 12, fontWeight: '800' },
  error: { color: palette.danger, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  privacyNote: { textAlign: 'center', color: palette.muted, fontSize: 10, lineHeight: 16 },
});

