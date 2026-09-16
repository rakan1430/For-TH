/**
 * تفاصيل العودة من مزوّد الهويّة — كلّها من أعطالٍ وقعت في الإنتاج.
 * (ملحق «الدخول بحساب Google»، القسمان ٢ و٣.)
 */

/**
 * ⚠️⚠️ أخطر فخّ في الباب كلّه: **عنوان العودة غير المسموح لا يُنتج خطأً.**
 *    الدخول ينجح، ثمّ يتجاهل المزوّد `redirectTo` ويقذف المستخدم إلى
 *    `Site URL` المضبوط في الإعدادات. فيقول المستخدم «دخلتُ… ووجدتُ نفسي
 *    في موقعٍ آخر»، ولا شيء في وحدة التحكّم يشير إلى السبب. وقد أُهدرت
 *    جلسةٌ كاملة في المشروع السابق على مطاردة أعطالٍ وهمية في الشفرة،
 *    والعلّة سطرٌ ناقص في لوحة الإعدادات.
 *
 *    فنعلّم الانطلاق: نحفظ الأصل الذي انطلقنا منه، فإن عدنا إلى أصلٍ آخر
 *    عرفنا **يقيناً** أنّ `redirectTo` أُهمل — ونقولها بدل أن يبحث أحدٌ
 *    في الشفرة عن عطبٍ ليس فيها.
 */
const MARK = "for-th:oauth-origin";

export function markOAuthStart(origin: string): void {
  try { sessionStorage.setItem(MARK, origin); } catch { /* تخزينٌ ممنوع */ }
}

export function takeOAuthMark(): string | null {
  try {
    const v = sessionStorage.getItem(MARK);
    if (v) sessionStorage.removeItem(MARK);
    return v;
  } catch { return null; }
}

/** رسالةُ «رجعتَ إلى أصلٍ غير الذي انطلقتَ منه»، أو `null` إن كان كلّ شيء سليماً. */
export function misredirectMessage(started: string | null, current: string): string | null {
  if (!started || started === current) return null;
  return (
    `دخلتَ بنجاح، لكنّ المزوّد أعادك إلى ${current} بدل ${started}. ` +
    "معناه أنّ عنوان العودة غير مُدرَجٍ في `Redirect URLs` بإعدادات المشروع. " +
    "هذا خطأ إعدادٍ لا خطأ منك."
  );
}

/**
 * عنوان العودة.
 *
 * ⚠️ **تُقصّ الشذرة.** المزوّد قد يضع شيئاً في الشذرة عند العودة، والشذرة
 *    هنا موضع المسارات (`#/teacher`) — فيتضاربان. ومسارُ المستخدم يُحمل
 *    في الاستعلام (`?next=`) بدلاً منها، فيعود إلى **نفس الصفحة** التي
 *    انطلق منها بلا تصادم. وإعادته إلى الجذر تعني أن يكرّر عمله كلّه.
 */
export function oauthRedirectTo(loc: { origin: string; pathname: string; hash: string }): string {
  const route = loc.hash.replace(/^#/, "");
  const base = `${loc.origin}${loc.pathname}`;
  if (!route.startsWith("/") || route === "/") return base;
  return `${base}?next=${encodeURIComponent(route)}`;
}

/** المسار المطلوب بعد العودة — ولا يُقبل إلّا مسارٌ داخليّ. */
export function readNext(search: string): string | null {
  let raw: string | null = null;
  try { raw = new URLSearchParams(search.replace(/^\?/, "")).get("next"); }
  catch { return null; }
  if (!raw) return null;
  /*
   * ⚠️ `//evil.com` و`https://evil.com` كلاهما يبدأ بشيءٍ يشبه المسار.
   *    فلا يُقبل إلّا ما يبدأ بشرطةٍ واحدة — وإلّا صار الرابط بوّابة
   *    تحويلٍ مفتوحة إلى أي موقع.
   */
  return /^\/(?!\/)/.test(raw) ? raw : null;
}

/** يمحو `next` وحدها من الرابط — و`code` تبقى ليقرأها عميل المصادقة. */
export function stripNext(href: string): string {
  const u = new URL(href);
  u.searchParams.delete("next");
  return u.pathname + (u.searchParams.toString() ? `?${u.searchParams}` : "") + u.hash;
}
