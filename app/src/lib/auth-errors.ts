/**
 * ترجمة أخطاء المصادقة إلى عربيّةٍ تقول للمستخدم **ما يفعله**، لا ما جرى.
 *
 * ⚠️ الدرس الذي أنتج هذا الملفّ: أنشأ المالك حساباً فلم تصله رسالة تأكيد،
 *    فحاول الدخول فظهرت له `Email not confirmed` — سطرٌ إنجليزيّ في واجهةٍ
 *    عربية لا يخبره أنّ الحساب أُنشئ فعلاً، ولا أنّ العطب في البريد لا في
 *    كلمة المرور. فوقف. **رسالة خطأ لا تقول الخطوة التالية عطبٌ في ذاتها.**
 *
 * ⚠️ والمطابقة على `code` أوّلاً لا على نصّ الرسالة: نصوص GoTrue تتغيّر بين
 *    إصداراته، والرموز مستقرّة. ونصّ الرسالة احتياطٌ لخادمٍ قديم لا يرسل رمزاً.
 */

type Shape = { code?: unknown; message?: unknown; status?: unknown };

const BY_CODE: Record<string, string> = {
  email_not_confirmed:
    "الحساب موجود، لكن البريد لم يُؤكَّد بعد. أبلغ المعلّم ليؤكّده لك — " +
    "أو عطِّل «تأكيد البريد» من إعدادات المشروع.",
  invalid_credentials: "البريد أو كلمة المرور غير صحيحة.",
  user_already_exists: "هذا البريد له حسابٌ بالفعل. سجّل الدخول به.",
  email_exists: "هذا البريد له حسابٌ بالفعل. سجّل الدخول به.",
  weak_password: "كلمة المرور قصيرة أو ضعيفة. اجعلها ٨ محارف فأكثر.",
  over_email_send_rate_limit:
    "تجاوزتَ حدّ رسائل البريد المسموح بها في الساعة. انتظر ساعةً، " +
    "أو اطلب من المعلّم تأكيد حسابك مباشرةً.",
  over_request_rate_limit: "محاولاتٌ كثيرة متتابعة. انتظر قليلاً ثم أعد المحاولة.",
  validation_failed: "تحقّق من صيغة البريد الإلكتروني.",
  email_address_invalid: "تحقّق من صيغة البريد الإلكتروني.",
  signup_disabled: "إنشاء الحسابات مغلقٌ حالياً. راجع المعلّم.",
  session_expired: "انتهت الجلسة. سجّل الدخول من جديد.",
};

/** احتياطٌ لخادمٍ لا يرسل `code`: مطابقةٌ على مقاطع من النصّ الإنجليزي. */
const BY_TEXT: [RegExp, string][] = [
  [/email not confirmed/i, BY_CODE.email_not_confirmed!],
  [/invalid login credentials/i, BY_CODE.invalid_credentials!],
  [/already registered|already exists/i, BY_CODE.user_already_exists!],
  [/password should be at least|weak password/i, BY_CODE.weak_password!],
  [/email rate limit/i, BY_CODE.over_email_send_rate_limit!],
  [/you can only request this after/i, BY_CODE.over_request_rate_limit!],
  [/unable to validate email|invalid format/i, BY_CODE.validation_failed!],
  [/signups? not allowed/i, BY_CODE.signup_disabled!],
  // انقطاع الشبكة يصل من `fetch` بنصٍّ مبهم لا علاقة له بالمصادقة
  [/failed to fetch|networkerror|load failed/i,
    "تعذّر الوصول إلى الخادم. تحقّق من اتّصالك ثم أعد المحاولة."],
];

export function authErrorMessage(err: unknown): string {
  const e = (err ?? {}) as Shape;
  const code = typeof e.code === "string" ? e.code : "";
  if (code && BY_CODE[code]) return BY_CODE[code]!;

  const text = typeof e.message === "string" ? e.message : "";
  for (const [re, ar] of BY_TEXT) if (re.test(text)) return ar;

  /*
   * ⚠️ لا نبتلع ما لا نعرفه خلف «حدث خطأ». نصٌّ إنجليزيٌّ يستطيع المالك
   *    أن ينقله إليّ خيرٌ من عبارةٍ مهذّبة لا تُشخّص شيئاً.
   */
  return text || "تعذّر إتمام العملية.";
}
