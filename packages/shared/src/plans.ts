export const TRIAL_DAYS = 30;

// IQD figures are product-owner targets, not guaranteed storefront prices.
// Always render localized price returned by App Store / Google Play / RevenueCat.
export const MERCHANT_PLANS = [
  { key: 'merchant_monthly', durationMonths: 1, targetPriceIqd: 2500 },
  { key: 'merchant_6_months', durationMonths: 6, targetPriceIqd: 12500 },
  { key: 'merchant_annual', durationMonths: 12, targetPriceIqd: 20000 },
] as const;

export const MERCHANT_ENTITLEMENT = 'merchant_pro';
export type MerchantAccessState = 'trial' | 'active' | 'read_only';

export function getMerchantAccessState(input: {
  trialEndsAt?: string | null;
  paidUntil?: string | null;
  now?: Date;
}): MerchantAccessState {
  const now = input.now ?? new Date();
  const paidUntil = input.paidUntil ? new Date(input.paidUntil) : null;
  const trialEndsAt = input.trialEndsAt ? new Date(input.trialEndsAt) : null;
  if (paidUntil && !Number.isNaN(paidUntil.getTime()) && paidUntil > now) return 'active';
  if (trialEndsAt && !Number.isNaN(trialEndsAt.getTime()) && trialEndsAt > now) return 'trial';
  return 'read_only';
}

