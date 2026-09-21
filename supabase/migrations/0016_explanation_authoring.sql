-- =============================================================================
-- ٠٠١٦ — كتابة الشرح: في المعاملة نفسها، وصورته يراها من يحقّ له
--
-- ٠٠١٥ بنى **مكان** الشرح وسياسة قراءته. وهذا يبني **طريق كتابته**، ويسدّ
-- ثغرةً تركها الأوّل: صورة الشرح لم يكن لها سبيلٌ إلى عين الطالب.
--
-- ⚠️ لماذا داخل `save_quiz` لا بدالّةٍ ثانية تُستدعى بعدها؟
--    لأنّ العلّة التي بُنيت من أجلها `save_quiz` أصلاً (٠٠٠٩) هي هذه بعينها:
--    شجرةٌ تُكتب على دفعاتٍ ينقطع في وسطها الاتّصال فتبقى نصفَ مكتوبة.
--    ولو حُفظ الاختبار في نداءٍ وشروحه في نداءٍ آخر لأنتج فشلُ الثاني
--    اختباراً محفوظاً بشروحٍ ضائعة — والمعلّم يظنّه حُفظ. فالشرح يُكتب مع
--    سؤاله أو لا يُكتب.
--
-- ⚠️ وإعادة كتابة الدالّة كاملةً هنا — لا تعديل نصّها آلياً كما في ٠٠١٤ —
--    مقصودة: الاستبدال النصّي يفشل صامتاً حين يتغيّر السطر المقصود، وهذه
--    الدالّة أخطر من أن تُترك لمطابقة نصّ. وهذا هو تعريفها النافذ.
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
  v_ex_body  text;
  v_ex_image text;
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

    -- ---- شرح الحلّ ----
    -- ⚠️ يُكتب **ولو كان السؤال مقفلاً**: القفل يحمي ما رآه الطالب وما
    --    يُصحَّح عليه، والشرح ليس منهما. بل أحوج ما يكون المعلّم إلى كتابته
    --    بعد أن يرى من أخطأ فيه — فمنعُه عن المقفل يمنعه في الحالة الوحيدة
    --    التي يُطلب فيها.
    --
    -- ⚠️⚠️ و**غياب المفتاح غير خلوّه**: حمولةٌ لا تذكر الشرح أصلاً
    --    لا تمسّه، وحمولةٌ تذكره فارغاً تمحوه. ولولا هذا الفرق لكان كل حفظٍ
    --    من واجهةٍ لا تعرف الحقل محواً صامتاً لشرحٍ كتبه المعلّم — وهو فقدٌ
    --    لا يُبلَّغ عنه ولا يُستعاد.
    if (v_q ? 'explanation') or (v_q ? 'explanation_image_path') then
      v_ex_body  := nullif(btrim(v_q->>'explanation'), '');
      v_ex_image := nullif(v_q->>'explanation_image_path', '');

      if v_ex_body is null and v_ex_image is null then
        -- المحو: ولا يُترك صفٌّ خاوٍ — قيد الجدول يرفضه أصلاً
        delete from public.question_explanations e where e.question_id = v_qid;
      else
        insert into public.question_explanations (question_id, body, image_path)
        values (v_qid, v_ex_body, v_ex_image)
        on conflict (question_id) do update
          set body = excluded.body, image_path = excluded.image_path;
      end if;
    end if;

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


-- ⚠️ `create or replace` يُبقي الصلاحيات القائمة، لكنّ البند ٣ لا يُترك
--    لافتراض: يُسحب من العموم ويُمنح للمحتاج صراحةً في كل مهاجرة.
revoke all on function public.save_quiz(jsonb) from public, anon;
grant execute on function public.save_quiz(jsonb) to authenticated;

-- =============================================================================
-- صورة الشرح: باب قراءةٍ لم يكن موجوداً
--
-- ⚠️⚠️ الثغرة التي سدّها هذا القسم: دلو `question-images` خاصّ، وسياسة
--    الطالب فيه (٠٠٠٨) تعرف مسارين اثنين لا ثالث لهما — `prompt_image_path`
--    و`image_path` على الخيار. فصورة الشرح، وهي في الدلو نفسه، لم يكن لها
--    صفٌّ يُطابقها في أيّ منهما: يُوقَّع رابطها فيُردّ، فيرى الطالب فراغاً
--    مكان الحلّ الذي كتبه له المعلّم — بلا رسالة خطأ.
--
-- ⚠️ والشرط **لا يُعاد كتابته هنا**: الاستعلام الفرعي على
--    `question_explanations` يخضع لسياستي ذلك الجدول — «سلّم» للطالب،
--    و`is_teacher()` للمعلّم. فيوم يضيق الحقّ هناك يضيق هنا معه، ولا
--    يفترق الشرطان بمرور الوقت. وهي الحيلة نفسها المكتوبة في ٠٠٠٨ لملفّات
--    المصادر، للسبب نفسه.
-- =============================================================================
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'تخطّي سياسات المخزن: لا مخطّط `storage` هنا (قاعدة محلّية).';
    return;
  end if;

  execute $p$
    drop policy if exists storage_student_read_question_images on storage.objects;
    create policy storage_student_read_question_images on storage.objects for select to authenticated
      using (
        bucket_id = 'question-images'
        and (
          exists (select 1 from public.quiz_questions q
                   where q.prompt_image_path = storage.objects.name)
          or exists (select 1 from public.quiz_options o
                      where o.image_path = storage.objects.name)
          -- صورة الشرح: لا تُرى إلّا بعد التسليم، بحكم سياسة جدولها
          or exists (select 1 from public.question_explanations e
                      where e.image_path = storage.objects.name)
        )
      );
  $p$;
end $$;
