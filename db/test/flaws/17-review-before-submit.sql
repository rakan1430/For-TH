-- خللٌ مقصود: «بدأ المحاولة» تكفي للمراجعة بدل «سلّمها».
-- فيفتح المراجعة في تبويبٍ آخر ويقرأ الصحيح قبل أن يجيب.
-- «بدأ المحاولة» تكفي للمراجعة بدل «سلّمها»
-- ظاهرها تساهلٌ بسيط: الطالب داخل الاختبار فعلاً. وحقيقتها أنّه يفتح
-- الاختبار، ثمّ يفتح المراجعة في تبويبٍ آخر فيقرأ الصحيح والشرح، ثمّ يعود
-- ويجيب. فيصير كل اختبارٍ مفتوح الكتاب بلا أن يدري أحد.
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
             and qq.id = p_question_id
         );
$$;
