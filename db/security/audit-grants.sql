-- =============================================================================
-- تدقيق صلاحيات التنفيذ — القائمة البيضاء (البند ٣)
--
-- يطبع كل من يستطيع تنفيذ كل دالّة في `public` و`private`، بصيغةٍ ثابتة
-- يقارنها `db/test/run.sh` بـ`db/security/expected-grants.txt`.
--
-- ⚠️ `coalesce(p.proacl, acldefault('f', p.proowner))` ليست تفصيلاً:
--    الدالّة التي لم تُمسّ صلاحياتها قطّ يكون `proacl` فيها **NULL**، ولا
--    يعني ذلك «لا أحد يستطيع تنفيذها» بل العكس تماماً — تسري عليها الصلاحية
--    الافتراضية، وهي **EXECUTE لـPUBLIC**. فلو قرأنا NULL على أنّها فراغاً
--    لأعطى التدقيق قائمةً نظيفة بينما كل دالّةٍ جديدة مفتوحة للعالم. وهذا
--    بالضبط شكل الفحص الأعمى الذي يطمئن ولا يلتقط شيئاً.
--
--    القائمة تستثني المالك: صلاحيته ضمنية دائماً، والسؤال هنا «ومن غيره؟».
-- =============================================================================
select format(
         '%s|%s|%s',
         p.oid::regprocedure::text,
         case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end,
         case when p.prosecdef then 'definer' else 'invoker' end
       )
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
where n.nspname in ('public', 'private')
  and a.privilege_type = 'EXECUTE'
  and a.grantee <> p.proowner
order by
  p.oid::regprocedure::text,
  case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end;
