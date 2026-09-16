/**
 * زرّ «المتابعة بحساب Google».
 *
 * ⚠️ لماذا ليس أحمر؟ قاعدة الهوية: **زرٌّ أحمر واحدٌ في الشاشة** للفعل
 *    الأساسي وحده. وهذا الزرّ فعلٌ أساسيٌّ ثانٍ — فيُميَّز بعلامة Google
 *    وحدها، وهي أوضح للطالب من أيّ لونٍ نختاره، ولا تُزاحم الأحمر.
 *
 * ⚠️ والعلامة مضمَّنةٌ SVG لا صورةً من نطاق Google: سياسة أمن المحتوى
 *    (`img-src 'self' data: blob: https://*.supabase.co`) تحجب الصور
 *    الخارجية — فصورةٌ من `google.com` كانت ستُحجب بصمت، فيظهر زرٌّ بلا
 *    علامة ولا يعرف الطالب ما هو.
 */
export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 009 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 010-3.44V4.95H.96a9 9 0 000 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 00.96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

export function GoogleButton({ onClick, busy, label }: {
  onClick: () => void;
  busy?: boolean;
  label: string;
}) {
  return (
    <button type="button" className="btn btn--google" onClick={onClick} disabled={busy}>
      <GoogleMark />
      <span>{busy ? "…" : label}</span>
    </button>
  );
}
