-- خللٌ مقصود: الحساب المطلوب حذفه يبقى يقرأ المحتوى كأنّ شيئاً لم يكن.
-- فالإخفاء وعدٌ في الشاشة لا حقيقةٌ في القاعدة — وهو أسوأ من ألّا يُوعد به.
-- وموضع الخلل هو نفسه موضع الدرس: `is_identified` هي البوّابة التي تقرؤها
-- كل أبواب الطالب. فمن أخرج الشرط منها فتح الأبواب كلّها دفعةً واحدة.
create or replace function public.is_identified()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and coalesce(auth.jwt() ->> 'email', '') <> '';
$$;
