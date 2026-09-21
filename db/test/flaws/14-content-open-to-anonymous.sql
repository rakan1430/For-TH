-- خللٌ مقصود: «مجّانيّ للجميع» تُقرأ حرفياً — فيصير المحتوى مفتوحاً لكل من
-- فتح الصفحة، لا لكل من سجّل دخوله.
--
-- ظاهرها أنّها تنفيذٌ أمين لقرار المالك. وحقيقتها أنّ الجلسة المجهولة رمزها
-- صحيحٌ ولها معرّف، فتجتاز `auth.uid() is not null` بلا عناء — ويصير بنك
-- أسئلة المعلّم كلّه مقروءاً لأي زائر، بلا حساب، بلا أثر.
create or replace function public.may_read_content(p_track public.track_t)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null;
$$;
