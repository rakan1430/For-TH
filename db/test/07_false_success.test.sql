\echo ''
\echo '  «أسوأ عطلٍ هو الذي يُبلغ عن نجاح» — البند ٤'
\echo ''
\echo '  ما وقع في المشروع السابق: أُرسل اختبار لفصلين، أحدهما مُسنَد مسبقاً.'
\echo '  فرفض صفٍّ واحد لتكرار المفتاح أسقط الإدراج كلّه، وابتلعت الشفرة الخطأ'
\echo '  بوصفه «إعادة إرسال عادية» — فرأى المعلّم «أُرسل ✅» ولم يصل أي فصلٍ'
\echo '  شيئاً. هذه هي الحالة، مُعادةً بالضبط.'
\echo ''

begin;
select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111"}', true);
set local role authenticated;

do $$
declare r record; seen integer;
begin
  -- بنك «قيد التجهيز» موزَّع على المسار مسبقاً (من البذرة)، والبنك الآخر لا.
  -- فهذه بالضبط الحالة: دفعةٌ فيها المُسنَد مسبقاً والجديد معاً.
  select * into r from public.assign_items(
    'bank',
    array['c0000000-0000-0000-0000-000000000003',   -- مُسنَد مسبقاً ← يصطدم بالقيد
          'c0000000-0000-0000-0000-000000000002']::uuid[],  -- جديد على هذا الجمهور
    'track');

  -- ⚠️ لبّ الفحص: الصفّ الجديد **وصل فعلاً**، ولم يُسقطه المكرَّر معه.
  perform testing.eq(r.created,  1, 'الصفّ الجديد أُدرج رغم وجود مكرَّرٍ في الدفعة نفسها');
  perform testing.eq(r.skipped,  1, 'والمكرَّر أُبلغ عنه عدداً، لا ابتُلع');
  perform testing.eq(r.targeted, 2, 'ومجموع المستهدَف معلَن');

  select count(*) into seen from public.assignments
   where item_type='bank' and item_id='c0000000-0000-0000-0000-000000000002' and audience='track';
  perform testing.eq(seen, 1, 'وهو موجود في الجدول حقاً — لا في تقرير الدالّة وحده');

  -- إعادة الدفعة نفسها: صفر جديد، والكلّ متخطّى. ولا «تمّ» غامضة.
  select * into r from public.assign_items(
    'bank',
    array['c0000000-0000-0000-0000-000000000003',
          'c0000000-0000-0000-0000-000000000002']::uuid[],
    'track');
  perform testing.eq(r.created, 0, 'إعادة الإرسال: صفر جديد');
  perform testing.eq(r.skipped, 2, 'إعادة الإرسال: الكلّ متخطّى، وقيلت الحقيقة');

  -- توزيعٌ على طلّابٍ بأسمائهم، وفيهم من وصله مسبقاً
  select * into r from public.assign_items(
    'resource',
    array['d0000000-0000-0000-0000-000000000004']::uuid[],
    'student', null,
    array['55555555-5555-5555-5555-555555555555',   -- وصله مسبقاً
          '22222222-2222-2222-2222-222222222222']::uuid[]);  -- جديد
  perform testing.eq(r.created, 1, 'التوزيع بالأسماء: الجديد وحده يُدرج');
  perform testing.eq(r.skipped, 1, 'التوزيع بالأسماء: والمكرَّر يُعلَن');
end $$;

-- ⚠️ وعنصرٌ غير موجود خطأُ برمجةٍ لا «تكرارٌ عاديّ»: يُصرَّح به ولا يمرّ
--    بصمت فيبدو التوزيع ناجحاً وهو ناقص. الفشل الصريح أرحم.
select testing.denied(
  $q$ select * from public.assign_items('bank', array['ffffffff-ffff-ffff-ffff-ffffffffffff']::uuid[], 'track') $q$,
  'عنصر غير موجود ← خطأٌ صريح لا تجاهلٌ صامت',
  array['23503']);

select testing.denied(
  $q$ select * from public.assign_items('bank', array['c0000000-0000-0000-0000-000000000001']::uuid[], 'student', null, array['ffffffff-ffff-ffff-ffff-ffffffffffff']::uuid[]) $q$,
  'طالب غير موجود ← خطأٌ صريح يسمّي المعرّف',
  array['23503']);

reset role;
rollback;

-- ── الطلب المعلّق المكرَّر: تُقرأ الحالة أوّلاً ويُقال ما جرى ────────────────
begin;
select set_config('request.jwt.claims', '{"sub":"66666666-6666-6666-6666-666666666666"}', true);
set local role authenticated;

do $$
declare r1 record; r2 record; pid uuid;
begin
  select id into pid from public.plans where track='qudurat' and period='monthly';

  select * into r1 from public.request_subscription(
    'qudurat', pid, 'طالب بلا اشتراك', 'أول ثانوي', '0500000005', 'transfer', 'receipts/66/r.jpg');
  perform testing.ok(r1.ok, 'الطلب الأول يُقبل');

  -- ⚠️ القيد يرفض طلباً معلّقاً ثانياً. ولو تُرك الخطأ خاماً لظهر للطالب
  --    نصٌّ غامض، ولو ابتُلع لظهر «أُرسل ✅» ولا طلبَ جديد.
  select * into r2 from public.request_subscription(
    'qudurat', pid, 'طالب بلا اشتراك', 'أول ثانوي', '0500000005', 'transfer', 'receipts/66/r2.jpg');
  perform testing.eq(r2.ok, false, 'الطلب الثاني لا يُقبل');
  perform testing.eq(r2.reason, 'already_pending', 'والسبب مفهوم: طلبك السابق ما زال معلّقاً');
  perform testing.eq(r2.request_id, r1.request_id, 'ويُعاد رقم الطلب القائم ليراه الطالب');
end $$;

reset role;
rollback;
