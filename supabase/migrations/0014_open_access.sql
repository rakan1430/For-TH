-- =============================================================================
-- ٠٠١٤ — الوصول المجانيّ
--
-- قرار المالك: المنصّة مجّانيّة للجميع في هذه المرحلة. وهذا **لا يعني**
-- إضعاف الحراسة — يعني نقل شرطٍ واحد فقط:
--
--     «مشتركٌ ساري في المسار»  ←  «مستخدمٌ حقيقيّ مسجَّل الدخول»
--
-- وكلّ ما عداه باقٍ كما هو: لا أحد يصل إلى `private`، ولا إلى مفتاح
-- الإجابة، ولا إلى لوحة المعلّم، ولا إلى بيانات طالبٍ آخر.
--
-- ⚠️⚠️ وما **لا** يتغيّر إطلاقاً، وهو أهمّ من التغيير نفسه:
--    · `private.teachers` يبقى خارج مخطّط الواجهة — لا مسار شبكة إليه.
--    · `private.answer_key` كذلك: مجّانيّةُ المحتوى لا تعني كشف الإجابات.
--    · كل سياسات الكتابة تبقى `is_teacher()` وحده.
--    · `profiles` يبقى: الطالب صفّه هو، والمعلّم الكلّ.
--    فالمجّانيّة قرارُ تسعيرٍ لا قرارُ أمن.
--
-- ⚠️ وجداول الاشتراكات **لا تُحذف**: تحمل تاريخاً حقيقياً، وقد يعود
--    التسعير يوماً. تبقى وسياساتها قائمة، ويكفّ المحتوى عن سؤالها.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) من يرى المحتوى؟
--
-- ⚠️ دالّةٌ واحدة تُعرّف «حقّ القراءة» لكل الجداول، بدل تكرار الشرط في ستّ
--    سياسات. ويوم يعود التسعير، يُبدَّل سطرٌ واحد هنا لا ستّة مواضع تفترق.
--
-- ⚠️ و`is_identified()` لا `auth.uid() is not null`: الجلسة المجهولة رمزها
--    صحيحٌ ولها معرّف (٠٠١١). ومجّانيّةٌ «لكل من سجّل دخوله» لا «لكل من
--    فتح الصفحة».
-- -----------------------------------------------------------------------------
create or replace function public.may_read_content(p_track public.track_t)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_teacher()
      or (public.is_identified() and p_track is not null);
$$;

comment on function public.may_read_content(public.track_t) is
  'حقّ قراءة المحتوى. مجّانيّ الآن: كل مستخدمٍ حقيقيّ مسجَّل. يوم يعود التسعير يُبدَّل هنا وحده.';

-- -----------------------------------------------------------------------------
-- ٢) التوزيع: من «شرطٌ للظهور» إلى «تضييقٌ عند وجوده»
--
-- ⚠️ هذا هو العطب الذي أبلغ عنه المالك: نشر المعلّم بنكاً فلم يره أحد،
--    لأنّه لم «يُرسله» بعد. والتوزيع بُني ليستهدف مجموعةً أو طالباً بعينه —
--    فصار بوجوده شرطاً يمنع الجميع بغيابه. **الغياب كان يعني المنع، وكان
--    يجب أن يعني العموم.**
--
--    فالقاعدة الآن: منشورٌ بلا توزيع = للجميع · منشورٌ بتوزيع = للمستهدَفين.
-- -----------------------------------------------------------------------------
create or replace function public.is_visible(
  p_item_type public.item_type_t,
  p_item_id   uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
           select 1 from public.assignments a
            where a.item_type = p_item_type and a.item_id = p_item_id
         )
      or public.is_assigned(p_item_type, p_item_id);
$$;

comment on function public.is_visible(public.item_type_t, uuid) is
  'منشورٌ بلا توزيع يراه الجميع؛ وبوجود توزيعٍ يراه المستهدَفون وحدهم.';

-- -----------------------------------------------------------------------------
-- ٣) السياسات
-- -----------------------------------------------------------------------------
drop policy if exists sections_read on public.sections;
create policy sections_read on public.sections for select to authenticated
  using ((select public.may_read_content(track)));

drop policy if exists banks_read on public.banks;
create policy banks_read on public.banks for select to authenticated
  using (
    (select public.is_teacher())
    or (is_published
        and (select public.may_read_content(track))
        and (select public.is_visible('bank', id)))
  );

-- -----------------------------------------------------------------------------
-- ٣-أ) الوعاء يورّث قيوده لما فيه
--
-- ⚠️⚠️ عطبٌ في أوّل صياغةٍ كتبتُها، التقطتُه قبل التطبيق: جعلتُ ظهورَ الملفّ
--    يعتمد على توزيع **الملفّ نفسه**. والملفّات داخل البنوك لا تُوزَّع عادةً
--    — يُوزَّع البنك. فملفٌّ في بنكٍ مقصورٍ على مجموعة «متقدّم» كان سيصير
--    **مرئياً للجميع**، لأنّه هو بلا توزيع. أي أنّ تعميم المجّانيّة كاد
--    يكسر التوزيع المقصور.
--
--    فالقاعدة: ما في وعاءٍ يرث شرطَي وعائه — نشرَه وحدودَ توزيعه.
-- -----------------------------------------------------------------------------
create or replace function public.bank_open(p_bank_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_bank_id is null
      or exists (
           select 1 from public.banks b
            where b.id = p_bank_id
              and b.is_published
              and public.is_visible('bank', b.id)
         );
$$;

comment on function public.bank_open(uuid) is
  'البنك الحاوي منشورٌ ومرئيّ للمستدعي. وما فيه يرث شرطيه — ولا وعاء يعني نعم.';

drop policy if exists resources_read on public.resources;
create policy resources_read on public.resources for select to authenticated
  using (
    (select public.is_teacher())
    or (is_published
        and (select public.may_read_content(track))
        and (select public.is_visible('resource', id))
        and (select public.bank_open(bank_id)))
  );

-- -----------------------------------------------------------------------------
-- ٣-ب) شرط قراءة الاختبار — **تعريفٌ واحد** تستعمله السياسة والدوالّ معاً
--
-- ⚠️ لماذا وسائط لا قراءةٌ من الجدول؟ لأنّ دالّةً تقرأ `public.quizzes`
--    وتُستدعى من سياسة `quizzes` نفسها تدور على نفسها. فتأخذ الأعمدة
--    وسائطَ: السياسة تمرّرها من الصفّ، والدوالّ تمرّرها ممّا حمّلته أصلاً.
--
-- ⚠️ وهذا ما يُعيد للبند ٧ أسنانه: كان حارس وقت الكتابة يسأل عن الاشتراك،
--    والاشتراك لم يعد يتغيّر. فصار يسأل عمّا **يتغيّر فعلاً**: هل الاختبار
--    ما زال منشوراً؟ هل بنكه ما زال مفتوحاً؟ فتبويبٌ مفتوحٌ منذ ساعةٍ على
--    اختبارٍ سحبه المعلّم لخطأٍ فيه **لا يُسلَّم**.
-- -----------------------------------------------------------------------------
create or replace function public.quiz_readable(
  p_quiz_id      uuid,
  p_track        public.track_t,
  p_is_published boolean,
  p_bank_id      uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p_is_published, false)
     and public.may_read_content(p_track)
     and public.is_visible('quiz', p_quiz_id)
     and public.bank_open(p_bank_id);
$$;

comment on function public.quiz_readable(uuid, public.track_t, boolean, uuid) is
  'شرط وصول الطالب إلى اختبار — تعريفٌ واحد تقرؤه سياسة الصفوف ودوالّ المحاولة.';

-- ⚠️ وهو العطب الذي رآه المالك بعينه: اختبارٌ منشورٌ داخل بنكٍ غير منشور
--    كان **يظهر للطالب والبنك مخفيّ**. فيرى اختباراً على درسٍ لا يفتحه.
drop policy if exists quizzes_read on public.quizzes;
create policy quizzes_read on public.quizzes for select to authenticated
  using (
    (select public.is_teacher())
    or public.quiz_readable(id, track, is_published, bank_id)
  );

-- -----------------------------------------------------------------------------
-- ٤) الصلاحيات
-- -----------------------------------------------------------------------------
revoke all on function public.may_read_content(public.track_t) from public, anon;
revoke all on function public.is_visible(public.item_type_t, uuid) from public, anon;
revoke all on function public.bank_open(uuid) from public, anon;
revoke all on function public.quiz_readable(uuid, public.track_t, boolean, uuid) from public, anon;
grant execute on function public.may_read_content(public.track_t) to authenticated;
grant execute on function public.is_visible(public.item_type_t, uuid) to authenticated;
grant execute on function public.bank_open(uuid) to authenticated;
grant execute on function public.quiz_readable(uuid, public.track_t, boolean, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- ٥) حراسة **وقت الكتابة** تتبع نفس التعريف
--
-- ⚠️⚠️ عطبٌ كاد يمرّ: فتحتُ المحتوى وتركتُ `start_attempt` و`save_answer`
--    و`submit_attempt` تشترط اشتراكاً سارياً. فالنتيجة طالبٌ **يقرأ**
--    الاختبار مجّاناً ولا يستطيع **الإجابة** عليه، ويُردّ بـ
--    `subscription_expired` على منصّةٍ لا اشتراك فيها أصلاً. رسالةٌ لا
--    يفهمها، وعطبٌ لا يفهمه المعلّم.
--
-- ⚠️ ويبقى الفحص **لحظة الكتابة** لا لحظة الفتح (البند ٧): تبويبٌ قديم
--    مفتوحٌ منذ ساعات لا يُسلَّم بحقٍّ سقط بعد فتحه. تغيّر الشرط، لا موضعه.
--
-- ⚠️ ولا تُعاد كتابة هذه الدوالّ كاملةً هنا: تُستبدل جملة الشرط وحدها
--    بـ`regexp_replace` على مصدرها. إعادةُ نسخِها بأكملها تُنشئ نسخةً
--    ثانية تتباعد عن الأصل مع كل تعديلٍ لاحق — وهو ما يحرس منه هذا المشروع.
-- -----------------------------------------------------------------------------
do $$
declare
  f record;
  src text;
begin
  for f in
    select p.oid, p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('start_attempt', 'save_answer', 'submit_attempt')
  loop
    src := pg_get_functiondef(f.oid);
    if position('has_active_subscription' in src) = 0 then
      continue;
    end if;
    -- `start_attempt` و`submit_attempt` حمّلتا صفّ الاختبار في `v_q`
    src := replace(src,
      'public.has_active_subscription(v_q.track)',
      'public.quiz_readable(v_q.id, v_q.track, v_q.is_published, v_q.bank_id)');

    -- ⚠️ و`save_answer` لم تقرأ إلا المسار، فتُستبدل جملة شرطها كاملةً.
    --    ولو اكتُفي باستبدال اسم الدالّة لَنتج نصٌّ لا يُصرَّف. والاستبدال
    --    النصّي يفشل **صامتاً** حين لا يجد نصّه، فيبقى الحارس القديم ولا
    --    يُنبّه أحد — ولهذا يتحقّق الفحص أدناه من النتيجة لا من نيّتنا.
    src := replace(src,
      'public.has_active_subscription(v_trk)',
      'exists (select 1 from public.quizzes q2 where q2.id = v_a.quiz_id'
      || ' and public.quiz_readable(q2.id, q2.track, q2.is_published, q2.bank_id))');

    -- والسبب المعلَن يتبع الحقيقة: لا اشتراك يُنتظر انتهاؤه على منصّةٍ
    -- مجّانيّة. `quiz_closed` تقول للطالب ما جرى فعلاً — سُحب الاختبار.
    src := replace(src, 'subscription_expired', 'quiz_closed');

    execute src;
    raise notice 'حُدّث شرط الوصول في %', f.sig;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- ٦) التحقّق من أنّ الاستبدال وقع فعلاً
--
-- ⚠️ `replace` لا ترفع خطأً حين لا تجد نصّها — تُعيد الأصل كما هو. فلو
--    تغيّرت صياغة إحدى الدوالّ يوماً لبقي حارسها القديم يسأل عن اشتراكٍ
--    لا وجود له، **بلا أي إشارة**. فيُرفع الخطأ هنا صراحةً.
-- -----------------------------------------------------------------------------
do $$
declare f record;
begin
  for f in
    select p.oid, p.oid::regprocedure::text as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('start_attempt', 'save_answer', 'submit_attempt')
  loop
    if position('has_active_subscription' in pg_get_functiondef(f.oid)) > 0 then
      raise exception 'لم يُستبدل حارس الاشتراك في %', f.sig;
    end if;
    if position('quiz_readable' in pg_get_functiondef(f.oid)) = 0 then
      raise exception 'لم يُركَّب حارس القراءة في %', f.sig;
    end if;
  end loop;
end $$;
