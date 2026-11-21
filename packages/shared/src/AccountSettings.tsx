import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { palette, radii } from './theme';

type Props = {
  languageControl: ReactNode;
  onBack: () => void;
  onSignedOut: () => void;
  readDeletionRequest: () => Promise<boolean>;
  requestDeletion: () => Promise<void>;
  withdrawDeletion: () => Promise<void>;
  signOut: () => Promise<void>;
};

export function AccountSettings({ languageControl, onBack, onSignedOut, readDeletionRequest, requestDeletion, withdrawDeletion, signOut }: Props) {
  const { t } = useTranslation();
  const initialRead = useRef(readDeletionRequest);
  const inFlight = useRef(false);
  const [status, setStatus] = useState<'loading' | 'available' | 'requested' | 'unavailable'>('loading');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);
  const [privacyExpanded, setPrivacyExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    void initialRead.current().then(
      (requested) => { if (mounted) setStatus(requested ? 'requested' : 'available'); },
      () => { if (mounted) setStatus('unavailable'); },
    );
    return () => { mounted = false; };
  }, []);

  async function run(action: () => Promise<void>, onSuccess: () => void) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setActionFailed(false);
    try {
      await action();
      onSuccess();
    } catch {
      setActionFailed(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function submitDeletion() {
    void run(requestDeletion, () => {
      setConfirming(false);
      setStatus('requested');
    });
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={onBack} style={styles.back}>
            <Text style={styles.backText}>‹</Text>
          </Pressable>
          <Text accessibilityRole="header" style={styles.title}>{t('common.settings')}</Text>
        </View>
        <View style={[styles.card, styles.languageRow]}>
          <Text style={styles.label}>{t('app.language')}</Text>
          {languageControl}
        </View>
        <View style={styles.card}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: privacyExpanded }} style={styles.action}
            onPress={() => setPrivacyExpanded((expanded) => !expanded)}>
            <Text style={styles.label}>{t('account.privacyTitle')}</Text>
          </Pressable>
          {privacyExpanded && (
            <>
              <Text style={styles.body}>{t('account.privacyPhone')}</Text>
              <Text style={styles.body}>{t('account.privacyLedger')}</Text>
              <Text style={styles.body}>{t('account.privacyNotifications')}</Text>
              <Text style={styles.body}>{t('account.privacyDeletion')}</Text>
            </>
          )}
        </View>
        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.label}>{t('account.deletionTitle')}</Text>
          <Text accessibilityLiveRegion="polite" style={styles.body}>
            {t(status === 'requested' ? 'account.requestReceived' : 'account.deletionBody')}
          </Text>
          {status === 'loading' && <ActivityIndicator color={palette.primary} />}
          {status === 'requested' && (
            <Pressable accessibilityRole="button" disabled={busy} style={styles.action}
              onPress={() => void run(withdrawDeletion, () => setStatus('available'))}>
              <Text style={styles.label}>{t(busy ? 'common.loading' : 'account.withdrawRequest')}</Text>
            </Pressable>
          )}
          {(status === 'available' || status === 'unavailable') && (
            confirming ? (
              <>
                <Text style={styles.body}>{t('account.confirmBody')}</Text>
                <Pressable accessibilityRole="button" disabled={busy} style={styles.action} onPress={submitDeletion}>
                  <Text style={styles.danger}>{t(busy ? 'common.loading' : 'account.submitRequest')}</Text>
                </Pressable>
                <Pressable accessibilityRole="button" disabled={busy} style={styles.action} onPress={() => setConfirming(false)}>
                  <Text style={styles.label}>{t('common.cancel')}</Text>
                </Pressable>
              </>
            ) : (
              <Pressable accessibilityRole="button" disabled={busy} style={styles.action} onPress={() => setConfirming(true)}>
                <Text style={styles.danger}>{t('account.requestDeletion')}</Text>
              </Pressable>
            )
          )}
        </View>
        <Pressable accessibilityRole="button" disabled={busy} style={[styles.card, styles.action]} onPress={() => void run(signOut, onSignedOut)}>
          <Text style={styles.label}>{t('customer.signOut')}</Text>
        </Pressable>
        {actionFailed && <Text accessibilityRole="alert" style={styles.danger}>{t('common.error')}</Text>}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  content: { padding: 22, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: palette.surface },
  backText: { color: palette.ink, fontSize: 28 },
  title: { color: palette.ink, fontSize: 24, fontWeight: '800' },
  card: { padding: 16, gap: 10, borderWidth: 1, borderColor: palette.line, borderRadius: radii.card, backgroundColor: palette.surface },
  languageRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: palette.ink, fontSize: 15, fontWeight: '700' },
  body: { color: palette.muted, fontSize: 14, lineHeight: 22 },
  action: { minHeight: 46, justifyContent: 'center' },
  danger: { color: palette.danger, fontSize: 15, fontWeight: '800' },
});

