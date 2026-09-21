-- خللٌ مقصود: `save_quiz` تعامل غياب مفتاح الشرح معاملة خلوّه.
-- فكل حفظٍ من واجهةٍ لا تعرف الحقل يمحو شرح المعلّم بلا رسالةٍ ولا رجعة.
-- ظاهرها تبسيط: «اقرأ الحقل واكتب ما فيه». وحقيقتها أنّ `->>` تُعيد `null`
-- للمفتاح الغائب كما تُعيده للمفتاح الفارغ — فلا تفرّق بين «لم يُذكر» و«أُفرغ
-- عمداً». وأيّ مسار حفظٍ لا يحمل الحقل (واجهةٌ أقدم، أو حفظٌ جزئيّ) يصير
-- محواً صامتاً لعملٍ كتبه المعلّم.
do $$
declare src text;
begin
  src := pg_get_functiondef('public.save_quiz(jsonb)'::regprocedure);
  src := replace(src,
    'if (v_q ? ''explanation'') or (v_q ? ''explanation_image_path'') then',
    'if true then');
  execute src;
end $$;
