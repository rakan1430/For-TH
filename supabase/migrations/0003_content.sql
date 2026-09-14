-- =============================================================================
-- ٠٠٠٣ — المحتوى: الأقسام، والبنوك، والملفّات والروابط، والمجموعات، والتوزيع
--
-- ⚠️ الفصل بين المسارين مفروضٌ هنا **بنيوياً** لا بالاتّفاق:
--    كل صفّ محتوىً يحمل `track`، وكل ارتباطٍ بين صفّين يمرّ بمفتاح أجنبيّ
--    **مركّب** يحمل `track` معه. فبنكٌ في القدرات لا يمكن أن يُسنَد إلى قسمٍ
--    في التحصيلي — لا لأنّ الشفرة تتذكّر أن تمنع، بل لأنّ القيد يرفض.
--    والسياسات في `0005` تحرس القراءة؛ وهذه القيود تحرس البنية نفسها.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- الأقسام — «المعلّم يقسّم الصفحة التي يراها الطالب كما يريد»
--
-- ليست بنيةً ثابتة يفرضها النظام (لا «الصف الأول ثانوي»، ولا «الفصل
-- الدراسي الثاني»): مجرّد عناوين يرتّبها المعلّم كما يشاء.
-- -----------------------------------------------------------------------------
create table if not exists public.sections (
  id         uuid primary key default gen_random_uuid(),
  track      public.track_t not null,
  title      text not null check (length(btrim(title)) between 1 and 160),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  -- لازمٌ للمفاتيح الأجنبية المركّبة أدناه
  unique (id, track)
);

-- -----------------------------------------------------------------------------
-- البنوك — أهمّ ميزة طلبها المالك صراحةً
--
-- حاوية يضع فيها المعلّم ملفّاتٍ **بالترتيب الذي يريده هو**: لا أبجدياً ولا
-- زمنياً. ولهذا `position` عمودٌ يكتبه المعلّم، ولا ترتيب ضمنيّ بـ`created_at`.
-- -----------------------------------------------------------------------------
create table if not exists public.banks (
  id           uuid primary key default gen_random_uuid(),
  track        public.track_t not null,
  section_id   uuid,
  title        text not null check (length(btrim(title)) between 1 and 160),
  description  text,
  position     integer not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (id, track)
);

-- القسم والبنك في المسار نفسه — يفرضه المفتاح المركّب لا الشفرة.
-- ملاحظة: `section_id` قد يكون NULL (بنك بلا قسم)، و MATCH SIMPLE لا يفحص
-- القيد حينها — وهذا هو السلوك المطلوب بالضبط.
alter table public.banks drop constraint if exists banks_section_same_track;
alter table public.banks add constraint banks_section_same_track
  foreign key (section_id, track) references public.sections(id, track)
  on update cascade on delete restrict;

-- -----------------------------------------------------------------------------
-- الملفّات والروابط والصور
--
-- ⚠️ `bank_id` قد يكون NULL: «يجوز أن يرفع المعلّم ملفاً أو رابطاً مفرداً بلا
--    بنك. البنوك تنظيم اختياري لا إجباري.»
-- -----------------------------------------------------------------------------
create table if not exists public.resources (
  id           uuid primary key default gen_random_uuid(),
  track        public.track_t not null,
  bank_id      uuid,
  section_id   uuid,
  kind         public.resource_kind_t not null,
  title        text not null check (length(btrim(title)) between 1 and 200),
  -- ملفٌّ في مخزنٍ مقيّد، أو رابط خارجي — أحدهما لا كلاهما
  storage_path text,
  url          text,
  position     integer not null default 0,
  is_published boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (id, track),
  check (
    (kind = 'link'            and url is not null and storage_path is null) or
    (kind in ('file','image') and storage_path is not null and url is null)
  ),
  check (url is null or url ~ '^https://')   -- لا http عاري ولا javascript:
);

alter table public.resources drop constraint if exists resources_bank_same_track;
alter table public.resources add constraint resources_bank_same_track
  foreign key (bank_id, track) references public.banks(id, track)
  on update cascade on delete cascade;

alter table public.resources drop constraint if exists resources_section_same_track;
alter table public.resources add constraint resources_section_same_track
  foreign key (section_id, track) references public.sections(id, track)
  on update cascade on delete restrict;

create index if not exists resources_bank_idx on public.resources (bank_id, position);
create index if not exists banks_track_idx    on public.banks (track, position);

-- -----------------------------------------------------------------------------
-- المجموعات — يقسّمها المعلّم كما يريد («متقدّم»، «تأسيس»)
--
-- ⚠️ لا مراحل دراسية مفروضة ولا فصول رسمية — خارج النطاق صراحةً.
-- ⚠️ والمجموعة تتبع مساراً واحداً (قرار ق-٤ في سجلّ المشروع): مجموعةٌ تعبر
--    المسارين تجعل «أرسل إلى متقدّم» أمراً غامضاً، وتفتح طريقاً لتسريب
--    محتوى مسارٍ إلى مشتركي الآخر. والمعلّم ينشئ «متقدّم» في كل مسار.
-- -----------------------------------------------------------------------------
create table if not exists public.groups (
  id         uuid primary key default gen_random_uuid(),
  track      public.track_t not null,
  name       text not null check (length(btrim(name)) between 1 and 80),
  -- وسم المجموعة: حدّ جانبيّ ملوّن على الحافة يميّزها
  color      text not null default '#85ABE6' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position   integer not null default 0,
  created_at timestamptz not null default now(),
  unique (track, name),
  unique (id, track)
);

create table if not exists public.group_members (
  group_id   uuid not null references public.groups(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  added_at   timestamptz not null default now(),
  primary key (group_id, student_id)
);

-- -----------------------------------------------------------------------------
-- التوزيع — إلى مجموعة، أو إلى طلّاب بأسمائهم، أو إلى كل مشتركي مسار
-- -----------------------------------------------------------------------------
create table if not exists public.assignments (
  id         uuid primary key default gen_random_uuid(),
  track      public.track_t not null,
  item_type  public.item_type_t not null,
  item_id    uuid not null,
  audience   public.audience_t not null,
  group_id   uuid,
  student_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id),
  check (
    (audience = 'track'   and group_id is null     and student_id is null)     or
    (audience = 'group'   and group_id is not null and student_id is null)     or
    (audience = 'student' and group_id is null     and student_id is not null)
  )
);

-- المجموعة المستهدَفة في مسار المحتوى نفسه
alter table public.assignments drop constraint if exists assignments_group_same_track;
alter table public.assignments add constraint assignments_group_same_track
  foreign key (group_id, track) references public.groups(id, track)
  on update cascade on delete cascade;

-- ⚠️⚠️ قيد التكرار الذي أنتج «النجاح الكاذب» (البند ٤).
--     صفٌّ واحد مرفوض لتكرار المفتاح كان يُسقط الإدراج الجماعي كلّه، فيرى
--     المعلّم «أُرسل ✅» ولا يصل أحداً شيء. القيد صحيح ويبقى — والعلاج في
--     `public.assign_items`: تقرأ الموجود أوّلاً، وتُدرج الجديد وحده، وتُبلغ
--     بعددين صريحين: كم أُنشئ وكم كان موجوداً.
create unique index if not exists assignments_unique_target
  on public.assignments (
    item_type, item_id, audience,
    coalesce(group_id,   '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(student_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

create index if not exists assignments_lookup_idx
  on public.assignments (item_type, item_id);
create index if not exists assignments_student_idx
  on public.assignments (student_id) where student_id is not null;
create index if not exists group_members_student_idx
  on public.group_members (student_id);
