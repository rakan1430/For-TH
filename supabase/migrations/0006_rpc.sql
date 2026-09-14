-- =============================================================================
-- ٠٠٠٦ — دوالّ الخادم
--
-- ⚠️ ثلاث قواعد تحكم كل دالّة في هذا الملف:
--
--   ١) **لا رفع استثناءٍ بعد كتابة.** في PL/pgSQL يُلغي `raise exception` كل
--      ما في المعاملة بما فيه كتاباتٌ نجحت قبله. فالترتيب دائماً: تحقّق
--      أوّلاً (وارفع هنا إن شئت) ← ثم اكتب ← ثم **أعد قيمةً** تصف ما جرى.
--
--   ٢) **لا نجاح كاذب.** ما لم يُكتب يُبلَّغ عنه بعددٍ صريح، لا يُبتلع بوصفه
--      «إعادة إرسال عادية». أسوأ عطلٍ هو الذي يُبلغ عن نجاح.
--
--   ٣) **الصلاحية تُفحص لحظة الكتابة**، لا لحظة فتح الصفحة: تبويبٌ قديم على
--      جهاز طالب قد يُسلّم إلى اشتراكٍ انتهى أو محتوىً أُغلق.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- نافذة الصلاحية للعمليات الخطرة (البند ١١)
--
-- جلسةٌ مفتوحة منذ أسبوع على جهازٍ تُرك في مكانٍ ما ليست إثبات هوية. فالعمليات
-- الأخطر — تغيير اشتراك، حذف جماعي — تشترط تأكيد هوية **حديثاً**: يعيد
-- المعلّم إدخال كلمة المرور، فتستدعي الواجهة `confirm_identity` مرّة، وتفتح
-- نافذة ١٢ ساعة.
-- -----------------------------------------------------------------------------
create table if not exists private.identity_confirmations (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  confirmed_at timestamptz not null default now()
);

create or replace function public.confirm_identity()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'لا جلسة' using errcode = '28000';
  end if;
  insert into private.identity_confirmations (user_id, confirmed_at)
  values (v_uid, now())
  on conflict (user_id) do update set confirmed_at = now();
  return now();
end;
$$;

create or replace function private.has_recent_confirmation(p_hours integer default 12)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.identity_confirmations c
    where c.user_id = auth.uid()
      and c.confirmed_at > now() - make_interval(hours => p_hours)
  );
$$;

-- -----------------------------------------------------------------------------
-- مسار العنصر — تُستعمل في التوزيع
-- -----------------------------------------------------------------------------
create or replace function private.item_track(
  p_item_type public.item_type_t,
  p_item_id   uuid
)
returns public.track_t
language plpgsql
stable
security definer
set search_path = ''
as $$
declare v public.track_t;
begin
  case p_item_type
    when 'section'  then select s.track into v from public.sections  s where s.id = p_item_id;
    when 'bank'     then select b.track into v from public.banks     b where b.id = p_item_id;
    when 'resource' then select r.track into v from public.resources r where r.id = p_item_id;
    when 'quiz'     then select q.track into v from public.quizzes   q where q.id = p_item_id;
  end case;
  return v;   -- NULL إن لم يوجد العنصر — ويعالجها المستدعي صراحةً
end;
$$;

-- =============================================================================
-- التوزيع — علاج «النجاح الكاذب» (البند ٤)
--
-- ما وقع في المشروع السابق: أُرسل اختبار لفصلين، أحدهما مُسنَد مسبقاً. فرفض
-- صفٍّ واحد لتكرار المفتاح أسقط الإدراج كلّه، وابتلعت الشفرة الخطأ بوصفه
-- «إعادة إرسال عادية» — فرأى المعلّم «أُرسل ✅» ولم يصل أي فصلٍ شيئاً.
--
-- العلاج هنا من شقّين:
--   · `on conflict do nothing` فلا يُسقط المكرَّرُ الدفعةَ كلّها.
--   · وإعادة **عددين صريحين** لا قيمة منطقية: كم صفّاً أُنشئ فعلاً، وكم كان
--     موجوداً. فالواجهة تقول «أُرسل إلى ٣، وكان ٢ مُرسَلاً من قبل» — لا «تمّ».
-- =============================================================================
create or replace function public.assign_items(
  p_item_type   public.item_type_t,
  p_item_ids    uuid[],
  p_audience    public.audience_t,
  p_group_ids   uuid[] default null,
  p_student_ids uuid[] default null
)
returns table (created integer, skipped integer, targeted integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_created   integer;
  v_targeted  integer;
  v_bad       uuid;
begin
  -- ---- تحقّق قبل أي كتابة (القاعدة ١) ----
  if not public.is_teacher() then
    raise exception 'التوزيع للمعلّم وحده' using errcode = '42501';
  end if;

  if p_item_ids is null or cardinality(p_item_ids) = 0 then
    raise exception 'لا عناصر للتوزيع' using errcode = '22023';
  end if;

  -- عنصرٌ غير موجود خطأُ برمجةٍ في الواجهة لا «تكرارٌ عاديّ»: نصرّح به ونسمّيه،
  -- ولا نمرّره بصمت فيبدو التوزيع ناجحاً وهو ناقص.
  select i into v_bad
  from unnest(p_item_ids) as i
  where private.item_track(p_item_type, i) is null
  limit 1;
  if v_bad is not null then
    raise exception 'عنصر غير موجود: % (%)', v_bad, p_item_type using errcode = '23503';
  end if;

  if p_audience = 'group' then
    if p_group_ids is null or cardinality(p_group_ids) = 0 then
      raise exception 'لا مجموعات مستهدَفة' using errcode = '22023';
    end if;
    select g into v_bad from unnest(p_group_ids) as g
    where not exists (select 1 from public.groups x where x.id = g) limit 1;
    if v_bad is not null then
      raise exception 'مجموعة غير موجودة: %', v_bad using errcode = '23503';
    end if;
  elsif p_audience = 'student' then
    if p_student_ids is null or cardinality(p_student_ids) = 0 then
      raise exception 'لا طلّاب مستهدَفون' using errcode = '22023';
    end if;
    select s into v_bad from unnest(p_student_ids) as s
    where not exists (select 1 from public.profiles x where x.id = s) limit 1;
    if v_bad is not null then
      raise exception 'طالب غير موجود: %', v_bad using errcode = '23503';
    end if;
  end if;

  -- ---- بناء مجموعة الأهداف والكتابة في عبارةٍ واحدة ----
  -- لا جدول مؤقّت هنا بعمد: الدالّة تعمل بـ`search_path = ''`، والاسم غير
  -- المؤهَّل فيها لا يُعتمد عليه. وتعبير `with` يؤدّي الغرض ويبقى معاملةً واحدة.
  with targets as (
    select private.item_track(p_item_type, i) as track,
           i as item_id, g.gid as group_id, s.sid as student_id
    from unnest(p_item_ids) as i
    left join lateral (
      select unnest(p_group_ids) as gid where p_audience = 'group'
    ) g on true
    left join lateral (
      select unnest(p_student_ids) as sid where p_audience = 'student'
    ) s on true
  ),
  ins as (
    insert into public.assignments
      (track, item_type, item_id, audience, group_id, student_id, created_by)
    select t.track, p_item_type, t.item_id, p_audience, t.group_id, t.student_id, v_uid
    from targets t
    on conflict do nothing          -- ⚠️ المكرَّر يُتخطّى وحده ولا يُسقط الدفعة
    returning 1
  )
  select (select count(*) from targets)::integer,
         (select count(*) from ins)::integer
    into v_targeted, v_created;

  -- ---- الإبلاغ: عددان صريحان، لا «تمّ» (القاعدة ٢) ----
  return query select v_created, v_targeted - v_created, v_targeted;
end;
$$;

-- =============================================================================
-- طلب الاشتراك — الطالب
--
-- القيد `subscription_requests_one_pending` يرفض طلباً معلّقاً ثانياً. ولو
-- تُرك الخطأ يخرج خاماً لظهر للطالب رسالةً غامضة، ولو ابتُلع لظهر «أُرسل ✅»
-- ولا طلبَ جديد. فنقرأ الموجود أوّلاً ونقول الحقيقة: طلبك السابق ما زال
-- معلّقاً، وهذا رقمه.
-- =============================================================================
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
    (v_uid, p_track, p_plan_id, p_full_name, p_grade, p_contact, p_method,
     nullif(btrim(p_receipt_path), ''))
  returning id into v_new;

  -- بعد الكتابة: نُعيد قيمةً ولا نرفع استثناءً (القاعدة ١)
  return query select true, 'created'::text, v_new;
end;
$$;

-- =============================================================================
-- قبول الطلب أو رفضه — المعلّم
-- =============================================================================
create or replace function public.decide_subscription_request(
  p_request_id uuid,
  p_accept     boolean,
  p_starts_on  date default null,
  p_months     integer default 1,
  p_note       text default null
)
returns table (ok boolean, reason text, subscription_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_req   public.subscription_requests%rowtype;
  v_start date;
  v_sub   uuid;
begin
  if not public.is_teacher() then
    raise exception 'القرار للمعلّم وحده' using errcode = '42501';
  end if;

  -- ⚠️ تغيير اشتراكٍ عمليةٌ خطرة: تشترط تأكيد هوية حديثاً (البند ١١)
  if not private.has_recent_confirmation(12) then
    return query select false, 'reauth_required'::text, null::uuid;
    return;
  end if;

  if p_months is null or p_months < 1 or p_months > 24 then
    return query select false, 'bad_duration'::text, null::uuid;
    return;
  end if;

  select * into v_req from public.subscription_requests r where r.id = p_request_id;
  if not found then
    return query select false, 'not_found'::text, null::uuid;
    return;
  end if;

  -- طلبٌ حُسم من قبل: نقولها صراحةً ولا نتظاهر بقبولٍ ثانٍ
  if v_req.status <> 'pending' then
    return query select false, 'already_decided'::text, null::uuid;
    return;
  end if;

  -- ---- من هنا تبدأ الكتابة: لا `raise` بعد هذا السطر ----
  if not p_accept then
    update public.subscription_requests
       set status = 'rejected', decided_at = now(), decided_by = v_uid, note = p_note
     where id = p_request_id;
    return query select true, 'rejected'::text, null::uuid;
    return;
  end if;

  v_start := coalesce(p_starts_on, current_date);

  insert into public.subscriptions
    (student_id, track, starts_on, ends_on, source_request_id, created_by)
  values
    (v_req.student_id, v_req.track, v_start,
     (v_start + make_interval(months => p_months))::date - 1,
     p_request_id, v_uid)
  returning id into v_sub;

  update public.subscription_requests
     set status = 'accepted', decided_at = now(), decided_by = v_uid, note = p_note
   where id = p_request_id;

  return query select true, 'accepted'::text, v_sub;
end;
$$;

-- =============================================================================
-- الاختبارات — التصحيح في الخادم (البند ٨)
--
-- «الدرجة تُحسب من الإجابات المخزَّنة، لا من رقمٍ يرسله المتصفّح.»
-- لا تقبل أيٌّ من هذه الدوالّ درجةً أو صحّةً من العميل. تقبل **اختياراتٍ**
-- فقط، وتقارنها بمفتاحٍ في `private` لا مسار شبكة إليه.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- مفتاح الإجابة — كتابةً للمعلّم، ولا قراءة لأحد
-- -----------------------------------------------------------------------------
create or replace function public.set_answer_key(
  p_question_id uuid,
  p_option_ids  uuid[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if not public.is_teacher() then
    raise exception 'مفتاح الإجابة للمعلّم وحده' using errcode = '42501';
  end if;

  if p_option_ids is null or cardinality(p_option_ids) = 0 then
    raise exception 'لا خيار صحيح' using errcode = '22023';
  end if;

  -- كل خيارٍ يجب أن يتبع هذا السؤال — وإلا صار «الصحيح» خياراً من سؤالٍ آخر
  if exists (
    select 1 from unnest(p_option_ids) as oid
    where not exists (
      select 1 from public.quiz_options o
      where o.id = oid and o.question_id = p_question_id
    )
  ) then
    raise exception 'خيار لا يتبع هذا السؤال' using errcode = '23503';
  end if;

  delete from private.answer_key k where k.question_id = p_question_id;
  insert into private.answer_key (question_id, option_id)
  select p_question_id, oid from unnest(p_option_ids) as oid;

  get diagnostics v_count = row_count;
  return v_count;      -- قيمةٌ تصف ما جرى، لا استثناء بعد الكتابة
end;
$$;

-- -----------------------------------------------------------------------------
-- بدء محاولة
--
-- ⚠️ الدالّة `security definer` فهي تتجاوز سياسات الصفوف. ولذلك تُعيد فحص
--    كل ما كانت السياسة ستفحصه بنفسها — النشر والاشتراك والتوزيع والموعد.
--    دالّةٌ بصلاحية عالية تنسى إعادة الفحص هي بالضبط الثغرة التي وقعت في
--    المشروع السابق (البند ٣).
-- -----------------------------------------------------------------------------
create or replace function public.start_attempt(p_quiz_id uuid)
returns table (
  ok boolean, reason text, attempt_id uuid, attempt_no integer, expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid  uuid := auth.uid();
  v_q    public.quizzes%rowtype;
  v_n    integer;
  v_exp  timestamptz;
  v_id   uuid;
begin
  if v_uid is null then
    raise exception 'لا جلسة' using errcode = '28000';
  end if;

  select * into v_q from public.quizzes q where q.id = p_quiz_id;
  if not found then
    return query select false, 'not_found'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  -- ---- إعادة فحص ما تفحصه السياسة، صراحةً ----
  if not v_q.is_published then
    return query select false, 'not_published'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  if not public.has_active_subscription(v_q.track) then
    return query select false, 'no_subscription'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  if not (
    public.is_assigned('quiz', v_q.id)
    or (v_q.bank_id is not null and public.is_assigned('bank', v_q.bank_id))
  ) then
    return query select false, 'not_assigned'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  if v_q.opens_at is not null and now() < v_q.opens_at then
    return query select false, 'not_open_yet'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  if v_q.due_at is not null and now() > v_q.due_at then
    return query select false, 'past_due'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  -- ⚠️ قفلٌ على (الاختبار + الطالب): نقرتان سريعتان على «ابدأ» تحسبان رقم
  --    المحاولة نفسه في آنٍ واحد، فيرفض القيد إحداهما بخطأٍ غامض. القفل
  --    يجعل الحساب متسلسلاً، وينتهي مع المعاملة تلقائياً.
  perform pg_advisory_xact_lock(hashtextextended(p_quiz_id::text || v_uid::text, 0));

  select coalesce(max(a.attempt_no), 0) + 1 into v_n
  from public.quiz_attempts a
  where a.quiz_id = p_quiz_id and a.student_id = v_uid;

  -- ⚠️ البند ٦: الاختبار المسجَّل يُعاد بلا حدّ ما لم يضع المعلّم حدّاً صراحةً
  if v_q.max_attempts is not null and v_n > v_q.max_attempts then
    return query select false, 'attempts_exhausted'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  -- المهلة تُحسب هنا في الخادم. مؤقّت المتصفّح عرضٌ للمستخدم لا مصدر حقيقة.
  v_exp := case when v_q.time_limit_minutes is null then null
                else now() + make_interval(mins => v_q.time_limit_minutes) end;
  if v_q.due_at is not null then
    v_exp := least(coalesce(v_exp, v_q.due_at), v_q.due_at);
  end if;

  insert into public.quiz_attempts (quiz_id, student_id, attempt_no, expires_at)
  values (p_quiz_id, v_uid, v_n, v_exp)
  returning id into v_id;

  return query select true, 'started'::text, v_id, v_n, v_exp;
end;
$$;

-- -----------------------------------------------------------------------------
-- حفظ إجابة أثناء المحاولة
--
-- ⚠️ لا تُكتب `is_correct` هنا ولا تُقرأ. لو صحّحت هذه الدالّة إجابةً واحدة
--    لصار الحفظ المرحلي قناةً يستخرج بها الطالب المفتاح سؤالاً سؤالاً قبل
--    أن يسلّم.
-- -----------------------------------------------------------------------------
create or replace function public.save_answer(
  p_attempt_id  uuid,
  p_question_id uuid,
  p_option_id   uuid
)
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_a   public.quiz_attempts%rowtype;
  v_trk public.track_t;
begin
  select * into v_a from public.quiz_attempts a
  where a.id = p_attempt_id and a.student_id = v_uid;
  if not found then
    return query select false, 'not_found'::text; return;
  end if;

  if v_a.status <> 'in_progress' then
    return query select false, 'already_submitted'::text; return;
  end if;

  -- ⚠️ البند ٧: الصلاحية تُفحص لحظة الكتابة، لا لحظة فتح الصفحة
  select q.track into v_trk from public.quizzes q where q.id = v_a.quiz_id;
  if not public.has_active_subscription(v_trk) then
    return query select false, 'subscription_expired'::text; return;
  end if;

  if v_a.expires_at is not null and now() > v_a.expires_at then
    return query select false, 'time_expired'::text; return;
  end if;

  if not exists (
    select 1 from public.quiz_questions qq
    where qq.id = p_question_id and qq.quiz_id = v_a.quiz_id
  ) then
    return query select false, 'question_not_in_quiz'::text; return;
  end if;

  if p_option_id is not null and not exists (
    select 1 from public.quiz_options o
    where o.id = p_option_id and o.question_id = p_question_id
  ) then
    return query select false, 'option_not_in_question'::text; return;
  end if;

  insert into public.attempt_answers (attempt_id, question_id, option_id, is_correct)
  values (p_attempt_id, p_question_id, p_option_id, null)
  on conflict (attempt_id, question_id)
    do update set option_id = excluded.option_id,
                  is_correct = null,
                  answered_at = now();

  return query select true, 'saved'::text;
end;
$$;

-- -----------------------------------------------------------------------------
-- التسليم والتصحيح
--
-- ⚠️ لا تقبل هذه الدالّة درجةً من العميل. تقبل اختياراته، وتقارنها بـ
--    `private.answer_key`، وتحسب الدرجة من الإجابات **المخزَّنة**.
--
-- ⚠️ وسلوك انتهاء المهلة: لا تُرفض المحاولة فيضيع عمل الطالب، بل تُتجاهَل
--    الإجابات الواصلة متأخّرة وتُصحَّح المحفوظة، وتُعلَّم المحاولة `late`.
--    أمّا انتهاء **الاشتراك** فمنعٌ كامل: لا حقّ في المحتوى أصلاً.
-- -----------------------------------------------------------------------------
create or replace function public.submit_attempt(
  p_attempt_id uuid,
  p_answers    jsonb default null   -- [{"question_id":"…","option_id":"…"}, …]
)
returns table (
  ok boolean, reason text, score numeric, max_score numeric,
  correct_count integer, question_count integer, late boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_a     public.quiz_attempts%rowtype;
  v_q     public.quizzes%rowtype;
  v_late  boolean := false;
  v_score numeric(8,2);
  v_max   numeric(8,2);
  v_ok_n  integer;
  v_all_n integer;
begin
  select * into v_a from public.quiz_attempts a
  where a.id = p_attempt_id and a.student_id = v_uid;
  if not found then
    return query select false, 'not_found'::text, null::numeric, null::numeric,
                        null::integer, null::integer, false; return;
  end if;

  if v_a.status = 'submitted' then
    return query select false, 'already_submitted'::text, v_a.score, v_a.max_score,
                        null::integer, null::integer, false; return;
  end if;

  select * into v_q from public.quizzes q where q.id = v_a.quiz_id;

  -- البند ٧: تبويبٌ قديم قد يُسلّم إلى اشتراكٍ انتهى — الفحص الآن، لا عند الفتح
  if not public.has_active_subscription(v_q.track) then
    return query select false, 'subscription_expired'::text, null::numeric, null::numeric,
                        null::integer, null::integer, false; return;
  end if;

  v_late := (v_a.expires_at is not null and now() > v_a.expires_at)
         or (v_q.due_at   is not null and now() > v_q.due_at);

  -- ---- تبدأ الكتابة هنا: لا `raise` بعد هذا السطر (القاعدة ١) ----

  -- الإجابات الواصلة الآن تُقبل ما دام الوقت باقياً. وتُتجاهَل بعد انتهائه
  -- فتُصحَّح المحفوظة وحدها.
  if p_answers is not null and not v_late then
    insert into public.attempt_answers (attempt_id, question_id, option_id, is_correct)
    select p_attempt_id,
           (e->>'question_id')::uuid,
           nullif(e->>'option_id', '')::uuid,
           null
    from jsonb_array_elements(p_answers) as e
    where exists (
      select 1 from public.quiz_questions qq
      where qq.id = (e->>'question_id')::uuid and qq.quiz_id = v_a.quiz_id
    )
    and (
      nullif(e->>'option_id', '') is null
      or exists (
        select 1 from public.quiz_options o
        where o.id = (e->>'option_id')::uuid
          and o.question_id = (e->>'question_id')::uuid
      )
    )
    on conflict (attempt_id, question_id)
      do update set option_id = excluded.option_id, answered_at = now();
  end if;

  -- سؤالٌ بلا إجابة محفوظة يُحسب خطأً: نُنشئ له صفّاً حتى تكون النتيجة كاملة
  insert into public.attempt_answers (attempt_id, question_id, option_id, is_correct)
  select p_attempt_id, qq.id, null, null
  from public.quiz_questions qq
  where qq.quiz_id = v_a.quiz_id
  on conflict (attempt_id, question_id) do nothing;

  -- ---- التصحيح: مقارنةٌ بمفتاحٍ لم يغادر الخادم قطّ ----
  update public.attempt_answers aa
     set is_correct = (
       aa.option_id is not null
       and exists (
         select 1 from private.answer_key k
         where k.question_id = aa.question_id and k.option_id = aa.option_id
       )
     )
   where aa.attempt_id = p_attempt_id;

  select coalesce(sum(qq.points) filter (where aa.is_correct), 0)::numeric(8,2),
         coalesce(sum(qq.points), 0)::numeric(8,2),
         count(*) filter (where aa.is_correct)::integer,
         count(*)::integer
    into v_score, v_max, v_ok_n, v_all_n
  from public.attempt_answers aa
  join public.quiz_questions qq on qq.id = aa.question_id
  where aa.attempt_id = p_attempt_id;

  update public.quiz_attempts a
     set status = 'submitted', submitted_at = now(), score = v_score, max_score = v_max
   where a.id = p_attempt_id;

  return query select true, 'submitted'::text, v_score, v_max, v_ok_n, v_all_n, v_late;
end;
$$;

-- -----------------------------------------------------------------------------
-- إعادة ترتيب عناصر البنك
--
-- ترتيب البنك يخلط ملفّاتٍ واختبارات في تسلسلٍ واحد يختاره المعلّم:
-- «شرح ١، تمارين ١، شرح ٢، تمارين ٢، اختبار البنك». فالترتيب يُكتب على
-- الجدولين معاً في معاملةٍ واحدة.
-- -----------------------------------------------------------------------------
create or replace function public.reorder_bank_items(
  p_bank_id uuid,
  p_ordered jsonb        -- [{"type":"resource","id":"…"}, {"type":"quiz","id":"…"}, …]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer := 0;
begin
  if not public.is_teacher() then
    raise exception 'الترتيب للمعلّم وحده' using errcode = '42501';
  end if;

  if not exists (select 1 from public.banks b where b.id = p_bank_id) then
    raise exception 'بنك غير موجود' using errcode = '23503';
  end if;

  with ord as (
    select (e->>'type') as t, (e->>'id')::uuid as id,
           (row_number() over ())::integer - 1 as pos
    from jsonb_array_elements(p_ordered) with ordinality as x(e, n)
  ),
  r as (
    update public.resources res set position = o.pos
    from ord o where o.t = 'resource' and res.id = o.id and res.bank_id = p_bank_id
    returning 1
  ),
  q as (
    update public.quizzes qz set position = o.pos
    from ord o where o.t = 'quiz' and qz.id = o.id and qz.bank_id = p_bank_id
    returning 1
  )
  select (select count(*) from r) + (select count(*) from q) into v_n;

  return v_n;
end;
$$;

-- -----------------------------------------------------------------------------
-- لوحة المعلّم — عدد المشتركين في كل مسار، والطلبات المعلّقة
-- -----------------------------------------------------------------------------
create or replace function public.teacher_overview()
returns table (
  track public.track_t, active_subscribers integer, pending_requests integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_teacher() then
    raise exception 'اللوحة للمعلّم وحده' using errcode = '42501';
  end if;

  return query
  select t.t,
         (select count(distinct s.student_id)::integer
            from public.subscriptions s
           where s.track = t.t and not s.is_revoked
             and current_date between s.starts_on and s.ends_on),
         (select count(*)::integer
            from public.subscription_requests r
           where r.track = t.t and r.status = 'pending')
  from (select unnest(enum_range(null::public.track_t)) as t) t;
end;
$$;
