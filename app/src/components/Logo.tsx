/**
 * العلامة: محوران وعليهما منحنى، وعلى المنحنى نقطة.
 *
 * أبسط صورةٍ يعرفها كل طالب رياضيات — والنقطة على المنحنى هي الطالب.
 * المحوران بلون النصّ الأول، والمنحنى والنقطة بالأحمر.
 */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      role="img" aria-label="شعار المنصّة"
    >
      {/* المحوران */}
      <path
        d="M4 3v16.5h16.5"
        stroke="var(--text-1)" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
      {/* المنحنى */}
      <path
        d="M6.5 17C9 17 9.5 7.5 13 7.5c2.6 0 3.6 4.2 6 4.2"
        stroke="var(--accent)" strokeWidth="1.5" strokeLinecap="round"
      />
      {/* النقطة: الطالب */}
      <circle cx="13" cy="7.5" r="2.1" fill="var(--accent)" />
    </svg>
  );
}

/**
 * اسم المنصّة — أعطاه المالك (أ. محمد الشرطي).
 *
 * ⚠️ بقي عنصراً نائباً حتى وصل الاسم الحقيقيّ، ولم يُخترَع في يومٍ من
 *    الأيّام. وموضعه واحدٌ في المشروع كلّه، فتغييره سطرٌ لا مطاردةٌ في
 *    عشرين ملفّاً.
 *
 * ⚠️ وكُتبت «إتقان» بهمزة القطع — وهو صوابها. فإن أراد المالك رسمها بلا
 *    همزة فهو اسمُ علامته وقراره، ويُغيَّر هنا.
 */
export const PLATFORM_NAME = "إتقان الشرطي";

export function Brand() {
  return (
    <span className="brand">
      <Logo />
      <span>{PLATFORM_NAME}</span>
    </span>
  );
}
