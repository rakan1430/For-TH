-- =============================================================================
-- ٠٠٠٥ — الحارس في الأسفل
--
-- «لو أخطأت الواجهة يوماً وطلبت ما لا يحقّ لها، لا يقع تسريب — لأنّ المنع
--  في قاعدة البيانات.»
--
-- والسؤال هنا ليس «هل أنت مسجَّل الدخول؟» بل: هل يحقّ لهذا الشخص تحديداً
-- رؤية **هذا الصفّ**؟ وإن لم يحقّ، لا يعود الصفّ إطلاقاً — لا فارغاً ولا
-- مخفيّاً، بل غير موجودٍ من وجهة نظره.
--
-- ⚠️ كل دالّة هنا `security definer`، وكلّها تُسحب صلاحية تنفيذها من
--    `PUBLIC` في `0007`. لا تكتب دالّةً جديدة بهذه الصفة دون أن تفعل مثلها.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- هل المستدعي هو المعلّم؟
--
-- `set search_path = ''` ليس زينة: بدونه يستطيع من يملك إنشاء مخطّطٍ أن
-- يزرع جدول `teachers` مزيّفاً يسبق الحقيقيّ في مسار البحث، فتُجيب الدالّة
-- «نعم» لمن ليس معلّماً. وكل اسمٍ هنا مؤهَّل بالكامل لهذا السبب.
-- -----------------------------------------------------------------------------
create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from private.teachers t where t.user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- هل للمستدعي اشتراكٌ **ساري** في **هذا المسار**؟
--
-- ⚠️ هذه الدالّة هي التي تفرض فصل المسارين فرضاً حقيقياً. طالبٌ مشترك في
--    التحصيلي وحده لا يقرأ صفّاً واحداً من القدرات ولو عبث بالطلب يدوياً.
-- ⚠️ ولا تقبل معرّف طالبٍ وسيطاً — تسأل عن المستدعي وحده دائماً. ولو قبلته
--    لصار بإمكان أي طالبٍ أن يستكشف اشتراكات غيره سؤالاً بعد سؤال.
-- -----------------------------------------------------------------------------
create or replace function public.has_active_subscription(p_track public.track_t)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.subscriptions s
    where s.student_id = auth.uid()
      and s.track      = p_track
      and s.is_revoked = false
      and current_date between s.starts_on and s.ends_on
  );
$$;

-- -----------------------------------------------------------------------------
-- هل وُزِّع هذا العنصر على المستدعي؟
--
-- «يرى ما أُرسل إليه في القسم الذي اشترك فيه»: الاشتراك يفتح المسار،
-- والتوزيع يحدّد ما يصله منه. والشرطان معاً، لا أحدهما.
-- -----------------------------------------------------------------------------
create or replace function public.is_assigned(
  p_item_type public.item_type_t,
  p_item_id   uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments a
    where a.item_type = p_item_type
      and a.item_id   = p_item_id
      and (
            a.audience = 'track'                               -- كل مشتركي المسار
        or (a.audience = 'student' and a.student_id = auth.uid())
        or (a.audience = 'group'   and exists (
              select 1 from public.group_members gm
              where gm.group_id = a.group_id
                and gm.student_id = auth.uid()
           ))
      )
  );
$$;

-- =============================================================================
-- تفعيل الحراسة — على كل جدول، بلا استثناء
--
-- `force row level security` تجعل السياسات تسري على مالك الجدول أيضاً. بدونها
-- يتجاوزها المالك بصمت، فتمرّ ثغرةٌ في الاختبار لأنّ الاختبار جرى بحسابه.
-- =============================================================================
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','plans','subscriptions','subscription_requests',
    'sections','banks','resources','groups','group_members','assignments',
    'quizzes','quiz_questions','quiz_options','quiz_attempts','attempt_answers'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force  row level security', t);
  end loop;
end $$;

-- =============================================================================
-- السياسات
--
-- ملاحظة أداء: نلفّ نداء الدالّة بـ `(select ...)` ليقيّمه المخطّط مرّةً
-- واحدة للاستعلام كلّه بدل مرّةٍ لكل صفّ.
-- =============================================================================

-- ---- الملفّات الشخصية ------------------------------------------------------
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id = auth.uid() or (select public.is_teacher()));

drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid() or (select public.is_teacher()))
  with check (id = auth.uid() or (select public.is_teacher()));

drop policy if exists profiles_delete_teacher on public.profiles;
create policy profiles_delete_teacher on public.profiles for delete to authenticated
  using ((select public.is_teacher()));

-- ---- الخطط -----------------------------------------------------------------
-- صفحة الأسعار تُقرأ قبل تسجيل الدخول، فهي الشيء الوحيد المتاح للزائر.
--
-- ⚠️ سياستان لا واحدة: لو شارك الزائرُ المجهول سياسةَ المسجَّل لاحتاج صلاحية
--    تنفيذ `is_teacher()` لتقييم شرطها، فنُضطرّ لمنحه إيّاها. والزائر المجهول
--    يجب أن يبقى بلا صلاحية تنفيذٍ على أي دالّة إطلاقاً — انظر `0007`.
drop policy if exists plans_read on public.plans;
drop policy if exists plans_read_anon on public.plans;
create policy plans_read_anon on public.plans for select to anon
  using (is_active);

drop policy if exists plans_read_auth on public.plans;
create policy plans_read_auth on public.plans for select to authenticated
  using (is_active or (select public.is_teacher()));

drop policy if exists plans_write on public.plans;
create policy plans_write on public.plans for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- ---- الاشتراكات ------------------------------------------------------------
drop policy if exists subscriptions_read on public.subscriptions;
create policy subscriptions_read on public.subscriptions for select to authenticated
  using (student_id = auth.uid() or (select public.is_teacher()));

drop policy if exists subscriptions_write on public.subscriptions;
create policy subscriptions_write on public.subscriptions for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- ---- طلبات الاشتراك --------------------------------------------------------
drop policy if exists subreq_read on public.subscription_requests;
create policy subreq_read on public.subscription_requests for select to authenticated
  using (student_id = auth.uid() or (select public.is_teacher()));

-- الطالب ينشئ طلبه هو، معلّقاً، باسمه. ولا يقرّر عن نفسه.
drop policy if exists subreq_insert_self on public.subscription_requests;
create policy subreq_insert_self on public.subscription_requests for insert to authenticated
  with check (student_id = auth.uid() and status = 'pending');

-- ⚠️ القبول والرفض للمعلّم وحده. لا سياسة تحديثٍ للطالب إطلاقاً — ولو مَلَك
--    تحديث صفّه لَقَبِل اشتراكه بنفسه.
drop policy if exists subreq_update_teacher on public.subscription_requests;
create policy subreq_update_teacher on public.subscription_requests for update to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

drop policy if exists subreq_delete_teacher on public.subscription_requests;
create policy subreq_delete_teacher on public.subscription_requests for delete to authenticated
  using ((select public.is_teacher()));

-- ---- المجموعات: تنظيم المعلّم الخاصّ، لا يراه الطلاب ------------------------
drop policy if exists groups_teacher_only on public.groups;
create policy groups_teacher_only on public.groups for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

drop policy if exists group_members_teacher_only on public.group_members;
create policy group_members_teacher_only on public.group_members for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- ⚠️ التوزيع كذلك: لا يحتاج الطالب قراءة جدول التوزيع ليرى محتواه، بل تقرأه
--    `is_assigned` نيابةً عنه. ولو قرأه لعرف ما أُرسل لغيره ولمن.
drop policy if exists assignments_teacher_only on public.assignments;
create policy assignments_teacher_only on public.assignments for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- ---- الأقسام ---------------------------------------------------------------
-- عناوين تخطيط لا محتوى؛ يراها مشترك المسار كي تُرسم صفحته. ومشترك التحصيلي
-- لا يرى عناوين القدرات — الشرط على المسار قائم هنا أيضاً.
drop policy if exists sections_read on public.sections;
create policy sections_read on public.sections for select to authenticated
  using (
    (select public.is_teacher())
    or (select public.has_active_subscription(track))
  );

drop policy if exists sections_write on public.sections;
create policy sections_write on public.sections for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- ---- البنوك ----------------------------------------------------------------
-- ثلاثة شروط مجتمعة: منشور، واشتراكٌ ساري في مساره، ومُرسَل إليه.
drop policy if exists banks_read on public.banks;
create policy banks_read on public.banks for select to authenticated
  using (
    (select public.is_teacher())
    or (
      is_published
      and (select public.has_active_subscription(track))
      and (select public.is_assigned('bank', id))
    )
  );

drop policy if exists banks_write on public.banks;
create policy banks_write on public.banks for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- ---- الملفّات والروابط ------------------------------------------------------
-- يصل الملفّ إمّا لأنّه أُرسل مفرداً، وإمّا لأنّ بنكه أُرسل.
drop policy if exists resources_read on public.resources;
create policy resources_read on public.resources for select to authenticated
  using (
    (select public.is_teacher())
    or (
      is_published
      and (select public.has_active_subscription(track))
      and (
        (select public.is_assigned('resource', id))
        or (bank_id is not null and (select public.is_assigned('bank', bank_id)))
      )
    )
  );

drop policy if exists resources_write on public.resources;
create policy resources_write on public.resources for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- ---- الاختبارات ------------------------------------------------------------
drop policy if exists quizzes_read on public.quizzes;
create policy quizzes_read on public.quizzes for select to authenticated
  using (
    (select public.is_teacher())
    or (
      is_published
      and (select public.has_active_subscription(track))
      and (
        (select public.is_assigned('quiz', id))
        or (bank_id is not null and (select public.is_assigned('bank', bank_id)))
      )
    )
  );

drop policy if exists quizzes_write on public.quizzes;
create policy quizzes_write on public.quizzes for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- ---- الأسئلة ---------------------------------------------------------------
-- ⚠️ الاستعلام الفرعي على `public.quizzes` يخضع لسياسة `quizzes_read` نفسها،
--    فلا يُعاد شرط الاشتراك والتوزيع هنا ولا يفترق عنه بمرور الوقت.
-- ⚠️ وشرط `opens_at`: اختبارٌ لم يُفتح بعد يظهر عنوانه ولا تظهر أسئلته.
drop policy if exists questions_read on public.quiz_questions;
create policy questions_read on public.quiz_questions for select to authenticated
  using (
    (select public.is_teacher())
    or exists (
      select 1 from public.quizzes q
      where q.id = quiz_questions.quiz_id
        and (q.opens_at is null or q.opens_at <= now())
    )
  );

drop policy if exists questions_write on public.quiz_questions;
create policy questions_write on public.quiz_questions for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- ---- الخيارات --------------------------------------------------------------
-- ⚠️ لا عمود صحّة هنا أصلاً (انظر 0004)، فليس في هذه السياسة ما يسرّب إجابة.
drop policy if exists options_read on public.quiz_options;
create policy options_read on public.quiz_options for select to authenticated
  using (
    (select public.is_teacher())
    or exists (
      select 1 from public.quiz_questions qq where qq.id = quiz_options.question_id
    )
  );

drop policy if exists options_write on public.quiz_options;
create policy options_write on public.quiz_options for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- ---- المحاولات والنتائج ----------------------------------------------------
-- ⚠️ قراءةٌ فقط للطالب على نتائجه هو. لا سياسة `insert` ولا `update` لأحد:
--    المحاولات تُكتب عبر دوالّ الخادم وحدها (`start_attempt`, `save_answer`,
--    `submit_attempt`)، وهي التي تفحص الاشتراك والموعد **لحظة الكتابة**.
--    ولو فُتح الإدراج المباشر لكتب الطالب درجته بنفسه.
drop policy if exists attempts_read on public.quiz_attempts;
create policy attempts_read on public.quiz_attempts for select to authenticated
  using (student_id = auth.uid() or (select public.is_teacher()));

drop policy if exists attempts_delete_teacher on public.quiz_attempts;
create policy attempts_delete_teacher on public.quiz_attempts for delete to authenticated
  using ((select public.is_teacher()));

drop policy if exists attempt_answers_read on public.attempt_answers;
create policy attempt_answers_read on public.attempt_answers for select to authenticated
  using (
    exists (
      select 1 from public.quiz_attempts a
      where a.id = attempt_answers.attempt_id
        and (a.student_id = auth.uid() or (select public.is_teacher()))
    )
  );
