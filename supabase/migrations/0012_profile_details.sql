-- =============================================================================
-- ٠٠١٢ — تفاصيل الطالب: تُجمع مرّةً عند الدخول، لا عند كل طلب
--
-- قرار المالك: الدخول بحساب Google وحده، ثمّ يُطلب من الطالب إكمال بياناته
-- قبل أن يستعمل المنصّة. وGoogle لا يعطي إلّا الاسم والبريد — والمعلّم يحتاج
-- المستوى والجوّال والمدرسة ليعرف من يخاطب.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) المدرسة — الحقل الرابع
--
-- ⚠️ `null` مسموحة في العمود بعمد: الصفّ يُنشأ لحظة أوّل دخولٍ بالاسم من
--    Google وحده، فلو كان العمود `not null` لفشل الإنشاء ولبقي الطالب بلا
--    ملفّ — أي عاجزاً عن الاشتراك. فالاكتمال شرطٌ على **الفعل** (طلب
--    الاشتراك) لا على وجود الصفّ.
-- -----------------------------------------------------------------------------
alter table public.profiles
  add column if not exists school text
    check (school is null or length(btrim(school)) between 2 and 120);

comment on column public.profiles.school is 'المدرسة أو المركز — يملؤه الطالب بعد أوّل دخول.';

-- -----------------------------------------------------------------------------
-- ٢) هل اكتمل ملفّ المستدعي؟
--
-- ⚠️ الاكتمال يُعرَّف **مرّةً واحدة هنا**، وتقرؤه الواجهة والقاعدة معاً. ولو
--    عُرِّف في الواجهة وحدها لصار تعريفان يفترقان بمرور الوقت: شاشةٌ تقول
--    «أكملتَ» وقاعدةٌ ترفض، أو أسوأ — قاعدةٌ تقبل ما لم تجمعه الشاشة.
--
-- ⚠️ وهي `stable` بلا `security definer`: تقرأ صفّ المستدعي وحده، وسياسة
--    `profiles_read` تسمح له بذلك أصلاً. فلا حاجة لرفع الصلاحية.
-- -----------------------------------------------------------------------------
create or replace function public.profile_complete()
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and length(btrim(p.full_name))          >= 2
      and length(btrim(coalesce(p.grade,  ''))) >= 2
      and length(btrim(coalesce(p.contact,''))) >= 8
      and length(btrim(coalesce(p.school, ''))) >= 2
  );
$$;

comment on function public.profile_complete() is
  'اكتمل ملفّ المستدعي: اسمٌ ومستوىً وجوّالٌ ومدرسة. تعريفٌ واحد تقرؤه الواجهة والقاعدة.';

-- -----------------------------------------------------------------------------
-- ٣) الحارس في الأسفل: لا طلب اشتراكٍ بملفٍّ ناقص
--
-- ⚠️ إخفاء الشاشة لا يحرس شيئاً — من يفتح أدوات المطوّر يستدعي الدالّة
--    مباشرةً. فالشرط هنا، في أوّل الدالّة، قبل أي كتابة.
--
-- ⚠️ وبقيت الوسائط الثلاثة كما هي بعمد: صفّ الطلب يحفظ **لقطةً** لما أقرّ
--    به الطالب لحظة الطلب. ولو قُرئت من الملفّ وقت العرض لتغيّرت تحت
--    المعلّم بعد أن قرّر — وقرارٌ يُراجَع ببياناتٍ غير التي بُني عليها عطب.
-- -----------------------------------------------------------------------------
create or replace function public.request_subscription(
  p_track        public.track_t,
  p_plan_id      uuid,
  p_full_name    text,
  p_grade        text,
  p_contact      text,
  p_method       public.pay_method_t,
  p_receipt_path text default null
)
returns table (ok boolean, reason text, request_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_existing uuid;
  v_new      uuid;
begin
  if v_uid is null then
    raise exception 'لا جلسة' using errcode = '28000';
  end if;

  if not public.profile_complete() then
    return query select false, 'profile_incomplete'::text, null::uuid;
    return;
  end if;

  if not exists (select 1 from public.plans p
                 where p.id = p_plan_id and p.track = p_track and p.is_active) then
    return query select false, 'plan_not_found'::text, null::uuid;
    return;
  end if;

  if p_method = 'transfer' and coalesce(btrim(p_receipt_path), '') = '' then
    return query select false, 'receipt_required'::text, null::uuid;
    return;
  end if;

  -- اقرأ الموجود أوّلاً (البند ٤)
  select r.id into v_existing
  from public.subscription_requests r
  where r.student_id = v_uid and r.track = p_track and r.status = 'pending';

  if v_existing is not null then
    return query select false, 'already_pending'::text, v_existing;
    return;
  end if;

  insert into public.subscription_requests
    (student_id, track, plan_id, full_name, grade, contact, method, receipt_path)
  values
    (v_uid, p_track, p_plan_id, btrim(p_full_name), btrim(p_grade), btrim(p_contact),
     p_method, nullif(btrim(p_receipt_path), ''))
  returning id into v_new;

  return query select true, 'pending'::text, v_new;
end;
$$;

-- -----------------------------------------------------------------------------
-- ٤) الصلاحيات — البند نفسه الذي أنتج `0010`
-- -----------------------------------------------------------------------------
revoke all on function public.profile_complete() from public, anon;
grant execute on function public.profile_complete() to authenticated;
revoke all on function public.request_subscription(
  public.track_t, uuid, text, text, text, public.pay_method_t, text) from public, anon;
grant execute on function public.request_subscription(
  public.track_t, uuid, text, text, text, public.pay_method_t, text) to authenticated;
