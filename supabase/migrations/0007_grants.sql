-- =============================================================================
-- ٠٠٠٧ — الصلاحيات: أخطر ملفّ في المشروع
--
-- ⚠️⚠️⚠️ اقرأ هذا مرّتين قبل أن تضيف دالّةً واحدة إلى `public`.
--
-- في Postgres، صلاحية `EXECUTE` على الدوالّ **ممنوحة لـ`PUBLIC` افتراضياً**.
-- ومنصّات مثل Supabase تكشف **كل دالّة في المخطّط العامّ** على مسار استدعاءٍ
-- عبر الشبكة. والدالّة المعرَّفة بـ`SECURITY DEFINER` تعمل بصلاحيات مالكها
-- لا مستدعيها — أي أنّها تتجاوز سياسات الصفوف عمداً.
--
-- اجمع الثلاثة: **دالّةٌ تتجاوز الحراسة، مكشوفةٌ على الشبكة، ومسموحٌ للعالم
-- بتنفيذها.**
--
-- وهذا وقع فعلاً في المشروع السابق: دالّة لقراءة غياب طالب، سياسات جدولها
-- مضبوطة ضبطاً سليماً تماماً — ومع ذلك استطاع زائرٌ مجهول استدعاءها مباشرةً
-- عبر الشبكة وقراءة البيانات، دون أن يلمس الجدول أصلاً.
--
-- ولذلك: **يُسحب `EXECUTE` من `PUBLIC` على كل دالّة، ثم يُمنح لمن يحتاجه
-- وحده.** والقائمة أدناه هي القائمة البيضاء المكتوبة، ويفحصها
-- `db/test/security.test.sql` في كل بناء.
--
-- 🔻 أضفت دالّة جديدة إلى `public`؟ عليك ثلاثة أشياء، لا اثنان:
--      ١. اسحب `EXECUTE` منها من `PUBLIC` (المسح أدناه يفعلها).
--      ٢. امنحها صراحةً للدور الذي يحتاجها.
--      ٣. حدّث `db/security/expected-grants.txt` — وإلا أرسب الفحص البناء.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) المسح: اسحب كل صلاحية تنفيذٍ من `PUBLIC` على كل دالّة في `public`
--
-- مسحٌ شاملٌ لا قائمة يدوية: القائمة اليدوية تنسى الدالّة التي أُضيفت أمس.
-- -----------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
  loop
    execute format('revoke all on function %s from public', f.sig);
  end loop;
end $$;

-- ولا شيء في المخطّط الخاصّ يُنفَّذ من الخارج إطلاقاً
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.prokind in ('f', 'p')
  loop
    execute format('revoke all on function %s from public', f.sig);
  end loop;
end $$;

-- ويسري السحب على ما يُنشأ لاحقاً بيد الدور نفسه
alter default privileges in schema public  revoke execute on functions from public;
alter default privileges in schema private revoke execute on functions from public;

-- -----------------------------------------------------------------------------
-- ٢) المخطّط الخاصّ: لا وصول لأحدٍ سوى مالك الدوالّ
-- -----------------------------------------------------------------------------
revoke all on schema private from public;
revoke all on all tables in schema private from public;

-- -----------------------------------------------------------------------------
-- ٣) الجداول: نسحب ما منحته الإعدادات الافتراضية، ثم نمنح الأفعال المقصودة
--
-- ⚠️ الحراسة بسياسات الصفوف لا تُغني عن ضبط الأفعال: الدوران `anon` و
--    `authenticated` دوران على مستوى قاعدة البيانات لا يميّزان معلّماً من
--    طالب — السياسات تفعل ذلك. لكن فعلاً لا يحتاجه أحدٌ أصلاً (إدراج محاولة
--    مباشرةً مثلاً) يُمنع هنا فلا يبقى معتمداً على سياسةٍ وحدها.
-- -----------------------------------------------------------------------------
revoke all on all tables in schema public from anon, authenticated;

grant usage on schema public to anon, authenticated;

-- الزائر المجهول: صفحة الأسعار وحدها. ولا صلاحية تنفيذٍ على أي دالّة.
grant select on public.plans to anon;

-- المسجَّل: ما تحرسه السياسات
grant select, insert, update, delete on
  public.profiles,
  public.plans,
  public.subscriptions,
  public.subscription_requests,
  public.sections,
  public.banks,
  public.resources,
  public.groups,
  public.group_members,
  public.assignments,
  public.quizzes,
  public.quiz_questions,
  public.quiz_options
to authenticated;

-- ⚠️ المحاولات: قراءةٌ فقط (وحذفٌ للمعلّم تحرسه السياسة). لا إدراج ولا تحديث
--    مباشر لأحد — وإلا كتب الطالب درجته بنفسه. الكتابة عبر `start_attempt`
--    و`save_answer` و`submit_attempt` وحدها، وهي التي تصحّح وتفحص الصلاحية.
grant select, delete on public.quiz_attempts  to authenticated;
grant select          on public.attempt_answers to authenticated;

-- -----------------------------------------------------------------------------
-- ٤) القائمة البيضاء: الدوالّ المقصود أنّها تُستدعى، ومن يستدعيها
--
-- كل سطرٍ هنا قرارٌ واعٍ. وما ليس هنا لا يُنفَّذ من الشبكة.
-- -----------------------------------------------------------------------------

-- محمولات الحراسة — تستدعيها السياسات نفسها، فيحتاجها الدور المسجَّل.
-- وكلّها تسأل عن **المستدعي** ولا تقبل معرّف شخصٍ آخر وسيطاً.
grant execute on function public.is_teacher()                                to authenticated;
grant execute on function public.has_active_subscription(public.track_t)     to authenticated;
grant execute on function public.is_assigned(public.item_type_t, uuid)       to authenticated;

-- نافذة الهوية للعمليات الخطرة
grant execute on function public.confirm_identity()                          to authenticated;

-- الاشتراك
grant execute on function public.request_subscription(
  public.track_t, uuid, text, text, text, public.pay_method_t, text)          to authenticated;
grant execute on function public.decide_subscription_request(
  uuid, boolean, date, integer, text)                                         to authenticated;

-- المحتوى والتوزيع
grant execute on function public.assign_items(
  public.item_type_t, uuid[], public.audience_t, uuid[], uuid[])              to authenticated;
grant execute on function public.reorder_bank_items(uuid, jsonb)              to authenticated;

-- الاختبارات
grant execute on function public.set_answer_key(uuid, uuid[])                 to authenticated;
grant execute on function public.start_attempt(uuid)                          to authenticated;
grant execute on function public.save_answer(uuid, uuid, uuid)                to authenticated;
grant execute on function public.submit_attempt(uuid, jsonb)                  to authenticated;

-- اللوحة
grant execute on function public.teacher_overview()                           to authenticated;

-- ⚠️ لاحظ ما ليس في القائمة: `private.item_track` و`private.has_recent_confirmation`
--    و`private.touch_updated_at`. تستدعيها دوالُّ `public` من الداخل بصلاحية
--    مالكها، ولا يبلغها أحدٌ من الشبكة.
