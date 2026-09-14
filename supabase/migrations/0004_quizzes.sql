-- =============================================================================
-- ٠٠٠٤ — الاختبارات
--
-- ⚠️⚠️ قراران بنيويّان لا يُنقَضان لاحقاً:
--
--   ١) **مفتاح الإجابة لا يعيش في `public` إطلاقاً.** لا عمود `is_correct`
--      في `quiz_options`. لأنّ سياسات الصفوف تحرس الصفوف لا الأعمدة: أي
--      استعلامٍ يرى الخيار يرى كل أعمدته. فالإجابة في `private.answer_key`،
--      خارج مخطّط الواجهة أصلاً، ولا مسار شبكة يبلغها (البند ٨).
--
--   ٢) **المحاولات المتعدّدة من اليوم الأوّل.** مفتاح النتيجة هو
--      (الاختبار + الطالب + **رقم المحاولة**) لا (الاختبار + الطالب).
--      المشروع السابق بُني على محاولةٍ واحدة ثم رُقّع؛ وهنا المتطلَّب واضح:
--      «الاختبار المسجَّل يُعاد أكثر من مرّة بلا مشاكل».
-- =============================================================================

create table if not exists public.quizzes (
  id           uuid primary key default gen_random_uuid(),
  track        public.track_t not null,

  -- اختبار بنك: قصير، على دروس بنكه · اختبار عامّ: كبير، على أقسام كاملة
  scope        public.quiz_scope_t not null,
  bank_id      uuid,
  section_id   uuid,

  title        text not null check (length(btrim(title)) between 1 and 200),

  -- مسجَّل (دائم) يبقى للتدريب · مؤقّت يُنشأ لمرّة وينتهي
  retention    public.quiz_retention_t not null default 'permanent',
  is_published boolean not null default false,

  opens_at     timestamptz,
  due_at       timestamptz,                    -- موعد التسليم: اختياري
  time_limit_minutes integer                    -- المؤقّت: اختياري
    check (time_limit_minutes is null or time_limit_minutes between 1 and 600),

  -- ⚠️ NULL = بلا حدّ، وهو الافتراضي للاختبار المسجَّل. لا تجعله 1 «تبسيطاً».
  max_attempts integer check (max_attempts is null or max_attempts >= 1),

  position     integer not null default 0,
  created_at   timestamptz not null default now(),

  unique (id, track),
  check (scope <> 'bank'    or bank_id is not null),
  check (scope <> 'general' or bank_id is null),
  check (due_at is null or opens_at is null or due_at > opens_at)
);

alter table public.quizzes drop constraint if exists quizzes_bank_same_track;
alter table public.quizzes add constraint quizzes_bank_same_track
  foreign key (bank_id, track) references public.banks(id, track)
  on update cascade on delete cascade;

alter table public.quizzes drop constraint if exists quizzes_section_same_track;
alter table public.quizzes add constraint quizzes_section_same_track
  foreign key (section_id, track) references public.sections(id, track)
  on update cascade on delete restrict;

-- -----------------------------------------------------------------------------
-- الأسئلة — نصّية أو بصور، ولا حدّ أعلى صغير لعددها
-- -----------------------------------------------------------------------------
create table if not exists public.quiz_questions (
  id                uuid primary key default gen_random_uuid(),
  quiz_id           uuid not null references public.quizzes(id) on delete cascade,
  position          integer not null default 0,
  prompt            text,
  -- ⚠️ مسارٌ في مخزنٍ مقيّد. الرابط يُوقَّع ويُؤقَّت عند العرض، ولا يكون
  --    عامّاً دائماً: طالبٌ من خارج الاختبار لا يفتح صورته (البند ٩).
  prompt_image_path text,
  points            numeric(6,2) not null default 1 check (points > 0),
  check (coalesce(btrim(prompt), '') <> '' or prompt_image_path is not null),
  -- مؤجَّل: إعادة الترتيب تبدّل مواضع، والتبديل يمرّ بحالةٍ متضاربة مؤقّتاً
  constraint quiz_questions_position_uniq unique (quiz_id, position)
    deferrable initially deferred
);

-- -----------------------------------------------------------------------------
-- الخيارات — نصّية أو بصور
--
-- ⚠️ لاحظ ما **ليس** هنا: لا عمود `is_correct`. هذا ليس سهواً.
-- -----------------------------------------------------------------------------
create table if not exists public.quiz_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  position    integer not null default 0,
  label       text,
  image_path  text,
  check (coalesce(btrim(label), '') <> '' or image_path is not null),
  constraint quiz_options_position_uniq unique (question_id, position)
    deferrable initially deferred
);

-- -----------------------------------------------------------------------------
-- ⚠️⚠️ مفتاح الإجابة — خارج مخطّط الواجهة
--
-- «الإجابات الصحيحة لا تُرسل لجهاز الطالب قبل التسليم — من يفتح أدوات
--  المطوّر يقرأها.»
--
-- لا `grant` على هذا الجدول لأي دور. تقرأه دوالّ التصحيح وحدها بصلاحية
-- مالكها، ولا تُخرج منه شيئاً إلا الدرجة.
-- -----------------------------------------------------------------------------
create table if not exists private.answer_key (
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  option_id   uuid not null references public.quiz_options(id)   on delete cascade,
  primary key (question_id, option_id)
);

create index if not exists answer_key_question_idx on private.answer_key (question_id);

-- -----------------------------------------------------------------------------
-- المحاولات
-- -----------------------------------------------------------------------------
create table if not exists public.quiz_attempts (
  id           uuid primary key default gen_random_uuid(),
  quiz_id      uuid not null references public.quizzes(id) on delete cascade,
  student_id   uuid not null references public.profiles(id) on delete cascade,
  attempt_no   integer not null check (attempt_no >= 1),
  status       public.attempt_status_t not null default 'in_progress',
  started_at   timestamptz not null default now(),
  -- المهلة محسوبة لحظة البدء: الخادم لا يثق بمؤقّت المتصفّح
  expires_at   timestamptz,
  submitted_at timestamptz,
  score        numeric(8,2),
  max_score    numeric(8,2),

  -- ⚠️ البند ٦ — هذا هو السطر الذي يجعل الإعادة تعمل «بلا مشاكل»
  constraint quiz_attempts_per_attempt_uniq unique (quiz_id, student_id, attempt_no),

  check ((status = 'submitted') = (submitted_at is not null)),
  check ((status = 'submitted') = (score is not null))
);

create index if not exists quiz_attempts_student_idx
  on public.quiz_attempts (student_id, quiz_id, attempt_no desc);

-- -----------------------------------------------------------------------------
-- إجابات المحاولة
--
-- ⚠️ `is_correct` يبقى NULL حتى لحظة التسليم. لا تُكتب قيمته عند الحفظ
--    المرحلي، وإلا صار الحفظ المرحلي قناةً يستخرج بها الطالب مفتاح الإجابة
--    سؤالاً سؤالاً قبل أن يسلّم.
-- -----------------------------------------------------------------------------
create table if not exists public.attempt_answers (
  attempt_id  uuid not null references public.quiz_attempts(id) on delete cascade,
  question_id uuid not null references public.quiz_questions(id) on delete cascade,
  option_id   uuid references public.quiz_options(id) on delete set null,
  is_correct  boolean,
  answered_at timestamptz not null default now(),
  primary key (attempt_id, question_id)
);
