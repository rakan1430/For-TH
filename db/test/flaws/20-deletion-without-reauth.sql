-- خللٌ مقصود: طلب حذف الحساب بلا إثبات Google حديث.
-- فمن جلس أمام جهازٍ تُرك مفتوحاً محا حساب صاحبه ونتائجه بلا رجعة.
-- ظاهرها تيسير: «الجلسة قائمة فهو صاحبها». وحقيقتها أنّ الجلسة تدوم
-- أسابيع، والفعل لا رجعة فيه. والفرق بين «ما زالت جلستك مفتوحة» و«أنت
-- حاضرٌ الآن» هو كلّ ما يحمي الحساب هنا.
do $$
declare src text;
begin
  src := pg_get_functiondef('public.request_account_deletion()'::regprocedure);
  src := replace(src, 'if not public.google_verified(1) then', 'if false then');
  execute src;
end $$;
