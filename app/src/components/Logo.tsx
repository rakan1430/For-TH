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
 * ⚠️ اسم المنصّة مبنيّ على اسم المعلّم، ولم يُعطَه أحدٌ بعد. فهو عنصرٌ نائب
 *    **ظاهر**، في مكانٍ واحد، يُغيَّر بسطر — لا اسمٌ مخترَع يتسرّب إلى عشرين
 *    ملفّاً ويصعب تتبّعه لاحقاً.
 */
export const PLATFORM_NAME = "أ. ‹اسم المعلّم›";

export function Brand() {
  return (
    <span className="brand">
      <Logo />
      <span>{PLATFORM_NAME}</span>
    </span>
  );
}
