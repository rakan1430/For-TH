\echo ''
\echo '  حذف الحساب: إخفاءٌ ٤٨ ساعة ثمّ محوٌ لا رجعة فيه'
\echo '  ومن يملك أن يطلبه؟ وهل يبقى للتراجع باب؟'
\echo ''

-- ── ١) بلا إثبات Google حديث: مرفوض، ولا صفّ ──────────────────────────────
-- ⚠️ حذفٌ لا رجعة فيه لا يُقبل من جلسةٍ فُتحت أمس على جهازٍ تُرك في غرفة.
begin;
select set_config('request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","email":"both@example.test"}', true);
set local role authenticated;

do $$
declare r record;
begin
  select * into r from public.request_account_deletion();
  perform testing.eq(r.ok, false, 'بلا إثبات Google: يُرفض الطلب');
  perform testing.eq(r.reason, 'reauth_required', 'والسبب معلَن');
  perform testing.eq(
    (select count(*)::integer from public.account_deletions), 0,
    'ولم يُكتب صفّ');
end $$;
reset role; rollback;

-- ── ٢) وإثباتٌ قديم (قبل ساعتين) لا يكفي ──────────────────────────────────
-- ⚠️ النافذة ساعةٌ واحدة هنا لا اثنتا عشرة كبقيّة المشروع: الفعل أخطر.
begin;
select set_config('request.jwt.claims', format(
  '{"sub":"55555555-5555-5555-5555-555555555555","email":"both@example.test",'
  '"amr":[{"method":"oauth","timestamp":%s}]}',
  extract(epoch from now())::bigint - (2 * 3600)), true);
set local role authenticated;

do $$
declare r record;
begin
  select * into r from public.request_account_deletion();
  perform testing.eq(r.reason, 'reauth_required', 'إثباتٌ قبل ساعتين: خارج نافذة الحذف');
end $$;
reset role; rollback;

-- ── ٣) والمعلّم لا يحذف حسابه من هنا — حسابه هو المنصّة ───────────────────
begin;
select set_config('request.jwt.claims', format(
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"teacher@example.test",'
  '"amr":[{"method":"oauth","timestamp":%s}]}',
  extract(epoch from now())::bigint - 60), true);
set local role authenticated;

do $$
declare r record;
begin
  select * into r from public.request_account_deletion();
  perform testing.eq(r.ok, false, 'المعلّم: يُرفض حذف حسابه');
  perform testing.eq(r.reason, 'teacher_account', 'والسبب معلَن');
end $$;
reset role; rollback;

-- ── ٤) الطالب بإثباتٍ حديث: يُقبل، والمهلة ٤٨ ساعة ────────────────────────
begin;
select set_config('request.jwt.claims', format(
  '{"sub":"55555555-5555-5555-5555-555555555555","email":"both@example.test",'
  '"amr":[{"method":"oauth","timestamp":%s}]}',
  extract(epoch from now())::bigint - 60), true);
set local role authenticated;

do $$
declare r record; r2 record;
begin
  select * into r from public.request_account_deletion();
  perform testing.ok(r.ok, 'طلبٌ بإثباتٍ قبل دقيقة: مقبول');
  perform testing.ok(
    r.purge_at between now() + interval '47 hours' and now() + interval '49 hours',
    'والمحو بعد ٤٨ ساعة');

  -- ⚠️ ومن هنا **الحساب مخفيّ**: هذه هي الحالة التي يعيشها الطالب يومين.
  perform testing.eq(public.is_identified(), false, 'وصار الحساب مخفيّاً');
  perform testing.eq(public.may_read_content('qudurat'), false, 'فلا يقرأ محتوى القدرات');
  perform testing.eq(public.may_read_content('tahsili'), false, 'ولا التحصيلي');
  perform testing.eq(testing.count_of($q$ select 1 from public.banks $q$), 0,
                     'ولا يرى بنكاً واحداً');
  perform testing.eq(testing.count_of($q$ select 1 from public.quizzes $q$), 0,
                     'ولا اختباراً');

  -- ⚠️⚠️ وبابُ التراجع **يجب أن يبقى مفتوحاً**: لو أُغلق عليه ملفّه وصفّه
  --    لصار الإخفاء حبساً بلا مخرج، والمهلة بلا معنى.
  perform testing.eq(testing.count_of($q$ select 1 from public.profiles $q$), 1,
                     'ويبقى يرى ملفّه هو');
  perform testing.eq(testing.count_of($q$ select 1 from public.account_deletions $q$), 1,
                     'ويرى متى يُمحى');

  -- وطلبٌ ثانٍ لا يُضاعف ولا يمدّد
  select * into r2 from public.request_account_deletion();
  perform testing.eq(r2.reason, 'already_requested', 'وطلبٌ ثانٍ: لا يُضاعف');
end $$;

-- والمعلّم لا يراه في لوحته
reset role;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"teacher@example.test"}', true);
set local role authenticated;

select testing.eq(
  testing.count_of($q$ select 1 from public.profiles
                        where id = '55555555-5555-5555-5555-555555555555' $q$), 0,
  'والمعلّم لا يرى ملفّ من طلب الحذف');
select testing.ok(
  testing.count_of($q$ select 1 from public.profiles $q$) > 0,
  'ويرى بقيّة طلّابه كما كانوا');

-- ثمّ يتراجع الطالب فيعود كلّ شيء
reset role;
select set_config('request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","email":"both@example.test"}', true);
set local role authenticated;

do $$
declare r record;
begin
  select * into r from public.cancel_account_deletion();
  perform testing.ok(r.ok, 'التراجع خلال المهلة: مقبول');
  perform testing.eq(public.is_identified(), true, 'وعادت الهويّة');
  perform testing.ok(public.may_read_content('qudurat'), 'وعاد المحتوى');
  perform testing.eq(testing.count_of($q$ select 1 from public.account_deletions $q$), 0,
                     'ولا أثر للطلب');
end $$;
reset role; rollback;

-- ── ٥) ولا كتابةَ مباشرة على جدول الطلبات إطلاقاً ─────────────────────────
-- ⚠️ لولا هذا لأدرج الطالب صفّاً لغيره فأخفاه، أو بمهلةٍ يختارها هو.
begin;
select set_config('request.jwt.claims',
  '{"sub":"55555555-5555-5555-5555-555555555555","email":"both@example.test"}', true);
set local role authenticated;

select testing.denied(
  $q$ insert into public.account_deletions (user_id, purge_at)
      values ('33333333-3333-3333-3333-333333333333', now() + interval '1 hour') $q$,
  'لا يُدرج طلباً لغيره');
select testing.denied(
  $q$ update public.account_deletions set purge_at = now() $q$,
  'ولا يقرّب موعد محوٍ');
select testing.denied(
  $q$ delete from public.account_deletions $q$,
  'ولا يحذف صفّاً بيده');
select testing.denied(
  $q$ select private.purge_due_accounts() $q$,
  'ولا ينفّذ المحو بنفسه');
reset role; rollback;

-- ── ٦) والمعلّم كذلك لا ينفّذ المحو ───────────────────────────────────────
begin;
select set_config('request.jwt.claims',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"teacher@example.test"}', true);
set local role authenticated;
select testing.denied(
  $q$ select private.purge_due_accounts() $q$,
  'المعلّم أيضاً: لا زرّ محوٍ على الشبكة');
reset role; rollback;

-- ── ٧) المحو نفسه: يمحو الطالب وأثره كلّه ─────────────────────────────────
-- ⚠️⚠️ وهذا ما وافق عليه المالك صراحةً: «نتائج الطلاب تُحذف بعد مرور ٤٨
--    ساعة، ولن يكون هناك قدرة للعودة». فالفحص يُثبت أنّ المحو **كامل** لا
--    جزئيّ — لا صفّ يتيم يشير إلى طالبٍ لم يعد موجوداً.
begin;
-- محاولةٌ مسلَّمة للطالب، ليُقاس اختفاؤها
insert into public.quiz_attempts
  (id, quiz_id, student_id, attempt_no, status, submitted_at, score, max_score)
values ('aaaaaaaa-0000-0000-0000-00000000000f',
        'e0000000-0000-0000-0000-000000000001',
        '55555555-5555-5555-5555-555555555555', 1, 'submitted', now(), 1, 2);
insert into public.attempt_answers (attempt_id, question_id, option_id, is_correct)
values ('aaaaaaaa-0000-0000-0000-00000000000f',
        'f0000000-0000-0000-0000-000000000001',
        '09000000-0000-0000-0000-000000000001', false);
insert into public.saved_questions (student_id, question_id)
values ('55555555-5555-5555-5555-555555555555',
        'f0000000-0000-0000-0000-000000000001');

-- طلبٌ بلغت مهلته
insert into public.account_deletions (user_id, requested_at, purge_at)
values ('55555555-5555-5555-5555-555555555555',
        now() - interval '49 hours', now() - interval '1 hour');

do $$
declare n integer;
begin
  n := private.purge_due_accounts();
  perform testing.eq(n, 1, 'المجدوِل يمحو الحساب المستحقّ');

  perform testing.eq(
    (select count(*)::integer from auth.users u
      where u.id = '55555555-5555-5555-5555-555555555555'), 0,
    'فلا يبقى في auth.users');
  perform testing.eq(
    (select count(*)::integer from public.profiles p
      where p.id = '55555555-5555-5555-5555-555555555555'), 0,
    'ولا ملفٌّ شخصيّ');
  perform testing.eq(
    (select count(*)::integer from public.quiz_attempts a
      where a.student_id = '55555555-5555-5555-5555-555555555555'), 0,
    'ولا محاولةٌ مسلَّمة — وهذا ما وافق عليه المالك');
  perform testing.eq(
    (select count(*)::integer from public.attempt_answers aa
      where aa.attempt_id = 'aaaaaaaa-0000-0000-0000-00000000000f'), 0,
    'ولا إجاباتها');
  perform testing.eq(
    (select count(*)::integer from public.saved_questions s
      where s.student_id = '55555555-5555-5555-5555-555555555555'), 0,
    'ولا دفتر مراجعته');
  perform testing.eq(
    (select count(*)::integer from public.subscriptions s
      where s.student_id = '55555555-5555-5555-5555-555555555555'), 0,
    'ولا اشتراكاته');
  perform testing.eq(
    (select count(*)::integer from public.account_deletions d
      where d.user_id = '55555555-5555-5555-5555-555555555555'), 0,
    'ولا طلب الحذف نفسه — يذهب مع صاحبه');
end $$;

-- ⚠️ وما ليس له: اختبارات المعلّم وأسئلته باقية. محوُ طالبٍ لا يمسّ المنهج.
select testing.ok(
  (select count(*) from public.quiz_questions
    where quiz_id = 'e0000000-0000-0000-0000-000000000001') > 0,
  'وأسئلة الاختبار باقية — محوُ طالبٍ لا يمسّ المنهج');
rollback;

-- ── ٨) ومحوٌ لطلبٍ لم تبلغ مهلته: لا يقع ──────────────────────────────────
begin;
insert into public.account_deletions (user_id, purge_at)
values ('66666666-6666-6666-6666-666666666666', now() + interval '10 hours');

do $$
declare n integer;
begin
  n := private.purge_due_accounts();
  perform testing.eq(n, 0, 'من لم تبلغ مهلته لا يُمحى');
  perform testing.eq(
    (select count(*)::integer from public.profiles p
      where p.id = '66666666-6666-6666-6666-666666666666'), 1,
    'ويبقى ملفّه كما هو');
end $$;
rollback;
