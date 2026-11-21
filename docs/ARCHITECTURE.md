# البنية التقنية

## الصورة العامة

```text
apps/merchant (Expo / iOS / Android) ─┐
                                      ├── Supabase Auth + Postgres + RPC + Edge Functions
apps/customer (Expo / iOS / Android) ─┘               │
                                                     ├── RevenueCat Webhook (merchant only)
                                                     ├── SMS provider (OTP / invitation)
                                                     └── Expo Push Service (transaction notices)

packages/shared: types, plans, localization, validation, money/date helpers
```

## التقنية

- Mobile: React Native + Expo SDK stable + Expo Router + TypeScript.
- Workspace: npm workspaces؛ تطبيقان منفصلان وحزمة مشتركة.
- Authentication: Supabase Phone OTP. رقم الهاتف في E.164.
- Database: Supabase Postgres, RLS, RPC functions, append-only event history.
- Server: Supabase Edge Functions (Deno) للأحداث الخارجية والإشعارات وRevenueCat.
- Subscriptions: RevenueCat فوق StoreKit وGoogle Play Billing في تطبيق صاحب المحل فقط.
- Notifications: Expo Push Tokens مع Outbox server-side؛ لا ترسل تفاصيل الدين على شاشة القفل افتراضياً.
- Local secrets: `expo-secure-store` لهوية تثبيت التطبيق ورموز محلية قصيرة العمر.

## فصل التطبيقين

يجب أن يكون لكل تطبيق Bundle Identifier / Application ID مختلف:

- `com.COMPANY.debtmerchant` (placeholder)
- `com.COMPANY.debtcustomer` (placeholder)

لا تعتمد على فصل التطبيقين لحماية البيانات؛ الفصل الحقيقي يتم عن طريق Auth وRLS وصلاحيات الخادم.

## حدود الثقة

1. تطبيق الهاتف غير موثوق؛ كل مبلغ، صلاحية، حالة اشتراك، وقرار موافقة يجب التحقق منه في الخادم.
2. قاعدة البيانات هي مصدر حقيقة الرصيد.
3. RevenueCat / Apple / Google هي مصدر حقيقة الشراء، ويقوم الخادم بمزامنة الاستحقاق.
4. الإشعار مجرد تنبيه وليس موافقة. الموافقة لا تتم إلا من جلسة موثقة داخل التطبيق وإجراء خادمي.
5. لا يعتبر تسليم SMS أو Push دليلاً على استلام أو موافقة.

## كيانات البيانات الرئيسية

- `profiles`: هوية التطبيق، رقم الهاتف الموثق، اللغة. يمكن حذف ملف الهوية مع إبقاء سجل معاملة مشترك بعد إزالة بيانات الاتصال/الاسم وفق سياسة الاحتفاظ المعتمدة.
- `businesses`: محل واحد لكل حساب تاجر في الإصدار الأول.
- `merchant_entitlements`: بداية/نهاية تجربة 30 يوماً، صلاحية المتجر.
- `customer_links`: ارتباط محل بعميل، الهاتف، سقف الدين، حالة الدعوة.
- `ledger_transactions`: طلب دين/تسديد وحالته الحالية.
- `transaction_events`: سجل أحداث غير قابل للتعديل أو الحذف المباشر.
- `device_installations`: جهاز واحد نشط لصاحب المحل.
- `push_tokens`: رموز إشعارات حسب الجهاز.
- `notification_outbox`: قائمة إرسال موثوقة قابلة لإعادة المحاولة.
- `store_webhook_events`: منع تكرار معالجة Webhook.
- `account_deletion_requests`: طلب واحد معلّق لكل حساب. يقرأ المستخدم طلبه فقط، ويُدرج الطلب عبر دالة مرتبطة بهوية الجلسة. يستطيع فريق التشغيل مراجعة الطلبات بصلاحية الخادم. تبقى معالجة الحذف ونشر صفحته العامة مرحلتين مطلوبتين قبل الإطلاق.

## قواعد الحساب

- `amount_iqd` عدد صحيح موجب، وPostgres يستخدم bigint.
- لا تستخدم float/double لأي مبلغ.
- تخزين UTC؛ توقيت العرض `Asia/Baghdad`.
- حساب الرصيد لا يعتمد على قيمة balance قابلة للتعديل؛ يستخرج من العمليات المؤكدة أو من projection يعاد بناؤه من سجل الأحداث.
- كل إجراء حساس له `idempotency_key` فريد لمنع تكرار الطلب عند ضعف الشبكة.

## استراتيجية الإشعارات

عند إنشاء طلب:

- Insert transaction + transaction_event + outbox row ضمن معاملة قاعدة بيانات واحدة.
- Function/worker يقرأ Outbox غير المرسل ويبعث Push إلى العميل المرتبط.
- عند عدم امتلاك العميل حساباً/رمز Push، تعرض الدعوة عند التسجيل وتستخدم SMS فقط كرسالة دعوة عامة بعد موافقة المستخدم على سياسة الاتصالات؛ لا ترسل مبلغ الدين في SMS.
- عند الموافقة/الاعتراض، يسجل القرار أولاً ثم ينشأ إشعار لصاحب المحل.
- يجب أن تكون عملية الإرسال قابلة لإعادة المحاولة ولا تكرر الأثر داخل التطبيق.

## البيئات

أنشئ Supabase project مستقلاً لكل من Development وProduction. لا تستخدم بيانات حقيقية في التطوير. مفاتيح الإنتاج لا تضاف إلى Git أو Codex context. خزّن أسرار Edge Functions في Supabase Secrets.

