\echo ''
\echo '  الصلاحية تُفحص لحظة الكتابة — البند ٧'
\echo '  «تبويب قديم مفتوح على جهاز طالب يمكن أن يُسلّم إلى محتوىً أُغلق أو'
\echo '   اشتراكٍ انتهى.» فنُعيد الحالة: يبدأ وهو مشترك، ويُسلّم وقد انتهى.'
\echo ''

begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
set local role authenticated;

do $$
declare a record;
begin
  select * into a from public.start_attempt('e0000000-0000-0000-0000-000000000001');
  perform testing.ok(a.ok, 'المحاولة تبدأ والاشتراك ساري');
  -- نحفظ رقم المحاولة لنُكمل عليها بعد سحب الاشتراك
  create temporary table _t_attempt on commit drop as select a.attempt_id as id;
end $$;

-- ينقضي الاشتراك بين اللحظتين (كأن انتهى وقتُه، أو سحبه المعلّم)
reset role;
update public.subscriptions
   set is_revoked = true
 where student_id = '22222222-2222-2222-2222-222222222222' and track = 'qudurat';

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
set local role authenticated;

do $$
declare s record; aid uuid;
begin
  select id into aid from _t_attempt;

  select * into s from public.submit_attempt(aid, jsonb_build_array(
    jsonb_build_object('question_id','f0000000-0000-0000-0000-000000000001',
                       'option_id',  '09000000-0000-0000-0000-000000000002')));

  -- ⚠️ لو كان الفحص عند فتح الصفحة وحدها لمرّ هذا التسليم ولَسُجّلت درجة
  --    لطالبٍ لا حقّ له في المحتوى أصلاً.
  perform testing.eq(s.ok, false, 'التسليم بعد انتهاء الاشتراك مرفوض');
  perform testing.eq(s.reason, 'subscription_expired', 'والسبب معلَن');

  -- والحفظ المرحلي كذلك، لا التسليم وحده
  select * into s from public.save_answer(aid,
    'f0000000-0000-0000-0000-000000000002', '09000000-0000-0000-0000-000000000011');
  perform testing.eq(s.ok, false, 'حفظ إجابةٍ بعد انتهاء الاشتراك مرفوض أيضاً');
  perform testing.eq(s.reason, 'subscription_expired', 'وبنفس السبب المعلَن');
end $$;

-- والمحتوى نفسه احتجب من القاعدة، لا بإخفاء زرٍّ
select testing.eq(testing.count_of($q$ select 1 from public.banks $q$), 0,
                  'وبعد السحب: صفر بنك — الإغلاق من القاعدة');

reset role;
rollback;

-- ── ونتائجه السابقة لا تُحذف ───────────────────────────────────────────────
-- «وعند انتهائه يتوقّف وصول الطالب للمحتوى — ولا تُحذف نتائجه.»
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
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

select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
set local role authenticated;

select testing.eq(testing.count_of($q$ select 1 from public.quiz_attempts $q$), 1,
                  'نتيجته باقية بعد انتهاء اشتراكه — يتوقّف الوصول ولا تُمحى النتائج');

reset role;
rollback;
