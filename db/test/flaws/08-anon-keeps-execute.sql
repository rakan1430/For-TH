-- خللٌ مقصود: إعادة الحالة التي وقعت فعلاً على Supabase — سحبُ `EXECUTE`
-- من `PUBLIC` وحده، وترك الدور `anon` ممنوحاً بالصلاحيات الافتراضية.
--
-- ظاهرها سليم: «سحبنا من PUBLIC». وحقيقتها أنّ كل دالّة `security definer`
-- — وكلّها تتجاوز سياسات الصفوف — صارت قابلةً للاستدعاء من زائرٍ مجهول
-- عبر الشبكة. وهذا هو البند ٣ بعينه.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public','private') and p.prokind in ('f','p')
  loop
    execute format('grant execute on function %s to anon', f.sig);
  end loop;
end $$;
