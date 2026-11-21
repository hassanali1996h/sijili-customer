import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Crypto from 'expo-crypto';
import { formatIqd, palette, radii } from '@debt/shared';
import { isPreviewMode, supabase } from '../src/lib/supabase';
import { requestAndRegisterPushToken, syncGrantedPushToken } from '../src/lib/notifications';
import { LanguageControl } from '../src/components/LanguageControl';

type LinkRow = { id: string; status: string; business_id: string; business?: { name?: string } | null; confirmed_balance_iqd?: number | string; pending_debt_iqd?: number | string };
type TransactionRow = { id: string; kind: 'debt' | 'payment'; amount_iqd: number | string; description: string; status: string; created_at: string; business_id: string };

export default function CustomerHomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [links, setLinks] = useState<LinkRow[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [busyTransactionId, setBusyTransactionId] = useState<string | null>(null);
  const [busyLinkId, setBusyLinkId] = useState<string | null>(null);
  const [responseAttempts, setResponseAttempts] = useState<Record<string, { decision: 'approve' | 'dispute'; key: string }>>({});
  const [pushStatus, setPushStatus] = useState<string>('permission_needed');

  useEffect(() => {
    let active = true;
    void syncGrantedPushToken(t('notifications.channel')).then((status) => {
      if (active) setPushStatus(status);
    });
    return () => { active = false; };
  }, [t]);

  const load = useCallback(async () => {
    setLoading(true);
    if (isPreviewMode) {
      setLinks([{ id: '00000000-0000-4000-8000-000000000011', status: 'active', business_id: '00000000-0000-4000-8000-000000000001', business: { name: 'متجر التجربة' }, confirmed_balance_iqd: 45000 }]);
      setTransactions([
        { id: '00000000-0000-4000-8000-000000000021', kind: 'debt', amount_iqd: 45000, description: 'مشتريات تجريبية', status: 'pending', created_at: new Date().toISOString(), business_id: '00000000-0000-4000-8000-000000000001' },
        { id: '00000000-0000-4000-8000-000000000022', kind: 'payment', amount_iqd: 10000, description: 'تسديد تجريبي', status: 'approved', created_at: new Date(Date.now() - 86_400_000).toISOString(), business_id: '00000000-0000-4000-8000-000000000001' },
      ]);
      setLoading(false);
      return;
    }
    const [{ data: linkData, error: linkError }, { data: txData, error: txError }] = await Promise.all([
      supabase.from('customer_links').select('id,status,business_id,business:businesses(name)').order('created_at', { ascending: false }),
      supabase.from('ledger_transactions').select('id,kind,amount_iqd,description,status,created_at,business_id').order('created_at', { ascending: false }).limit(100),
    ]);
    if (linkError) Alert.alert(t('common.error'), linkError.message);
    if (txError) Alert.alert(t('common.error'), txError.message);
    const linkRows = ((linkData ?? []) as LinkRow[]).filter((link) => link.status !== 'declined');
    const balanceRows = await Promise.all(linkRows.filter((link) => link.status === 'active').map(async (link) => {
      const { data } = await supabase.rpc('get_customer_balance', { p_link_id: link.id });
      const balance = Array.isArray(data) ? data[0] : data;
      return balance ? [link.id, balance] as const : null;
    }));
    const balanceByLink = new Map(balanceRows.filter((row): row is NonNullable<typeof row> => row !== null));
    setLinks(linkRows.map((link) => ({ ...link, ...(balanceByLink.get(link.id) ?? {}) })));
    setTransactions((txData ?? []) as TransactionRow[]);
    setLoading(false);
  }, [t]);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  async function acceptLink(id: string) {
    if (isPreviewMode) {
      setLinks((current) => current.map((link) => link.id === id ? { ...link, status: 'active' } : link));
      return;
    }
    setBusyLinkId(id);
    const { error } = await supabase.rpc('accept_customer_link', { p_link_id: id });
    setBusyLinkId(null);
    if (error) Alert.alert(t('common.error'), error.message);
    else await load();
  }

  async function declineLink(id: string) {
    if (isPreviewMode) {
      setLinks((current) => current.filter((link) => link.id !== id));
      return;
    }
    setBusyLinkId(id);
    const { error } = await supabase.rpc('decline_customer_link', { p_link_id: id });
    setBusyLinkId(null);
    if (error) Alert.alert(t('common.error'), error.message);
    else await load();
  }

  function confirmDecline(id: string) {
    Alert.alert(t('customer.declineInviteTitle'), t('customer.declineInviteConfirm'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('customer.decline'), style: 'destructive', onPress: () => void declineLink(id) },
    ]);
  }

  async function respond(id: string, decision: 'approve' | 'dispute') {
    if (isPreviewMode) {
      setTransactions((current) => current.map((transaction) => transaction.id === id ? { ...transaction, status: decision === 'approve' ? 'approved' : 'disputed' } : transaction));
      return;
    }
    setBusyTransactionId(id);
    const previousAttempt = responseAttempts[id];
    const idempotencyKey = previousAttempt?.decision === decision ? previousAttempt.key : Crypto.randomUUID();
    setResponseAttempts((current) => ({ ...current, [id]: { decision, key: idempotencyKey } }));
    const { error } = await supabase.rpc('respond_to_transaction', {
      p_transaction_id: id,
      p_decision: decision,
      p_idempotency_key: idempotencyKey,
    });
    setBusyTransactionId(null);
    if (error) Alert.alert(t('common.error'), error.message);
    else {
      setResponseAttempts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      await load();
    }
  }

  async function enableNotifications() {
    const status = await requestAndRegisterPushToken(t('notifications.channel'));
    setPushStatus(status);
    const messageKey = status === 'registered' ? 'notifications.enabled'
      : status === 'permission_denied' ? 'notifications.permissionDenied'
        : status === 'permission_needed' ? 'notifications.permissionNeeded'
          : status === 'error' ? 'notifications.error' : 'notifications.setupPending';
    Alert.alert(t('notifications.title'), t(messageKey));
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={palette.primary} /></View>;
  const locale = i18n.resolvedLanguage === 'ckb' ? 'ckb-IQ' : 'ar-IQ';
  const businessNames = new Map(links.map((link) => [link.business_id, link.business?.name ?? t('customer.shop')]));
  const pendingRequests = transactions.filter((row) => row.status === 'pending');
  const completedTransactions = transactions.filter((row) => row.status !== 'pending');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topbar}>
          <View style={styles.brand}>
            <View style={styles.brandMark}><View style={styles.brandMarkInner} /></View>
            <View>
              <Text style={styles.brandName}>{t('customer.shops')}</Text>
              <Text style={styles.brandCaption}>{t('app.customerName')}</Text>
            </View>
          </View>
          <View style={styles.topActions}>
            <LanguageControl />
            <Pressable accessibilityRole="button" accessibilityLabel={t('common.settings')} onPress={() => router.push('/settings')} style={styles.profileButton}>
              <Text style={styles.profileInitial}>•</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>{t('app.welcome')}</Text>
            <Text style={styles.title}>{t('customer.reviewRequest')}</Text>
            <Text style={styles.heroText}>{t('customer.shellNote')}</Text>
          </View>
          <View style={styles.heroSeal}><Text style={styles.heroSealText}>✓</Text></View>
          <View style={styles.heroOrbit} />
        </View>

        <View style={styles.notificationCard}>
          <View style={styles.notificationIcon}><View style={styles.bellBody} /><View style={styles.bellBase} /></View>
          <View style={styles.notificationCopy}>
            <Text style={styles.notificationTitle}>{t('notifications.title')}</Text>
            <Text style={styles.notificationText}>{t(pushStatus === 'registered' ? 'notifications.enabled' : pushStatus === 'permission_denied' ? 'notifications.permissionDenied' : pushStatus === 'error' ? 'notifications.error' : pushStatus === 'permission_needed' ? 'notifications.permissionNeeded' : 'notifications.setupPending')}</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => void enableNotifications()} style={styles.notificationButton}>
            <Text style={styles.notificationButtonText}>{t('notifications.enable')}</Text>
          </Pressable>
        </View>

        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <View style={styles.summaryIcon}><Text style={styles.summaryIconText}>!</Text></View>
            <Text style={styles.summaryValue}>{pendingRequests.length}</Text>
            <Text style={styles.summaryLabel}>{t('customer.pendingCount')}</Text>
          </View>
          <View style={[styles.summaryCard, styles.summaryCardSoft]}>
            <View style={[styles.summaryIcon, styles.summaryIconSoft]}><Text style={[styles.summaryIconText, styles.summaryIconTextSoft]}>⌂</Text></View>
            <Text style={styles.summaryValue}>{links.filter((link) => link.status === 'active').length}</Text>
            <Text style={styles.summaryLabel}>{t('customer.shopAccounts')}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{t('customer.requests')}</Text>
            {pendingRequests.length > 0 && <Text style={styles.countPill}>{pendingRequests.length}</Text>}
          </View>
          {pendingRequests.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>✓</Text></View>
              <Text style={styles.emptyTitle}>{t('customer.noRequests')}</Text>
              <Text style={styles.emptyText}>{t('customer.reviewRequest')}</Text>
            </View>
          ) : pendingRequests.map((request) => (
            <View key={request.id} style={styles.requestCard}>
              <View style={styles.requestTop}>
                <View style={styles.shopIdentity}>
                  <View style={styles.shopAvatar}><Text style={styles.shopAvatarText}>{(businessNames.get(request.business_id) ?? '•').trim().charAt(0)}</Text></View>
                  <View style={styles.shopCopy}>
                    <Text numberOfLines={1} style={styles.shopName}>{businessNames.get(request.business_id) ?? t('customer.shop')}</Text>
                    <Text style={styles.requestKind}>{t(request.kind === 'debt' ? 'customer.debt' : 'customer.payment')}</Text>
                  </View>
                </View>
                <View style={styles.pendingTag}><View style={styles.pendingDot} /><Text style={styles.pendingTagText}>{t('transaction.pendingStatus')}</Text></View>
              </View>
              <Text style={[styles.amount, request.kind === 'payment' && styles.paymentAmount]}>{formatIqd(String(request.amount_iqd), locale)}</Text>
              <Text style={styles.description}>{request.description || t('customer.noDescription')}</Text>
              <View style={styles.requestDivider} />
              <Text style={styles.reviewHint}>{t('customer.reviewRequest')}</Text>
              <View style={styles.actions}>
                <Pressable
                  accessibilityRole="button"
                  disabled={busyTransactionId === request.id}
                  onPress={() => void respond(request.id, 'approve')}
                  style={({ pressed }) => [styles.approveButton, pressed && styles.pressed, busyTransactionId === request.id && styles.disabled]}
                >
                  {busyTransactionId === request.id ? <ActivityIndicator color={palette.white} /> : <Text style={styles.approveText}>{t('customer.approve')}</Text>}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  disabled={busyTransactionId === request.id}
                  onPress={() => void respond(request.id, 'dispute')}
                  style={({ pressed }) => [styles.disputeButton, pressed && styles.pressed, busyTransactionId === request.id && styles.disabled]}
                >
                  <Text style={styles.disputeText}>{t('customer.dispute')}</Text>
                </Pressable>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{t('customer.shopAccounts')}</Text><Text style={styles.countPill}>{links.length}</Text></View>
          {links.length === 0 ? (
            <View style={styles.emptyCard}>
              <View style={styles.emptyIcon}><Text style={styles.emptyIconText}>⌂</Text></View>
              <Text style={styles.emptyTitle}>{t('customer.shops')}</Text>
              <Text style={styles.emptyText}>{t('customer.noShops')}</Text>
            </View>
          ) : links.map((link) => (
            <View key={link.id} style={styles.linkCard}>
              <Pressable
                disabled={link.status !== 'active'}
                onPress={() => router.push({ pathname: '/shop/[linkId]', params: { linkId: link.id } })}
                style={styles.linkDetails}
              >
                <View style={styles.shopAvatar}><Text style={styles.shopAvatarText}>{(link.business?.name ?? t('customer.shop')).trim().charAt(0)}</Text></View>
                <View style={styles.shopCopy}>
                  <Text numberOfLines={1} style={styles.shopName}>{link.business?.name ?? t('customer.shop')}</Text>
                  <Text style={styles.requestKind}>{link.status === 'invited' ? t('customer.invitePending') : t('customer.accountLinked')}</Text>
                  {link.status === 'active' && <Text style={styles.balanceMeta}>{t('customer.balance')}: {formatIqd(String(link.confirmed_balance_iqd ?? '0'), locale)} · {t('customer.pendingBalance')}: {formatIqd(String(link.pending_debt_iqd ?? '0'), locale)}</Text>}
                </View>
              </Pressable>
              {link.status === 'invited' ? (
                <View style={styles.inviteActions}>
                  <Pressable disabled={busyLinkId === link.id} onPress={() => void acceptLink(link.id)} style={styles.acceptButton}><Text style={styles.acceptText}>{t('customer.acceptLink')}</Text></Pressable>
                  <Pressable disabled={busyLinkId === link.id} onPress={() => confirmDecline(link.id)} style={styles.declineButton}><Text style={styles.declineText}>{t('customer.declineInvite')}</Text></Pressable>
                </View>
              ) : <View style={styles.linkedCheck}><Text style={styles.linkedCheckText}>✓</Text></View>}
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{t('customer.history')}</Text></View>
          {completedTransactions.length === 0 ? (
            <Text style={styles.historyEmpty}>{t('customer.noRequests')}</Text>
          ) : completedTransactions.slice(0, 8).map((transaction) => (
            <View key={transaction.id} style={styles.historyRow}>
              <View style={[styles.historyIcon, transaction.status === 'disputed' && styles.historyIconDisputed]}>
                <Text style={[styles.historyMark, transaction.status === 'disputed' && styles.historyMarkDisputed]}>{transaction.kind === 'debt' ? '−' : '+'}</Text>
              </View>
              <View style={styles.historyCopy}>
                <Text numberOfLines={1} style={styles.shopName}>{businessNames.get(transaction.business_id) ?? t('customer.shop')}</Text>
                <Text style={styles.requestKind}>{t(transaction.kind === 'debt' ? 'customer.debt' : 'customer.payment')} · {t(`transaction.${transaction.status === 'confirmed' ? 'confirmedStatus' : transaction.status === 'disputed' ? 'disputedStatus' : 'cancelledStatus'}`)}</Text>
              </View>
              <Text style={styles.historyAmount}>{formatIqd(String(transaction.amount_iqd), locale)}</Text>
            </View>
          ))}
        </View>

        <Pressable onPress={() => void load()} style={styles.refreshButton}><Text style={styles.refreshText}>{t('customer.refresh')}</Text></Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  content: { padding: 22, paddingBottom: 36, gap: 22 },
  topbar: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center' },
  brandMarkInner: { width: 13, height: 19, borderRadius: 4, borderWidth: 2, borderColor: palette.white },
  brandName: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  brandCaption: { color: palette.muted, fontSize: 11, marginTop: 2 },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  profileButton: { width: 42, height: 42, borderRadius: 15, backgroundColor: palette.primaryTint, alignItems: 'center', justifyContent: 'center' },
  profileInitial: { color: palette.primaryDark, fontSize: 18, fontWeight: '900' },
  hero: { minHeight: 150, borderRadius: radii.card, backgroundColor: palette.primaryDark, padding: 20, flexDirection: 'row', alignItems: 'center', overflow: 'hidden' },
  heroCopy: { flex: 1, gap: 7, zIndex: 1 },
  eyebrow: { color: '#A8D2BF', fontSize: 12, fontWeight: '800' },
  title: { color: palette.white, fontSize: 23, lineHeight: 31, fontWeight: '900' },
  heroText: { maxWidth: 250, color: '#D4E7DD', fontSize: 12, lineHeight: 18 },
  heroSeal: { width: 48, height: 48, borderRadius: 17, backgroundColor: '#2A6D5A', alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  heroSealText: { color: '#DFF2E7', fontSize: 25, fontWeight: '900' },
  heroOrbit: { position: 'absolute', width: 165, height: 165, borderRadius: 83, right: -59, bottom: -95, borderWidth: 1, borderColor: '#367562' },
  notificationCard: { minHeight: 74, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  notificationIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: palette.goldTint, alignItems: 'center', justifyContent: 'center' },
  bellBody: { width: 15, height: 17, borderWidth: 2, borderColor: '#9D6C27', borderTopLeftRadius: 9, borderTopRightRadius: 9, borderBottomLeftRadius: 5, borderBottomRightRadius: 5 },
  bellBase: { width: 21, height: 2, borderRadius: 1, backgroundColor: '#9D6C27', marginTop: -1 },
  notificationCopy: { flex: 1, gap: 3 },
  notificationTitle: { color: palette.ink, fontSize: 11, fontWeight: '800' },
  notificationText: { color: palette.muted, fontSize: 9, lineHeight: 14 },
  notificationButton: { minHeight: 36, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderRadius: 11, backgroundColor: palette.primaryTint, maxWidth: 98 },
  notificationButtonText: { color: palette.primaryDark, fontSize: 9, lineHeight: 13, fontWeight: '800', textAlign: 'center' },
  summaryRow: { flexDirection: 'row', gap: 12 },
  summaryCard: { flex: 1, minHeight: 116, borderRadius: 20, backgroundColor: palette.goldTint, padding: 15, gap: 4 },
  summaryCardSoft: { backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  summaryIcon: { width: 29, height: 29, borderRadius: 10, backgroundColor: '#F1D79D', alignItems: 'center', justifyContent: 'center' },
  summaryIconSoft: { backgroundColor: palette.primaryTint },
  summaryIconText: { color: '#986A27', fontSize: 17, fontWeight: '900' },
  summaryIconTextSoft: { color: palette.primary, fontSize: 20 },
  summaryValue: { color: palette.ink, fontSize: 25, lineHeight: 30, fontWeight: '900' },
  summaryLabel: { color: palette.muted, fontSize: 10, lineHeight: 15, fontWeight: '700' },
  section: { gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  sectionTitle: { color: palette.ink, fontSize: 18, fontWeight: '900' },
  countPill: { color: palette.primary, backgroundColor: palette.primaryTint, fontSize: 11, fontWeight: '800', overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill, marginStart: 'auto' },
  emptyCard: { minHeight: 142, alignItems: 'center', justifyContent: 'center', padding: 20, gap: 7, borderRadius: 21, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  emptyIcon: { width: 40, height: 40, borderRadius: 14, backgroundColor: palette.primaryTint, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  emptyIconText: { color: palette.primary, fontSize: 20, fontWeight: '900' },
  emptyTitle: { color: palette.ink, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  emptyText: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  requestCard: { borderRadius: 21, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 15, gap: 11 },
  requestTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  shopIdentity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 9 },
  shopAvatar: { width: 39, height: 39, borderRadius: 14, backgroundColor: palette.primaryTint, alignItems: 'center', justifyContent: 'center' },
  shopAvatarText: { color: palette.primary, fontSize: 15, fontWeight: '900' },
  shopCopy: { flex: 1, gap: 3 },
  shopName: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  requestKind: { color: palette.muted, fontSize: 10 },
  balanceMeta: { color: palette.primaryDark, fontSize: 10, lineHeight: 16, fontWeight: '700' },
  pendingTag: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: palette.goldTint, paddingHorizontal: 8, paddingVertical: 6, borderRadius: radii.pill },
  pendingDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#B17C2F' },
  pendingTagText: { color: '#8F6528', fontSize: 9, fontWeight: '800' },
  amount: { color: palette.ink, fontSize: 27, lineHeight: 34, fontWeight: '900', textAlign: 'left', writingDirection: 'ltr' },
  paymentAmount: { color: palette.primary },
  description: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  requestDivider: { height: 1, backgroundColor: palette.line },
  reviewHint: { color: palette.muted, fontSize: 10, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 9 },
  approveButton: { flex: 1, minHeight: 46, borderRadius: 14, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  approveText: { color: palette.white, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  disputeButton: { minHeight: 46, borderRadius: 14, borderWidth: 1, borderColor: '#E7C9C5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, backgroundColor: palette.white },
  disputeText: { color: palette.danger, fontSize: 12, fontWeight: '800' },
  linkCard: { minHeight: 69, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderRadius: 17, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  linkDetails: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  inviteActions: { alignItems: 'flex-end', gap: 5 },
  acceptButton: { minHeight: 38, paddingHorizontal: 10, borderRadius: 12, backgroundColor: palette.primary, alignItems: 'center', justifyContent: 'center', maxWidth: 128 },
  acceptText: { color: palette.white, fontSize: 10, fontWeight: '800', textAlign: 'center' },
  declineButton: { minHeight: 30, minWidth: 74, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  declineText: { color: palette.danger, fontSize: 9, fontWeight: '800' },
  linkedCheck: { width: 27, height: 27, borderRadius: 10, backgroundColor: palette.primaryTint, alignItems: 'center', justifyContent: 'center' },
  linkedCheckText: { color: palette.primary, fontWeight: '900' },
  historyEmpty: { color: palette.muted, fontSize: 12, padding: 15, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  historyRow: { minHeight: 63, flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 11, borderRadius: 16, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  historyIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: palette.primaryTint, alignItems: 'center', justifyContent: 'center' },
  historyIconDisputed: { backgroundColor: palette.dangerTint },
  historyMark: { color: palette.primary, fontSize: 20, fontWeight: '700' },
  historyMarkDisputed: { color: palette.danger },
  historyCopy: { flex: 1, gap: 3 },
  historyAmount: { color: palette.ink, fontSize: 11, fontWeight: '800' },
  refreshButton: { minHeight: 48, borderRadius: 15, backgroundColor: palette.primaryTint, alignItems: 'center', justifyContent: 'center' },
  refreshText: { color: palette.primaryDark, fontSize: 13, fontWeight: '800' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.6 },
});

