-- =============================================================================
-- ٠٠٠٩ — التأليف: ما يحتاجه المعلّم لينشئ محتواه بنفسه
--
-- «المعلّم الذي ستُسلَّم له المنصّة لا يعرف SQL ولن يفتحها.» فكل ما كان
-- يُنشأ بـSQL يصير له مسارٌ من الواجهة — وبحراسةٍ كاملة كبقيّة المسارات.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ⚠️ حمايةٌ بنيوية للنتائج
--
-- «ولا تُحذف نتائجه.» وحذف اختبارٍ يتسلسل إلى محاولاته وإجاباتها. ولمّا صار
-- للمعلّم زرّ حذفٍ في الواجهة، صارت ضغطةٌ واحدة كافيةً لمحو درجات فصلٍ كامل.
--
-- والحارس هنا **مُشغِّل على الجدول** لا فحصٌ في الواجهة: يسري على أي مسار —
-- زرّ الواجهة، واستدعاء مباشر، وحذف بنكٍ يتسلسل إلى اختباراته.
-- -----------------------------------------------------------------------------
create or replace function private.block_delete_with_results()
returns trigger
language plpgsql
set search_path = ''
as $$
declare v_n integer;
begin
  select count(*) into v_n
  from public.quiz_attempts a
  where a.quiz_id = old.id and a.status = 'submitted';

  if v_n > 0 then
    raise exception
      'لا يُحذف اختبارٌ له % محاولة مسلَّمة — النتائج لا تُمحى. أخفِ الاختبار بإلغاء نشره بدل حذفه.', v_n
      using errcode = '23503';
  end if;
  return old;
end;
$$;

drop trigger if exists quizzes_protect_results on public.quizzes;
create trigger quizzes_protect_results
  before delete on public.quizzes
  for each row execute function private.block_delete_with_results();

-- -----------------------------------------------------------------------------
-- ⚠️ سلوك النوعين — كان ناقصاً
--
-- كان `retention` عموداً يُعرض ولا يفعل شيئاً: الاختبار **المؤقّت** يُعاد بلا
-- حدّ كالمسجَّل تماماً ما لم يضع المعلّم حدّاً يدوياً. وهذا يخالف التمييز
-- الجوهري بين النوعين.
--
-- الآن: `max_attempts = NULL` تعني «بلا حدّ» للمسجَّل، و«محاولة واحدة»
-- للمؤقّت. ويبقى للمعلّم أن يضع رقماً صريحاً فيغلب الافتراض.
-- -----------------------------------------------------------------------------
create or replace function private.effective_max_attempts(q public.quizzes)
returns integer
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    q.max_attempts,
    case q.retention when 'temporary' then 1 else null end
  );
$$;

-- -----------------------------------------------------------------------------
-- إعادة ترتيب الأقسام أو البنوك
--
-- ⚠️ لا اسم جدولٍ يأتي من العميل ويُركَّب في نصّ SQL. الأنواع المسموحة
--    مكتوبة هنا صراحةً، وما عداها يُرفض. حقن SQL يبدأ دائماً بـ«الاسم يأتي
--    من الواجهة، وهي واجهتنا نحن».
-- -----------------------------------------------------------------------------
create or replace function public.reorder(p_kind text, p_ids uuid[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_n integer := 0;
begin
  if not public.is_teacher() then
    raise exception 'الترتيب للمعلّم وحده' using errcode = '42501';
  end if;

  -- ⚠️ يُتحقَّق من النوع **قبل** أي خروجٍ مبكّر. كان الترتيب معكوساً، فمرّ
  --    نوعٌ مجهولٌ بصمت متى جاءت القائمة فارغة — أي أنّ خطأً في الواجهة
  --    (أو محاولة عبثٍ) كان يُجاب بـ«صفر صفّ» بدل رفضٍ صريح. كشفه فحصٌ سالب.
  if p_kind is null or p_kind not in ('section', 'bank', 'group') then
    raise exception 'نوع غير مسموح للترتيب: %', p_kind using errcode = '22023';
  end if;

  if p_ids is null or cardinality(p_ids) = 0 then
    return 0;
  end if;

  if p_kind = 'section' then
    update public.sections s
       set position = o.pos
      from (select id, (ordinality - 1)::integer as pos
              from unnest(p_ids) with ordinality as t(id, ordinality)) o
     where s.id = o.id;
    get diagnostics v_n = row_count;

  elsif p_kind = 'bank' then
    update public.banks b
       set position = o.pos
      from (select id, (ordinality - 1)::integer as pos
              from unnest(p_ids) with ordinality as t(id, ordinality)) o
     where b.id = o.id;
    get diagnostics v_n = row_count;

  elsif p_kind = 'group' then
    update public.groups g
       set position = o.pos
      from (select id, (ordinality - 1)::integer as pos
              from unnest(p_ids) with ordinality as t(id, ordinality)) o
     where g.id = o.id;
    get diagnostics v_n = row_count;

  end if;

  return v_n;
end;
$$;

-- =============================================================================
-- حفظ اختبار كاملاً — في معاملةٍ واحدة
--
-- ⚠️ لماذا دالّة واحدة بدل كتابةٍ مباشرة من الواجهة؟
--    لأنّ الاختبار ليس صفّاً بل شجرة: اختبار ← أسئلة ← خيارات ← مفتاح إجابة.
--    ولو كُتبت من الواجهة صفّاً صفّاً لأنتج انقطاعُ الشبكة في المنتصف اختباراً
--    نصفَ مبنيّ: أسئلةً بلا خيارات، أو خياراتٍ بلا إجابةٍ صحيحة. وهذا يصل
--    الطالب فيؤدّي اختباراً مكسوراً.
--
-- ⚠️ وحمايةُ النتائج هنا دقيقة: سؤالٌ أجاب عنه طالبٌ فعلاً **لا يُحذف ولا
--    تُبدَّل خياراته**، وإلا فقدت إجابته معناها أو صارت درجته محسوبةً على
--    سؤالٍ غير الذي رآه. فتُقفل هذه الأسئلة، ويُبلَّغ عنها **عدداً صريحاً**
--    لا تُتجاهَل بصمت.
-- =============================================================================
create or replace function public.save_quiz(p_quiz jsonb)
returns table (
  ok boolean, reason text, quiz_id uuid,
  questions_saved integer, questions_locked integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := auth.uid();
  v_id       uuid;
  v_track    public.track_t;
  v_scope    public.quiz_scope_t;
  v_bank     uuid;
  v_q        jsonb;
  v_qid      uuid;
  v_opt      jsonb;
  v_oid      uuid;
  v_pos      integer := 0;
  v_opos     integer;
  v_saved    integer := 0;
  v_locked   integer := 0;
  v_keep     uuid[]  := array[]::uuid[];
  v_is_locked boolean;
begin
  -- ---- تحقّق قبل أي كتابة ----
  if not public.is_teacher() then
    raise exception 'التأليف للمعلّم وحده' using errcode = '42501';
  end if;

  v_track := (p_quiz->>'track')::public.track_t;
  v_scope := coalesce((p_quiz->>'scope')::public.quiz_scope_t, 'general');
  v_bank  := nullif(p_quiz->>'bank_id', '')::uuid;

  if coalesce(btrim(p_quiz->>'title'), '') = '' then
    return query select false, 'title_required'::text, null::uuid, 0, 0; return;
  end if;

  if v_scope = 'bank' and v_bank is null then
    return query select false, 'bank_required'::text, null::uuid, 0, 0; return;
  end if;

  if jsonb_typeof(p_quiz->'questions') <> 'array' then
    return query select false, 'questions_required'::text, null::uuid, 0, 0; return;
  end if;

  -- كل سؤالٍ يحتاج خياراً صحيحاً واحداً على الأقلّ، وإلا فالتصحيح بلا معنى
  for v_q in select * from jsonb_array_elements(p_quiz->'questions') loop
    if not exists (
      select 1 from jsonb_array_elements(v_q->'options') o
      where (o->>'is_correct')::boolean
    ) then
      return query select false, 'question_without_answer'::text, null::uuid, 0, 0; return;
    end if;
  end loop;

  -- ---- تبدأ الكتابة هنا: لا `raise` بعد هذا السطر ----
  v_id := nullif(p_quiz->>'id', '')::uuid;

  if v_id is null then
    insert into public.quizzes
      (track, scope, bank_id, section_id, title, retention, is_published,
       opens_at, due_at, time_limit_minutes, max_attempts, position)
    values (
      v_track, v_scope, v_bank,
      nullif(p_quiz->>'section_id', '')::uuid,
      btrim(p_quiz->>'title'),
      coalesce((p_quiz->>'retention')::public.quiz_retention_t, 'permanent'),
      coalesce((p_quiz->>'is_published')::boolean, false),
      nullif(p_quiz->>'opens_at', '')::timestamptz,
      nullif(p_quiz->>'due_at', '')::timestamptz,
      nullif(p_quiz->>'time_limit_minutes', '')::integer,
      nullif(p_quiz->>'max_attempts', '')::integer,
      coalesce((p_quiz->>'position')::integer, 0)
    )
    returning id into v_id;
  else
    update public.quizzes set
      scope              = v_scope,
      bank_id            = v_bank,
      section_id         = nullif(p_quiz->>'section_id', '')::uuid,
      title              = btrim(p_quiz->>'title'),
      retention          = coalesce((p_quiz->>'retention')::public.quiz_retention_t, retention),
      is_published       = coalesce((p_quiz->>'is_published')::boolean, is_published),
      opens_at           = nullif(p_quiz->>'opens_at', '')::timestamptz,
      due_at             = nullif(p_quiz->>'due_at', '')::timestamptz,
      time_limit_minutes = nullif(p_quiz->>'time_limit_minutes', '')::integer,
      max_attempts       = nullif(p_quiz->>'max_attempts', '')::integer
    where id = v_id;
  end if;

  -- ---- الأسئلة ----
  for v_q in select * from jsonb_array_elements(p_quiz->'questions') loop
    v_qid := nullif(v_q->>'id', '')::uuid;

    -- سؤالٌ أجاب عنه طالبٌ فعلاً: مقفل
    v_is_locked := v_qid is not null and exists (
      select 1 from public.attempt_answers aa where aa.question_id = v_qid
    );

    if v_qid is null then
      insert into public.quiz_questions (quiz_id, position, prompt, prompt_image_path, points)
      values (v_id, v_pos, nullif(btrim(v_q->>'prompt'), ''),
              nullif(v_q->>'prompt_image_path', ''),
              coalesce((v_q->>'points')::numeric, 1))
      returning id into v_qid;
    elsif v_is_locked then
      -- المقفل: يُحرَّك موضعه ولا يُمسّ نصّه ولا خياراته
      update public.quiz_questions set position = v_pos where id = v_qid;
      v_locked := v_locked + 1;
    else
      update public.quiz_questions set
        position = v_pos,
        prompt = nullif(btrim(v_q->>'prompt'), ''),
        prompt_image_path = nullif(v_q->>'prompt_image_path', ''),
        points = coalesce((v_q->>'points')::numeric, 1)
      where id = v_qid;
    end if;

    v_keep := v_keep || v_qid;

    if not v_is_locked then
      -- الخيارات تُستبدل كاملةً، ومعها مفتاح الإجابة
      delete from public.quiz_options o where o.question_id = v_qid;
      v_opos := 0;
      for v_opt in select * from jsonb_array_elements(v_q->'options') loop
        insert into public.quiz_options (question_id, position, label, image_path)
        values (v_qid, v_opos, nullif(btrim(v_opt->>'label'), ''),
                nullif(v_opt->>'image_path', ''))
        returning id into v_oid;

        if coalesce((v_opt->>'is_correct')::boolean, false) then
          insert into private.answer_key (question_id, option_id) values (v_qid, v_oid);
        end if;
        v_opos := v_opos + 1;
      end loop;
      v_saved := v_saved + 1;
    end if;

    v_pos := v_pos + 1;
  end loop;

  -- ---- ما حُذف من الاختبار ----
  -- المقفل لا يُحذف مهما فعل المعلّم: إجابات الطلاب تشير إليه.
  delete from public.quiz_questions qq
  where qq.quiz_id = v_id
    and not (qq.id = any (v_keep))
    and not exists (select 1 from public.attempt_answers aa where aa.question_id = qq.id);

  select v_locked + count(*)::integer into v_locked
  from public.quiz_questions qq
  where qq.quiz_id = v_id and not (qq.id = any (v_keep));

  -- ---- الإبلاغ: أعداد صريحة، لا «حُفظ ✅» ----
  return query select true, 'saved'::text, v_id, v_saved, v_locked;
end;
$$;

-- =============================================================================
-- الصلاحيات — البند ٣ يسري على كل دالّة جديدة، بلا استثناء
-- =============================================================================
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private') and p.prokind in ('f', 'p')
  loop
    execute format('revoke all on function %s from public', f.sig);
  end loop;
end $$;

grant execute on function public.reorder(text, uuid[]) to authenticated;
grant execute on function public.save_quiz(jsonb)      to authenticated;
-- ولا شيء لـ`private.effective_max_attempts` ولا `private.block_delete_with_results`

-- =============================================================================
-- إعادة تعريف `start_attempt` لتطبيق سلوك النوعين
--
-- الفرق الوحيد عن نسخة `0006`: الحدّ الفعليّ للمحاولات يأتي من
-- `private.effective_max_attempts` بدل `max_attempts` خاماً — فالمؤقّت
-- محاولةٌ واحدة افتراضاً، والمسجَّل بلا حدّ.
--
-- ⚠️ `create or replace` يُبقي صلاحيات الدالّة كما هي، فلا تُفتح للعالم
--    بالاستبدال. ومع ذلك نُعيد السحب والمنح صراحةً أدناه: الاعتماد على أنّ
--    «الاستبدال يحفظ الصلاحيات» اعتمادٌ على تفصيلٍ يسهل نسيانه.
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

  if not public.has_active_subscription(v_q.track) then
    return query select false, 'no_subscription'::text, null::uuid, null::integer, null::timestamptz;
    return;
  end if;

  if not (
    public.is_assigned('quiz', v_q.id)
    or (v_q.bank_id is not null and public.is_assigned('bank', v_q.bank_id))
  ) then
    return query select false, 'not_assigned'::text, null::uuid, null::integer, null::timestamptz;
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

revoke all on function public.start_attempt(uuid) from public;
grant execute on function public.start_attempt(uuid) to authenticated;

-- =============================================================================
-- قراءة مفتاح الإجابة — للمعلّم وحده
--
-- ⚠️ نقطةٌ يسهل الخلط فيها، فلتُقرأ بدقّة:
--
--    القاعدة ليست «لا أحد يقرأ المفتاح»، بل **«لا طريق من الطالب إلى
--    المفتاح»**. والمعلّم هو من كتبه أصلاً، ولا بدّ أن يراه ليعدّل اختباراً
--    بناه أمس — وإلا أُجبر على إعادة تحديد الإجابات الصحيحة كلّها في كل
--    تعديل، فيخطئ يوماً ويصير التصحيح خطأً على فصلٍ كامل.
--
--    فالمنع يبقى تامّاً حيث يجب: لا `grant` على `private.answer_key` لأي
--    دور، ولا تُعيد هذه الدالّة صفّاً واحداً لغير المعلّم — تفحص `is_teacher()`
--    في أوّل سطرٍ منها، ويحرس ذلك فحصٌ صريح في `10_authoring.test.sql`.
-- =============================================================================
create or replace function public.teacher_answer_key(p_quiz_id uuid)
returns table (question_id uuid, option_id uuid)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_teacher() then
    raise exception 'مفتاح الإجابة للمعلّم وحده' using errcode = '42501';
  end if;

  return query
  select k.question_id, k.option_id
  from private.answer_key k
  join public.quiz_questions qq on qq.id = k.question_id
  where qq.quiz_id = p_quiz_id;
end;
$$;

revoke all on function public.teacher_answer_key(uuid) from public;
grant execute on function public.teacher_answer_key(uuid) to authenticated;
