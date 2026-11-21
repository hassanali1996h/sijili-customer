import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { formatIqd, palette, radii } from '@debt/shared';
import { supabase } from '../../src/lib/supabase';

type ShopLink = {
  id: string;
  status: string;
  credit_limit_iqd: number | string;
  business?: { name?: string } | null;
};
type TransactionRow = {
  id: string;
  kind: 'debt' | 'payment';
  amount_iqd: number | string;
  description: string;
  status: string;
  created_at: string;
  due_at: string | null;
};
type Balance = { confirmed_balance_iqd: number | string; pending_debt_iqd: number | string; credit_limit_iqd: number | string };

const PAGE_SIZE = 25;

function statusTranslationKey(status: string) {
  if (status === 'confirmed') return 'transaction.confirmedStatus';
  if (status === 'disputed') return 'transaction.disputedStatus';
  if (status === 'cancelled') return 'transaction.cancelledStatus';
  return 'transaction.pendingStatus';
}

export default function ShopStatementScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ linkId?: string | string[] }>();
  const { t, i18n } = useTranslation();
  const linkId = Array.isArray(params.linkId) ? params.linkId[0] : params.linkId;
  const [link, setLink] = useState<ShopLink | null>(null);
  const [balance, setBalance] = useState<Balance | null>(null);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    if (!linkId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [{ data: linkData, error: linkError }, { data: balanceData, error: balanceError }, { data: txData, error: txError }] = await Promise.all([
      supabase.from('customer_links').select('id,status,credit_limit_iqd,business:businesses(name)').eq('id', linkId).maybeSingle(),
      supabase.rpc('get_customer_balance', { p_link_id: linkId }),
      supabase.from('ledger_transactions').select('id,kind,amount_iqd,description,status,created_at,due_at').eq('customer_link_id', linkId).order('created_at', { ascending: false }).range(0, PAGE_SIZE - 1),
    ]);
    if (linkError) Alert.alert(t('common.error'), linkError.message);
    if (balanceError) Alert.alert(t('common.error'), balanceError.message);
    if (txError) Alert.alert(t('common.error'), txError.message);
    setLink((linkData ?? null) as ShopLink | null);
    const parsedBalance = Array.isArray(balanceData) ? balanceData[0] : balanceData;
    setBalance(balanceError ? null : (parsedBalance as Balance | null));
    const rows = (txData ?? []) as TransactionRow[];
    setTransactions(rows);
    setHasMore(rows.length === PAGE_SIZE);
    setLoading(false);
  }, [linkId, t]);

  useEffect(() => { void load(); }, [load]);

  async function loadMore() {
    if (!linkId || loadingMore || !hasMore) return;
    setLoadingMore(true);
    const start = transactions.length;
    const { data, error } = await supabase.from('ledger_transactions')
      .select('id,kind,amount_iqd,description,status,created_at,due_at')
      .eq('customer_link_id', linkId)
      .order('created_at', { ascending: false })
      .range(start, start + PAGE_SIZE - 1);
    if (error) Alert.alert(t('common.error'), error.message);
    const rows = (data ?? []) as TransactionRow[];
    setTransactions((current) => [...current, ...rows]);
    setHasMore(rows.length === PAGE_SIZE);
    setLoadingMore(false);
  }

  async function shareStatement() {
    if (!link || !balance) return;
    const locale = i18n.resolvedLanguage === 'ckb' ? 'ckb-IQ' : 'ar-IQ';
    const shopName = link.business?.name ?? t('customer.shop');
    const lines = [
      t('customer.statementShared'),
      shopName,
      `${t('customer.balance')}: ${formatIqd(String(balance.confirmed_balance_iqd), locale)}`,
      `${t('customer.pendingBalance')}: ${formatIqd(String(balance.pending_debt_iqd), locale)}`,
      `${t('customer.creditLimit')}: ${formatIqd(String(balance.credit_limit_iqd), locale)}`,
      ...transactions.slice(0, 10).map((row) => `${new Date(row.created_at).toLocaleDateString(locale, { timeZone: 'Asia/Baghdad' })} · ${t(row.kind === 'debt' ? 'customer.debt' : 'customer.payment')} · ${formatIqd(String(row.amount_iqd), locale)} · ${t(statusTranslationKey(row.status))}`),
    ];
    await Share.share({ message: lines.join('\n'), title: t('customer.history') });
  }

  if (loading) return <View style={styles.center}><ActivityIndicator color={palette.primary} /></View>;
  if (!link) return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ title: t('customer.history'), headerShown: false }} />
      <View style={styles.missingState}>
        <Text style={styles.missingTitle}>{t('common.error')}</Text>
        <Pressable onPress={() => router.back()} style={styles.backAction}><Text style={styles.backActionText}>{t('common.back')}</Text></Pressable>
      </View>
    </SafeAreaView>
  );

  const locale = i18n.resolvedLanguage === 'ckb' ? 'ckb-IQ' : 'ar-IQ';
  const shopName = link.business?.name ?? t('customer.shop');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <Stack.Screen options={{ title: shopName, headerShown: false }} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.topbar}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('common.back')} onPress={() => router.back()} style={styles.backButton}><Text style={styles.backText}>‹</Text></Pressable>
          <View style={styles.topbarCopy}>
            <Text style={styles.kicker}>{t('customer.shopAccounts')}</Text>
            <Text numberOfLines={1} style={styles.topbarTitle}>{shopName}</Text>
          </View>
          <View style={styles.shopAvatar}><Text style={styles.shopAvatarText}>{shopName.trim().charAt(0)}</Text></View>
        </View>

        <View style={styles.balanceCard}>
          <View style={styles.balanceCardHeader}>
            <Text style={styles.balanceLabel}>{t('customer.balance')}</Text>
            <View style={styles.confirmedBadge}><View style={styles.confirmedDot} /><Text style={styles.confirmedText}>{t('transaction.confirmedStatus')}</Text></View>
          </View>
          <Text style={styles.balanceValue}>{balance ? formatIqd(String(balance.confirmed_balance_iqd), locale) : '—'}</Text>
          <View style={styles.balanceRule} />
          <View style={styles.balanceMetaRow}>
            <Text style={styles.balanceMetaLabel}>{t('customer.pendingBalance')}</Text>
            <Text style={styles.balanceMetaValue}>{balance ? formatIqd(String(balance.pending_debt_iqd), locale) : '—'}</Text>
          </View>
        </View>

        <View style={styles.limitCard}>
          <View style={styles.limitIcon}><Text style={styles.limitIconText}>⌁</Text></View>
          <View style={styles.limitCopy}><Text style={styles.limitLabel}>{t('customer.creditLimit')}</Text><Text style={styles.limitValue}>{balance ? formatIqd(String(balance.credit_limit_iqd), locale) : formatIqd(String(link.credit_limit_iqd), locale)}</Text></View>
          <Pressable disabled={!balance} onPress={() => void shareStatement()} style={({ pressed }) => [styles.shareButton, pressed && styles.pressed, !balance && styles.disabled]}>
            <Text style={styles.shareIcon}>↗</Text><Text style={styles.shareText}>{t('customer.shareStatement')}</Text>
          </Pressable>
        </View>

        <View style={styles.historyHeader}>
          <View><Text style={styles.historyTitle}>{t('customer.history')}</Text><Text style={styles.historySubtitle}>{t('customer.shellNote')}</Text></View>
          <Text style={styles.historyCount}>{transactions.length}</Text>
        </View>

        {transactions.length === 0 ? (
          <View style={styles.emptyCard}><View style={styles.emptyIcon}><Text style={styles.emptyIconText}>⌁</Text></View><Text style={styles.emptyText}>{t('customer.noHistory')}</Text></View>
        ) : transactions.map((transaction) => {
          const disputed = transaction.status === 'disputed';
          const payment = transaction.kind === 'payment';
          const dateLabel = new Date(transaction.created_at).toLocaleDateString(locale, { timeZone: 'Asia/Baghdad', year: 'numeric', month: 'short', day: 'numeric' });
          return (
            <View key={transaction.id} style={styles.transactionCard}>
              <View style={[styles.transactionIcon, payment && styles.transactionIconPayment, disputed && styles.transactionIconDisputed]}>
                <Text style={[styles.transactionMark, payment && styles.transactionMarkPayment, disputed && styles.transactionMarkDisputed]}>{payment ? '+' : '−'}</Text>
              </View>
              <View style={styles.transactionCopy}>
                <View style={styles.transactionHeader}>
                  <Text style={styles.transactionType}>{t(payment ? 'customer.payment' : 'customer.debt')}</Text>
                  <Text style={[styles.statusText, disputed && styles.statusDisputed]}>{t(statusTranslationKey(transaction.status))}</Text>
                </View>
                <Text style={styles.transactionDescription}>{transaction.description || t('customer.noDescription')}</Text>
                <Text style={styles.transactionDate}>{dateLabel}{transaction.due_at ? ` · ${t('transaction.dueDate')}: ${new Date(transaction.due_at).toLocaleDateString(locale, { timeZone: 'Asia/Baghdad' })}` : ''}</Text>
              </View>
              <Text style={[styles.transactionAmount, payment && styles.paymentAmount]}>{formatIqd(String(transaction.amount_iqd), locale)}</Text>
            </View>
          );
        })}

        {hasMore && (
          <Pressable disabled={loadingMore} onPress={() => void loadMore()} style={styles.loadMoreButton}>
            {loadingMore ? <ActivityIndicator color={palette.primary} /> : <Text style={styles.loadMoreText}>{t('customer.loadMore')}</Text>}
          </Pressable>
        )}
        <Text style={styles.footnote}>{t('customer.statementShared')}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: palette.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.background },
  content: { padding: 22, paddingBottom: 36, gap: 16 },
  topbar: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 11, marginBottom: 3 },
  backButton: { width: 42, height: 42, borderRadius: 14, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, alignItems: 'center', justifyContent: 'center' },
  backText: { color: palette.ink, fontSize: 28, lineHeight: 32 },
  topbarCopy: { flex: 1, gap: 2 },
  kicker: { color: palette.primary, fontSize: 11, fontWeight: '800' },
  topbarTitle: { color: palette.ink, fontSize: 19, fontWeight: '900' },
  shopAvatar: { width: 42, height: 42, borderRadius: 15, backgroundColor: palette.primaryTint, alignItems: 'center', justifyContent: 'center' },
  shopAvatarText: { color: palette.primary, fontSize: 17, fontWeight: '900' },
  balanceCard: { minHeight: 185, borderRadius: radii.card, backgroundColor: palette.primaryDark, padding: 20, gap: 9, overflow: 'hidden' },
  balanceCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  balanceLabel: { color: '#C5DFD2', fontSize: 12, fontWeight: '700' },
  confirmedBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#286E5B', paddingHorizontal: 8, paddingVertical: 5, borderRadius: radii.pill },
  confirmedDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#8FD1AF' },
  confirmedText: { color: '#DFF2E7', fontSize: 9, fontWeight: '800' },
  balanceValue: { color: palette.white, fontSize: 33, lineHeight: 43, fontWeight: '900', writingDirection: 'ltr', textAlign: 'left' },
  balanceRule: { height: 1, backgroundColor: '#39725F', marginTop: 1 },
  balanceMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  balanceMetaLabel: { color: '#C5DFD2', fontSize: 11 },
  balanceMetaValue: { color: '#F0D598', fontSize: 12, fontWeight: '800' },
  limitCard: { minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, borderRadius: 17, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  limitIcon: { width: 34, height: 34, borderRadius: 12, backgroundColor: palette.goldTint, alignItems: 'center', justifyContent: 'center' },
  limitIconText: { color: '#9D6C27', fontSize: 20, fontWeight: '800' },
  limitCopy: { flex: 1, gap: 3 },
  limitLabel: { color: palette.muted, fontSize: 10 },
  limitValue: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  shareButton: { minHeight: 39, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, borderRadius: 12, backgroundColor: palette.primaryTint },
  shareIcon: { color: palette.primary, fontSize: 16, fontWeight: '900' },
  shareText: { color: palette.primaryDark, fontSize: 10, fontWeight: '800' },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 6 },
  historyTitle: { color: palette.ink, fontSize: 19, fontWeight: '900' },
  historySubtitle: { color: palette.muted, fontSize: 10, lineHeight: 16, marginTop: 3 },
  historyCount: { color: palette.primary, fontSize: 12, fontWeight: '800', backgroundColor: palette.primaryTint, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 5, borderRadius: radii.pill },
  emptyCard: { minHeight: 130, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 18, borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line },
  emptyIcon: { width: 38, height: 38, borderRadius: 13, backgroundColor: palette.primaryTint, alignItems: 'center', justifyContent: 'center' },
  emptyIconText: { color: palette.primary, fontSize: 20, fontWeight: '800' },
  emptyText: { color: palette.muted, fontSize: 12, textAlign: 'center' },
  transactionCard: { minHeight: 91, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.line, padding: 12 },
  transactionIcon: { width: 36, height: 36, borderRadius: 13, backgroundColor: palette.dangerTint, alignItems: 'center', justifyContent: 'center' },
  transactionIconPayment: { backgroundColor: palette.primaryTint },
  transactionIconDisputed: { backgroundColor: '#F9E6E3' },
  transactionMark: { color: palette.danger, fontSize: 21, fontWeight: '700' },
  transactionMarkPayment: { color: palette.primary },
  transactionMarkDisputed: { color: palette.danger },
  transactionCopy: { flex: 1, gap: 4 },
  transactionHeader: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 7 },
  transactionType: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  statusText: { color: palette.primary, fontSize: 9, fontWeight: '700' },
  statusDisputed: { color: palette.danger },
  transactionDescription: { color: palette.muted, fontSize: 10, lineHeight: 15 },
  transactionDate: { color: '#929E95', fontSize: 9 },
  transactionAmount: { maxWidth: 110, color: palette.ink, fontSize: 11, fontWeight: '800', textAlign: 'right' },
  paymentAmount: { color: palette.primary },
  loadMoreButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1, borderColor: palette.line, backgroundColor: palette.surface },
  loadMoreText: { color: palette.primary, fontSize: 12, fontWeight: '800' },
  footnote: { color: palette.muted, fontSize: 10, lineHeight: 17, textAlign: 'center', paddingHorizontal: 6 },
  missingState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24 },
  missingTitle: { color: palette.ink, fontSize: 17, fontWeight: '800' },
  backAction: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 14, backgroundColor: palette.primary },
  backActionText: { color: palette.white, fontWeight: '800' },
  pressed: { opacity: 0.75 },
  disabled: { opacity: 0.5 },
});

