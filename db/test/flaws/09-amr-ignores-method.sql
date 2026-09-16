-- خللٌ مقصود: قراءة أحدث توقيتٍ في `amr` بلا النظر إلى **طريقة** المصادقة —
-- فدخولٌ بكلمة مرور قبل دقيقة يفتح نافذة العمليات الخطرة.
--
-- ظاهرها سليم تماماً: «نأخذ آخر إثبات هوية، ونتأكّد أنّه داخل ١٢ ساعة».
-- وحقيقتها أنّ دخولاً بكلمة مرور قبل دقيقة صار يفتح نافذة العمليات الخطرة
-- — وهي النافذة التي وُضعت أصلاً لأنّ كلمة المرور **لا تكفي**. فالحارس
-- يبقى قائماً في الشفرة، ويسقط معناه كلّه بحذف شرطٍ واحد.
create or replace function public.google_verified(p_hours int default 12)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select max((e ->> 'timestamp')::bigint)
       from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e)
    > (extract(epoch from now())::bigint - (p_hours * 3600)),
    false);
$$;
