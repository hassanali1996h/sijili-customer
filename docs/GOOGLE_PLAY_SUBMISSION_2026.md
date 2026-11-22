# ملف تجهيز Google Play Console — سِجلي

آخر مراجعة: 22 نوفمبر 2026. **حزمة جاهزة للنقل إلى حقول المتجر بعد اختبار الإصدار، وليست إفادة بأن النشر اكتمل.**

## هوية التطبيق
- الاسم الظاهر في إعداد Expo: **سِجلي**
- Android package: `com.debtledgeriq.sijili` (لا تعدّله بعد إنشاء الإدراج في Google Play)
- نوع التطبيق: تطبيق جوّال؛ اللغة العربية الأساسية؛ واجهة سورانية داخلية (لا تضف لغة متجر لم يتم تحريرها واختبارها).
- تصنيف مقترح للفحص: Finance أو Business وفق التصنيف المتاح الفعلي في Play Console؛ لا تختَر تصنيف القروض الشخصية لأن التطبيق دفتر سجلات لا يُصدر قروضاً.
- سوق أولي: العراق؛ تحقّق من إتاحة البلد داخل Console قبل نشر أي إصدار.

## Store Listing — نصوص معدّة للنسخ
**App name:** سِجلي

**Short description:** سِجلي: راجع ديونك لدى المحلات ووافق أو اعترض على كل عملية.

**Full description:**

سِجلي هو تطبيق مجاني للعملاء لمتابعة حساباتهم لدى المحلات المرتبطة بهم.

• مشاهدة المحلات المرتبطة بحسابك عبر رقم الهاتف.
• مراجعة كل طلب دين أو تسديد قبل اعتماده.
• الموافقة أو الاعتراض على العملية من داخل التطبيق.
• متابعة الرصيد وسجل الحركات لكل محل بشكل منفصل.
• الاطلاع على الطلبات المعلقة والمؤكدة.
• دعم العربية والكردية السورانية.

لا يستطيع صاحب المحل اعتبار الطلب معاملة مؤكدة دون موافقتك داخل النظام. سِجلي يساعدك على متابعة الحسابات وتوثيق حالة الطلبات، وليس بنكاً أو جهة تمويل أو ضماناً قانونياً لتحصيل الديون.

التطبيق مجاني للعملاء ولا يطلب شراء اشتراك.

لا تستخدم لقطات أو وصفاً يزعم أن OTP أو الإشعارات أو الشراء تعمل بالإنتاج قبل اختبارها على إصدار Android المرفوع.

## روابط App content
- Privacy policy: https://hassanali1996h.github.io/sijili-customer/privacy.html
- Account deletion web link: https://hassanali1996h.github.io/sijili-customer/delete-account.html
- Support: https://hassanali1996h.github.io/sijili-customer/support.html
- Terms: https://hassanali1996h.github.io/sijili-customer/terms.html
- المواقع الأربعة فُحصت روابط الخصوصية والحذف فقط عبر HTTP 200 يوم 22 نوفمبر 2026؛ تحقّق أيضاً من محتوى الصفحة وظهورها داخل التطبيق.
- جهة التواصل الموجودة في مصدر الصفحات: `appsijil@gmail.com` — يلزم التأكد أنها مراقبة وتستقبل الرسائل.
- الاسم القانوني للناشر/مسؤول البيانات وفترات الاحتفاظ النهائية بحاجة إلى التحقق؛ لا تقدّم إقرارات قانونية متعارضة مع الواقع.

## App content / Data safety — ورقة تدقيق وليست إجابات مفترضة
- **Does the app collect data? YES** عند تفعيل Supabase: رقم هاتف للتحقق، معرّف حساب، الاسم/لغة الواجهة، ومعاملات الديون والتسديدات والوصف ومبالغها وتواريخها وحالة الموافقة، وبيانات المحلات المرتبطة.
- **Data types to investigate and declare precisely:** Personal info (phone, name, user IDs)، Financial info/Other financial info (مبالغ الديون والرصيد، وربما purchase history في تطبيق صاحب المحل)، App activity (إن تم تخزينه)، Device or other IDs (معرف تثبيت التاجر/رمز الإشعارات)، App info/performance (فقط إذا SDK فعلي يرسل سجلات أو diagnostics). راجع تصنيف كل حقل وفق الأسئلة الفعلية.
- **Purposes:** app functionality, account management, fraud prevention/security, notifications; purchases/subscription management في تطبيق التاجر فقط.
- **Data sharing:** مراجعة Supabase, Expo Push, SMS OTP provider, Google Play notification services وفق عقودهم؛ لا تضع "No sharing" قبل التحقق من كونهم service providers ومعالجة كل SDK.
- **Encrypted in transit:** تحقّق من HTTPS/TLS في كل اتصال فعلي، وليس من مصدر JavaScript فقط.
- **Can users request deletion?** توجد وظيفة طلب الحذف داخل إعدادات الكود ورابط ويب؛ يجب إجراء اختبار طلب وحذف فعلي في مشروع اختبار منفصل، مع تحديد ما يبقى من سجلات مشتركة وأساس الاحتفاظ.
- **Advertising:** لا توجد SDK إعلانات ظاهرة في package.json الذي راجعناه؛ تحقق من Android merged manifest وAAB قبل اختيار "No ads".
- **Financial features declaration:** التطبيق يتتبع ديون المحلات، فلا تجب خطأ بأن التطبيق لا يخص بيانات مالية. اختر التصنيف المطابق حرفياً من خيارات Google بعد مراجعة طبيعة الخدمة؛ لا تعرضه على أنه مُقرض أو مقدم قروض نقدية.
- **Target audience:** صُمم للاستخدام التجاري أو لإدارة حسابات الكبار؛ راجع إعداد جمهور Google والأسئلة العمرية، ولا تستهدف الأطفال دون تحقق.
- **Permissions:** الإشعارات؛ افحص الصلاحيات الفعلية من Android Manifest الناتج. لا تضف صلاحيات الرسائل SMS أو جهات الاتصال أو الملفات دون ضرورة وتبرير.
- **App access:** تسجيل الدخول OTP برقم هاتف عراقي؛ يلزم توفير حسابي اختبار وآلية مراجعة قانونية عاملة دون مشاركة رموز SMS حقيقية أو تعطيل الأمان.

## البناء والنشر
1. تحقق من خصائص الإصدار: `eas.json`، إعداد Production environment، توقيع Google Play App Signing، وAndroid package.
2. Google Play يتطلب Android 16 / target API **36** للتطبيقات الجديدة/التحديثات الحالية منذ 31 أغسطس 2026 بحسب سياسة Google؛ أثبت targetSdkVersion من الـ AAB قبل التقديم.
3. ابنِ AAB موقعاً فعلياً في EAS، تأكد من رقم versionCode غير مستخدم، وافحص الـ permissions وحالة crash.
4. ارفع أولاً إلى Internal testing مع حسابات اختبار، وليس Production مباشرة.
5. اختبر هاتفياً: OTP العراقي، الربط بين التطبيقين، الطلب والاعتراض، حدود الدين، تقييد الوصول، انقطاع الإنترنت والحذف.
6. تطبيق العميل مجاني ولا يحتوي اشتراكات؛ لا تنشئ منتجات مدفوعة له.
7. اكمل App content: Privacy policy, Data safety, Financial features, Content rating, Target audience, Ads, App access, Government/other declarations إذا ظهرت، ثم Full store listing وصور حقيقية وشعار وصورة Feature Graphic.
8. عند جاهزية الاختبارات وإصلاح العوائق، أرسل إلى المسار الملائم للمراجعة، وراجع نتائج Play Console بدلاً من افتراض القبول.

## فجوات مؤكدة من مستودع المصدر بتاريخ 22 نوفمبر 2026
- ملف EAS كان يحوي preview/preview-connected فقط؛ لا يوجد ملف Production AAB مثبت أنه بُني ورُفع.
- عنوان Play Console الحقيقي وإجابات App content الحالية لم تُقرأ؛ جلسة المتصفح المفتوحة تظهر Google account لا يدخل إلى حساب مطور التطبيقات.
- OTP provider وحسابات المراجع والمشتريات الحقيقية والاختبارات على أجهزة فعلية ليست مثبتة النجاح.
- الاسم القانوني، صورة العلامة التجارية، لقطة الشاشة التجارية، والصلاحيات النهائية تحتاج مراجعة.

## مصادر سياسات Google الرسمية
- https://support.google.com/googleplay/android-developer/answer/10144311
- https://support.google.com/googleplay/android-developer/answer/10787469
- https://support.google.com/googleplay/android-developer/answer/13849271
- https://support.google.com/googleplay/android-developer/answer/11926878
