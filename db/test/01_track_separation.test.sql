\echo ''
\echo '  الوصول المجانيّ — ومن لا يزال ممنوعاً'
\echo '  «المجّانيّة قرار تسعيرٍ لا قرار أمن.» فما الذي فُتح، وما الذي بقي مقفلاً؟'
\echo ''

-- ⚠️⚠️ كان هذا الملفّ يحرس «فصل المسارين»: مشترك التحصيلي لا يقرأ صفّاً من
--    القدرات. وقد **سقط هذا الادّعاء بقرار المالك** لا بخطأٍ في الشفرة:
--    لا اشتراكات، فلا شيء يُفصَل به. وصار المسار تبويبَ عرضٍ لا حاجزاً.
--
--    ولم يُحذف الملفّ: أُعيدت كتابته ليحرس ما صار صحيحاً — وليُثبت في آخره
--    أنّ **آلة الفصل ما زالت سليمة**، فيومَ يعود التسعير يُبدَّل سطرٌ واحد
--    في `may_read_content` ويعود الحاجز كما كان. فحصٌ يُحذف عند تغيّر
--    المتطلَّب يترك المشروع بلا ذاكرةٍ لما كان يحرسه.

-- ── ١) طالبٌ مسجَّل يرى المنشور في **المسارين** — وهذه هي المجّانيّة ───────
begin;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","email":"t@x.test"}', true);
set local role authenticated;

select testing.eq(testing.count_of($q$ select 1 from public.banks where track='qudurat' $q$), 1,
                  'مجّاناً: يرى بنك القدرات المنشور وإن لم يشترك فيه');
select testing.eq(testing.count_of($q$ select 1 from public.banks where track='tahsili' $q$), 1,
                  'ويرى بنك التحصيلي كذلك');
select testing.eq(testing.count_of($q$ select 1 from public.sections $q$), 2,
                  'وأقسام المسارين معاً');

-- والدالّة القديمة ما زالت تقول الحقيقة — الآلة سليمة وإن كفّ المحتوى عن سؤالها
select testing.eq(public.has_active_subscription('qudurat'), false,
                  'وآلة الاشتراك سليمة: لا اشتراك له في القدرات');
select testing.eq(public.has_active_subscription('tahsili'), true,
                  'وله اشتراكٌ ساري في التحصيلي — فيوم يعود التسعير يعود الحاجز');

reset role; rollback;

-- ── ٢) وغير المنشور يبقى مخفيّاً — والنشر قرار المعلّم لا التسعير ─────────
begin;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","email":"t@x.test"}', true);
set local role authenticated;
select testing.eq(
  testing.count_of($q$ select 1 from public.banks where title = 'بنك قيد التجهيز' $q$), 0,
  'بنكٌ غير منشور: لا يراه الطالب ولو كان موزَّعاً إليه');
reset role; rollback;

-- ── ٣) والتوزيع المقصور يقصر فعلاً ────────────────────────────────────────
-- ⚠️ «بنك التفاضل» موزَّعٌ لمجموعة «متقدّم» وحدها، والطالب ٣٣٣٣ ليس فيها.
--    ولولا هذا الفحص لمرّ تعميمُ المجّانيّة وهو يكسر التوزيع المقصور.
begin;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","email":"t@x.test"}', true);
set local role authenticated;
select testing.eq(
  testing.count_of($q$ select 1 from public.banks where title = 'بنك التفاضل' $q$), 0,
  'بنكٌ مقصورٌ على مجموعة: لا يراه من ليس فيها');

-- ⚠️⚠️ والملفّ **داخله** كذلك — وهو العطب الذي كاد يمرّ: الملفّ بلا توزيعٍ
--    خاصّ به، فلو قيس ظهوره بتوزيعه وحده لصار عامّاً داخل بنكٍ مقصور.
select testing.eq(
  testing.count_of($q$ select 1 from public.resources where title = 'مرجع التفاضل' $q$), 0,
  'وملفٌّ داخله: يرث قصرَ بنكه ولا يصير عامّاً بغياب توزيعه هو');
reset role; rollback;

-- ── ٤) وعضو المجموعة يراهما ــ وإلّا كان الفحص يقيس انكسار القراءة ────────
begin;
select set_config('request.jwt.claims',
  '{"sub":"22222222-2222-2222-2222-222222222222","email":"g@x.test"}', true);
set local role authenticated;
select testing.eq(
  testing.count_of($q$ select 1 from public.banks where title = 'بنك التفاضل' $q$), 1,
  'عضو «متقدّم»: يرى بنك التفاضل');
select testing.eq(
  testing.count_of($q$ select 1 from public.resources where title = 'مرجع التفاضل' $q$), 1,
  'ويرى ملفّه');
reset role; rollback;

-- ── ٥) والموجَّه لطالبٍ باسمه يبقى له وحده ────────────────────────────────
begin;
select set_config('request.jwt.claims',
  '{"sub":"33333333-3333-3333-3333-333333333333","email":"t@x.test"}', true);
set local role authenticated;
select testing.eq(
  testing.count_of($q$ select 1 from public.resources where title = 'ملزمة مراجعة' $q$), 0,
  'ملزمةٌ موجَّهة لطالبٍ باسمه: لا يراها غيره');
reset role; rollback;

begin;
select set_config('request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","email":"b@x.test"}', true);
set local role authenticated;
select testing.eq(
  testing.count_of($q$ select 1 from public.resources where title = 'ملزمة مراجعة' $q$), 1,
  'وصاحبها يراها');
reset role; rollback;

-- ── ٦) والمجهول لا يرى شيئاً — المجّانيّة «لكل مسجَّل» لا «لكل من فتح» ────
-- ⚠️ الجلسة المجهولة رمزها صحيحٌ ولها معرّف (٠٠١١). ولولا `is_identified()`
--    في `may_read_content` لصار المحتوى مفتوحاً لكل زائرٍ بلا حساب.
begin;
select set_config('request.jwt.claims',
  '{"sub":"66666666-6666-6666-6666-666666666666","is_anonymous":true}', true);
set local role authenticated;
select testing.eq(testing.count_of($q$ select 1 from public.banks $q$), 0,
                  'جلسةٌ مجهولة: صفر بنك');
select testing.eq(testing.count_of($q$ select 1 from public.resources $q$), 0,
                  'وصفر ملفّ');
select testing.eq(testing.count_of($q$ select 1 from public.quizzes $q$), 0,
                  'وصفر اختبار');
reset role; rollback;

-- ── ٧) والمعلّم يرى كل شيء — المنشور وغير المنشور ─────────────────────────
begin;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"m@x.test"}', true);
set local role authenticated;
select testing.eq(testing.count_of($q$ select 1 from public.banks $q$), 4,
                  'المعلّم: يرى البنوك الأربعة بما فيها غير المنشور');
reset role; rollback;
