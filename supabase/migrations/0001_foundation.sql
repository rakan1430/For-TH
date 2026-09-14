-- =============================================================================
-- ٠٠٠١ — الأساس: الأنواع، والمخطّط الخاصّ، والدورين الاثنين
--
-- ⚠️ الأدوار اثنان فقط: المعلّم (مالك واحد) والطالب المشترك.
--    لا «إدارة» ولا «مشرف» ولا «مساعد» — حسم المالك ذلك. لا تُضف دوراً
--    ثالثاً بحجّة المرونة.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- المخطّط الخاصّ: ما لا يجوز أن تصل إليه شبكةٌ إطلاقاً
--
-- واجهة PostgREST في Supabase تكشف مخطّط `public` وحده. فما يوضع هنا ليس
-- «محمياً بسياسة قد تُنسى» — بل خارج سطح الشبكة أصلاً. وهذا الفرق جوهري:
-- السياسة تُنسى، وغياب المسار لا يُنسى.
-- -----------------------------------------------------------------------------
create schema if not exists private;
revoke all on schema private from public;

-- -----------------------------------------------------------------------------
-- الأنواع
-- -----------------------------------------------------------------------------

-- ⚠️ المساران. القدرات هنا = القسم **الكمّي** فقط. لا لفظي — خارج النطاق.
do $$ begin
  create type public.track_t as enum ('qudurat', 'tahsili');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.plan_period_t as enum ('monthly', 'quarterly');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.pay_method_t as enum ('gateway', 'transfer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.request_status_t as enum ('pending', 'accepted', 'rejected');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.item_type_t as enum ('section', 'bank', 'resource', 'quiz');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.audience_t as enum ('track', 'group', 'student');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.resource_kind_t as enum ('file', 'link', 'image');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.quiz_scope_t as enum ('bank', 'general');
exception when duplicate_object then null; end $$;

-- «مسجَّل (دائم)» يُعاد أكثر من مرّة بلا مشاكل · «مؤقّت» لمرّةٍ وينتهي
do $$ begin
  create type public.quiz_retention_t as enum ('permanent', 'temporary');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.attempt_status_t as enum ('in_progress', 'submitted');
exception when duplicate_object then null; end $$;

-- -----------------------------------------------------------------------------
-- المعلّم
--
-- ⚠️ لماذا جدولٌ في `private` ولا عمود `role` في `profiles`؟
--    لأنّ عمود الدور في جدولٍ يملك الطالب تعديل صفّه فيه هو باب ترقيةٍ
--    ذاتية: سياسةٌ واحدة مكتوبة بتساهل، فيصير الطالب معلّماً. وهنا لا
--    يوجد هذا الباب أصلاً — الجدول خارج مخطّط الواجهة، ولا سياسة تفتحه،
--    ولا مسار شبكة يصل إليه. يُضاف المعلّم بـ SQL مباشرةً مرّةً واحدة.
-- -----------------------------------------------------------------------------
create table if not exists private.teachers (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  note     text
);

-- -----------------------------------------------------------------------------
-- ملفّ المستخدم — لا عمود دور فيه، بعمد
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  full_name  text not null check (length(btrim(full_name)) between 2 and 120),
  grade      text check (grade is null or length(btrim(grade)) <= 60),  -- الصفّ
  contact    text check (contact is null or length(btrim(contact)) <= 40), -- رقم التواصل
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- تحديث `updated_at` تلقائياً
-- -----------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
