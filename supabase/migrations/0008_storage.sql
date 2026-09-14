-- =============================================================================
-- ٠٠٠٨ — المخزن: الملفّات وصور الأسئلة وإيصالات التحويل
--
-- ⚠️ كل الدلاء **خاصّة** (`public = false`). لا رابط دائم لأي ملفّ: الواجهة
--    تطلب رابطاً **موقَّعاً ومؤقّتاً** عند العرض (البند ٩). ودلوٌ عامّ واحد
--    يكفي لأن يصير رابط إيصالٍ بنكيّ قابلاً للتخمين والمشاركة إلى الأبد.
--
-- ⚠️ وهذا الملفّ خاصّ بـ Supabase. يتخطّى نفسه بلا ضجيج في قاعدةٍ محلّية لا
--    مخطّط `storage` فيها، فتبقى المهاجرات قابلةً للتطبيق في الحالتين.
-- =============================================================================

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'تخطّي سياسات المخزن: لا مخطّط `storage` هنا (قاعدة محلّية).';
    return;
  end if;

  -- ---- الدلاء ----
  insert into storage.buckets (id, name, public)
  values ('resources',       'resources',       false),
         ('question-images', 'question-images', false),
         ('receipts',        'receipts',        false)
  on conflict (id) do update set public = false;   -- ولو أُنشئ عامّاً سهواً، يُغلق

  -- ---- المعلّم: كل شيء ----
  execute $p$
    drop policy if exists storage_teacher_all on storage.objects;
    create policy storage_teacher_all on storage.objects for all to authenticated
      using (bucket_id in ('resources','question-images','receipts')
             and (select public.is_teacher()))
      with check (bucket_id in ('resources','question-images','receipts')
             and (select public.is_teacher()));
  $p$;

  -- ---- الطالب: يقرأ ملفّ مصدرٍ يراه فعلاً ----
  -- ⚠️ لا نُعيد هنا شرط الاشتراك والتوزيع مكتوباً من جديد: الاستعلام الفرعي
  --    على `public.resources` يخضع لسياسة `resources_read` نفسها. فإن ضاق
  --    الحقّ يوماً في مكانٍ واحد، ضاق هنا معه — ولا يفترق الشرطان بمرور الوقت.
  execute $p$
    drop policy if exists storage_student_read_resources on storage.objects;
    create policy storage_student_read_resources on storage.objects for select to authenticated
      using (
        bucket_id = 'resources'
        and exists (select 1 from public.resources r where r.storage_path = storage.objects.name)
      );
  $p$;

  -- ---- الطالب: يقرأ صورة سؤالٍ أو خيارٍ في اختبارٍ يراه ----
  execute $p$
    drop policy if exists storage_student_read_question_images on storage.objects;
    create policy storage_student_read_question_images on storage.objects for select to authenticated
      using (
        bucket_id = 'question-images'
        and (
          exists (select 1 from public.quiz_questions q
                   where q.prompt_image_path = storage.objects.name)
          or exists (select 1 from public.quiz_options o
                      where o.image_path = storage.objects.name)
        )
      );
  $p$;

  -- ---- الإيصالات: يرفع الطالب في مجلّده هو، ويقرأ ما رفعه ----
  -- المسار: `<معرّف المستخدم>/<اسم الملفّ>` — والشرط على أوّل جزءٍ منه.
  execute $p$
    drop policy if exists storage_student_upload_receipt on storage.objects;
    create policy storage_student_upload_receipt on storage.objects for insert to authenticated
      with check (
        bucket_id = 'receipts'
        and (storage.foldername(name))[1] = auth.uid()::text
      );

    drop policy if exists storage_student_read_own_receipt on storage.objects;
    create policy storage_student_read_own_receipt on storage.objects for select to authenticated
      using (
        bucket_id = 'receipts'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  $p$;
end $$;
