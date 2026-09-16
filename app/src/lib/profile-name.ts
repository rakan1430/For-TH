/**
 * اختيار اسم العرض لصفّ `profiles`.
 *
 * ⚠️ لماذا دالّةٌ مستقلّة ومفحوصة بدل سطرٍ في مكانه؟ لأنّ `full_name` عمودٌ
 *    `not null` بقيدٍ صارم: `length(btrim(full_name)) between 2 and 120`.
 *    فاسمٌ فارغ أو حرفٌ واحد أو اسمٌ طويل من Google **يُرفض عند الإدراج**،
 *    والمستخدم حينها بلا صفّ `profiles` — ولا يستطيع طلب اشتراكٍ أصلاً،
 *    لأنّ المفتاح الأجنبي يمنعه. عطبٌ صامتٌ لا يظهر إلّا عند الدفع.
 *
 *    فالضمان هنا لا هناك: هذه الدالّة **لا تُعيد إلّا نصّاً يجتاز القيد**.
 */

const FALLBACK = "مستخدم جديد";
const MIN = 2;
const MAX = 120;

type Meta = Record<string, unknown> | null | undefined;

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (t.length < MIN) return null;
  return t.length > MAX ? t.slice(0, MAX).trim() : t;
}

export function pickName(opts: {
  /** ما كتبه المستخدم في نموذجنا — أولى، فقد اختاره بنفسه وغالباً بالعربية */
  typed?: string | null;
  /** `user_metadata` من Google: `full_name` ثمّ `name` */
  metadata?: Meta;
  email?: string | null;
}): string {
  const m = opts.metadata ?? {};
  return (
    clean(opts.typed) ??
    clean(m["full_name"]) ??
    clean(m["name"]) ??
    clean((opts.email ?? "").split("@")[0]) ??
    FALLBACK
  );
}
