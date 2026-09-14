-- =============================================================================
-- ٠٠٠٢ — الخطط والاشتراكات وطلبات الاشتراك
--
-- ⚠️ اشتراكان مستقلّان تماماً: قد يشترك الطالب في مسار، أو في الاثنين، أو
--    ينتهي أحدهما ويبقى الآخر. لا اشتراك «عامّ» يفتح المسارين.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- الخطط
--
-- ⚠️⚠️ `price_minor` قد يكون NULL — وهذا **مقصود ولا يُملأ باجتهاد**.
--      الأسعار لم يحدّدها المالك بعد. NULL تعني «[السعر]» في الواجهة تماماً
--      كما في اللوحات المعتمدة. أي رقمٍ يوضع هنا الآن رقمٌ مخترَع، وسيصل
--      طالباً ويُظنّ ملزماً.
--      والقيمة بالوحدة الصغرى (هللات) لا بالريالات — لا حساب نقود بعشريّ
--      عائم أبداً.
-- -----------------------------------------------------------------------------
create table if not exists public.plans (
  id          uuid primary key default gen_random_uuid(),
  track       public.track_t not null,
  period      public.plan_period_t not null,
  price_minor integer check (price_minor is null or price_minor >= 0),
  currency    char(3) not null default 'SAR',
  is_active   boolean not null default true,
  unique (track, period)
);

comment on column public.plans.price_minor is
  'بالهللات. NULL = لم يحدّده المالك بعد؛ تعرضه الواجهة «[السعر]». لا تخترع قيمة.';

-- -----------------------------------------------------------------------------
-- الاشتراكات
--
-- ⚠️ لا عمود `status` محفوظ. السريان يُحسب من التاريخ لحظة السؤال:
--    عمودٌ محفوظ يحتاج مهمّةً مجدولة تُحدّثه، وإن تأخّرت المهمّة ساعةً بقي
--    اشتراكٌ منتهٍ «سارياً» وقرأ صاحبه محتوىً لا يحقّ له. الحساب من التاريخ
--    لا يتأخّر أبداً.
--    و`is_revoked` وحده محفوظ لأنّه قرار المعلّم لا دالّة الزمن.
-- -----------------------------------------------------------------------------
create table if not exists public.subscriptions (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references public.profiles(id) on delete cascade,
  track             public.track_t not null,
  starts_on         date not null,
  ends_on           date not null,
  is_revoked        boolean not null default false,
  source_request_id uuid,
  created_at        timestamptz not null default now(),
  created_by        uuid references public.profiles(id),
  check (ends_on >= starts_on)
);

create index if not exists subscriptions_student_track_idx
  on public.subscriptions (student_id, track, ends_on desc);

-- -----------------------------------------------------------------------------
-- طلبات الاشتراك
--
-- دورة الطلب: الطالب يختار خطّة ← يدفع ← يرسل طلباً ← المعلّم يقبل أو يرفض.
-- -----------------------------------------------------------------------------
create table if not exists public.subscription_requests (
  id           uuid primary key default gen_random_uuid(),
  student_id   uuid not null references public.profiles(id) on delete cascade,
  track        public.track_t not null,
  plan_id      uuid not null references public.plans(id) on delete restrict,

  -- بيانات الطلب كما طلبها المالك: الاسم، الصفّ، رقم التواصل، وصورة الإيصال
  full_name    text not null check (length(btrim(full_name)) between 2 and 120),
  grade        text,
  contact      text not null check (length(btrim(contact)) between 5 and 40),

  method       public.pay_method_t not null,
  -- ⚠️ مسارٌ داخل مخزنٍ مقيّد، لا رابط عامّ. الإيصال يحمل بيانات بنكية،
  --    ورابطه يُوقَّع ويُؤقَّت عند العرض (البند ٩).
  receipt_path text,

  status       public.request_status_t not null default 'pending',
  note         text,
  created_at   timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references public.profiles(id),

  -- إيصال التحويل إلزامي لمسار التحويل — وإلا فالطلب بلا دليل دفع
  check (method <> 'transfer' or receipt_path is not null),
  -- الحالة والقرار متلازمان: لا «مقبول» بلا تاريخ قرار، ولا «معلّق» ومعه واحد
  check ((status = 'pending') = (decided_at is null)),
  check ((status = 'pending') = (decided_by is null))
);

-- ⚠️ طلبٌ معلّق واحد لكل طالب لكل مسار.
--    وهذا بالضبط نوع القيد الذي أنتج «النجاح الكاذب» في المشروع السابق
--    (البند ٤): صفٌّ مرفوض أسقط الإدراج كلّه، وابتلعت الشفرة الخطأ بوصفه
--    «إعادة إرسال عادية». فكل مسارٍ يصطدم بهذا القيد يجب أن **يقرأ الموجود
--    أوّلاً** ويُبلغ صراحةً — انظر `public.request_subscription`.
create unique index if not exists subscription_requests_one_pending
  on public.subscription_requests (student_id, track)
  where status = 'pending';

create index if not exists subscription_requests_pending_idx
  on public.subscription_requests (status, created_at desc);

alter table public.subscriptions
  add constraint subscriptions_source_request_fk
  foreign key (source_request_id) references public.subscription_requests(id) on delete set null;
