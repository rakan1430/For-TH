-- خللٌ مقصود: إعادة عمود الصحّة إلى الجدول المكشوف «تسهيلاً للواجهة».
-- سياسات الصفوف لا تحرس الأعمدة، فمن يرى الخيار يرى صحّته.
alter table public.quiz_options add column is_correct boolean not null default false;
update public.quiz_options o set is_correct = true
  where exists (select 1 from private.answer_key k where k.option_id = o.id);
