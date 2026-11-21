import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { readMerchantEntitlement } from '../_shared/revenuecat_entitlement.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const webhookSecret = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');
  const suppliedAuth = req.headers.get('authorization');
  if (!webhookSecret || suppliedAuth !== `Bearer ${webhookSecret}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const revenueCatSecret = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!supabaseUrl || !serviceRoleKey || !revenueCatSecret) {
    return json({ error: 'Server configuration is incomplete' }, 500);
  }

  const payload = await req.json().catch(() => null);
  const event = payload?.event;
  const eventId = event?.id;
  const appUserId = event?.app_user_id;
  const eventType = event?.type;
  if (!eventId || !appUserId || !eventType) {
    return json({ error: 'Missing RevenueCat event fields' }, 400);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: existing } = await supabase
    .from('store_webhook_events')
    .select('processed_at')
    .eq('event_id', String(eventId))
    .maybeSingle();

  if (existing?.processed_at) return json({ received: true, duplicate: true });

  const { error: insertError } = await supabase.from('store_webhook_events').upsert({
    event_id: String(eventId),
    app_user_id: String(appUserId),
    event_type: String(eventType),
    payload,
  }, { onConflict: 'event_id', ignoreDuplicates: true });
  if (insertError) return json({ error: 'Could not persist webhook event' }, 500);

  // appUserID must be the authenticated Supabase UUID. Do not trust the client to set paid_until.
  const { data: business, error: businessError } = await supabase
    .from('businesses')
    .select('id')
    .eq('owner_user_id', String(appUserId))
    .maybeSingle();
  if (businessError) return json({ error: 'Could not resolve merchant account' }, 500);
  if (!business) {
    await supabase.from('store_webhook_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('event_id', String(eventId));
    return json({ received: true, ignored: 'No merchant business for app user' });
  }

  const subscriberResponse = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(String(appUserId))}`,
    { headers: { Authorization: `Bearer ${revenueCatSecret}`, Accept: 'application/json' } },
  );
  if (!subscriberResponse.ok) {
    // Return 500 so RevenueCat retries; do not mark this event processed.
    return json({ error: 'RevenueCat subscriber verification failed' }, 500);
  }

  const subscriberPayload = await subscriberResponse.json();
  const entitlement = readMerchantEntitlement(subscriberPayload);

  const { error: updateError } = await supabase
    .from('merchant_entitlements')
    .update({
      paid_until: entitlement.paidUntil,
      store_platform: entitlement.storePlatform,
      store_product_id: entitlement.productId,
      revenuecat_app_user_id: String(appUserId),
      updated_at: new Date().toISOString(),
    })
    .eq('business_id', business.id);
  if (updateError) return json({ error: 'Could not update merchant entitlement' }, 500);

  const { error: markError } = await supabase.from('store_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('event_id', String(eventId));
  if (markError) return json({ error: 'Entitlement updated; webhook marker update failed' }, 500);

  return json({ received: true, processed: true });
});

