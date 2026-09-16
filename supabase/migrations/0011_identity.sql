-- =============================================================================
-- ٠٠١١ — الهويّة: من أنت فعلاً، وكم مضى على إثباتها
--
-- من ملحق «الدخول بحساب Google» — القسمان ٥ و٧. وكلاهما عطلٌ وقع في
-- إنتاجٍ حقيقيّ، لا احتياطٌ نظريّ.
--
-- ⚠️ الدالّتان هنا **ليستا `security definer`** — خلافاً لكل دالّةٍ في
--    `0005`. والفرق مقصود: هاتان تقرآن رمز **المستدعي نفسه** (`auth.jwt()`)،
--    ولا تلمسان صفّاً واحداً في أي جدول. فرفعُ الصلاحية فيهما زيادةٌ بلا
--    حاجة — وكل زيادةٍ بلا حاجة سطحُ هجومٍ إضافيّ.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- ١) هل المستدعي **شخصٌ حقيقيّ** لا جلسةٌ مجهولة؟
--
-- ⚠️⚠️ الفخّ الصامت: الجلسة المجهولة رمزها **صحيحٌ تماماً**، ولها معرّف
--      مستخدمٍ حقيقيّ في `auth.users`، وتجتاز أي فحصٍ ساذجٍ من نوع «هل
--      `auth.uid()` موجود؟». فمن اكتفى بذلك صار كل زائرٍ مجهولٍ عنده
--      مستخدماً مصرَّحاً له.
--
-- ⚠️ وحراسة هذا المشروع **عضوية** لا «هل أنت داخل»: القراءة مشروطةٌ بصفٍّ
--    في `teachers` أو باشتراكٍ سارٍ، والمجهول لا يملك أيّاً منهما. فلا
--    تسريب. لكن بابين كانا مفتوحين له: إنشاء ملفٍّ شخصيّ لنفسه، ثمّ تقديم
--    **طلب اشتراك**. فيلوّث طابور المعلّم بطلباتٍ من لا بريد له أصلاً.
--
-- الشروط الثلاثة مجتمعة: هويّة، وليست مجهولة، وبريدٌ موجود.
-- -----------------------------------------------------------------------------
create or replace function public.is_identified()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null
     and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
     and coalesce(auth.jwt() ->> 'email', '') <> '';
$$;

comment on function public.is_identified() is
  'هويّة حقيقية: رمزٌ صالح، وليست جلسةً مجهولة، وبريدٌ موجود.';

-- -----------------------------------------------------------------------------
-- ٢) هل أُثبتت الهويّة بـGoogle **حديثاً**؟
--
-- يضع الخادم في الرمز الموقَّع حقل `amr` يسرد طرق المصادقة المستعملة فعلاً
-- مع توقيت كلٍّ منها:
--
--     "amr": [ { "method": "oauth", "timestamp": 1757… } ]
--
-- ⚠️ والحقل **موقَّعٌ من الخادم فلا يستطيع المتصفّح تزويره** — وهذه هي
--    النقطة كلّها: يصلح أساساً لقرارٍ أمنيّ حقيقيّ، لا لعرضٍ فحسب.
--
-- ⚠️ ولماذا «حديثاً» لا «أصلاً»؟ جلسةٌ فُتحت بـGoogle قبل أسبوع على جهازٍ
--    تُرك في غرفة المعلّمين ليست إثباتاً لحضور صاحبها الآن.
--
-- ⚠️ وهي **غير مستعملةٍ في أي سياسة بعد**، بعمد: المعلّم اليوم يدخل بكلمة
--    مرور وGoogle لم يُفعَّل بعد في الإعدادات. فربطها بسياسات الكتابة الآن
--    يُغلق المنصّة على مالكها. تُربط بعد أن يعمل الدخول بـGoogle ويُجرَّب.
-- -----------------------------------------------------------------------------
create or replace function public.google_verified(p_hours int default 12)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select max((e ->> 'timestamp')::bigint)
       from jsonb_array_elements(coalesce(auth.jwt() -> 'amr', '[]'::jsonb)) e
      where e ->> 'method' = 'oauth')
    > (extract(epoch from now())::bigint - (p_hours * 3600)),
    false);
$$;

comment on function public.google_verified(int) is
  'أُثبتت الهويّة بمزوّد خارجيّ خلال الساعات المذكورة (١٢ افتراضاً). غير مربوطةٍ بسياسة بعد.';

-- -----------------------------------------------------------------------------
-- ٣) سدّ البابين المفتوحين للمجهول
--
-- ⚠️ الشرط يُضاف إلى ما كان، لا يحلّ محلّه: ملفّك أنت **و** هويّةٌ حقيقية.
-- -----------------------------------------------------------------------------
drop policy if exists profiles_insert_self on public.profiles;
create policy profiles_insert_self on public.profiles for insert to authenticated
  with check (id = auth.uid() and (select public.is_identified()));

drop policy if exists subreq_insert_self on public.subscription_requests;
create policy subreq_insert_self on public.subscription_requests for insert to authenticated
  with check (
    student_id = auth.uid()
    -- ⚠️ `status = 'pending'` باقٍ من `0005` ولا يُمسّ: بدونه يُنشئ الطالب
    --    طلباً **مقبولاً** بنفسه، فيمنح نفسه اشتراكاً مدفوعاً بسطرٍ واحد.
    and status = 'pending'
    and (select public.is_identified())
  );

-- -----------------------------------------------------------------------------
-- ٤) الصلاحيات — البند نفسه الذي أنتج `0010`
-- -----------------------------------------------------------------------------
revoke all on function public.is_identified()     from public, anon;
revoke all on function public.google_verified(int) from public, anon;
grant execute on function public.is_identified()     to authenticated;
grant execute on function public.google_verified(int) to authenticated;

-- -----------------------------------------------------------------------------
-- ٥) نافذة الهوية: يقبلها إثباتُ Google الموقَّع
--
-- ⚠️ الفرق الذي كشفه الملحق: `confirm_identity()` القائمة **يستطيع أي صاحب
--    جلسةٍ استدعاءها**. فهي تقول «ما زلتُ هنا» لا «أنا هو». والواجهة تطلب
--    كلمة المرور قبلها — لكنّ القاعدة لا تستطيع التحقّق من ذلك إطلاقاً،
--    وهي وحدها الحارس. أمّا `amr` فموقَّعٌ من خادم المصادقة، فلا يُزوَّر.
--
-- ⚠️ وهي إضافةٌ بـ`or` لا استبدال، بعمد: المعلّم اليوم يدخل بكلمة مرور،
--    فاستبدالها الآن يُغلق عليه منصّته. ومتى عمل الدخول بـGoogle وجُرّب،
--    يُحذف الفرع الأضعف في مهاجرةٍ مستقلّة — **وهذا هو الغرض**، لا أن
--    يبقى الفرعان أبداً.
-- -----------------------------------------------------------------------------
create or replace function private.has_recent_confirmation(p_hours integer default 12)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.google_verified(p_hours)
      or exists (
        select 1 from private.identity_confirmations c
        where c.user_id = auth.uid()
          and c.confirmed_at > now() - make_interval(hours => p_hours)
      );
$$;

revoke all on function private.has_recent_confirmation(integer) from public, anon;
