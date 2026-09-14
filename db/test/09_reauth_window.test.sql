\echo ''
\echo '  نافذة الهوية للعمليات الخطرة — البند ١١'
\echo '  «جلسة مفتوحة منذ أسبوع على جهازٍ تُرك في مكانٍ ما» ليست إثبات هوية.'
\echo ''

begin;

-- طلبٌ معلّق ينتظر قرار المعلّم
reset role;
insert into public.subscription_requests (id, student_id, track, plan_id, full_name, grade, contact, method, receipt_path)
select '0a000000-0000-0000-0000-00000000000f', '66666666-6666-6666-6666-666666666666', 'qudurat',
       p.id, 'طالب بلا اشتراك', 'أول ثانوي', '0500000005', 'transfer', 'receipts/66/r.jpg'
from public.plans p where p.track='qudurat' and p.period='monthly';

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
set local role authenticated;

do $$
declare r record; n integer;
begin
  perform testing.ok(public.is_teacher(), 'المستدعي هو المعلّم');

  -- جلسةٌ قائمة، وبلا تأكيد هوية حديث
  select * into r from public.decide_subscription_request(
    '0a000000-0000-0000-0000-00000000000f', true, current_date, 1, null);
  perform testing.eq(r.ok, false, 'قبول اشتراكٍ بلا تأكيد هوية حديث: مرفوض');
  perform testing.eq(r.reason, 'reauth_required', 'والسبب معلَن لتعرضه الواجهة');

  select count(*) into n from public.subscriptions
   where student_id = '66666666-6666-6666-6666-666666666666';
  perform testing.eq(n::integer, 0, 'ولم يُكتب اشتراكٌ رغم الرفض — لا كتابةَ جزئية');

  -- يعيد المعلّم إدخال كلمة المرور، فتُسجَّل لحظة التأكيد
  perform public.confirm_identity();

  select * into r from public.decide_subscription_request(
    '0a000000-0000-0000-0000-00000000000f', true, current_date, 3, null);
  perform testing.ok(r.ok, 'وبعد التأكيد: القبول يقع');
  perform testing.eq(r.reason, 'accepted', 'والحالة معلَنة');

  select count(*) into n from public.subscriptions
   where student_id = '66666666-6666-6666-6666-666666666666' and track='qudurat';
  perform testing.eq(n::integer, 1, 'وأُنشئ اشتراكٌ واحد');

  -- ⚠️ وقرارٌ ثانٍ على طلبٍ حُسم: يُرفض صراحةً ولا يُنشئ اشتراكاً ثانياً.
  --    لو ابتُلع لصار كل ضغطٍ على «قبول» اشتراكاً إضافياً بلا أن يدري أحد.
  select * into r from public.decide_subscription_request(
    '0a000000-0000-0000-0000-00000000000f', true, current_date, 1, null);
  perform testing.eq(r.ok, false, 'قرارٌ ثانٍ على طلبٍ محسوم: مرفوض');
  perform testing.eq(r.reason, 'already_decided', 'والسبب معلَن');

  select count(*) into n from public.subscriptions
   where student_id = '66666666-6666-6666-6666-666666666666' and track='qudurat';
  perform testing.eq(n::integer, 1, 'ولا اشتراك مكرّر');
end $$;

-- ومدّة الاشتراك محسوبة من القرار: ٣ أشهر
select testing.eq(
  (select (ends_on - starts_on + 1)::integer from public.subscriptions
    where student_id = '66666666-6666-6666-6666-666666666666' and track='qudurat'),
  (select ((current_date + interval '3 months')::date - current_date)::integer),
  'مدّة الاشتراك ثلاثة أشهر كاملة من تاريخ البداية');

reset role;
rollback;
