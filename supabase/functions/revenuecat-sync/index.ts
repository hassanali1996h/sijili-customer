import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { readMerchantEntitlement } from '../_shared/revenuecat_entitlement.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const authorization = req.headers.get('authorization');
  if (!authorization) return json({ error: 'Unauthorized' }, 401);

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const revenueCatSecret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!url || !anonKey || !serviceKey || !revenueCatSecret) {
    return json({ error: 'Server configuration is incomplete' }, 500);
  }

  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Unauthorized' }, 401);

  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: business, error: businessError } = await admin
    .from('businesses')
    .select('id')
    .eq('owner_user_id', userData.user.id)
    .maybeSingle();
  if (businessError) return json({ error: 'Could not resolve merchant account' }, 500);
  if (!business) return json({ error: 'Merchant business not found' }, 403);

  const subscriberResponse = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userData.user.id)}`,
    { headers: { Authorization: `Bearer ${revenueCatSecret}`, Accept: 'application/json' } },
  );
  if (!subscriberResponse.ok) return json({ error: 'RevenueCat verification failed' }, 502);

  const entitlement = readMerchantEntitlement(await subscriberResponse.json());
  const { error: updateError } = await admin
    .from('merchant_entitlements')
    .update({
      paid_until: entitlement.paidUntil,
      store_platform: entitlement.storePlatform,
      store_product_id: entitlement.productId,
      revenuecat_app_user_id: userData.user.id,
      updated_at: new Date().toISOString(),
    })
    .eq('business_id', business.id);
  if (updateError) return json({ error: 'Could not update merchant entitlement' }, 500);

  return json({ active: entitlement.active, paidUntil: entitlement.paidUntil });
});

