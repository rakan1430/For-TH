\echo ''
\echo '  فصل المسارين — الادّعاء الأهمّ في المشروع'
\echo '  «طالبٌ مشترك في التحصيلي وحده لا يقرأ صفّاً واحداً من محتوى القدرات'
\echo '   حتى لو عبث بالطلب.» فنعبث بالطلب هنا: لا واجهة ولا زرّ، بل استعلامٌ'
\echo '   مباشر على الجداول بصلاحيات الطالب نفسها.'
\echo ''

-- ── مشترك التحصيلي وحده ─────────────────────────────────────────────────────
begin;
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333"}', true);
set local role authenticated;

select testing.eq(testing.count_of($q$ select 1 from public.banks     where track = 'qudurat' $q$), 0,
                  'مشترك التحصيلي: صفر بنك من القدرات');
select testing.eq(testing.count_of($q$ select 1 from public.resources where track = 'qudurat' $q$), 0,
                  'مشترك التحصيلي: صفر ملفّ من القدرات');
select testing.eq(testing.count_of($q$ select 1 from public.quizzes   where track = 'qudurat' $q$), 0,
                  'مشترك التحصيلي: صفر اختبار من القدرات');
select testing.eq(testing.count_of($q$ select 1 from public.sections  where track = 'qudurat' $q$), 0,
                  'مشترك التحصيلي: صفر قسم من القدرات');
select testing.eq(testing.count_of($q$ select 1 from public.quiz_questions $q$), 1,
                  'مشترك التحصيلي: لا يرى إلا سؤال اختباره هو');

-- وليس الأمر أنّه لا يرى شيئاً إطلاقاً: مساره هو يعمل.
-- ⚠️ لولا هذا السطر لمرّ الفحص لو انكسرت القراءة كلّها — وهو الفخّ الذي
--    يجعل فحصاً «ينجح» وهو يقيس الشيء الخطأ.
select testing.eq(testing.count_of($q$ select 1 from public.banks where track = 'tahsili' $q$), 1,
                  'مشترك التحصيلي: يرى بنك التحصيلي المُرسَل إليه');
select testing.eq(testing.count_of($q$ select 1 from public.resources where track = 'tahsili' $q$), 1,
                  'مشترك التحصيلي: يرى ملفّ التحصيلي');

-- والدالّة نفسها تقول الحقيقة عن صاحبها
select testing.eq(public.has_active_subscription('qudurat'), false, 'مشترك التحصيلي: لا اشتراك له في القدرات');
select testing.eq(public.has_active_subscription('tahsili'), true,  'مشترك التحصيلي: اشتراكه في التحصيلي ساري');

reset role;
rollback;

-- ── مشترك القدرات وحده ──────────────────────────────────────────────────────
begin;
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222"}', true);
set local role authenticated;

select testing.eq(testing.count_of($q$ select 1 from public.banks     where track = 'tahsili' $q$), 0,
                  'مشترك القدرات: صفر بنك من التحصيلي');
select testing.eq(testing.count_of($q$ select 1 from public.resources where track = 'tahsili' $q$), 0,
                  'مشترك القدرات: صفر ملفّ من التحصيلي');
select testing.eq(testing.count_of($q$ select 1 from public.quizzes   where track = 'tahsili' $q$), 0,
                  'مشترك القدرات: صفر اختبار من التحصيلي');
select testing.eq(testing.count_of($q$ select 1 from public.sections  where track = 'tahsili' $q$), 0,
                  'مشترك القدرات: صفر قسم من التحصيلي');

reset role;
rollback;

-- ── مشترك في المسارين: يرى الاثنين، ولا شيء وراءهما ─────────────────────────
begin;
select set_config('request.jwt.claims', '{"sub":"55555555-5555-5555-5555-555555555555"}', true);
set local role authenticated;

select testing.eq(testing.count_of($q$ select 1 from public.sections $q$), 2,
                  'مشترك المسارين: يرى قسمَي المسارين معاً');
select testing.ok(testing.count_of($q$ select 1 from public.banks where track = 'qudurat' $q$) > 0,
                  'مشترك المسارين: يرى بنوك القدرات');
select testing.ok(testing.count_of($q$ select 1 from public.banks where track = 'tahsili' $q$) > 0,
                  'مشترك المسارين: يرى بنوك التحصيلي');

reset role;
rollback;
