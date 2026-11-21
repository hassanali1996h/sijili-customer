import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.119.2';

type Locale = 'ar' | 'ckb';
type OutboxRow = {
  id: number;
  recipient_user_id: string;
  event_type: string;
  payload: Record<string, unknown> | null;
  attempt_count: number;
};
type PushTokenRow = { id: string; user_id: string; expo_push_token: string; last_seen_at: string };
type PushMessage = {
  to: string;
  title: string;
  body: string;
  data: Record<string, string | null>;
  sound: 'default';
};
type PushTicket = {
  status?: 'ok' | 'error';
  id?: string;
  details?: { error?: string };
};
type PushJob = { outboxId: number; registration: PushTokenRow; message: PushMessage };
type AcceptedTicket = { ticket_id: string; registration_id: string; registration_seen_at: string };
type ReceiptClaim = { ticket_id: string; created_at: string };
type ExpoResponse<T> = { data?: T; errors?: { code?: string }[] };

const genericMessages: Record<string, Record<Locale, { title: string; body: string }>> = {
  transaction_pending: {
    ar: { title: 'طلب حساب جديد', body: 'لديك طلب حساب جديد. افتح التطبيق لمراجعة التفاصيل.' },
    ckb: { title: 'داواکاریی هەژماری نوێ', body: 'داواکارییەکی نوێت هەیە. بۆ پێداچوونەوە ئەپەکە بکەرەوە.' },
  },
  transaction_responded: {
    ar: { title: 'تم الرد على طلب حساب', body: 'تم الرد على أحد طلبات الحساب. افتح التطبيق لمراجعة الحالة.' },
    ckb: { title: 'وەڵام بۆ داواکاریی هەژمار', body: 'وەڵامێک بۆ داواکارییەکی هەژمار درا. بۆ بینینی دۆخەکە ئەپەکە بکەرەوە.' },
  },
  transaction_cancelled: {
    ar: { title: 'تم إلغاء طلب حساب', body: 'تم إلغاء طلب حساب معلّق.' },
    ckb: { title: 'داواکاریی هەژمار هەڵوەشایەوە', body: 'داواکارییەکی هەژماری چاوەڕوان هەڵوەشایەوە.' },
  },
  shop_link_invitation: {
    ar: { title: 'دعوة ربط حساب', body: 'أرسل إليك محل دعوة لربط حساب. افتح التطبيق للمراجعة.' },
    ckb: { title: 'بانگهێشت بۆ پەیوەستکردنی هەژمار', body: 'دووکانێک بانگهێشتی پەیوەستکردنی هەژماری بۆ ناردوویت. بۆ پێداچوونەوە ئەپەکە بکەرەوە.' },
  },
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'content-type': 'application/json' },
});

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

function readReference(payload: Record<string, unknown> | null, key: string): string | null {
  const value = payload?.[key];
  return typeof value === 'string' ? value : null;
}

async function expoRequest<T>(path: 'send' | 'getReceipts', payload: unknown) {
  const accessToken = Deno.env.get('EXPO_PUSH_ACCESS_TOKEN');
  const response = await fetch(`https://exp.host/--/api/v2/push/${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json() as ExpoResponse<T>;
  return { response, body };
}

async function sendExpoBatch(jobs: PushJob[]): Promise<PushTicket[]> {
  const { response, body } = await expoRequest<PushTicket[]>('send', jobs.map((job) => job.message));
  // Expo rejects mixed projects as a whole. Split only on that explicit rejection.
  if (!response.ok && jobs.length > 1 && body.errors?.some((error) => error.code === 'PUSH_TOO_MANY_EXPERIENCE_IDS')) {
    const middle = Math.ceil(jobs.length / 2);
    // Preserve successful tickets even if the other half fails.
    const halves = [jobs.slice(0, middle), jobs.slice(middle)];
    const results = await Promise.allSettled(halves.map(sendExpoBatch));
    return results.flatMap((result, index) => result.status === 'fulfilled'
      ? result.value
      : halves[index].map(() => ({ status: 'error' as const })));
  }
  if (!response.ok) throw new Error(`Expo Push returned HTTP ${response.status}`);
  if (!Array.isArray(body.data) || body.data.length !== jobs.length) {
    throw new Error('Expo Push returned an unexpected ticket response');
  }
  return body.data;
}

async function checkReceipts(supabase: SupabaseClient) {
  const claimToken = crypto.randomUUID();
  const { data, error } = await supabase.rpc('claim_notification_push_receipts', { p_claim_token: claimToken });
  if (error) throw error;
  const claims = (data ?? []) as ReceiptClaim[];
  const stats = { accepted: 0, failed: 0, pending: 0, unknown: 0, writeErrors: 0, lookupError: false };
  if (claims.length === 0) return stats;

  let receipts: Record<string, PushTicket> = {};
  try {
    const { response, body } = await expoRequest<Record<string, PushTicket>>('getReceipts', {
      ids: claims.map((claim) => claim.ticket_id),
    });
    if (!response.ok || !body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      throw new Error('Expo did not return a receipt map');
    }
    receipts = body.data;
  } catch {
    stats.lookupError = true;
  }

  for (const group of chunk(claims, 10)) {
    await Promise.all(group.map(async (claim) => {
      const receipt = Object.hasOwn(receipts, claim.ticket_id) ? receipts[claim.ticket_id] : undefined;
      const expired = Date.now() - Date.parse(claim.created_at) >= 24 * 60 * 60 * 1000;
      const result = receipt?.status === 'ok' ? 'provider_accepted'
        : receipt?.status === 'error' ? 'provider_error'
          : expired ? 'unknown' : 'pending';
      const expoCode = receipt?.details?.error;
      const errorCode = result === 'provider_error'
        ? (typeof expoCode === 'string' && /^[a-zA-Z0-9_]{1,100}$/.test(expoCode) ? expoCode : 'Unspecified')
        : result === 'unknown' ? 'ReceiptUnavailable' : null;
      const { data: completed, error } = await supabase.rpc('complete_notification_push_receipt', {
        p_ticket_id: claim.ticket_id,
        p_claim_token: claimToken,
        p_result: result,
        p_error_code: errorCode,
      });
      if (error || completed !== true) stats.writeErrors++;
      else if (result === 'provider_accepted') stats.accepted++;
      else if (result === 'provider_error') stats.failed++;
      else stats[result]++;
    }));
  }
  return stats;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const expected = Deno.env.get('NOTIFY_FUNCTION_SECRET');
  if (!expected || req.headers.get('authorization') !== `Bearer ${expected}`) {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) return json({ error: 'Missing server configuration' }, 500);

  const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const receipts = await checkReceipts(supabase).catch(() => ({ lookupError: true }));
  const claimToken = crypto.randomUUID();
  const { data: rows, error: claimError } = await supabase.rpc('claim_notification_outbox', {
    p_claim_token: claimToken,
    p_limit: 25,
    p_lease_seconds: 300,
  });
  if (claimError) return json({ error: 'Could not claim notification queue' }, 500);

  const outboxRows = (rows ?? []) as OutboxRow[];
  if (outboxRows.length === 0) return json({ claimed: 0, processed: 0, retried: 0, invalidTokensRemoved: 0, receipts });

  const recipientIds = [...new Set(outboxRows.map((row) => row.recipient_user_id))];
  const [{ data: tokenRows, error: tokenError }, { data: profileRows }] = await Promise.all([
    supabase.from('push_tokens').select('id,user_id,expo_push_token,last_seen_at').in('user_id', recipientIds),
    supabase.from('profiles').select('id,preferred_locale').in('id', recipientIds),
  ]);

  const tokensByUser = new Map<string, PushTokenRow[]>();
  for (const row of (tokenRows ?? []) as PushTokenRow[]) {
    const current = tokensByUser.get(row.user_id) ?? [];
    current.push(row);
    tokensByUser.set(row.user_id, current);
  }
  const localeByUser = new Map<string, Locale>();
  for (const profile of profileRows ?? []) {
    localeByUser.set(profile.id, profile.preferred_locale === 'ckb' ? 'ckb' : 'ar');
  }

  const jobs: PushJob[] = [];
  const failures = new Map<number, { reason: string; retryAfter: number }>();
  const acceptedTickets = new Map<number, AcceptedTicket[]>();

  if (tokenError) {
    for (const row of outboxRows) failures.set(row.id, { reason: 'Push token lookup failed', retryAfter: 60 });
  } else {
    for (const row of outboxRows) {
      const tokens = tokensByUser.get(row.recipient_user_id) ?? [];
      if (tokens.length === 0) {
        failures.set(row.id, { reason: 'Recipient has no registered push token', retryAfter: 600 });
        continue;
      }

      const locale = localeByUser.get(row.recipient_user_id) ?? 'ar';
      const message = genericMessages[row.event_type]?.[locale] ?? {
        title: locale === 'ckb' ? 'نوێکاری لە هەژمار' : 'تحديث في دفتر الحساب',
        body: locale === 'ckb' ? 'نوێکارییەکت هەیە. بۆ پێداچوونەوە ئەپەکە بکەرەوە.' : 'لديك تحديث جديد. افتح التطبيق للمراجعة.',
      };
      const data = {
        eventType: row.event_type,
        transactionId: readReference(row.payload, 'transaction_id'),
        linkId: readReference(row.payload, 'link_id'),
      };
      for (const registration of tokens) {
        jobs.push({
          outboxId: row.id,
          registration,
          message: { to: registration.expo_push_token, title: message.title, body: message.body, data, sound: 'default' },
        });
      }
    }
  }

  const invalidTokens = new Map<string, PushTokenRow>();
  const failedRows = new Set<number>();
  for (const batch of chunk(jobs, 100)) {
    try {
      const tickets = await sendExpoBatch(batch);
      tickets.forEach((ticket, index) => {
        const job = batch[index];
        if (ticket?.status === 'ok' && typeof ticket.id === 'string' && ticket.id.length > 0 && ticket.id.length <= 200) {
          const entries = acceptedTickets.get(job.outboxId) ?? [];
          entries.push({
            ticket_id: ticket.id,
            registration_id: job.registration.id,
            registration_seen_at: job.registration.last_seen_at,
          });
          acceptedTickets.set(job.outboxId, entries);
          return;
        }
        failedRows.add(job.outboxId);
        if (ticket?.details?.error === 'DeviceNotRegistered') invalidTokens.set(job.registration.id, job.registration);
      });
    } catch {
      for (const job of batch) failedRows.add(job.outboxId);
    }
  }

  let invalidTokensRemoved = 0;
  for (const group of chunk([...invalidTokens.values()], 10)) {
    await Promise.all(group.map(async (registration) => {
      const { count } = await supabase.from('push_tokens').delete({ count: 'exact' })
        .eq('id', registration.id).eq('last_seen_at', registration.last_seen_at);
      invalidTokensRemoved += count ?? 0;
    }));
  }

  let processed = 0;
  let retried = 0;
  let completionErrors = 0;
  for (const row of outboxRows) {
    const tickets = acceptedTickets.get(row.id);
    if (tickets?.length) {
      const { data, error } = await supabase.rpc('record_notification_push_tickets', {
        p_id: row.id, p_claim_token: claimToken, p_tickets: tickets,
      });
      if (!error && data === true) processed++;
      else completionErrors++;
      continue;
    }
    const failed = failures.get(row.id);
    const failedWithoutSuccess = failedRows.has(row.id);
    const reason = failed?.reason ?? (failedWithoutSuccess ? 'Expo Push ticket failed' : null);
    const { data: completed, error: completionError } = await supabase.rpc('complete_notification_outbox', {
      p_id: row.id,
      p_claim_token: claimToken,
      p_succeeded: false,
      p_error: reason,
      p_retry_after_seconds: failed?.retryAfter ?? (failedWithoutSuccess ? 120 : 60),
    });
    if (completionError || completed !== true) completionErrors++;
    else retried++;
  }

  return json({ claimed: outboxRows.length, processed, retried, invalidTokensRemoved, completionErrors, receipts });
});

