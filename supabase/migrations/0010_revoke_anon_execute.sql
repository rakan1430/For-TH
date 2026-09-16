-- =============================================================================
-- ٠٠١٠ — سحب التنفيذ من `anon` (تصحيحٌ لقواعد أُنشئت قبل إصلاح `0007`)
--
-- ⚠️⚠️ ثغرةٌ وقعت فعلاً على قاعدة إنتاجٍ حقيقية، ولم يكشفها الفحص المحلّي:
--
--    كان `0007` يسحب `EXECUTE` من `PUBLIC` وحده. وهذا كافٍ على Postgres
--    عارٍ — **وغير كافٍ على Supabase**: فله `alter default privileges`
--    خاصّة به تمنح الدور `anon` **صراحةً باسمه**، و`PUBLIC` ليس دوراً
--    مسمّى بل «كل الأدوار ضمناً». فالسحب من أحدهما لا يمسّ الآخر.
--
--    والنتيجة: كل دالّة `security definer` في المشروع — وكلّها تتجاوز
--    سياسات الصفوف بتصميمها — كانت قابلةً للاستدعاء من **زائرٍ مجهول**
--    عبر `/rest/v1/rpc/…`.
--
--    ولم يقع تسريبٌ فعليّ لأنّ كل دالّة تفحص `is_teacher()` أو `auth.uid()`
--    في أوّل سطرٍ منها — الطبقة الداخلية صمدت. لكنّ الطبقة الخارجية سقطت،
--    والاعتماد على طبقةٍ واحدة هو ما يجعل الخطأ التالي تسريباً.
--
--    وهذه المهاجرة تصحّح القواعد القائمة. أمّا القواعد الجديدة فيصحّحها
--    `0007` المُصلَح، فتمرّ هذه بلا أثر.
--
-- ⚠️ ولماذا يبقى `service_role`؟ لأنّه مفتاح الخادم السرّي: لا يصل متصفّحاً
--    أبداً، ويتجاوز سياسات الصفوف بتصميمه، وتعتمد عليه أدوات Supabase
--    نفسها. ويحرس عدمَ تسرّبه إلى حزمة المتصفّح `scripts/check-conventions.mjs`.
-- =============================================================================

do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind in ('f', 'p')
  loop
    execute format('revoke all on function %s from public, anon', f.sig);
  end loop;
end $$;

alter default privileges in schema public  revoke execute on functions from public, anon;
alter default privileges in schema private revoke execute on functions from public, anon;

-- والجداول كذلك: الزائر لا يقرأ إلا الخطط
revoke all on all tables in schema public from anon;
grant select on public.plans to anon;

-- ثمّ يُعاد المنح للدور المسجَّل وحده (السحب أعلاه شامل، فنُعيد المقصود)
grant execute on function public.is_teacher()                            to authenticated;
grant execute on function public.has_active_subscription(public.track_t) to authenticated;
grant execute on function public.is_assigned(public.item_type_t, uuid)   to authenticated;
grant execute on function public.confirm_identity()                      to authenticated;
grant execute on function public.request_subscription(
  public.track_t, uuid, text, text, text, public.pay_method_t, text)     to authenticated;
grant execute on function public.decide_subscription_request(
  uuid, boolean, date, integer, text)                                    to authenticated;
grant execute on function public.assign_items(
  public.item_type_t, uuid[], public.audience_t, uuid[], uuid[])         to authenticated;
grant execute on function public.reorder_bank_items(uuid, jsonb)         to authenticated;
grant execute on function public.reorder(text, uuid[])                   to authenticated;
grant execute on function public.save_quiz(jsonb)                        to authenticated;
grant execute on function public.set_answer_key(uuid, uuid[])            to authenticated;
grant execute on function public.teacher_answer_key(uuid)                to authenticated;
grant execute on function public.start_attempt(uuid)                     to authenticated;
grant execute on function public.save_answer(uuid, uuid, uuid)           to authenticated;
grant execute on function public.submit_attempt(uuid, jsonb)             to authenticated;
grant execute on function public.teacher_overview()                      to authenticated;
