-- خللٌ مقصود: `start_attempt` تشترط توزيعاً صريحاً كما قبل ٠٠١٤.
-- فالاختبار يظهر للطالب في القائمة ويُردّ عند الضغط: وعدٌ في الشاشة يكسره الخادم.
-- وهذا هو العطل الحقيقيّ الذي خلّفه ٠٠١٤: شرط الرؤية مكتوبٌ مرّتين، فمرّت
-- المهاجرة على إحداهما وتركت الأخرى. و`is_visible` تقول «بلا توزيع = للجميع»
-- بينما هذا الحارس ما زال يقول «بلا توزيع = ممنوع».
do $$
declare src text;
begin
  src := pg_get_functiondef('public.start_attempt(uuid)'::regprocedure);
  src := replace(src,
    '  if v_q.opens_at is not null and now() < v_q.opens_at then',
    '  if not ('
    || ' public.is_assigned(''quiz'', v_q.id)'
    || ' or (v_q.bank_id is not null and public.is_assigned(''bank'', v_q.bank_id))'
    || ' ) then'
    || ' return query select false, ''not_assigned''::text, null::uuid, null::integer, null::timestamptz;'
    || ' return;'
    || ' end if;'
    || E'\n  if v_q.opens_at is not null and now() < v_q.opens_at then');
  execute src;
end $$;
