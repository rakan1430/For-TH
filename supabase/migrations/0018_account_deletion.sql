-- =============================================================================
-- ٠٠١٨ — حذف الحساب: إخفاءٌ ٤٨ ساعة، ثمّ محوٌ لا رجعة فيه
--
-- تصميم المالك حرفياً: «عند تأكيد حذفه من الموقع سيجب تأكيده … بعد ذلك
-- سيتم إخفاء الحساب لمدّة ٤٨ ساعة وبعد تلك المدّة سيتم حذفه بشكل نهائي».
-- وأضاف بعدها: «نتائج الطلاب تُحذف بعد مرور ٤٨ ساعة، ولن يكون هناك قدرة
-- للعودة».
--
-- ⚠️⚠️ **وهذا ينسخ قاعدةً قائمة في المشروع، بعمدٍ ووعي:** «نتائج الطلّاب
--    لا تُمحى» (المُشغِّل `quizzes_protect_results`). والقاعدتان لا
--    تتناقضان: تلك تمنع **المعلّم** من محو نتيجةِ طالبٍ بحذف اختبار،
--    وهذه تعطي **الطالب** حقّ محو بياناته هو. مالكُ الأثر يمحوه، وغيرُه لا.
--
-- ⚠️ والتأكيد **بإعادة الدخول بـGoogle** لا برمزٍ في البريد. سببه قياسٌ لا
--    تفضيل: بريد Supabase المدمج لا يصل إلا لأعضاء الفريق (خ-١٤)، فرمزٌ
--    «يصل الإيميل» لا يصل أحداً. و`amr` **موقَّعٌ من خادم المصادقة فلا
--    يُزوَّر** — إثباتٌ أقوى من رمزٍ يُنسخ من بريد.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) الطلب
--
-- ⚠️ `purge_at` تُحسب في الدالّة لا بـ`default`: المهلة ثابتٌ واحد مكتوب في
--    موضعٍ واحد، فلا تفترق مهلة الجدول عن مهلة الشاشة.
-- -----------------------------------------------------------------------------
create table if not exists public.account_deletions (
  user_id      uuid primary key references public.profiles(id) on delete cascade,
  requested_at timestamptz not null default now(),
  purge_at     timestamptz not null,
  check (purge_at > requested_at)
);

comment on table public.account_deletions is
  'طلبات حذف الحساب. الصفّ موجود = الحساب مخفيّ. ويُمحى الحساب كلّه عند بلوغ purge_at.';

alter table public.account_deletions enable row level security;
alter table public.account_deletions force row level security;

-- ⚠️ يقرؤه صاحبه — وإلّا لم يرَ متى يُمحى ولا استطاع التراجع.
-- ⚠️ ويقرؤه المعلّم: طالبٌ يختفي من لوحته فجأةً سؤالٌ بلا جواب. ولا سرّ
--    هنا يُخفى عنه — الصفّ لا يحمل إلّا تاريخين.
drop policy if exists deletions_read on public.account_deletions;
create policy deletions_read on public.account_deletions for select to authenticated
  using (user_id = auth.uid() or (select public.is_teacher()));

-- ⚠️ ولا كتابةَ مباشرة إطلاقاً: الطلب والإلغاء بدالّتين تفحصان الهويّة.
--    لو فُتح الإدراج للطالب لأدرج صفّاً لغيره أو بمهلةٍ يختارها هو.
revoke all on table public.account_deletions from public, anon;
grant select on table public.account_deletions to authenticated;

-- -----------------------------------------------------------------------------
-- ٢) الإخفاء — شرطٌ واحد يُضاف إلى `is_identified`
--
-- ⚠️ لماذا هنا بالذات؟ لأنّها **البوّابة التي تقرؤها كل أبواب الطالب**:
--    قراءة المحتوى (`may_read_content`)، وإنشاء الملفّ، وطلب الاشتراك.
--    فشرطٌ واحدٌ هنا يُغلق الجميع — بدل ستّة شروطٍ تفترق بمرور الوقت.
--    وهو الدرس الذي دفعناه ثمنه في ٠٠١٧.
--
-- ⚠️ وتبقى `invoker` كما كانت: الاستعلام على صفّ **المستدعي نفسه**،
--    وسياسة الجدول تكفله. فلا رفع صلاحيةٍ بلا حاجة.
--
-- ⚠️ ولا يُغلق بهذا بابُ التراجع: `cancel_account_deletion` دالّةٌ مستقلّة
--    لا تسأل `is_identified`، وقراءة الطالب لملفّه وصفّ حذفه بـ
--    `id = auth.uid()` لا بها. فيدخل ويرى ويتراجع.
-- -----------------------------------------------------------------------------
create or replace function public.is_identified()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and coalesce(auth.jwt() ->> 'email', '') <> ''
     and not exists (
       select 1 from public.account_deletions d where d.user_id = auth.uid()
     );
$$;

comment on function public.is_identified() is
  'هويّة حقيقية: رمزٌ صالح، وليست جلسةً مجهولة، وبريدٌ موجود، ولا طلبَ حذفٍ معلّق.';

-- ⚠️ ويختفي من لوحة المعلّم: صفّه لا يُقرأ ما دام الطلب قائماً. والشرط
--    على الفرع الثاني وحده — صاحب الصفّ يراه دائماً.
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (
    id = auth.uid()
    or (
      (select public.is_teacher())
      and not exists (select 1 from public.account_deletions d where d.user_id = profiles.id)
    )
  );

-- -----------------------------------------------------------------------------
-- ٣) الطلب والإلغاء
-- -----------------------------------------------------------------------------
create or replace function public.request_account_deletion()
returns table (ok boolean, reason text, purge_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_at  timestamptz;
begin
  if v_uid is null then
    return query select false, 'no_session'::text, null::timestamptz; return;
  end if;

  -- ⚠️⚠️ المعلّم لا يحذف حسابه من هنا إطلاقاً: حسابه **هو المنصّة**، وحذفه
  --    يمحو معه كل ما وزّعه وصحّحه. ولا زرّ في الواجهة يفعل ذلك — وهذا
  --    الحارس لمن يستدعي الدالّة مباشرةً بلا واجهة.
  if public.is_teacher() then
    return query select false, 'teacher_account'::text, null::timestamptz; return;
  end if;

  if exists (select 1 from public.account_deletions d where d.user_id = v_uid) then
    return query select false, 'already_requested'::text, null::timestamptz; return;
  end if;

  -- ⚠️ إثباتُ حضورٍ حديث: ساعةٌ واحدة لا اثنتا عشرة. حذفُ حسابٍ لا رجعة فيه
  --    لا يُقبل من جلسةٍ فُتحت أمس على جهازٍ تُرك في غرفةٍ ما.
  if not public.google_verified(1) then
    return query select false, 'reauth_required'::text, null::timestamptz; return;
  end if;

  v_at := now() + interval '48 hours';
  insert into public.account_deletions (user_id, purge_at) values (v_uid, v_at);
  return query select true, 'requested'::text, v_at;
end;
$$;

comment on function public.request_account_deletion() is
  'يطلب حذف الحساب: يُخفى فوراً ويُمحى نهائياً بعد ٤٨ ساعة. يشترط إثبات Google خلال ساعة.';

create or replace function public.cancel_account_deletion()
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_n integer;
begin
  if v_uid is null then
    return query select false, 'no_session'::text; return;
  end if;

  -- ⚠️ التراجع متاحٌ ما دامت المهلة قائمة: «الإخفاء» يُتراجع عنه، والمحو لا.
  --    ومن بلغت مهلته يمحوه المجدوِل، فلا يُلغى ما وقع.
  delete from public.account_deletions d
   where d.user_id = v_uid and d.purge_at > now();
  get diagnostics v_n = row_count;

  if v_n = 0 then
    return query select false, 'not_pending'::text; return;
  end if;
  return query select true, 'cancelled'::text;
end;
$$;

-- -----------------------------------------------------------------------------
-- ٤) المحو — ولا طريق إليه من الشبكة
--
-- ⚠️⚠️ حذف صفّ `auth.users` يتسلسل إلى `profiles` ومنها إلى كل ما يتبع
--    الطالب: اشتراكاته وطلباته ومحاولاته وإجاباته ودفتر مراجعته وعضويّاته
--    وما وُزّع إليه بعينه. سطرٌ واحدٌ يمحو الأثر كلّه، ولا بقايا.
--
-- ⚠️ ولا `grant` لأحد: تُنفَّذ من المجدوِل وحده بصلاحية مالكها. ولو كُشفت
--    لصارت زرّ محوٍ جماعيّ على الشبكة.
-- -----------------------------------------------------------------------------
create or replace function private.purge_due_accounts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer := 0; r record;
begin
  for r in select d.user_id from public.account_deletions d where d.purge_at <= now() loop
    delete from auth.users u where u.id = r.user_id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;

revoke all on function private.purge_due_accounts() from public, anon, authenticated;

revoke all on function public.request_account_deletion() from public, anon;
revoke all on function public.cancel_account_deletion()  from public, anon;
grant execute on function public.request_account_deletion() to authenticated;
grant execute on function public.cancel_account_deletion()  to authenticated;

-- -----------------------------------------------------------------------------
-- ٥) المجدوِل — لأنّ وعداً بـ«٤٨ ساعة» لا ينفّذه أحدٌ وعدٌ كاذب
--
-- ⚠️ هذا أوّل موضعٍ في المشروع يحتاج عملاً يقع **بلا مستخدم**. والبديل
--    «المحو الكسول» (يُمحى متى دخل أحدٌ الموقع) يعني أنّ حساباً طُلب حذفه
--    يوم الخميس يبقى إلى الأحد إن لم يفتح أحدٌ الموقع. والوعد قيل بالساعة.
--
-- ⚠️ ويتخطّى نفسه بلا ضجيج حيث لا `pg_cron` — كقاعدة الفحص المحلّية.
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'تخطّي الجدولة: لا `pg_cron` هنا (قاعدة محلّية).';
    return;
  end if;

  execute 'create extension if not exists pg_cron';

  -- إلغاء أي جدولةٍ سابقة بالاسم نفسه، فتبقى المهاجرة قابلةً للإعادة
  perform cron.unschedule('purge-deleted-accounts')
    where exists (select 1 from cron.job j where j.jobname = 'purge-deleted-accounts');

  -- ⚠️ الدقيقة ١٧ لا ٠: لئلّا تزدحم مع كل مهامّ العالم على رأس الساعة.
  perform cron.schedule('purge-deleted-accounts', '17 * * * *',
                        'select private.purge_due_accounts();');
end $$;
