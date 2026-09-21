\echo ''
\echo '  المراجعة بعد التسليم، والأسئلة المحفوظة'
\echo '  «الشرح فيه الحلّ» — فمتى يُقرأ، ومن يقرؤه؟'
\echo ''

-- بذرةٌ خاصّة بهذا الملفّ: شرحٌ على سؤال اختبار القدرات
reset role;
insert into public.question_explanations (question_id, body)
values ('f0000000-0000-0000-0000-000000000001', 'اقسم الطرفين على ٣ فتحصل على س = ٤.')
on conflict (question_id) do update set body = excluded.body;

-- ── ١) قبل التسليم: الشرح غير مقروء — وفيه الحلّ ──────────────────────────
-- ⚠️⚠️ هذا هو الفحص الذي أُنشئ الجدول المستقلّ من أجله. كان الشرح عمودين
--    على `quiz_questions`، فأيّ طالبٍ يرى السؤال يرى شرحه في نفس الصفّ —
--    لأنّ سياسات الصفوف تحرس الصفوف لا الأعمدة.
begin;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","email":"u33@x.test"}', true);
set local role authenticated;

select testing.eq(testing.count_of($q$ select 1 from public.quiz_questions
                                       where id = 'f0000000-0000-0000-0000-000000000001' $q$), 1,
                  'الطالب يرى السؤال نفسه');
select testing.eq(testing.count_of($q$ select 1 from public.question_explanations $q$), 0,
                  'ولا يرى شرحه قبل أن يسلّم — والشرح فيه الحلّ');
select testing.eq(public.may_review_question('f0000000-0000-0000-0000-000000000001'), false,
                  'ولا يحقّ له مراجعته');
reset role; rollback;

-- ── ٢) ومن بدأ ولم يسلّم لا يُعدّ مراجعاً ─────────────────────────────────
-- ⚠️ «بدأ» لا تكفي: من يبدأ ثمّ يقرأ الشرح قد كشف الإجابة **قبل أن يجيب**.
begin;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","email":"u33@x.test"}', true);
set local role authenticated;

do $$
declare a record;
begin
  select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  perform testing.ok(a.ok, 'بدأ المحاولة');
end $$;

select testing.eq(public.may_review_question('f0000000-0000-0000-0000-000000000001'), false,
                  'بدأ ولم يسلّم: لا مراجعة');
select testing.eq(testing.count_of($q$ select 1 from public.question_explanations $q$), 0,
                  'ولا شرح');
reset role; rollback;

-- ── ٣) وبعد التسليم: يُقرأ الشرح، وتُعيد المراجعة الصحيح وما اختاره ───────
begin;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","email":"u33@x.test"}', true);
set local role authenticated;

do $$
declare a record; s record; r record; n integer;
begin
  select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  -- يجيب الأوّل خطأً («٣» والصحيح «٤») ويترك الثاني
  select * into s from public.submit_attempt(a.attempt_id, jsonb_build_array(
    jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000001',
                       'option_id',  '09000000-0000-0000-0000-000000000001')));
  perform testing.ok(s.ok, 'سلّم المحاولة');

  perform testing.ok(public.may_review_question('f0000000-0000-0000-0000-000000000001'),
                     'وبعد التسليم يحقّ له المراجعة');

  select count(*) into n from public.question_explanations;
  perform testing.eq(n::integer, 1, 'ويقرأ الشرح الآن');

  -- المراجعة تُعيد كل الأسئلة، لا ما أخطأ فيه وحده
  select count(*) into n from public.attempt_review(a.attempt_id);
  perform testing.eq(n::integer, 2, 'المراجعة تُعيد أسئلة الاختبار كلّها');

  select * into r from public.attempt_review(a.attempt_id)
   where question_id = 'f0000000-0000-0000-0000-000000000001';
  perform testing.eq(r.chosen_option_id, '09000000-0000-0000-0000-000000000001'::uuid,
                     'وتُظهر ما اختاره الطالب');
  perform testing.eq(r.correct_option_id, '09000000-0000-0000-0000-000000000002'::uuid,
                     'والصحيح — وهذا المخرج الوحيد لمفتاح الإجابة');
  perform testing.eq(r.is_correct, false, 'وتقول إنّه أخطأ');
  perform testing.ok(r.explanation is not null, 'ومعها الشرح');

  -- والسؤال المتروك: بلا اختيار، ومعه الصحيح
  select * into r from public.attempt_review(a.attempt_id)
   where question_id = 'f0000000-0000-0000-0000-000000000002';
  perform testing.ok(r.chosen_option_id is null, 'وسؤالٌ متروك: بلا اختيار');
  perform testing.ok(r.correct_option_id is not null, 'ومعه صحيحُه');

  create temporary table _t_rev on commit drop as select a.attempt_id as id;
end $$;

-- ── ٤) دفتر المراجعة: يُحفظ ما يحقّ مراجعته وحده ──────────────────────────
do $$
declare r record; n integer;
begin
  select * into r from public.save_question('f0000000-0000-0000-0000-000000000001',
                                            'راجع قسمة الطرفين');
  perform testing.ok(r.ok, 'يحفظ سؤالاً سلّم اختباره');

  select count(*) into n from public.my_saved_questions();
  perform testing.eq(n::integer, 1, 'ويظهر في دفتره');

  -- ⚠️ سؤالٌ من اختبار المسار الآخر لم يسلّمه: لو قُبل حفظه لصار الحفظ
  --    بابَ استكشاف — يحفظ ما لم يره ثمّ يقرؤه من قسم المراجعة.
  select * into r from public.save_question('f0000000-0000-0000-0000-000000000011');
  perform testing.eq(r.ok, false, 'ولا يحفظ سؤالاً لم يسلّم اختباره');
  perform testing.eq(r.reason, 'not_reviewable', 'والسبب معلَن');

  select count(*) into n from public.my_saved_questions();
  perform testing.eq(n::integer, 1, 'ولم يُضف شيء');

  -- والنزع
  select * into r from public.unsave_question('f0000000-0000-0000-0000-000000000001');
  perform testing.ok(r.ok, 'وينزعه متى شاء');
  select count(*) into n from public.my_saved_questions();
  perform testing.eq(n::integer, 0, 'فيخلو دفتره');
end $$;

reset role; rollback;

-- ── ٥) ومحاولة غيره: «غير موجودة» لا «ليست لك» ────────────────────────────
-- ⚠️ لو قيل «ليست لك» لأمكن استكشافُ أيّ المعرّفات حقيقيّة. والفرق بين
--    الردّين تسريبٌ صغير يُجمَع.
begin;
reset role;
-- ⚠️ القيد يلزم: «مسلَّمة» ⇔ لها وقت تسليم ودرجة. والجدول نفسه يمنع
--    محاولةً «مسلَّمة» بلا نتيجة — فلا يُنشأ صفٌّ متناقض ولو بـSQL مباشر.
insert into public.quiz_attempts
  (id, quiz_id, student_id, attempt_no, status, submitted_at, score, max_score)
values ('0e000000-0000-0000-0000-00000000000a',
        'e0000000-0000-0000-0000-000000000001',
        '22222222-2222-2222-2222-222222222222', 9, 'submitted', now(), 1, 2);

select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","email":"u33@x.test"}', true);
set local role authenticated;

select testing.denied($q$ select 1 from public.attempt_review('0e000000-0000-0000-0000-00000000000a') $q$,
                      'مراجعة محاولة غيره: مرفوضة');
reset role; rollback;

-- ── ٦) ودفتر الطالب لا يراه المعلّم ───────────────────────────────────────
-- ⚠️ ما استصعبه الطالب ليس تقييماً يُرفع. ولو عُرض على المعلّم لتردّد الطالب
--    قبل أن يحفظ — فتفقد الميزة معناها.
begin;
reset role;
insert into public.saved_questions (student_id, question_id)
values ('22222222-2222-2222-2222-222222222222', 'f0000000-0000-0000-0000-000000000001')
on conflict do nothing;

select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"u11@x.test"}', true);
set local role authenticated;
select testing.eq(testing.count_of($q$ select 1 from public.saved_questions $q$), 0,
                  'المعلّم لا يرى دفتر مراجعة الطالب');
reset role; rollback;

-- ── ٧) والمجهول لا ينفّذ شيئاً من هذا ─────────────────────────────────────
begin;
set local role anon;
select testing.denied($q$ select public.may_review_question('f0000000-0000-0000-0000-000000000001') $q$,
                      'المجهول: لا ينفّذ may_review_question');
select testing.denied($q$ select 1 from public.question_explanations $q$,
                      'ولا يقرأ جدول الشروح');
reset role; rollback;
