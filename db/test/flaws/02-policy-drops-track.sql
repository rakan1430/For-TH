-- خللٌ مقصود: إسقاط شرط الاشتراك والمسار من سياسة قراءة البنوك، وإبقاء
-- شرطَي النشر والتوزيع. هذا هو الخطأ الواقعيّ: «التوزيع يكفي» — فيرى
-- مشترك التحصيلي محتوى القدرات الموزَّع على المسار كلّه.
drop policy banks_read on public.banks;
create policy banks_read on public.banks for select to authenticated
  using (
    (select public.is_teacher())
    or (is_published and (select public.is_assigned('bank', id)))
  );
