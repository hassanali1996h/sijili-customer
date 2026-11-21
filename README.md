# دفتر الديون — Debt Ledger (اسم عمل مؤقت)

مشروع تطبيقين منفصلين مرتبطين بخادم واحد:

- **تطبيق صاحب المحل**: إضافة العملاء، تحديد سقف الدين، تسجيل طلب دين/تسديد، ومتابعة الحسابات. مدفوع بعد 30 يوماً مجانية.
- **تطبيق العميل**: استلام طلبات العمليات والموافقة أو الاعتراض ومشاهدة الحسابات. مجاني.

اللغة العربية والكردية السورانية مدعومتان، والواجهتان RTL. السوق الأول العراق، والعملة المحاسبية IQD.

> هذه حزمة انطلاق هندسية ووثائق مواصفات وهيكل أولي للتطبيقين، وليست تطبيقاً منشوراً أو نظاماً إنتاجياً مكتملاً. اقرأ `docs/KNOWN_GAPS.md` قبل البدء. يجب على Codex إكمال الشيفرة والاختبارات وربط الخدمات، وعلى صاحب المشروع إكمال حسابات المتاجر ومزود SMS وبيانات الشركة والمراجعة القانونية قبل النشر.

## القرارات التجارية المعتمدة

| الباقة | المدة | السعر المستهدف |
|---|---:|---:|
| شهرية | شهر | 2,500 د.ع |
| ستة أشهر | 6 أشهر | 12,500 د.ع |
| سنوية | سنة | 20,000 د.ع |

- 30 يوماً مجانية من أول تفعيل لحساب صاحب المحل، يمنحها الخادم، بلا بطاقة وبلا شراء.
- ليست تجربة متجر مجانية ولا تبدأ فوترة تلقائية بعد 30 يوماً. يختار صاحب المحل باقة ويوافق على الشراء صراحةً.
- بعد انتهاء التجربة أو الاشتراك: **وضع مشاهدة فقط**؛ تبقى البيانات القديمة متاحة، وتتوقف إضافة العملاء والديون والتسديدات وأي تعديل جديد.
- العميل لا يدفع اشتراكاً.
- الأسعار أعلاه أسعار مستهدفة بالدينار العراقي. السعر المعروض فعلياً داخل الشراء يجب أن يأتي من Apple/Google حسب بلد متجر العميل؛ قد تختلف العملة أو قيمة السعر المحلي. لا نعرض رقماً ثابتاً يخالف سعر المتجر.

## أهم قاعدة للنزاهة

أي عملية دين أو تسديد ينشئها صاحب المحل تبقى **بانتظار موافقة العميل**. يرسل النظام إشعاراً للعميل، ثم يختار الموافقة أو الاعتراض. الموافقة تثبت قبول العملية داخل النظام وتسجل هوية المستخدم ووقت الموافقة. الاعتراض يبقي العملية محل نزاع ولا تدخل ضمن الرصيد المؤكد. لا يمكن تعديل أو حذف عملية مؤكدة؛ أي تصحيح يكون بطلب مستقل موثق وموافقة الطرف الآخر.

هذا السجل يحسن الإثبات والشفافية لكنه لا يضمن وحده أن العملية توقيع إلكتروني معترف به قضائياً؛ يلزم رأي قانوني عراقي قبل استعمال عبارات مثل «سند قانوني» أو «توقيع إلكتروني ملزم».

## تشغيل الحزمة على Windows

المتطلبات:

1. Node.js `24.22.3` كما في `.nvmrc`، أو إصدار متوافق يحقق متطلبات Expo SDK الحالي (SDK 58 يتطلب `22.13.0` أو أحدث ضمن إصدارات Node المدعومة).
2. Git.
3. Codex (إضافة IDE أو تطبيق Codex) وفتح مجلد المشروع كاملاً.
4. Docker Desktop أو بديل متوافق مع Docker لتشغيل Supabase محلياً على Windows.
5. حساب Supabase ومشروع مستضاف عند ربط OTP والخدمات السحابية؛ المرحلة المحلية لا تحتاج حساباً.
6. لاحقاً: حساب RevenueCat ومنتجات المتاجر، ومزوّد SMS يدعم أرقام العراق مع اختبار التوصيل والتكلفة.

افتح مجلد `debt-ledger-starter` داخل Codex. تثبيت الحزم وتشغيل قاعدة البيانات المحلية:

```powershell
npm ci
npm run supabase:start
npm run db:reset
npm run db:test
npm run typecheck
```

بعد أن يطبع Supabase المحلي عنوان API ومفتاحه العام، انسخ ملفات الإعداد:

```powershell
Copy-Item apps\merchant\.env.example apps\merchant\.env
Copy-Item apps\customer\.env.example apps\customer\.env
# ضع عنوان API والمفتاح العام المحلي أو بيانات مشروع التطوير في الملفين
# ضع مفاتيح RevenueCat العامة الخاصة بـ iOS وAndroid في apps\merchant\.env فقط
npm run start:merchant
# وفي نافذة ثانية:
npm run start:customer
```

للتشغيل على هاتف حقيقي مع RevenueCat والإشعارات وبعض الوحدات الأصلية، استخدم **Development Build / EAS Build**. الإشعارات البعيدة غير متاحة في Expo Go على Android مع SDK 53 وما بعده.

## تجربة APK على هاتف Android

لكل تطبيق إعداد `preview` ينتج APK قابلًا للتثبيت. شغّل الأمر التالي من مجلد كل تطبيق إذا كنت تستخدم بناء Expo السحابي بعد ربطه بمشروع Expo:

```powershell
npx eas-cli build --platform android --profile preview
```

إعداد `preview` مخصص لمعاينة الواجهة. في وضع Preview يظهر زر **الدخول للتجربة بدون تسجيل** وتُستخدم بيانات محلية تجريبية، ولا يتصل التطبيق بـ Supabase؛ هذا الوضع للتجربة فقط وليس للإطلاق. لتجربة الدخول والدعوات والعمليات على الخادم، استخدم `--profile preview-connected` بعدما تطبّق الترحيلات وتفعّل Phone OTP في مشروع Supabase تجريبي. اضبط رابط هذا المشروع ومفتاحه العام، `EXPO_PUBLIC_SUPABASE_URL` و`EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`، على مستوى كل مشروع في بيئة Expo المسماة `preview`. للبناء المحلي ضع القيم في `.env` لكل تطبيق. مفاتيح الخادم ومزوّد SMS تبقى في إعدادات الخادم.

على هاتف الاختبار ثبّت التطبيقين، وسجّل برقمين للاختبار، ثم أنشئ محلاً، وأضف العميل، واقبل الدعوة، وسجّل عملية ووافق عليها من تطبيق العميل. افحص الرصيد في التطبيقين وجرّب العربية والسورانية. تحتاج الإشعارات والاشتراكات إلى إعدادات اختبارها الخاصة.

### ترتيب الربط التجريبي

1. سجّل دخول Supabase CLI باستخدام `npx supabase login`. حدّد مشروع اختبار مخصص لهذا الدفتر، وتحقّق من معرّفه قبل `supabase link --project-ref <ref>`.
2. افحص الترحيلات المستهدفة باستخدام `supabase db push --dry-run`، ثم طبّقها على مشروع الاختبار باستخدام `supabase db push`.
3. فعّل Phone مع تأكيد الرقم في Auth. أرقام الاختبار ذات الرموز الثابتة تكون في مشروع الاختبار وحده، مع تاريخ انتهاء، وبعد إعداد مزوّد SMS حسب [دليل Supabase](https://supabase.com/docs/guides/auth/testing-auth-flows).
4. ضَع رابط Supabase ومفتاح Publishable في بيئة Expo `preview` لكل مشروع من مشروعَي دفتر الديون، بنطاق `project`. بعدها ابنِ النسختين باستخدام `preview-connected` واختبر التدفق الكامل. [إعداد متغيرات Expo](https://docs.expo.dev/eas/environment-variables/manage/)

للبناء محلياً على Windows، استخدم نسخة عمل بمسار ASCII قصير إذا كان مسار المشروع يحتوي أحرفاً عربية. شغّل `npx expo prebuild --platform android` من مجلد التطبيق، ثم شغّل الأمر التالي من مجلد `android` باستخدام Android Studio JDK وAndroid SDK. يتطلب قالب SDK 58 منصة Android API 37 وBuild Tools 37.0.0 وNDK 27.1.12297006.

```powershell
.\gradlew.bat ':app:assembleRelease' '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a' '-Pkotlin.compiler.execution.strategy=in-process'
```

يوجد الملف بعد نجاح البناء في `android/app/build/outputs/apk/release/app-release.apk`. توقيع القالب المحلي مخصص للاختبار. جهّز هوية الحزم ومفاتيح التوقيع عند إعداد إصدار Google Play.

## محتويات الحزمة

- `AGENTS.md`: تعليمات صارمة لـ Codex.
- `docs/PRODUCT_SPEC.md`: مواصفات المنتج والواجهات وقواعد العمل.
- `docs/ARCHITECTURE.md`: البنية التقنية وتدفق البيانات.
- `docs/SECURITY.md`: الأمان ومنع التلاعب والخصوصية.
- `docs/STORE_SETUP.md`: إعداد Google Play وApple وRevenueCat.
- `docs/RELEASE_CHECKLIST.md`: قائمة إطلاق المتاجر.
- `docs/LEGAL_REVIEW.md`: ما يجب إكماله قانونياً قبل النشر.
- `docs/KNOWN_GAPS.md`: الأعمال التي لم تُنفذ بعد ويجب إغلاقها.
- `docs/TEST_PLAN.md`: سيناريوهات اختبار أساسية.
- `public/legal/`: مسودات سياسة الخصوصية وشروط الاستخدام بالعربية والكردية السورانية.
- `supabase/migrations/`: أساس قاعدة البيانات.
- `packages/shared/`: الترجمات والخطط والوظائف المشتركة.
- `apps/merchant/` و`apps/customer/`: هيكل التطبيقين.

## مصادر تقنية رسمية راجعها Codex قبل التنفيذ

- Expo SDK: https://docs.expo.dev/versions/latest/
- Expo Router: https://docs.expo.dev/router/introduction/
- Supabase Phone Auth: https://supabase.com/docs/guides/auth/phone-login
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- RevenueCat + Expo: https://www.revenuecat.com/docs/getting-started/installation/expo
- RevenueCat Webhooks: https://www.revenuecat.com/docs/integrations/webhooks
- Google Play Billing subscriptions: https://developer.android.com/google/play/billing/subscriptions
- Apple subscriptions: https://developer.apple.com/app-store/subscriptions/
- Apple Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Google Play developer policies: https://support.google.com/googleplay/android-developer/topic/9858052

