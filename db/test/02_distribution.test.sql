\echo ''
\echo '  التوزيع — «يرى ما أُرسل إليه في القسم الذي اشترك فيه»'
\echo '  الاشتراك يفتح المسار، والتوزيع يحدّد ما يصله منه. والشرطان معاً.'
\echo ''

-- طالب القدرات عضوٌ في مجموعة «متقدّم»
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;

-- ⚠️ العدّ على المسار وحده: المجّانيّة فتحت المسار الآخر كذلك، فالعدّ
--    المطلق صار يخلط قرار التوزيع بقرار التسعير. والمقصود هنا التوزيع.
-- بنك النِّسب (لكل المسار) + بنك التفاضل (لمجموعته) = ٢
-- والبنك الثالث موزَّع عليه أيضاً لكنّه **غير منشور**، فلا يصله.
select testing.eq(testing.count_of($q$ select 1 from public.banks where track='qudurat' $q$), 2,
                  'عضو «متقدّم»: بنكان في القدرات — ما أُرسل للمسار وما أُرسل لمجموعته');
select testing.eq(testing.count_of($q$ select 1 from public.banks where title = 'بنك قيد التجهيز' $q$), 0,
                  'البنك غير المنشور لا يصل ولو كان موزَّعاً — النشر والتوزيع شرطان مستقلّان');

-- ملفّات البنك تصل بوصول بنكها، بلا توزيعٍ مستقلّ لكل ملفّ
select testing.eq(testing.count_of($q$ select 1 from public.resources where bank_id = 'c0000000-0000-0000-0000-000000000001' $q$), 2,
                  'ملفّات البنك تصل بوصول بنكها');

-- الملزمة المفردة أُرسلت لطالبٍ آخر باسمه
select testing.eq(testing.count_of($q$ select 1 from public.resources where bank_id is null $q$), 0,
                  'ملفٌّ مفرد أُرسل لغيره لا يصله');

-- ⚠️ وبنك التحصيلي يصله الآن — وهذا أثر المجّانيّة لا خلل في التوزيع.
--    ويُثبَّت هنا صراحةً ليُعرف أنّه مقصود، لا ليمرّ بصمتٍ في عدٍّ مطلق.
select testing.eq(testing.count_of($q$ select 1 from public.banks where track='tahsili' $q$), 1,
                  'ويرى بنك التحصيلي أيضاً — أثرُ المجّانيّة، لا التوزيع');

reset role;
rollback;

-- مشترك المسارين ليس في أي مجموعة، لكنّه مقصودٌ باسمه بالملزمة المفردة
begin;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555","email":"u55@x.test"}', true);
set local role authenticated;

select testing.eq(testing.count_of($q$ select 1 from public.banks where track = 'qudurat' $q$), 1,
                  'غير العضو في «متقدّم»: بنك المسار وحده، لا بنك المجموعة');
select testing.eq(testing.count_of($q$ select 1 from public.resources where bank_id is null and track = 'qudurat' $q$), 1,
                  'الملفّ المفرد يصل من قُصد باسمه');

reset role;
rollback;

-- ── جدول التوزيع نفسه: تنظيم المعلّم، لا يقرؤه الطالب ───────────────────────
-- لو قرأه لعرف ما أُرسل لغيره ولمن، ولاستنتج قوائم المجموعات كاملة.
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","email":"u22@x.test"}', true);
set local role authenticated;

select testing.eq(testing.count_of($q$ select 1 from public.assignments $q$), 0,
                  'الطالب لا يقرأ صفّاً من جدول التوزيع');
select testing.eq(testing.count_of($q$ select 1 from public.groups $q$), 0,
                  'الطالب لا يرى المجموعات ولا أسماءها');
select testing.eq(testing.count_of($q$ select 1 from public.group_members $q$), 0,
                  'الطالب لا يرى عضويّات المجموعات');

reset role;
rollback;
