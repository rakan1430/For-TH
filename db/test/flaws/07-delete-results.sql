-- خللٌ مقصود: إسقاط المُشغِّل الذي يمنع حذف اختبارٍ له نتائج. فتصير ضغطةٌ
-- واحدة على زرّ الحذف كافيةً لمحو درجات فصلٍ كامل — و«لا تُحذف نتائجه».
drop trigger if exists quizzes_protect_results on public.quizzes;
