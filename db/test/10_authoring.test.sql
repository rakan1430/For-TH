\echo ''
\echo '  التأليف: نوعا الاختبار، وحفظ الشجرة، وحماية النتائج'
\echo ''

-- ── ١) الاختبار المؤقّت: محاولةٌ واحدة افتراضاً ─────────────────────────────
-- كان `retention` عموداً يُعرض ولا يفعل شيئاً، فيُعاد المؤقّت بلا حدّ
-- كالمسجَّل تماماً. هذا الفحص يحرس الفرق.
begin;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","email":"u11@x.test"}', true);
set local role authenticated;

do $$
declare r record; a record; s record; qid uuid;
begin
  select * into r from public.save_quiz(jsonb_build_object(
    'track', 'qudurat', 'scope', 'bank',
    'bank_id', 'c0000000-0000-0000-0000-000000000001',
    'title', 'اختبار مؤقّت', 'retention', 'temporary', 'is_published', true,
    'questions', jsonb_build_array(jsonb_build_object(
      'prompt', '٢ + ٢ = ؟', 'points', 1,
      'options', jsonb_build_array(
        jsonb_build_object('label', '٤', 'is_correct', true),
        jsonb_build_object('label', '٥', 'is_correct', false))))));
  perform testing.ok(r.ok, 'المعلّم يحفظ اختباراً كاملاً بدالّة واحدة');
  perform testing.eq(r.questions_saved, 1, 'وسؤالٌ واحد حُفظ');
  qid := r.quiz_id;

  -- والمعلّم يقرأ ما كتبه ليعدّله لاحقاً
  perform testing.eq(
    (select count(*)::integer from public.teacher_answer_key(r.quiz_id)), 1,
    'والمعلّم يقرأ مفتاح إجابته ليعدّل اختباره لاحقاً');
  perform public.assign_items('quiz', array[qid], 'track');
  create temporary table _tq on commit drop as select qid as id;
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;

do $$
declare a record; s record; qid uuid;
begin
  select id into qid from _tq;

  select * into a from public.start_attempt(qid);
  perform testing.ok(a.ok, 'المؤقّت: المحاولة الأولى تبدأ');
  select * into s from public.submit_attempt(a.attempt_id, '[]'::jsonb);
  perform testing.ok(s.ok, 'المؤقّت: وتُسلَّم');

  -- ⚠️ هنا الفرق عن المسجَّل: لا محاولة ثانية بلا إذنٍ صريح من المعلّم
  select * into a from public.start_attempt(qid);
  perform testing.eq(a.ok, false, 'المؤقّت: لا محاولة ثانية — «لمرّة»');
  perform testing.eq(a.reason, 'attempts_exhausted', 'والسبب معلَن');
end $$;

reset role;
rollback;

-- ── ٢) المسجَّل يبقى بلا حدّ — وإلا كان الإصلاح قد كسر النوع الآخر ──────────
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;
do $$
declare a record; s record;
begin
  for i in 1..4 loop
    select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
    perform testing.ok(a.ok, format('المسجَّل: المحاولة %s تبدأ بلا حدّ', i));
    select * into s from public.submit_attempt(a.attempt_id, '[]'::jsonb);
  end loop;
end $$;
reset role;
rollback;

-- ── ٣) سؤالٌ أجاب عنه طالبٌ لا يُحذف ولا تُبدَّل خياراته ────────────────────
-- لو حُذف لفقدت إجابته معناها؛ ولو بُدّلت خياراته لصارت درجته محسوبةً على
-- سؤالٍ غير الذي رآه.
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;
do $$
declare a record; s record;
begin
  select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  select * into s from public.submit_attempt(a.attempt_id, jsonb_build_array(
    jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000001',
                       'option_id','09000000-0000-0000-0000-000000000002')));
  perform testing.ok(s.ok, 'طالبٌ أجاب عن سؤالٍ وسلّم');
end $$;

reset role;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","email":"u11@x.test"}', true);
set local role authenticated;

do $$
declare r record; n integer;
begin
  -- المعلّم يحاول إعادة بناء الاختبار بسؤالٍ جديد وحده، حاذفاً المُجاب عنه
  select * into r from public.save_quiz(jsonb_build_object(
    'id', 'e0000000-0000-0000-0000-000000000001',
    'track', 'qudurat', 'scope', 'bank',
    'bank_id', 'c0000000-0000-0000-0000-000000000001',
    'title', 'اختبار بنك النِّسب', 'retention', 'permanent', 'is_published', true,
    'questions', jsonb_build_array(jsonb_build_object(
      'prompt', 'سؤال جديد', 'points', 1,
      'options', jsonb_build_array(
        jsonb_build_object('label', 'أ', 'is_correct', true),
        jsonb_build_object('label', 'ب', 'is_correct', false))))));

  perform testing.ok(r.ok, 'الحفظ يقع');
  perform testing.eq(r.questions_saved, 1, 'السؤال الجديد حُفظ');

  /*
   * ⚠️ السؤالان **كلاهما** مقفلان، لا الذي اختار الطالب إجابته وحده.
   *
   *    لأنّ التسليم يكتب صفّاً لكل سؤالٍ في الاختبار، بما فيها ما تركه
   *    الطالب — فالمتروك حُسب خطأً ودخل في الدرجة العظمى. وحذفه بعد ذلك
   *    يجعل محاولةً مسجَّلةً «٢ من ٣» بينما اختبارها صار سؤالين، فتكذب
   *    النتيجة على من يقرأها لاحقاً.
   *
   *    فالقاعدة أدقّ ممّا تبدو: يُقفل كل سؤالٍ **دخل في نتيجةٍ مسلَّمة**،
   *    لا كل سؤالٍ أُجيب عنه.
   */
  perform testing.eq(r.questions_locked, 2, 'كل سؤالٍ دخل في نتيجةٍ مسلَّمة مقفل — والعدد معلَن لا مبتلع');

  select count(*) into n from public.quiz_questions
   where id in ('f0000000-0000-0000-0000-000000000001',
                'f0000000-0000-0000-0000-000000000002');
  perform testing.eq(n, 2, 'والسؤالان ما يزالان موجودين فعلاً — لا في التقرير وحده');

  select count(*) into n from public.attempt_answers
   where question_id = 'f0000000-0000-0000-0000-000000000001';
  perform testing.ok(n > 0, 'وإجابة الطالب محفوظة');

  -- والدرجة العظمى المسجَّلة ما زالت متّسقة مع الأسئلة التي رآها
  select count(*) into n from public.quiz_questions
   where quiz_id = 'e0000000-0000-0000-0000-000000000001';
  perform testing.eq(n, 3, 'والاختبار صار ثلاثة أسئلة: مقفلان ومضافٌ جديد');
end $$;

-- ⚠️ وحذف الاختبار نفسه ممنوع ما دامت له نتائج — مُشغِّلٌ على الجدول يسري
--    على أي مسار، لا فحصٌ في الواجهة يُنسى.
select testing.denied(
  $q$ delete from public.quizzes where id = 'e0000000-0000-0000-0000-000000000001' $q$,
  'لا يُحذف اختبارٌ له نتائج — ولو بحذفٍ مباشر',
  array['23503']);

-- وحذف بنكه يتسلسل إليه، فيُمنع كذلك
select testing.denied(
  $q$ delete from public.banks where id = 'c0000000-0000-0000-0000-000000000001' $q$,
  'ولا يُحذف بنكه — الحماية تسري عبر التسلسل',
  array['23503']);

reset role;
rollback;

-- ── ٤) رفضٌ صريح لاختبارٍ لا يُصحَّح ────────────────────────────────────────
begin;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","email":"u11@x.test"}', true);
set local role authenticated;

do $$
declare r record;
begin
  -- سؤالٌ بلا خيارٍ صحيح: التصحيح عليه بلا معنى، فيُرفض قبل أي كتابة
  select * into r from public.save_quiz(jsonb_build_object(
    'track', 'qudurat', 'scope', 'general', 'title', 'ناقص',
    'questions', jsonb_build_array(jsonb_build_object(
      'prompt', 'س', 'options', jsonb_build_array(
        jsonb_build_object('label', 'أ', 'is_correct', false))))));
  perform testing.eq(r.ok, false, 'سؤال بلا إجابة صحيحة يُرفض');
  perform testing.eq(r.reason, 'question_without_answer', 'والسبب معلَن');

  select * into r from public.save_quiz(jsonb_build_object(
    'track', 'qudurat', 'scope', 'general', 'title', '',
    'questions', '[]'::jsonb));
  perform testing.eq(r.reason, 'title_required', 'واختبار بلا عنوان يُرفض');

  select * into r from public.save_quiz(jsonb_build_object(
    'track', 'qudurat', 'scope', 'bank', 'title', 'بلا بنك',
    'questions', '[]'::jsonb));
  perform testing.eq(r.reason, 'bank_required', 'واختبار بنكٍ بلا بنك يُرفض');
end $$;

reset role;
rollback;

-- ── ٥) الترتيب: لا اسم جدولٍ يأتي من العميل ────────────────────────────────
begin;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","email":"u11@x.test"}', true);
set local role authenticated;

select testing.eq(
  public.reorder('bank', array['c0000000-0000-0000-0000-000000000002',
                               'c0000000-0000-0000-0000-000000000001']::uuid[]), 2,
  'إعادة ترتيب البنوك تمسّ صفّين');

select testing.eq(
  (select position from public.banks where id = 'c0000000-0000-0000-0000-000000000002'), 0,
  'والبنك المنقول صار أوّلاً');

select testing.denied(
  $q$ select public.reorder('quiz_attempts; drop table public.profiles', array[]::uuid[]) $q$,
  'نوعٌ خارج القائمة المسموحة يُرفض — لا اسم جدولٍ يُركَّب من مدخلات',
  array['22023']);

reset role;
rollback;

-- ── ٦) والطالب لا يؤلّف ─────────────────────────────────────────────────────
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;

select testing.denied(
  $q$ select * from public.save_quiz('{"track":"qudurat","title":"اختباري","questions":[]}'::jsonb) $q$,
  'save_quiz ترفض غير المعلّم');
select testing.denied(
  $q$ select public.reorder('bank', array['c0000000-0000-0000-0000-000000000001']::uuid[]) $q$,
  'reorder ترفض غير المعلّم');

-- ⚠️ وأهمّها: بابُ قراءة المفتاح الذي فُتح للمعلّم لا يُفتح للطالب قيد شعرة.
select testing.denied(
  $q$ select * from public.teacher_answer_key('e0000000-0000-0000-0000-000000000001') $q$,
  'teacher_answer_key ترفض الطالب — الباب للمعلّم وحده');
select testing.denied(
  $q$ select 1 from private.answer_key $q$,
  'والمفتاح نفسه ما يزال بلا طريقٍ من الطالب');

reset role;
rollback;
