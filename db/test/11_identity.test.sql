\echo ''
\echo '  الهويّة: جلسةٌ مجهولة، وإثباتٌ موقَّع من خادم المصادقة'
\echo '  (ملحق «الدخول بحساب Google» — القسمان ٥ و٧)'
\echo ''

-- ── ١) الجلسة المجهولة: رمزٌ صحيح، ومعرّفٌ حقيقيّ، ولا شيء وراءه ────────────
-- ⚠️ لبّ القسم ٧: هذه الجلسة تجتاز «هل auth.uid() موجود؟» بلا عناء.
--    فالفحص هنا يُثبت أنّ المشروع **لا يسأل ذلك السؤال** في موضعٍ حسّاس.
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","is_anonymous":true}', true);
set local role authenticated;

select testing.eq(auth.uid()::text, '66666666-6666-6666-6666-666666666666',
                  'المجهول: معرّفه حقيقيّ — فلا يكفي وجوده دليلاً');
select testing.eq(public.is_identified(), false, 'المجهول: ليس هويّةً حقيقية');

reset role; rollback;

-- ── ٢) وبريدٌ غائب يُعامل معاملة المجهول ────────────────────────────────────
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","is_anonymous":false}', true);
set local role authenticated;
select testing.eq(public.is_identified(), false, 'بلا بريد: ليس هويّةً حقيقية');
reset role; rollback;

-- ── ٣) والمستخدم العاديّ يمرّ — وإلّا كان الفحص يقيس انكسار القراءة ─────────
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","email":"s@x.test"}', true);
set local role authenticated;
select testing.eq(public.is_identified(), true, 'مستخدمٌ ببريدٍ وبلا علَم مجهول: هويّة حقيقية');
reset role; rollback;

-- ── ٤) المجهول لا يُنشئ ملفّاً ولا يقدّم طلب اشتراك ─────────────────────────
-- ⚠️ لا تسريب بيانات هنا أصلاً — الحراسة عضوية. لكنّه كان يستطيع تلويث
--    طابور المعلّم بطلباتٍ من لا بريد له.
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","is_anonymous":true}', true);
set local role authenticated;

select testing.denied($q$
  insert into public.profiles (id, full_name)
  values ('66666666-6666-6666-6666-666666666666', 'زائر مجهول')
$q$, 'المجهول: لا يُنشئ ملفّاً شخصياً');

reset role; rollback;

-- ── ٥) `amr`: الإثبات الموقَّع من خادم المصادقة ─────────────────────────────
-- ⚠️ هذا ما لا يستطيع المتصفّح تزويره — بخلاف `confirm_identity()` التي
--    يستدعيها أي صاحب جلسة. فالفرق بين «ما زلتُ هنا» و«أنا هو».
begin;
select set_config('request.jwt.claims', format(
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"t@x.test",'
  '"amr":[{"method":"oauth","timestamp":%s}]}',
  extract(epoch from now())::bigint - 600), true);   -- قبل ١٠ دقائق
set local role authenticated;

select testing.ok(public.google_verified(12), 'إثباتٌ قبل ١٠ دقائق: داخل نافذة ١٢ ساعة');
select testing.ok(public.is_identified(),     'ومعه هويّة حقيقية');

reset role; rollback;

-- ── ٦) وإثباتٌ قديم لا يُقبل — «جلسةٌ فُتحت قبل أسبوع ليست إثبات حضور» ──────
begin;
select set_config('request.jwt.claims', format(
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"t@x.test",'
  '"amr":[{"method":"oauth","timestamp":%s}]}',
  extract(epoch from now())::bigint - (13 * 3600), true), true);
set local role authenticated;
select testing.eq(public.google_verified(12), false, 'إثباتٌ قبل ١٣ ساعة: خارج النافذة');
reset role; rollback;

-- ── ٧) وكلمة المرور ليست إثبات هوية مهما قرُب وقتها ─────────────────────────
-- ⚠️ الفخّ: `amr` موجودة، والتوقيت قبل دقيقة — لكنّ الطريقة `password`.
--    فلو قرأت الدالّة أحدث توقيتٍ في المصفوفة بلا النظر إلى الطريقة لمرّ.
begin;
select set_config('request.jwt.claims', format(
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"t@x.test",'
  '"amr":[{"method":"password","timestamp":%s}]}',
  extract(epoch from now())::bigint - 60), true);
set local role authenticated;
select testing.eq(public.google_verified(12), false, 'كلمة المرور قبل دقيقة: ليست إثبات هوية');
reset role; rollback;

-- ── ٨) ورمزٌ بلا `amr` إطلاقاً لا يرفع خطأً — يُجيب «لا» بهدوء ──────────────
-- ⚠️ استثناءٌ هنا كان سيُسقط كل سياسةٍ تستدعيها، فيتحوّل «ليس مُثبتاً» إلى
--    «الموقع معطّل». وهذا بالضبط ما وقع في `auth.uid()` المحلّية من قبل.
begin;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"t@x.test"}', true);
set local role authenticated;
select testing.eq(public.google_verified(12), false, 'بلا amr: «لا» هادئة لا استثناء');
reset role; rollback;

-- ── ٩) و`amr` فارغة أو مشوّهة كذلك ─────────────────────────────────────────
begin;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"t@x.test","amr":[]}', true);
set local role authenticated;
select testing.eq(public.google_verified(12), false, 'amr فارغة: «لا» هادئة');
reset role; rollback;

-- ── ١٠) نافذة الهوية تقبل إثبات Google بلا استدعاء `confirm_identity` ──────
-- ⚠️ ويُقاس من الطرف الآخر — عبر العملية الخطرة نفسها — لا بسؤال الدالّة.
--    فالادّعاء ليس «الدالّة تُعيد true» بل «قبولُ اشتراكٍ مدفوع يقع فعلاً».
--    والفحص الذي يسأل الدالّة وحدها يمرّ ولو انفصلت عن السياسة التي تحرسها.
begin;

reset role;
insert into public.subscription_requests (id, student_id, track, plan_id, full_name, grade, contact, method, receipt_path)
select '0b000000-0000-0000-0000-00000000000f', '66666666-6666-6666-6666-666666666666', 'qudurat',
       p.id, 'طالب بلا اشتراك', 'أول ثانوي', '0500000005', 'transfer', 'receipts/66/r.jpg'
from public.plans p where p.track='qudurat' and p.period='monthly';

-- ⚠️ يُقاس قبل تبديل الدور: `authenticated` لا يقرأ `private` إطلاقاً —
--    وهذا في ذاته حارسٌ مقصود، لا عائقٌ يُلتفّ عليه.
select testing.eq(
  (select count(*)::integer from private.identity_confirmations
    where user_id = '11111111-1111-1111-1111-111111111111'),
  0, 'لا تأكيد يدويّ مسجَّل إطلاقاً');

-- المعلّم داخلٌ بـGoogle قبل ١٠ دقائق — ولم يستدعِ `confirm_identity` قطّ
select set_config('request.jwt.claims', format(
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"t@x.test",'
  '"amr":[{"method":"oauth","timestamp":%s}]}',
  extract(epoch from now())::bigint - 600), true);
set local role authenticated;

do $$
declare r record;
begin
  select * into r from public.decide_subscription_request(
    '0b000000-0000-0000-0000-00000000000f', true, current_date, 1, null);
  perform testing.ok(r.ok, 'الداخل بـGoogle حديثاً: القبول يقع بلا تأكيدٍ يدويّ');
  perform testing.eq(r.reason, 'accepted', 'والحالة معلَنة');
end $$;

reset role; rollback;

-- ── ١٠-ب) وإثبات Google القديم لا يفتحها — النافذة نافذة ────────────────────
begin;

reset role;
insert into public.subscription_requests (id, student_id, track, plan_id, full_name, grade, contact, method, receipt_path)
select '0c000000-0000-0000-0000-00000000000f', '66666666-6666-6666-6666-666666666666', 'qudurat',
       p.id, 'طالب بلا اشتراك', 'أول ثانوي', '0500000005', 'transfer', 'receipts/66/r.jpg'
from public.plans p where p.track='qudurat' and p.period='monthly';

select set_config('request.jwt.claims', format(
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"t@x.test",'
  '"amr":[{"method":"oauth","timestamp":%s}]}',
  extract(epoch from now())::bigint - (13 * 3600)), true);
set local role authenticated;

do $$
declare r record; n integer;
begin
  select * into r from public.decide_subscription_request(
    '0c000000-0000-0000-0000-00000000000f', true, current_date, 1, null);
  perform testing.eq(r.ok, false, 'دخولٌ بـGoogle قبل ١٣ ساعة: مرفوض');
  perform testing.eq(r.reason, 'reauth_required', 'والسبب معلَن');

  select count(*) into n from public.subscriptions
   where student_id = '66666666-6666-6666-6666-666666666666';
  perform testing.eq(n::integer, 0, 'ولا اشتراك كُتب');
end $$;

reset role; rollback;

-- ── ١١) والزائر المجهول لا ينفّذ الدالّتين أصلاً ────────────────────────────
-- ⚠️ الطبقة الخارجية — درس `0010`. الطبقة الداخلية تكفي، وطبقةٌ واحدة
--    هي ما يجعل الخطأ التالي تسريباً.
begin;
set local role anon;
select testing.denied($q$ select public.is_identified() $q$,
                      'المجهول: لا ينفّذ is_identified');
select testing.denied($q$ select public.google_verified(12) $q$,
                      'المجهول: لا ينفّذ google_verified');
reset role; rollback;
