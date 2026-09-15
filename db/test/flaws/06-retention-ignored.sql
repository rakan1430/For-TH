-- خللٌ مقصود: إعادة `retention` عموداً يُعرض ولا يفعل شيئاً، فيُعاد الاختبار
-- المؤقّت بلا حدّ كالمسجَّل تماماً — وهو ما كان عليه الحال فعلاً حتى كشفه
-- سؤال المالك عن التمييز بين النوعين.
create or replace function private.effective_max_attempts(q public.quizzes)
returns integer
language sql
immutable
set search_path = ''
as $$
  select q.max_attempts;
$$;
