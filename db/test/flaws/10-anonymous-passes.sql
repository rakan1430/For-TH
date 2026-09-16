-- خللٌ مقصود: الاكتفاء بـ«هل يوجد مستخدم؟» بدل فحص الهويّة الحقيقية —
-- فالجلسة المجهولة تجتاز الشرط، ويصير كل زائرٍ مستخدماً مصرَّحاً له.
--
-- ظاهرها سليم: `auth.uid() is not null` تبدو فحص هويّةٍ كاملاً. وحقيقتها
-- أنّ الجلسة المجهولة رمزُها صحيح ولها معرّفٌ حقيقيّ في `auth.users` —
-- فتجتاز الشرط بلا عناء، ويصير كل زائرٍ مجهول مستخدماً مصرَّحاً له.
create or replace function public.is_identified()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null;
$$;
