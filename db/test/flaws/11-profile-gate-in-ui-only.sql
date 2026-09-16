-- خللٌ مقصود: الاكتفاء بشاشة «أكمل ملفّك» في الواجهة، وترك الدالّة تقبل —
-- فمن يفتح أدوات المطوّر يستدعي `request_subscription` ويتجاوز الشاشة كلّها.
--
-- ظاهرها سليم: النموذج يمنع الإرسال قبل ملء الحقول، والمستخدم لا يرى طريقاً
-- آخر. وحقيقتها أنّ الطريق الآخر مفتوحٌ دائماً — الشاشة تهذيبٌ لا حراسة.
create or replace function public.request_subscription(
  p_track public.track_t, p_plan_id uuid, p_full_name text, p_grade text,
  p_contact text, p_method public.pay_method_t, p_receipt_path text default null
)
returns table (ok boolean, reason text, request_id uuid)
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid := auth.uid(); v_existing uuid; v_new uuid;
begin
  if v_uid is null then raise exception 'لا جلسة' using errcode = '28000'; end if;

  if not exists (select 1 from public.plans p
                 where p.id = p_plan_id and p.track = p_track and p.is_active) then
    return query select false, 'plan_not_found'::text, null::uuid; return;
  end if;
  if p_method = 'transfer' and coalesce(btrim(p_receipt_path), '') = '' then
    return query select false, 'receipt_required'::text, null::uuid; return;
  end if;

  select r.id into v_existing from public.subscription_requests r
   where r.student_id = v_uid and r.track = p_track and r.status = 'pending';
  if v_existing is not null then
    return query select false, 'already_pending'::text, v_existing; return;
  end if;

  insert into public.subscription_requests
    (student_id, track, plan_id, full_name, grade, contact, method, receipt_path)
  values (v_uid, p_track, p_plan_id, btrim(p_full_name), btrim(p_grade),
          btrim(p_contact), p_method, nullif(btrim(p_receipt_path), ''))
  returning id into v_new;

  return query select true, 'pending'::text, v_new;
end;
$$;
