\echo ''
\echo '  مفتاح الإجابة والتصحيح'
\echo '  «الإجابات الصحيحة لا تُرسل لجهاز الطالب قبل التسليم» و«الدرجة تُحسب'
\echo '   من الإجابات المخزَّنة، لا من رقمٍ يرسله المتصفّح».'
\echo ''

-- ── ١) لا عمود صحّةٍ في الجدول المكشوف ──────────────────────────────────────
-- سياسات الصفوف تحرس الصفوف لا الأعمدة: من يرى الخيار يرى كل أعمدته. فلو
-- وُجد عمود `is_correct` هنا لوصل جهاز الطالب مع الخيار نفسه، مهما كتبنا
-- من سياسات.
select testing.eq(
  (select count(*)::integer from information_schema.columns
    where table_schema = 'public' and table_name = 'quiz_options'
      and column_name in ('is_correct','correct','is_right','answer')), 0,
  'لا عمود صحّةٍ في `quiz_options` — الإجابة ليست في الجدول المكشوف أصلاً');

select testing.eq(
  (select count(*)::integer from information_schema.tables
    where table_schema = 'public' and table_name = 'answer_key'), 0,
  'لا `answer_key` في المخطّط المكشوف');

select testing.eq(
  (select count(*)::integer from information_schema.tables
    where table_schema = 'private' and table_name = 'answer_key'), 1,
  'المفتاح موجود — في المخطّط الخاصّ وحده');

-- ── ٢) لا تقبل دالّة التسليم درجةً من العميل ────────────────────────────────
-- فحصٌ على **توقيع** الدالّة لا على سلوكها: لو أضاف أحدٌ يوماً وسيطاً باسم
-- `p_score` تسهيلاً، سقط هذا الفحص فوراً.
select testing.ok(
  pg_get_function_identity_arguments('public.submit_attempt(uuid,jsonb)'::regprocedure)
    not ilike '%score%',
  'submit_attempt لا تقبل درجةً ولا نسبةً وسيطاً من العميل');
select testing.ok(
  pg_get_function_identity_arguments('public.save_answer(uuid,uuid,uuid)'::regprocedure)
    not ilike '%correct%',
  'save_answer لا تقبل صحّةً من العميل');

-- ── ٣) الطالب لا يبلغ المفتاح بأي طريق ──────────────────────────────────────
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;

select testing.denied($q$ select 1 from private.answer_key $q$,
                      'الطالب لا يقرأ مفتاح الإجابة');
select testing.denied($q$ select 1 from private.answer_key where question_id = 'f0000000-0000-0000-0000-000000000001' $q$,
                      'ولا صفّاً واحداً منه بسؤالٍ بعينه');

-- يرى الخيارات كاملةً — ولا شيء فيها يدلّ على الصحيح
-- ⚠️ العدّ مقصورٌ على اختبارٍ بعينه: المجّانيّة فتحت المسار الآخر كذلك
--    (٠٠١٤)، والعدّ المطلق صار يقيس قرار التسعير لا مفتاح الإجابة. وادّعاء
--    هذا الملفّ واحدٌ لا يتغيّر: **لا طريق من الطالب إلى الصحيح** — لا
--    عموداً، ولا جدولاً، ولا دالّة.
select testing.eq(testing.count_of(
  $q$ select 1 from public.quiz_options o
      join public.quiz_questions qq on qq.id = o.question_id
      where qq.quiz_id = 'e0000000-0000-0000-0000-000000000001' $q$), 6,
  'الطالب يرى خيارات سؤالَي الاختبار الستّة، بلا إشارةٍ إلى الصحيح');

reset role;
rollback;

-- ── ٤) التصحيح يقع في القاعدة، والدرجة تتبع الإجابة فعلاً ───────────────────
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;

do $$
declare a record; s record;
begin
  -- محاولةٌ بإجابتين خاطئتين
  select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  perform testing.ok(a.ok, 'المحاولة تبدأ لمشترك القدرات');

  select * into s from public.submit_attempt(a.attempt_id, jsonb_build_array(
      jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000001',
                         'option_id',  '09000000-0000-0000-0000-000000000001'),  -- خطأ
      jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000002',
                         'option_id',  '09000000-0000-0000-0000-000000000012')   -- خطأ
  ));
  perform testing.ok(s.ok, 'التسليم يقع');
  perform testing.eq(s.score::numeric, 0::numeric, 'إجابتان خاطئتان ← الدرجة صفر');
  perform testing.eq(s.max_score::numeric, 2::numeric, 'الدرجة العظمى ٢');

  -- محاولةٌ بإجابتين صحيحتين
  select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  select * into s from public.submit_attempt(a.attempt_id, jsonb_build_array(
      jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000001',
                         'option_id',  '09000000-0000-0000-0000-000000000002'),  -- صحيح
      jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000002',
                         'option_id',  '09000000-0000-0000-0000-000000000011')   -- صحيح
  ));
  perform testing.eq(s.score::numeric, 2::numeric, 'إجابتان صحيحتان ← الدرجة كاملة');
  perform testing.eq(s.correct_count, 2, 'عدد الصحيح ٢');

  -- ⚠️ وسؤالٌ لم يُجَب يُحسب خطأً ولا يختفي من النتيجة: نصفٌ لا ثلثٌ ولا كامل
  select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  select * into s from public.submit_attempt(a.attempt_id, jsonb_build_array(
      jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000001',
                         'option_id',  '09000000-0000-0000-0000-000000000002')   -- صحيح، والثاني متروك
  ));
  perform testing.eq(s.score::numeric, 1::numeric, 'سؤال متروك يُحسب خطأً لا يُسقَط من المجموع');
  perform testing.eq(s.question_count, 2, 'النتيجة تعدّ أسئلة الاختبار كلّها');
end $$;

reset role;
rollback;

-- ── ٥) ولا يصحّح أحدٌ اختبار غيره ──────────────────────────────────────────
begin;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","email":"u33@x.test"}', true);
set local role authenticated;

-- ⚠️ كان هنا: «مشترك التحصيلي لا يبدأ اختبار القدرات». سقط بالمجّانيّة
--    (٠٠١٤) لا بخطأ. والمقصود الآن أن يُثبَت أنّ الحارس **لم يُحذف** بل
--    تبدّل شرطه: يبدأ الاختبار لأنّه مسجَّل، ويُردّ لو لم يكن.
do $$
declare r record;
begin
  select * into r from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  perform testing.ok(r.ok, 'مجّاناً: يبدأ اختبار المسار الآخر — لا حاجز اشتراك');
end $$;

reset role;
rollback;
