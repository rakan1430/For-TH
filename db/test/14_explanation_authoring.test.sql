\echo ''
\echo '  كتابة الشرح: مع سؤاله لا بعده'
\echo '  ومتى يُمحى الشرح ومتى يُترك؟ وهل يُمنع عن سؤالٍ أجاب عنه طالب؟'
\echo ''

-- ── ١) الشرح يُكتب مع سؤاله في نداءٍ واحد ─────────────────────────────────
-- ⚠️ العلّة التي بُنيت `save_quiz` لها أصلاً: شجرةٌ تُكتب على دفعاتٍ ينقطع
--    في وسطها الاتّصال. ولو كُتب الشرح بنداءٍ ثانٍ لعاد العطل نفسه في ثوبٍ
--    جديد: اختبارٌ محفوظ بشروحٍ ضائعة، والمعلّم يظنّه تمّ.
begin;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"teacher@example.test"}', true);
set local role authenticated;

do $$
declare r record; v_qid uuid;
begin
  select * into r from public.save_quiz(jsonb_build_object(
    'track', 'qudurat', 'scope', 'general', 'title', 'اختبارٌ بشرحٍ مرفق',
    'is_published', true, 'position', 9,
    'questions', jsonb_build_array(jsonb_build_object(
      'prompt', 'ما جذر ١٤٤؟', 'points', 1,
      'explanation', 'لأنّ ١٢ × ١٢ = ١٤٤.',
      'options', jsonb_build_array(
        jsonb_build_object('label', '١٢', 'is_correct', true),
        jsonb_build_object('label', '١٤', 'is_correct', false))))));

  perform testing.ok(r.ok, 'حُفظ الاختبار');
  perform testing.eq(r.questions_saved, 1, 'وسؤالٌ واحد معه');

  select qq.id into v_qid from public.quiz_questions qq where qq.quiz_id = r.quiz_id;
  perform testing.eq(
    (select e.body from public.question_explanations e where e.question_id = v_qid),
    'لأنّ ١٢ × ١٢ = ١٤٤.',
    'والشرح وصل في المعاملة نفسها — بلا نداءٍ ثانٍ ينقطع');
end $$;
reset role; rollback;

-- ── ٢) غياب المفتاح غير خلوّه ─────────────────────────────────────────────
-- ⚠️⚠️ الفخّ: لو قرأنا `->>'explanation'` بلا سؤالٍ عن وجود المفتاح، لكان
--    كل حفظٍ من واجهةٍ لا تعرف الحقل **محواً صامتاً** لشرحٍ كتبه المعلّم.
--    فقدٌ لا يُبلَّغ عنه ولا يُستعاد. فالفرق مقصود ومُختبَر هنا.
begin;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"teacher@example.test"}', true);
set local role authenticated;

do $$
declare r record; v_quiz uuid; v_qid uuid; n integer;
  base jsonb;
begin
  select * into r from public.save_quiz(jsonb_build_object(
    'track', 'qudurat', 'scope', 'general', 'title', 'اختبار المحو',
    'is_published', true, 'position', 9,
    'questions', jsonb_build_array(jsonb_build_object(
      'prompt', 'ما جذر ٨١؟', 'points', 1,
      'explanation', 'لأنّ ٩ × ٩ = ٨١.',
      'options', jsonb_build_array(
        jsonb_build_object('label', '٩', 'is_correct', true),
        jsonb_build_object('label', '٨', 'is_correct', false))))));
  v_quiz := r.quiz_id;
  select qq.id into v_qid from public.quiz_questions qq where qq.quiz_id = v_quiz;

  -- حمولةٌ **لا تذكر الشرح إطلاقاً**
  base := jsonb_build_object(
    'id', v_quiz, 'track', 'qudurat', 'scope', 'general', 'title', 'اختبار المحو',
    'is_published', true, 'position', 9,
    'questions', jsonb_build_array(jsonb_build_object(
      'id', v_qid, 'prompt', 'ما جذر ٨١؟', 'points', 1,
      'options', jsonb_build_array(
        jsonb_build_object('label', '٩', 'is_correct', true),
        jsonb_build_object('label', '٨', 'is_correct', false)))));
  perform public.save_quiz(base);

  select count(*) into n from public.question_explanations e where e.question_id = v_qid;
  perform testing.eq(n, 1, 'حمولةٌ لا تذكر الشرح لا تمسّه');

  -- وحمولةٌ تذكره **فارغاً**: محوٌ مقصود
  perform public.save_quiz(jsonb_set(base, '{questions,0,explanation}', '""'::jsonb));

  select count(*) into n from public.question_explanations e where e.question_id = v_qid;
  perform testing.eq(n, 0, 'وحمولةٌ تذكره فارغاً تمحوه');
end $$;
reset role; rollback;

-- ── ٣) السؤال المقفل: نصّه محميّ، وشرحه مفتوح ─────────────────────────────
-- ⚠️ القفل يحمي **ما رآه الطالب وما يُصحَّح عليه**. والشرح ليس منهما: هو
--    ما يُقال له بعد أن أخطأ. فمنعُه عن المقفل يمنعه في الحالة الوحيدة
--    التي يُطلب فيها أصلاً.
begin;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"teacher@example.test"}', true);
set local role authenticated;

do $$
declare r record;
begin
  select * into r from public.save_quiz(jsonb_build_object(
    'track', 'qudurat', 'scope', 'general', 'title', 'اختبار القفل',
    'is_published', true, 'position', 9,
    'questions', jsonb_build_array(jsonb_build_object(
      'prompt', 'ما ناتج ٧ × ٨؟', 'points', 1,
      'options', jsonb_build_array(
        jsonb_build_object('label', '٥٦', 'is_correct', true),
        jsonb_build_object('label', '٥٤', 'is_correct', false))))));
  perform testing.ok(r.ok, 'اختبارٌ بلا شرح، منشور');
  create temporary table _t_lock on commit drop as
    select r.quiz_id as quiz_id,
           (select qq.id from public.quiz_questions qq where qq.quiz_id = r.quiz_id) as q_id,
           (select o.id from public.quiz_options o
             where o.question_id = (select qq.id from public.quiz_questions qq where qq.quiz_id = r.quiz_id)
               and o.label = '٥٤') as wrong_id;
end $$;

-- الطالب يجيب ويسلّم — فيصير السؤال مقفلاً
reset role;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","email":"u33@x.test"}', true);
set local role authenticated;

do $$
declare a record; s record; t record;
begin
  select * into t from _t_lock;
  select * into a from public.start_attempt(t.quiz_id);
  perform testing.ok(a.ok, 'بدأ الطالب اختباراً منشوراً بلا توزيع — أي للجميع');
  select * into s from public.submit_attempt(a.attempt_id, jsonb_build_array(
    jsonb_build_object('question_id', t.q_id, 'option_id', t.wrong_id)));
  perform testing.ok(s.ok, 'وسلّم وأخطأ');
end $$;

-- والمعلّم الآن يريد أن يشرح له — والسؤال مقفل
reset role;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"teacher@example.test"}', true);
set local role authenticated;

do $$
declare r record; t record;
begin
  select * into t from _t_lock;
  select * into r from public.save_quiz(jsonb_build_object(
    'id', t.quiz_id, 'track', 'qudurat', 'scope', 'general', 'title', 'اختبار القفل',
    'is_published', true, 'position', 9,
    'questions', jsonb_build_array(jsonb_build_object(
      'id', t.q_id,
      -- يحاول تبديل النصّ أيضاً: هذا **يجب** أن يُرفض
      'prompt', 'نصٌّ مبدَّل بعد أن أجاب الطلّاب', 'points', 1,
      'explanation', 'حاصل ضرب ٧ في ٨ هو ٥٦.',
      'options', jsonb_build_array(
        jsonb_build_object('label', '٥٦', 'is_correct', true),
        jsonb_build_object('label', '٥٤', 'is_correct', false))))));

  perform testing.ok(r.ok, 'قُبل الحفظ');
  perform testing.eq(r.questions_locked, 1, 'وأُبلغ أنّ سؤالاً مقفل — عدداً صريحاً');
  perform testing.eq(
    (select qq.prompt from public.quiz_questions qq where qq.id = t.q_id),
    'ما ناتج ٧ × ٨؟',
    'ونصّ السؤال لم يُمسّ — إجابة الطالب تشير إليه');
  perform testing.eq(
    (select e.body from public.question_explanations e where e.question_id = t.q_id),
    'حاصل ضرب ٧ في ٨ هو ٥٦.',
    'والشرح كُتب رغم القفل — وهو وقته بالضبط');
end $$;

-- ويراه الطالب الآن، وقد سلّم
reset role;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","email":"u33@x.test"}', true);
set local role authenticated;

do $$
declare t record; n integer;
begin
  select * into t from _t_lock;
  select count(*) into n from public.question_explanations e where e.question_id = t.q_id;
  perform testing.eq(n, 1, 'والطالب يقرؤه بعد تسليمه');
end $$;
reset role; rollback;

-- ── ٤) والطالب لا يكتب شرحاً ولا يحذفه ────────────────────────────────────
-- ⚠️ لولا هذا لكتب الطالب لنفسه «شرحاً» في سؤالٍ لم يسلّمه بعد، فصار صفّاً
--    يقرؤه… لا. الأخطر: يمحو شرح المعلّم عن زملائه.
begin;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","email":"u33@x.test"}', true);
set local role authenticated;

select testing.denied(
  $q$ insert into public.question_explanations (question_id, body)
      values ('f0000000-0000-0000-0000-000000000002', 'شرحٌ كتبه طالب') $q$,
  'الطالب لا يكتب شرحاً');

select testing.affects(
  $q$ delete from public.question_explanations $q$, 0,
  'ولا يمحو شرحاً');

select testing.denied(
  $q$ select public.save_quiz('{"track":"qudurat","title":"س"}'::jsonb) $q$,
  'ولا ينفّذ `save_quiz` أصلاً');
reset role; rollback;
