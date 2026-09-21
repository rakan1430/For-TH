\echo ''
\echo '  حدّ الاشتراك المنتهي، والزائر المجهول'
\echo '  المحتوى مجّانيّ الآن، لكنّ آلة الاشتراك تبقى مفحوصة — يوم يعود التسعير.'
\echo ''

-- ── من انتهى اشتراكه أمس ────────────────────────────────────────────────────
-- انتهى **أمس** لا منذ سنة: الحدّ الدقيق هو ما يكشف خطأ `<` مقابل `<=`.
--
-- ⚠️ ولم يعد انتهاؤه يقطع المحتوى عنه — المنصّة مجّانيّة (٠٠١٤). فما يُقاس
--    هنا الآن هو **الآلة** لا أثرها: `has_active_subscription` تحسب الحدّ
--    بدقّة، فيومَ يُعاد وصلُها بـ`may_read_content` يعود القطع صحيحاً من
--    أوّل يوم. وحذفُ هذا الفحص كان سيترك الحدّ بلا حارسٍ حتى يعود التسعير،
--    وهو أسوأ وقتٍ لاكتشاف خطأٍ في مقارنة تاريخ.
begin;
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","email":"u44@x.test"}', true);
set local role authenticated;

select testing.eq(public.has_active_subscription('qudurat'), false,
                  'انتهى أمس: الدالّة تقول «غير ساري» — والحدّ مقيسٌ باليوم');
select testing.ok(testing.count_of($q$ select 1 from public.banks $q$) > 0,
                  'ومع ذلك يرى المحتوى: المنصّة مجّانيّة، والقطع لم يعد مربوطاً بالاشتراك');

-- وحسابه وسجلّه لا يُمحيان
select testing.eq(testing.count_of($q$ select 1 from public.profiles $q$), 1,
                  'المنتهي: ملفّه الشخصي باقٍ — انتهاء الاشتراك ليس حذفاً');
select testing.eq(testing.count_of($q$ select 1 from public.subscriptions $q$), 1,
                  'المنتهي: سجلّ اشتراكه المنتهي محفوظ');

reset role;
rollback;

-- ── الزائر المجهول ──────────────────────────────────────────────────────────
begin;
-- ما ترسله واجهة PostgREST فعلاً لطلبٍ بلا تسجيل دخول: مطالباتٌ بلا `sub`
select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;

-- ⚠️ الفعّالة وحدها: سياسة `plans_read_anon` شرطها `is_active`. وقد عُطِّلت
--    الخطط الشهرية بقرار المالك (٠٠١٣) ولم تُحذف — فهي في الجدول ولا تظهر.
--    وهذا الفحص يُثبت الشيئين معاً: أنّ صفحة الأسعار تُقرأ قبل الدخول، وأنّ
--    ما عطّله المالك لا يُعرض على أحد.
select testing.eq(testing.count_of($q$ select 1 from public.plans $q$), 2,
                  'الزائر: يرى الخطّتين الفعّالتين — صفحة الأسعار تُقرأ قبل الدخول');
select testing.eq(testing.count_of($q$ select 1 from public.plans where not is_active $q$), 0,
                  'ولا يرى المعطَّلة ولو كانت في الجدول');
select testing.eq(auth.uid(), null::uuid, 'الزائر: لا هوية له — NULL هادئة لا استثناء');

-- ⚠️ لاحظ أنّ الردّ هنا **منعٌ** لا «صفر صفّ»: الزائر لا يملك صلاحية القراءة
--    على هذه الجداول أصلاً، فيُردّ قبل أن تُستشار سياسات الصفوف. طبقتان لا
--    واحدة — ولو أخطأت سياسةٌ يوماً فالصلاحية ما تزال قائمة دونها.
--    (وهذا ما كشفه الفحص فعلاً: كان مكتوباً هنا «صفر صفّ» فردّت القاعدة
--     منعاً، فصحّحنا التوقّع إلى الأقوى.)
select testing.denied($q$ select 1 from public.banks         $q$, 'الزائر: مُنع من جدول البنوك');
select testing.denied($q$ select 1 from public.resources     $q$, 'الزائر: مُنع من جدول الملفّات');
select testing.denied($q$ select 1 from public.quizzes       $q$, 'الزائر: مُنع من جدول الاختبارات');
select testing.denied($q$ select 1 from public.quiz_options  $q$, 'الزائر: مُنع من جدول الخيارات');
select testing.denied($q$ select 1 from public.sections      $q$, 'الزائر: مُنع من جدول الأقسام');
select testing.denied($q$ select 1 from public.profiles      $q$, 'الزائر: مُنع من الملفّات الشخصية');
select testing.denied($q$ select 1 from public.subscriptions $q$, 'الزائر: مُنع من الاشتراكات');
select testing.denied($q$ select 1 from public.quiz_attempts $q$, 'الزائر: مُنع من المحاولات');
select testing.denied($q$ select 1 from public.assignments   $q$, 'الزائر: مُنع من التوزيع');
select testing.denied($q$ select 1 from private.answer_key   $q$, 'الزائر: مُنع من مفتاح الإجابة');

-- ⚠️⚠️ صلب البند ٣: الطريق الذي لا يمرّ بجدولٍ أصلاً.
--
-- في المشروع السابق كانت سياسات الجدول مضبوطةً ضبطاً سليماً تماماً، ومع ذلك
-- قرأ زائرٌ مجهول البيانات — لأنّه استدعى **الدالّة** مباشرةً عبر الشبكة،
-- ولم يلمس الجدول. فلا يكفي أن نفحص ما يراه الزائر في الجداول: نفحص ما
-- يستطيع **تنفيذه**.
select testing.denied($q$ select public.is_teacher() $q$,
                      'الزائر: لا ينفّذ is_teacher()');
select testing.denied($q$ select public.has_active_subscription('qudurat') $q$,
                      'الزائر: لا ينفّذ has_active_subscription()');
select testing.denied($q$ select public.is_assigned('bank','c0000000-0000-0000-0000-000000000001') $q$,
                      'الزائر: لا ينفّذ is_assigned()');
select testing.denied($q$ select * from public.teacher_overview() $q$,
                      'الزائر: لا ينفّذ teacher_overview()');
select testing.denied($q$ select * from public.start_attempt('e0000000-0000-0000-0000-000000000001') $q$,
                      'الزائر: لا ينفّذ start_attempt()');
select testing.denied($q$ select * from public.assign_items('bank', array['c0000000-0000-0000-0000-000000000001']::uuid[], 'track') $q$,
                      'الزائر: لا ينفّذ assign_items()');
select testing.denied($q$ select public.set_answer_key('f0000000-0000-0000-0000-000000000001', array['09000000-0000-0000-0000-000000000001']::uuid[]) $q$,
                      'الزائر: لا ينفّذ set_answer_key()');

reset role;
rollback;
