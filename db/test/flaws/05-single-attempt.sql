-- خللٌ مقصود: بناء جدول النتائج على محاولةٍ واحدة — (الطالب + الاختبار)
-- بدل (الطالب + الاختبار + رقم المحاولة). وهو ما بُني عليه المشروع السابق
-- وكلّف ترقيعاً.
alter table public.quiz_attempts drop constraint quiz_attempts_per_attempt_uniq;
alter table public.quiz_attempts add constraint quiz_attempts_per_attempt_uniq
  unique (quiz_id, student_id);
