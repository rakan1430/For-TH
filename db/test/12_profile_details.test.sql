\echo ''
\echo '  اكتمال ملفّ الطالب — شرطٌ على الفعل لا على وجود الصفّ'
\echo ''

-- ⚠️ كل فحصٍ هنا يعدّل ملفّ طالبٍ موجودٍ في البذرة ثمّ يتراجع. ولا يُنشأ
--    مستخدمٌ جديد: `profiles.id` مفتاحٌ أجنبيّ إلى `auth.users`، وإنشاء صفٍّ
--    هناك يدوياً محاكاةٌ لما يفعله خادم المصادقة — ومحاكاةٌ ناقصة تُغري.

-- ── ١) صفٌّ ناقص: موجودٌ ولا يُعدّ مكتملاً ──────────────────────────────────
-- ⚠️ الصفّ يُنشأ لحظة أوّل دخولٍ بالاسم من Google وحده. فلو اشترطنا الاكتمال
--    على وجود الصفّ لفشل الإنشاء ولبقي الطالب بلا ملفّ — أي عاجزاً عن
--    الاشتراك أصلاً، وهو العطب الذي نتفاداه هنا.
begin;
reset role;
update public.profiles set full_name = 'Soos Rakan', grade = null, contact = null, school = null
 where id = '66666666-6666-6666-6666-666666666666';

select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","email":"n@x.test"}', true);
set local role authenticated;
select testing.eq(public.profile_complete(), false, 'اسمٌ من Google وحده: غير مكتمل');
reset role; rollback;

-- ── ٢) كل حقلٍ ناقصٍ وحده يمنع الاكتمال ────────────────────────────────────
-- ⚠️ لولا هذه الثلاثة لمرّ شرطٌ يفحص حقلاً واحداً ويُهمل البقيّة — وهو الخطأ
--    الذي لا يظهر إلّا بعد أن يشترك طالبٌ بلا رقمٍ يُتّصل به.
begin;
reset role;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","email":"n@x.test"}', true);

do $$
declare c text;
begin
  foreach c in array array['grade', 'contact', 'school'] loop
    -- يُملأ الصفّ كاملاً أوّلاً، ثمّ يُفرَّغ حقلٌ واحد. (جملتان لا جملة:
    -- إسنادان لنفس العمود في `update` واحد خطأٌ في Postgres.)
    update public.profiles
       set full_name = 'سعد المطيري', grade = 'ثالث ثانوي',
           contact = '0500000000', school = 'ثانوية الملك فهد'
     where id = '66666666-6666-6666-6666-666666666666';
    execute format(
      'update public.profiles set %I = null where id = %L',
      c, '66666666-6666-6666-6666-666666666666');
    perform testing.eq(public.profile_complete(), false, format('بلا %s: غير مكتمل', c));
  end loop;
end $$;
rollback;

-- ── ٣) والمكتمل مكتمل — وإلّا كان الفحص يقيس انكسار القراءة لا الشرط ────────
begin;
reset role;
update public.profiles
   set full_name = 'سعد المطيري', grade = 'ثالث ثانوي',
       contact = '0500000000', school = 'ثانوية الملك فهد'
 where id = '66666666-6666-6666-6666-666666666666';

select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","email":"n@x.test"}', true);
set local role authenticated;
select testing.ok(public.profile_complete(), 'الأربعة كاملة: مكتمل');
reset role; rollback;

-- ── ٤) الحارس في الأسفل: لا طلب اشتراكٍ بملفٍّ ناقص ─────────────────────────
-- ⚠️ ويُقاس من الفعل نفسه لا بسؤال الدالّة: إخفاء الشاشة لا يحرس شيئاً،
--    ومن يفتح أدوات المطوّر يستدعي `request_subscription` مباشرةً.
begin;
reset role;
update public.profiles set full_name = 'Soos Rakan', grade = null, contact = null, school = null
 where id = '66666666-6666-6666-6666-666666666666';

select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","email":"n@x.test"}', true);
set local role authenticated;

do $$
declare r record; n integer;
begin
  select * into r from public.request_subscription(
    'qudurat', (select id from public.plans where track='qudurat' and period='monthly'),
    'Soos Rakan', '', '', 'transfer', 'receipts/66/r.jpg');
  perform testing.eq(r.ok, false, 'ملفٌّ ناقص: طلب الاشتراك مرفوض');
  perform testing.eq(r.reason, 'profile_incomplete', 'والسبب معلَن لتعرضه الواجهة');

  select count(*) into n from public.subscription_requests
   where student_id = '66666666-6666-6666-6666-666666666666';
  perform testing.eq(n::integer, 0, 'ولم يُكتب طلبٌ رغم الرفض — لا كتابةَ جزئية');
end $$;
reset role; rollback;

-- ── ٥) وبملفٍّ مكتمل يقع الطلب ──────────────────────────────────────────────
begin;
reset role;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","email":"n@x.test"}', true);
set local role authenticated;

do $$
declare r record;
begin
  select * into r from public.request_subscription(
    'qudurat', (select id from public.plans where track='qudurat' and period='monthly'),
    'طالب بلا اشتراك', 'أول ثانوي', '0500000005', 'transfer', 'receipts/66/r.jpg');
  perform testing.ok(r.ok, 'ملفٌّ مكتمل (من البذرة): الطلب يقع');
  perform testing.eq(r.reason, 'pending', 'وحالته معلنة');
end $$;
reset role; rollback;

-- ── ٦) والزائر المجهول لا ينفّذ الدالّة ─────────────────────────────────────
begin;
set local role anon;
select testing.denied($q$ select public.profile_complete() $q$,
                      'المجهول: لا ينفّذ profile_complete');
reset role; rollback;

-- ── ٧) المعلّم يرى **كل** صفوف `profiles` — وهو المقصود، لا عطب ─────────────
-- ⚠️ هذا الصفّ يوثّق الحقيقة التي كسرت اللوحة في الإنتاج: الواجهة كانت تقرأ
--    ملفّها بـ`maybeSingle()` بلا `eq("id", …)`، متّكئةً على أنّ السياسة
--    تُعيد صفّاً واحداً. وهي تفعل ذلك **للطالب وحده**. فأوّل قراءةٍ للمعلّم
--    ترفض بـ«multiple rows»، فتسقط الجلسة ويُرسم المعلّم طالباً بلا اشتراك.
--
--    فالدرس المثبّت هنا: «السياسة تُعيد ما يحقّ» لا تعني «تُعيد صفّاً واحداً».
--    والاختيار (صفّي أنا) مسؤولية النداء، والحراسة (ما يحقّ لي) مسؤوليتها.
begin;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"t@x.test"}', true);
set local role authenticated;

select testing.ok(
  testing.count_of($q$ select 1 from public.profiles $q$) > 1,
  'المعلّم يرى أكثر من صفّ — فلا تكفي maybeSingle بلا ترشيح');

select testing.eq(
  testing.count_of($q$ select 1 from public.profiles
                        where id = '11111111-1111-1111-1111-111111111111' $q$),
  1, 'وبالترشيح على معرّفه: صفٌّ واحد بالضبط');

reset role; rollback;

-- وللطالب صفٌّ واحد بالحالين — ومن هنا جاء الوهم
begin;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","email":"s@x.test"}', true);
set local role authenticated;
select testing.eq(testing.count_of($q$ select 1 from public.profiles $q$), 1,
                  'الطالب: صفٌّ واحد بلا ترشيح — وهو ما أخفى العطب');
reset role; rollback;
