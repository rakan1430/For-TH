-- خللٌ مقصود: إعادة «النجاح الكاذب». تبتلع الدالّة المكرَّر وتُبلغ أنّ كل
-- المستهدَف أُنشئ — تماماً كما رأى المعلّم «أُرسل ✅» ولم يصل أحداً شيء.
create or replace function public.assign_items(
  p_item_type   public.item_type_t,
  p_item_ids    uuid[],
  p_audience    public.audience_t,
  p_group_ids   uuid[] default null,
  p_student_ids uuid[] default null
)
returns table (created integer, skipped integer, targeted integer)
language plpgsql
security definer
set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_targeted integer;
begin
  if not public.is_teacher() then
    raise exception 'التوزيع للمعلّم وحده' using errcode = '42501';
  end if;

  begin
    insert into public.assignments (track, item_type, item_id, audience, group_id, student_id, created_by)
    select private.item_track(p_item_type, i), p_item_type, i, p_audience, null, null, v_uid
    from unnest(p_item_ids) as i;
  exception when unique_violation then
    null;   -- «إعادة إرسال عادية» — وهنا يضيع كل شيء بصمت
  end;

  select cardinality(p_item_ids) into v_targeted;
  return query select v_targeted, 0, v_targeted;   -- يُبلغ عن نجاحٍ كامل دائماً
end;
$$;
