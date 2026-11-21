export type MerchantEntitlement = {
  active: boolean;
  paidUntil: string | null;
  productId: string | null;
  storePlatform: 'apple' | 'google' | null;
};

export function readMerchantEntitlement(payload: any, now = new Date()): MerchantEntitlement {
  const entitlement = payload?.subscriber?.entitlements?.merchant_pro;
  if (!entitlement) return { active: false, paidUntil: null, productId: null, storePlatform: null };

  const expiresDate = entitlement.expires_date ? new Date(entitlement.expires_date) : null;
  const active = !expiresDate || (Number.isFinite(expiresDate.getTime()) && expiresDate > now);
  if (!active) return { active: false, paidUntil: null, productId: null, storePlatform: null };

  const store = String(entitlement.store ?? '').toUpperCase();
  const storePlatform = store.includes('PLAY') || store.includes('GOOGLE') ? 'google'
    : store.includes('APP') || store.includes('APPLE') ? 'apple' : null;
  return {
    active: true,
    paidUntil: expiresDate?.toISOString() ?? null,
    productId: entitlement.product_identifier ?? null,
    storePlatform,
  };
}

