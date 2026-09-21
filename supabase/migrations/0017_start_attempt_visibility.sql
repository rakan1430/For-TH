-- =============================================================================
-- ٠٠١٧ — «لم يُرسَل إليك هذا الاختبار» لاختبارٍ يراه الطالب أمامه
--
-- ⚠️⚠️ عطلٌ خلّفه ٠٠١٤ وراءه ولم ينتبه له أحد — كشفه فحصٌ جديد لا مراجعة.
--
-- ٠٠١٤ قلب قاعدة الظهور: **الغياب صار يعني العموم** لا المنع (خ-٢٢). ووُضع
-- القرار كلّه في `is_visible`، تقرؤها `quiz_readable` وتقرؤها السياسات.
-- لكنّ `start_attempt` كانت تحمل **حارساً ثانياً مستقلّاً** يسبق ٠٠١٤:
--
--     if not (is_assigned('quiz', …) or is_assigned('bank', …)) then
--       return … 'not_assigned' …
--
-- وهذا الحارس بقي على القاعدة القديمة. فالنتيجة بعد ٠٠١٤:
--
--   · الاختبار **يظهر** للطالب في القائمة — لأنّ السياسة تقول «بلا توزيع =
--     للجميع».
--   · وإذا ضغط «ابدأ» رُدّ بـ«لم يُرسَل إليك هذا الاختبار».
--
-- أي وعدٌ في الشاشة يكسره الخادم. وهو عين ما اشتكى منه المالك في خ-٢٢،
-- ناجياً في الموضع الوحيد الذي لم تمرّ عليه المهاجرة.
--
-- ⚠️ والعلاج حذف الحارس الثاني، لا إصلاحه: شرط الرؤية يُكتب **مرّةً واحدة**
--    في `is_visible`، ومن كتبه مرّتين ضمن أن يفترقا يوماً — وقد افترقا.
--
-- ⚠️ وسببٌ ثانٍ صُحِّح معه: كان ردّ `quiz_readable` عند الرفض
--    `no_subscription` — ترجمتها في الواجهة «اشتراكك في هذا المسار غير
--    ساري». وعلى منصّةٍ **مجّانية للجميع** (ق-٤) هذه جملةٌ لا معنى لها،
--    تُرسل الطالب إلى صفحة اشتراكٍ لا تحلّ شيئاً. صارت `quiz_closed` كما
--    في `save_answer` و`submit_attempt`.
--
-- ⚠️ وتُعاد الدالّة كاملةً هنا — لا تُعدَّل نصّياً كما في ٠٠١٤ — لأنّ
--    الاستبدال النصّي هو الذي أنتج هذه الثغرة أصلاً: أصاب سطراً وأخطأ كتلة.
--    وهذا هو تعريفها النافذ، يُقرأ كما هو.
-- =============================================================================

create or replace function public.start_attempt(p_quiz_id uuid)
returns table (
  ok boolean, reason text, attempt_id uuid, attempt_no integer, expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_q     public.quizzes%rowtype;
  v_n     integer;
  v_limit integer;
  v_exp   timestamptz;
  v_id    uuid;
begin
  if v_uid is null then
    raise exception 'لا جلسة' using errcode = '28000';
  end if;

  select * into v_q from public.quizzes q where q.id = p_quiz_id;
  if not found then
    return query select false, 'not_found'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  if not v_q.is_published then
    return query select false, 'not_published'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  if not public.quiz_readable(v_q.id, v_q.track, v_q.is_published, v_q.bank_id) then
    return query select false, 'quiz_closed'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  if v_q.opens_at is not null and now() < v_q.opens_at then
    return query select false, 'not_open_yet'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  if v_q.due_at is not null and now() > v_q.due_at then
    return query select false, 'past_due'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_quiz_id::text || v_uid::text, 0));

  select coalesce(max(a.attempt_no), 0) + 1 into v_n
  from public.quiz_attempts a
  where a.quiz_id = p_quiz_id and a.student_id = v_uid;

  -- ⚠️ هنا الفرق: المؤقّت محاولةٌ واحدة، والمسجَّل بلا حدّ — ما لم يضع
  --    المعلّم رقماً صريحاً فيغلب الافتراض.
  v_limit := private.effective_max_attempts(v_q);
  if v_limit is not null and v_n > v_limit then
    return query select false, 'attempts_exhausted'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  v_exp := case when v_q.time_limit_minutes is null then null
                else now() + make_interval(mins => v_q.time_limit_minutes) end;
  if v_q.due_at is not null then
    v_exp := least(coalesce(v_exp, v_q.due_at), v_q.due_at);
  end if;

  insert into public.quiz_attempts (quiz_id, student_id, attempt_no, expires_at)
  values (p_quiz_id, v_uid, v_n, v_exp)
  returning id into v_id;

  return query select true, 'started'::text, v_id, v_n, v_exp;
end;
$$;

revoke all on function public.start_attempt(uuid) from public, anon;
grant execute on function public.start_attempt(uuid) to authenticated;
