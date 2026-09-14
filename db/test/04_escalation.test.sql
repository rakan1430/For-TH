\echo ''
\echo '  محاولات الترقّي — ماذا لو حاول الطالب أن يصير معلّماً؟'
\echo '  كل فحصٍ هنا هجومٌ فعليّ بصلاحيات الطالب، لا مراجعةً لسياسةٍ مكتوبة.'
\echo ''

begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
set local role authenticated;

-- ١) الترقّي المباشر: جدول المعلّمين خارج مخطّط الواجهة أصلاً
select testing.denied($q$ insert into private.teachers (user_id) values ('22222222-2222-2222-2222-222222222222') $q$,
                      'الطالب لا يبلغ جدول المعلّمين — لا مسار إليه أصلاً');
select testing.denied($q$ select 1 from private.teachers $q$,
                      'الطالب لا يقرأ جدول المعلّمين');
select testing.eq(public.is_teacher(), false, 'الطالب ليس معلّماً بحسب الدالّة');

-- ٢) لا عمود دورٍ يُعدَّل في ملفّه: لا وجود له في المخطّط
select testing.eq(
  (select count(*)::integer from information_schema.columns
    where table_schema='public' and table_name='profiles'
      and column_name in ('role','is_teacher','is_admin')), 0,
  'لا عمود دورٍ في `profiles` — فلا باب ترقيةٍ ذاتية أصلاً');

-- ٣) كتابة المحتوى
--    الإدراج يُرفَض بخطأٍ صريح (42501)…
select testing.denied($q$ insert into public.banks (track, title) values ('qudurat','بنكي أنا') $q$,
                      'الطالب لا ينشئ بنكاً');
select testing.denied($q$ insert into public.assignments (track,item_type,item_id,audience)
                          values ('qudurat','bank','c0000000-0000-0000-0000-000000000003','track') $q$,
                      'الطالب لا يوزّع محتوىً على نفسه');

--    …أمّا التحديث فيمرّ ويمسّ **صفراً** من الصفوف، ولا يرفع خطأً. والطالب
--    يرى بنكين بالقراءة، فالادّعاء هنا ليس «مُنع» بل «لم يتغيّر شيء».
select testing.affects($q$ update public.banks set is_published = true $q$, 0,
                       'الطالب ينشر صفر بنك — يقرأ بنكين ولا يكتب في واحد');
select testing.affects($q$ update public.banks set title = 'مسروق' $q$, 0,
                       'الطالب يعدّل صفر عنوان');
select testing.affects($q$ delete from public.banks $q$, 0,
                       'الطالب يحذف صفر بنك');

-- ٤) تمديد اشتراكه بيده
select testing.affects($q$ update public.subscriptions set ends_on = current_date + 3650 $q$, 0,
                       'الطالب يمدّد صفر اشتراك — ويرى اشتراكه هو بالقراءة');
select testing.denied($q$ insert into public.subscriptions (student_id, track, starts_on, ends_on)
                          values ('22222222-2222-2222-2222-222222222222','tahsili',current_date,current_date+365) $q$,
                      'الطالب لا يمنح نفسه اشتراكاً في المسار الآخر');
select testing.eq((select max(ends_on) from public.subscriptions), current_date + 20,
                  'وتاريخ انتهاء اشتراكه كما هو، لم يتزحزح');

-- ٥) قبول طلبه بنفسه
--    ⚠️ نُنشئ له طلباً معلّقاً أوّلاً: لولا ذلك لمرّ الفحص لأنّه لا صفّ له
--       أصلاً — فيقيس العدم لا المنع. (البند ٢٢: أثبت أنّ الفحص ليس أعمى.)
reset role;
insert into public.subscription_requests (student_id, track, plan_id, full_name, contact, method, receipt_path)
select '22222222-2222-2222-2222-222222222222', 'tahsili', p.id, 'طالب القدرات', '0500000001', 'transfer', 'receipts/22/r.jpg'
from public.plans p where p.track = 'tahsili' and p.period = 'monthly';
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
set local role authenticated;

select testing.eq(testing.count_of($q$ select 1 from public.subscription_requests $q$), 1,
                  'الطالب يرى طلبه المعلّق — فالفحص التالي يقيس منعاً لا عدماً');
select testing.affects($q$ update public.subscription_requests set status = 'accepted' $q$, 0,
                       'ومع ذلك يقبل صفر طلب — القرار للمعلّم وحده');
select testing.eq((select status::text from public.subscription_requests), 'pending',
                  'وطلبه ما زال معلّقاً فعلاً');

-- ٦) كتابة درجةٍ لنفسه مباشرةً — لا صلاحية إدراجٍ أصلاً على جدول المحاولات
select testing.denied($q$ insert into public.quiz_attempts (quiz_id, student_id, attempt_no, status, submitted_at, score, max_score)
                          values ('e0000000-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',1,'submitted',now(),100,100) $q$,
                      'الطالب لا يكتب محاولةً بدرجةٍ من عنده');
select testing.denied($q$ insert into public.attempt_answers (attempt_id, question_id, is_correct)
                          values (gen_random_uuid(),'f0000000-0000-0000-0000-000000000001',true) $q$,
                      'الطالب لا يكتب إجابةً مصحَّحة بيده');

-- ٧) ملفّات غيره
select testing.eq(testing.count_of($q$ select 1 from public.profiles $q$), 1,
                  'الطالب يرى ملفّه وحده — لا دليل أسماء للطلّاب');

-- ٨) الدوالّ التي تفحص المعلّم في أوّل سطرٍ منها
select testing.denied($q$ select * from public.assign_items('bank', array['c0000000-0000-0000-0000-000000000001']::uuid[], 'track') $q$,
                      'assign_items ترفض غير المعلّم');
select testing.denied($q$ select * from public.teacher_overview() $q$,
                      'teacher_overview ترفض غير المعلّم');
select testing.denied($q$ select public.set_answer_key('f0000000-0000-0000-0000-000000000001', array['09000000-0000-0000-0000-000000000003']::uuid[]) $q$,
                      'set_answer_key ترفض غير المعلّم — ولا يعيّن الطالب الإجابة الصحيحة');
select testing.denied($q$ select public.reorder_bank_items('c0000000-0000-0000-0000-000000000001','[]'::jsonb) $q$,
                      'reorder_bank_items ترفض غير المعلّم');

reset role;
rollback;
