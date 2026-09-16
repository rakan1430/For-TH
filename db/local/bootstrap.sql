-- =============================================================================
-- تهيئة قاعدة محلّية تشبه Supabase — **للتطوير والاختبار وحدهما**
--
-- ⚠️ هذا الملفّ ليس مهاجرة ولا يُطبَّق على الإنتاج إطلاقاً. Supabase يوفّر
--    مخطّط `auth` والدوار `anon`/`authenticated`/`service_role` جاهزة؛ وهنا
--    نصنع أقلّ ما يكفي منها لتعمل المهاجرات نفسها بلا تعديل — فما يُختبَر
--    محلّياً هو الشفرة التي تذهب إلى الإنتاج، لا نسخةٌ منها.
-- =============================================================================

-- ---- الأدوار ----
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end $$;

-- ---- مخطّط المصادقة ----
create schema if not exists auth;

create table if not exists auth.users (
  id    uuid primary key,
  email text unique
);

-- تطابق سلوك Supabase: المعرّف يأتي من مطالبات الرمز، لا من اسم دور القاعدة
-- ⚠️ لاحظ موضع `nullif`: **قبل** التحويل إلى jsonb لا بعده.
--    لو كُتبت `current_setting(...)::jsonb` أوّلاً لرفعت خطأً (22P02) حين
--    تكون القيمة نصّاً فارغاً — أي عند كل طلبٍ بلا رمز. فتنقلب «لا هوية»
--    من NULL هادئة إلى استثناءٍ يُسقط الاستعلام.
--    وقعت هذه هنا فعلاً: رسب فحصٌ برمز خطأٍ غير متوقَّع فكشفها. وهذا هو
--    الفرق بين محاكاةٍ أمينة ومحاكاةٍ «تعمل عندي».
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', ''
  )::uuid;
$$;

-- ⚠️⚠️ تقليد صلاحيات Supabase الافتراضية — وهذا **جوهر الفحص** لا تفصيل:
--    Supabase يمنح `EXECUTE` على كل دالّةٍ جديدة في `public` للأدوار
--    `anon` و`authenticated` و`service_role` **بأسمائها**. وكانت القاعدة
--    المحلّية بلا هذا، فبدا سحبُ `PUBLIC` وحده كافياً — ومرّ الفحص بينما
--    كان كل زائرٍ مجهول في الإنتاج يستطيع استدعاء كل دالّة.
--    فمن الآن: بيئة الفحص تشبه الإنتاج في هذا، ليرسب الفحص حين يجب.
--    (على `public` وحده، كما يفعل Supabase فعلاً — ولا صلاحيات افتراضية
--     لمخطّطٍ لم يُنشأ بعد.)
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
grant select on auth.users to service_role;

-- =============================================================================
-- أدوات الاختبار — لا وجود لها في الإنتاج
--
-- توضع في مخطّط `testing` قصداً: لو وُضعت في `public` لظهرت في فحص الصلاحيات
-- بوصفها دوالَّ مكشوفة، ولصار على المشروع أن يستثنيها — واستثناءٌ في فحص
-- أمنيّ بابٌ يُنسى مفتوحاً.
-- =============================================================================
create schema if not exists testing;
grant usage on schema testing to anon, authenticated, service_role;

-- ⚠️ لا جدول نتائج هنا بعمد. الفحوص تُجرى داخل معاملات تُلغى بعدها لتبقى
-- مستقلّةً عن بعضها، والإلغاء يمحو أي صفٍّ كُتب فيها — فتضيع النتائج نفسها
-- مع البيانات، ويبدو الفحص وكأنّه لم يُجرِ شيئاً.
-- فالنجاح يُعلَن بـ`notice` (لا يُلغى)، والفشل يرفع استثناءً يوقف البناء
-- كلّه بـ`ON_ERROR_STOP=1`. والعدّ يقع في الصَّدفة على السطور المطبوعة.
create or replace function testing.eq(
  p_actual anyelement, p_expected anyelement, p_label text
) returns void
language plpgsql
as $$
begin
  if p_actual is not distinct from p_expected then
    raise notice 'PASS|%|= %', p_label, p_expected;
  else
    raise exception 'فشل التحقّق: %  — توقّعنا % فجاء %', p_label, p_expected, p_actual;
  end if;
end;
$$;

create or replace function testing.ok(p_cond boolean, p_label text)
returns void language plpgsql as $$
begin
  perform testing.eq(coalesce(p_cond, false), true, p_label);
end;
$$;

-- يتوقّع أن يفشل ما بداخله. يُستعمل لإثبات المنع: «هذا الاستدعاء يجب أن
-- يُرفَض» — ولو نجح فذلك هو العطل.
--
-- ⚠️ ويشترط رمز خطأٍ متوقَّعاً: لولا ذلك لمرّ الفحص على خطأٍ مطبعيٍّ في اسم
--    جدول («العلاقة غير موجودة») فبدا منعاً أمنياً وهو ليس كذلك. فحصٌ يقبل
--    أي فشلٍ يقبل الفشل الخطأ.
create or replace function testing.denied(
  p_sql text, p_label text, p_sqlstates text[] default array['42501','42883','28000']
) returns void
language plpgsql
as $$
declare v_state text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics v_state = returned_sqlstate;
    if v_state = any (p_sqlstates) then
      raise notice 'PASS|%|رُفض بـ %', p_label, v_state;
      return;
    end if;
    raise exception 'فشل التحقّق: % — رُفض بسبب غير متوقَّع (%): %',
      p_label, v_state, p_sql;
  end;
  raise exception 'فشل التحقّق: % — كان يجب أن يُرفَض فنُفِّذ', p_label;
end;
$$;

-- ⚠️ التحديث والحذف تحت سياسات الصفوف **لا يرفعان خطأً**: تمرّ العبارة
-- وتمسّ صفراً من الصفوف. (الإدراج وحده يرفع 42501.) فادّعاء «مُنع» في غير
-- محلّه يجعل الفحص يبحث عن خطأٍ لا يأتي أبداً.
-- والادّعاء الصحيح هنا: كم صفّاً تأثّر فعلاً؟ صفرٌ يعني أنّ شيئاً لم يتغيّر.
create or replace function testing.affects(
  p_sql text, p_expected integer, p_label text
) returns void
language plpgsql
as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  perform testing.eq(n, p_expected, p_label);
end;
$$;

-- يعدّ صفوف استعلامٍ بصلاحيات الدور الحالي (تسري عليه سياسات الصفوف)
create or replace function testing.count_of(p_sql text)
returns integer
language plpgsql
as $$
declare n integer;
begin
  execute format('select count(*) from (%s) _t', p_sql) into n;
  return n;
end;
$$;

grant execute on function testing.eq(anyelement, anyelement, text) to anon, authenticated, service_role;
grant execute on function testing.ok(boolean, text)                to anon, authenticated, service_role;
grant execute on function testing.denied(text, text, text[])        to anon, authenticated, service_role;
grant execute on function testing.count_of(text)                   to anon, authenticated, service_role;
grant execute on function testing.affects(text, integer, text)     to anon, authenticated, service_role;
