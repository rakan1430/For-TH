\echo ''
\echo '  الصلاحية تُفحص لحظة الكتابة — البند ٧'
\echo '  «تبويب قديم مفتوح على جهاز طالب يمكن أن يُسلّم إلى محتوىً أُغلق.»'
\echo '  فنُعيد الحالة: يبدأ والاختبار منشور، ويُسلّم وقد سحبه المعلّم.'
\echo ''

-- ⚠️⚠️ كان هذا الملفّ يُعيد حالة «بدأ وهو مشترك، وسلّم وقد انتهى اشتراكه».
--    وسقط الاشتراك بالمجّانيّة (٠٠١٤) — فكاد البند ٧ يفقد أسنانه: لم يبق
--    شرطٌ **يتغيّر** بين البدء والتسليم، فصار الحارس يفحص ما لا يتبدّل.
--
--    فنُقل إلى ما يتبدّل فعلاً: المعلّم يسحب نشر اختبارٍ اكتشف فيه خطأً،
--    والطالب تبويبُه مفتوحٌ منذ ساعة. والتسليم يجب أن يُردّ.

begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;

do $$
declare a record;
begin
  select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  perform testing.ok(a.ok, 'المحاولة تبدأ والاختبار منشور');
  create temporary table _t_attempt on commit drop as select a.attempt_id as id;
end $$;

-- يسحب المعلّم نشر الاختبار بين اللحظتين
reset role;
update public.quizzes set is_published = false
 where id = 'e0000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;

do $$
declare s record; aid uuid;
begin
  select id into aid from _t_attempt;

  select * into s from public.submit_attempt(aid, jsonb_build_array(
    jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000001',
                       'option_id',  '09000000-0000-0000-0000-000000000002')));

  -- ⚠️ لو كان الفحص عند فتح الصفحة وحدها لمرّ هذا التسليم ولَسُجّلت درجة
  --    على اختبارٍ سحبه المعلّم لخطأٍ فيه.
  perform testing.eq(s.ok, false, 'التسليم بعد سحب النشر مرفوض');
  perform testing.eq(s.reason, 'quiz_closed', 'والسبب معلَن');

  -- والحفظ المرحلي كذلك، لا التسليم وحده
  select * into s from public.save_answer(aid,
    'f0000000-0000-0000-0000-000000000002', '09000000-0000-0000-0000-000000000011');
  perform testing.eq(s.ok, false, 'حفظ إجابةٍ بعد سحب النشر مرفوض أيضاً');
  perform testing.eq(s.reason, 'quiz_closed', 'وبنفس السبب المعلَن');
end $$;

-- والاختبار نفسه احتجب من القاعدة، لا بإخفاء زرٍّ
select testing.eq(
  testing.count_of($q$ select 1 from public.quizzes
                        where id = 'e0000000-0000-0000-0000-000000000001' $q$), 0,
  'وبعد السحب: الاختبار غير مرئيّ — الإغلاق من القاعدة');

reset role;
rollback;

-- ── ونتائجه السابقة لا تُحذف ───────────────────────────────────────────────
-- «وعند انتهائه يتوقّف وصول الطالب للمحتوى — ولا تُحذف نتائجه.»
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;

do $$
declare a record; s record; n integer;
begin
  select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  select * into s from public.submit_attempt(a.attempt_id, jsonb_build_array(
    jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000001','option_id','09000000-0000-0000-0000-000000000002')));
  perform testing.ok(s.ok, 'محاولةٌ سُلّمت والاشتراك ساري');
end $$;

reset role;
update public.subscriptions set is_revoked = true
 where student_id = '22222222-2222-2222-2222-222222222222' and track = 'qudurat';

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;

select testing.eq(testing.count_of($q$ select 1 from public.quiz_attempts $q$), 1,
                  'نتيجته باقية بعد انتهاء اشتراكه — يتوقّف الوصول ولا تُمحى النتائج');

reset role;
rollback;
