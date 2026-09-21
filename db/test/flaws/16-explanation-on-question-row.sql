-- خللٌ مقصود: الشرح عمودٌ على صفّ السؤال بدل جدولٍ له سياسته.
-- فأيّ طالبٍ يرى السؤال يرى شرحه — وفي الشرح الحلّ.
-- الشرح عمودٌ على صفّ السؤال بدل جدولٍ له سياسته
-- ظاهرها أبسط وأقلّ جداول. وحقيقتها أنّ **سياسات الصفوف تحرس الصفوف لا
-- الأعمدة**: أيّ طالبٍ يرى السؤال يرى شرحه في نفس الصفّ — قبل أن يبدأ
-- الاختبار. وفي الشرح الحلّ. وهو الدرس نفسه الذي أخرج مفتاح الإجابة إلى
-- `private` في ٠٠٠٤، وكتبتُه أوّل مرّة هنا ناسياً إيّاه.
drop policy if exists explanations_read on public.question_explanations;
create policy explanations_read on public.question_explanations for select to authenticated
  using (true);
