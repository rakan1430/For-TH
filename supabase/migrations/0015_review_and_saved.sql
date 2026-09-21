-- =============================================================================
-- ٠٠١٥ — المراجعة بعد التسليم، والأسئلة المحفوظة
--
-- من ملحق «آلية الاختبارات» (§٦) وطلب المالك:
--   · شرحٌ يكتبه المعلّم — نصّاً أو صورة — يظهر **تحت السؤال الذي أخطأ فيه
--     الطالب**، بعد انتهاء الاختبار كاملاً لا أثناءه.
--   · مراجعةٌ تكشف الصحيح والخطأ وما اختاره الطالب.
--   · قسمٌ للطالب يحفظ فيه ما أخطأ فيه أو استصعبه.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) الشرح — **جدولٌ مستقلّ**، لا عمودان على السؤال
--
-- ⚠️⚠️ كتبتُه أوّلاً عمودين على `quiz_questions`، ثمّ نقضتُه: **سياسات
--    الصفوف تحرس الصفوف لا الأعمدة** — وهو الدرس نفسه الذي أخرج مفتاح
--    الإجابة إلى `private` في ٠٠٠٤. فأيّ طالبٍ يرى السؤال كان سيرى شرحه
--    في نفس الصفّ، **قبل أن يبدأ الاختبار**. وفي الشرح الحلّ.
--
--    فالشرح في جدولٍ له سياسته: لا يُقرأ إلّا بعد التسليم.
--
-- ⚠️ ولماذا ليس في `private` كمفتاح الإجابة؟ لأنّ المفتاح لا يُقرأ أبداً
--    من الشبكة — تصحّحه الدوالّ وحدها. والشرح **يُقرأ** فعلاً: يعرضه
--    الطالب في مراجعته. فهو في `public` بشرطٍ، لا خارجها بلا مسار.
--
-- ⚠️ ونصّاً **أو** صورة أو كليهما، كالسؤال نفسه: خطوات حلٍّ رياضيّة تُكتب
--    بخطّ اليد وتُصوَّر أسرع وأوضح من صياغتها نصّاً.
-- -----------------------------------------------------------------------------
create table if not exists public.question_explanations (
  question_id uuid primary key references public.quiz_questions(id) on delete cascade,
  body        text check (body is null or length(btrim(body)) <= 4000),
  image_path  text,
  updated_at  timestamptz not null default now(),
  check (coalesce(btrim(body), '') <> '' or image_path is not null)
);

comment on table public.question_explanations is
  'شرح حلّ السؤال — يُقرأ بعد التسليم وحده. في جدولٍ مستقلّ لأنّ RLS تحرس الصفوف لا الأعمدة.';

alter table public.question_explanations enable row level security;
alter table public.question_explanations force row level security;

drop trigger if exists question_explanations_touch on public.question_explanations;
create trigger question_explanations_touch before update on public.question_explanations
  for each row execute function private.touch_updated_at();

-- -----------------------------------------------------------------------------
-- ٢) الأسئلة المحفوظة — دفتر الطالب
--
-- ⚠️ `on delete cascade` على السؤال: لو حذف المعلّم سؤالاً، يختفي من دفاتر
--    الطلّاب بدل أن يبقى صفّاً معلّقاً يشير إلى لا شيء.
--
-- ⚠️ ولا عمود «صحيح/خطأ» هنا: الحفظ قرار الطالب لا نتيجة. قد يحفظ سؤالاً
--    أصابه وهو غير واثق — وهو ما طلبه المالك صراحةً.
-- -----------------------------------------------------------------------------
create table if not exists public.saved_questions (
  student_id  uuid not null references public.profiles(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  note        text check (note is null or length(btrim(note)) <= 500),
  saved_at    timestamptz not null default now(),
  primary key (student_id, question_id)
);

create index if not exists saved_questions_student_idx
  on public.saved_questions (student_id, saved_at desc);

alter table public.saved_questions enable row level security;
alter table public.saved_questions force row level security;

-- ⚠️ دفترُ الطالب له وحده — **ولا يراه المعلّم**. ما استصعبه الطالب ليس
--    تقييماً يُرفع، وإن عُرض على المعلّم صار الطالب يتردّد قبل أن يحفظ.
drop policy if exists saved_read on public.saved_questions;
create policy saved_read on public.saved_questions for select to authenticated
  using (student_id = auth.uid());

drop policy if exists saved_write on public.saved_questions;
create policy saved_write on public.saved_questions for all to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid() and (select public.is_identified()));

-- -----------------------------------------------------------------------------
-- ٣) هل يحقّ للمستدعي مراجعة هذا السؤال؟
--
-- ⚠️⚠️ الشرط: **سلّم** محاولةً في اختبارٍ يحوي هذا السؤال. لا «بدأ» — لأنّ
--    من يبدأ ثمّ يقرأ الشرح قد كشف الإجابة قبل أن يجيب. و`submitted` وحدها.
--
-- ⚠️ ولا يُشترط أن يكون الاختبار ما زال منشوراً: الطالب سلّم فعلاً، ومراجعة
--    ما فعله حقُّه ولو سحب المعلّم الاختبار بعده. (بخلاف حارس **الكتابة**
--    الذي يشترط النشر — فذاك فعلٌ جديد، وهذا قراءةُ ماضٍ.)
-- -----------------------------------------------------------------------------
create or replace function public.may_review_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_teacher()
      or exists (
           select 1
           from public.quiz_attempts a
           join public.quiz_questions qq on qq.quiz_id = a.quiz_id
           where a.student_id = auth.uid()
             and a.status = 'submitted'
             and qq.id = p_question_id
         );
$$;

comment on function public.may_review_question(uuid) is
  'سلّم المستدعي محاولةً في اختبارٍ يحوي هذا السؤال — فيحقّ له شرحُه ومفتاحه.';

-- ⚠️ سياسة الشرح: تُكتب هنا لا فوق، لأنّها تستدعي الدالّة أعلاه.
drop policy if exists explanations_read on public.question_explanations;
create policy explanations_read on public.question_explanations for select to authenticated
  using ((select public.may_review_question(question_id)));

drop policy if exists explanations_write on public.question_explanations;
create policy explanations_write on public.question_explanations for all to authenticated
  using ((select public.is_teacher())) with check ((select public.is_teacher()));

-- -----------------------------------------------------------------------------
-- ٤) المراجعة — الدالّة الوحيدة التي تُخرج الصحيح من `private`
--
-- ⚠️⚠️ «الإجابات الصحيحة لا تُرسل لجهاز الطالب قبل التسليم.» وهذه الدالّة
--    هي الاستثناء الوحيد، وشرطها أعلاه. ولا تقبل معرّف طالبٍ وسيطاً —
--    تسأل عن المستدعي وحده، وإلّا صارت بابَ استكشافٍ لمحاولات غيره.
--
-- ⚠️ وتُعيد **كل** أسئلة الاختبار لا ما أخطأ فيه وحده: الطالب يراجع اختباره
--    كاملاً، ولوحة الأرقام في الواجهة تحتاج حالة كل سؤال.
-- -----------------------------------------------------------------------------
create or replace function public.attempt_review(p_attempt_id uuid)
returns table (
  question_id            uuid,
  -- ⚠️ `q_position` لا `position`: الأخيرة كلمةٌ محجوزة في Postgres (دالّة
  --    `position(x in y)`) ولا تصلح اسمَ عمودٍ في `returns table` بلا
  --    اقتباس. والاقتباس يُنسى عند أوّل تعديل، فالتسمية الصريحة أسلم.
  q_position             integer,
  prompt                 text,
  prompt_image_path      text,
  points                 numeric,
  explanation            text,
  explanation_image_path text,
  chosen_option_id       uuid,
  correct_option_id      uuid,
  is_correct             boolean,
  is_saved               boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_a   public.quiz_attempts%rowtype;
begin
  if v_uid is null then
    raise exception 'لا جلسة' using errcode = '28000';
  end if;

  select * into v_a from public.quiz_attempts a where a.id = p_attempt_id;

  -- ⚠️ «غير موجودة» لمحاولة غيري كذلك: لو قيل «ليست لك» لأمكن استكشافُ
  --    أيّ المعرّفات حقيقيّة — والفرق بين الردّين تسريبٌ صغير يُجمَع.
  if v_a.id is null or (v_a.student_id <> v_uid and not public.is_teacher()) then
    raise exception 'لا محاولة بهذا المعرّف' using errcode = '42501';
  end if;

  if v_a.status <> 'submitted' then
    raise exception 'المراجعة بعد التسليم' using errcode = '42501';
  end if;

  return query
  select qq.id,
         qq.position,
         qq.prompt,
         qq.prompt_image_path,
         qq.points,
         ex.body,
         ex.image_path,
         aa.option_id,
         (select ak.option_id from private.answer_key ak where ak.question_id = qq.id limit 1),
         aa.is_correct,
         exists (select 1 from public.saved_questions sq
                  where sq.student_id = v_uid and sq.question_id = qq.id)
  from public.quiz_questions qq
  left join public.question_explanations ex on ex.question_id = qq.id
  left join public.attempt_answers aa
         on aa.question_id = qq.id and aa.attempt_id = p_attempt_id
  where qq.quiz_id = v_a.quiz_id
  order by qq.position;
end;
$$;

-- -----------------------------------------------------------------------------
-- ٥) حفظ سؤالٍ في دفتر المراجعة ونزعه
--
-- ⚠️ لا يُحفظ إلّا ما يحقّ للطالب مراجعته — وإلّا صار الحفظ بابَ استكشاف:
--    يحفظ معرّفات أسئلةٍ لم يرها ثمّ يقرؤها من قسم المراجعة.
-- -----------------------------------------------------------------------------
create or replace function public.save_question(p_question_id uuid, p_note text default null)
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'لا جلسة' using errcode = '28000';
  end if;

  if not public.may_review_question(p_question_id) then
    return query select false, 'not_reviewable'::text; return;
  end if;

  insert into public.saved_questions (student_id, question_id, note)
  values (v_uid, p_question_id, nullif(btrim(p_note), ''))
  on conflict (student_id, question_id)
    do update set note = excluded.note, saved_at = now();

  return query select true, 'saved'::text;
end;
$$;

create or replace function public.unsave_question(p_question_id uuid)
returns table (ok boolean, reason text)
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'لا جلسة' using errcode = '28000';
  end if;
  delete from public.saved_questions
   where student_id = v_uid and question_id = p_question_id;
  return query select true, 'removed'::text;
end;
$$;

-- -----------------------------------------------------------------------------
-- ٦) دفتر المراجعة — يُقرأ بالدالّة لا بالجدول، ليحمل الشرح والمفتاح
-- -----------------------------------------------------------------------------
create or replace function public.my_saved_questions()
returns table (
  question_id            uuid,
  quiz_id                uuid,
  quiz_title             text,
  track                  public.track_t,
  prompt                 text,
  prompt_image_path      text,
  explanation            text,
  explanation_image_path text,
  correct_option_id      uuid,
  note                   text,
  saved_at               timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'لا جلسة' using errcode = '28000';
  end if;

  return query
  select qq.id, q.id, q.title, q.track,
         qq.prompt, qq.prompt_image_path,
         ex.body, ex.image_path,
         (select ak.option_id from private.answer_key ak where ak.question_id = qq.id limit 1),
         sq.note, sq.saved_at
  from public.saved_questions sq
  join public.quiz_questions qq on qq.id = sq.question_id
  join public.quizzes q         on q.id  = qq.quiz_id
  left join public.question_explanations ex on ex.question_id = qq.id
  where sq.student_id = v_uid
    -- ⚠️ الشرط يُعاد فحصه عند **كل قراءة** لا عند الحفظ وحده: لو حُذفت
    --    محاولات الطالب يوماً، أو تغيّر حقّه، لا يبقى الشرح مقروءاً لأنّه
    --    حُفظ يوم كان يحقّ له. البند ٧ في موضعٍ آخر.
    and public.may_review_question(qq.id)
  order by sq.saved_at desc;
end;
$$;

-- -----------------------------------------------------------------------------
-- ٧) الصلاحيات
-- -----------------------------------------------------------------------------
revoke all on function public.may_review_question(uuid)        from public, anon;
revoke all on function public.attempt_review(uuid)             from public, anon;
revoke all on function public.save_question(uuid, text)        from public, anon;
revoke all on function public.unsave_question(uuid)            from public, anon;
revoke all on function public.my_saved_questions()             from public, anon;
grant execute on function public.may_review_question(uuid)     to authenticated;
grant execute on function public.attempt_review(uuid)          to authenticated;
grant execute on function public.save_question(uuid, text)     to authenticated;
grant execute on function public.unsave_question(uuid)         to authenticated;
grant execute on function public.my_saved_questions()          to authenticated;

revoke all on table public.saved_questions from public, anon;
grant select, insert, update, delete on table public.saved_questions to authenticated;

revoke all on table public.question_explanations from public, anon;
grant select, insert, update, delete on table public.question_explanations to authenticated;
