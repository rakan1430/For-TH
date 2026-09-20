-- خللٌ مقصود: مقارنة بريد قائمة الانتظار **بحساسيةٍ لحالة الأحرف** —
-- فبريدٌ يختلف بحرفٍ كبيرٍ واحد لا يُرقّى، ويبقى صاحب المنصّة طالباً.
--
-- ظاهرها سليم تماماً: مقارنة نصٍّ بنصّ. وحقيقتها أنّ Google يعيد البريد كما
-- سجّله صاحبه، فـ`Mohamed@…` و`mohamed@…` نصّان مختلفان وبريدٌ واحد. ولا
-- رسالة خطأ: يدخل المالك ويرى شاشة طالبٍ بلا اشتراك، ولا أحد يعرف لماذا.
create or replace function private.promote_pending_teacher()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from private.pending_teachers p
    where p.email = coalesce(new.email, '')
  ) then
    insert into private.teachers (user_id, note)
    values (new.id, 'رُقّي تلقائياً من قائمة الانتظار')
    on conflict (user_id) do nothing;
  end if;
  return new;
end;
$$;
