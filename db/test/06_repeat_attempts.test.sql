\echo ''
\echo '  المحاولات المتعدّدة — «يُعاد أكثر من مرّة بلا مشاكل»'
\echo '  شرطٌ تصميميّ لا ميزة: بنية النتائج تحتمل محاولاتٍ متعدّدة لنفس الطالب'
\echo '  على نفس الاختبار **من البداية**، لا جدولاً يفترض محاولةً واحدة ثم'
\echo '  يُرقَّع.'
\echo ''

-- ── البنية نفسها: المفتاح ثلاثيّ لا ثنائيّ ─────────────────────────────────
-- لو كان المفتاح (الاختبار + الطالب) لاستحالت الإعادة مهما فعلت الشفرة.
select testing.ok(
  exists (
    select 1
    from pg_constraint c
    join lateral unnest(c.conkey) k(attnum) on true
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k.attnum
    where c.conrelid = 'public.quiz_attempts'::regclass
      and c.contype = 'u'
    group by c.oid
    having array_agg(a.attname::text order by a.attname::text) = array['attempt_no','quiz_id','student_id']
  ),
  'مفتاح المحاولة = (الاختبار + الطالب + رقم المحاولة)');

-- ── والسلوك: ثلاث محاولاتٍ متتالية، كلٌّ بدرجتها ───────────────────────────
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;

do $$
declare a record; s record; n integer;
begin
  -- الأولى: صفر
  select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  perform testing.eq(a.attempt_no, 1, 'رقم المحاولة الأولى = ١');
  select * into s from public.submit_attempt(a.attempt_id, jsonb_build_array(
    jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000001','option_id','09000000-0000-0000-0000-000000000001')));
  perform testing.eq(s.score::numeric, 0::numeric, 'درجة المحاولة الأولى صفر');

  -- الثانية: واحد
  select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  perform testing.eq(a.attempt_no, 2, 'رقم المحاولة الثانية = ٢ — لا خطأ تكرارٍ ولا رفض');
  select * into s from public.submit_attempt(a.attempt_id, jsonb_build_array(
    jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000001','option_id','09000000-0000-0000-0000-000000000002')));
  perform testing.eq(s.score::numeric, 1::numeric, 'درجة المحاولة الثانية ١');

  -- الثالثة: كاملة
  select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  perform testing.eq(a.attempt_no, 3, 'رقم المحاولة الثالثة = ٣');
  select * into s from public.submit_attempt(a.attempt_id, jsonb_build_array(
    jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000001','option_id','09000000-0000-0000-0000-000000000002'),
    jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000002','option_id','09000000-0000-0000-0000-000000000011')));
  perform testing.eq(s.score::numeric, 2::numeric, 'درجة المحاولة الثالثة ٢');

  -- ⚠️ والمحاولات الثلاث **محفوظة كلّها**: لا تدوس المحاولةُ سابقتَها.
  --    المعلّم يريد رؤية التقدّم، لا آخر رقمٍ فقط.
  select count(*) into n from public.quiz_attempts
   where quiz_id = 'e0000000-0000-0000-0000-000000000001'
     and student_id = '22222222-2222-2222-2222-222222222222';
  perform testing.eq(n::integer, 3, 'المحاولات الثلاث محفوظة، لا واحدة تدوس الأخرى');

  select count(distinct score) into n from public.quiz_attempts
   where quiz_id = 'e0000000-0000-0000-0000-000000000001'
     and student_id = '22222222-2222-2222-2222-222222222222';
  perform testing.eq(n::integer, 3, 'ولكلٍّ درجتها المستقلّة (٠ و١ و٢)');
end $$;

reset role;
rollback;

-- ── التسليم مرّتين لنفس المحاولة: رفضٌ صريح لا كتابةٌ صامتة ────────────────
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;

do $$
declare a record; s1 record; s2 record;
begin
  select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  select * into s1 from public.submit_attempt(a.attempt_id, jsonb_build_array(
    jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000001','option_id','09000000-0000-0000-0000-000000000002')));
  perform testing.ok(s1.ok, 'التسليم الأول ينجح');

  select * into s2 from public.submit_attempt(a.attempt_id, jsonb_build_array(
    jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000001','option_id','09000000-0000-0000-0000-000000000002'),
    jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000002','option_id','09000000-0000-0000-0000-000000000011')));
  perform testing.eq(s2.ok, false, 'التسليم الثاني لنفس المحاولة مرفوض');
  perform testing.eq(s2.reason, 'already_submitted', 'والسبب معلَن — لا تظاهرَ بنجاح');
  perform testing.eq(s2.score::numeric, 1::numeric, 'والدرجة الأصلية لم تتبدّل بمحاولة إعادة التسليم');
end $$;

reset role;
rollback;
