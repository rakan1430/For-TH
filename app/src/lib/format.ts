/**
 * تنسيق التواريخ والأرقام والأسعار.
 *
 * ⚠️ فخّ صامت كلّف وقتاً في المشروع السابق (البند ١٧): المحلّية `"ar-SA"`
 *    وحدها تُعطي **التقويم الهجري**. فيكتب المعلّم موعد تسليمٍ ميلادياً
 *    ويراه الطالب هجرياً — ولا رسالة خطأ ولا شيء يلفت النظر.
 *
 *    **وموعدٌ يُفهم خطأً أسوأ من موعدٍ لا يظهر.**
 *
 *    ولذلك لا يُستعمل `toLocaleDateString` مباشرةً في هذا المشروع إطلاقاً:
 *    كل تاريخٍ يمرّ من هنا. ويفحص `scripts/check-locale.mjs` أن لا استدعاء
 *    خارج هذا الملفّ.
 */

/** التقويم ميلاديّ والأرقام لاتينية صراحةً — لا يُختصر هذا الثابت. */
export const AR_LOCALE = "ar-SA-u-ca-gregory-nu-latn" as const;

const DATE_FMT = new Intl.DateTimeFormat(AR_LOCALE, {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const DATETIME_FMT = new Intl.DateTimeFormat(AR_LOCALE, {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

const SHORT_FMT = new Intl.DateTimeFormat(AR_LOCALE, {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function toDate(value: string | number | Date): Date | null {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** تاريخ ميلاديّ بأرقام لاتينية. يُعيد «—» لقيمةٍ غير صالحة، ولا يرمي. */
export function formatDate(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const d = toDate(value);
  return d ? DATE_FMT.format(d) : "—";
}

export function formatDateTime(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const d = toDate(value);
  return d ? DATETIME_FMT.format(d) : "—";
}

export function formatDateShort(value: string | number | Date | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const d = toDate(value);
  return d ? SHORT_FMT.format(d) : "—";
}

/** الأيام المتبقّية حتى تاريخٍ ما (بالتقويم لا بالساعات، فلا تُنقص ساعةٌ يوماً). */
export function daysUntil(endsOn: string | Date, from: Date = new Date()): number {
  const end = toDate(endsOn);
  if (!end) return 0;
  const a = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  const b = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((a - b) / 86_400_000);
}

/* -------------------------------------------------------------------------
   الأسعار
   ⚠️ لم يحدّد المالك الأسعار بعد، واللوحات المعتمدة تكتبها `[السعر]`.
      فالقيمة NULL في القاعدة تعني «لم تُحدَّد» — لا صفراً ولا مجّاناً.
      ولا تُخترع قيمةٌ هنا ولا في أي مكان.
   ------------------------------------------------------------------------- */

export type Price =
  | { kind: "placeholder"; text: string }
  | { kind: "amount"; text: string };

const MONEY_FMT = new Intl.NumberFormat(AR_LOCALE, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * @param priceMinor القيمة بالوحدة الصغرى (هللات)، أو null إن لم تُحدَّد.
 */
export function formatPrice(
  priceMinor: number | null | undefined,
  currency = "SAR"
): Price {
  if (priceMinor === null || priceMinor === undefined) {
    return { kind: "placeholder", text: "[السعر]" };
  }
  const label = currency === "SAR" ? "ريال" : currency;
  return { kind: "amount", text: `${MONEY_FMT.format(priceMinor / 100)} ${label}` };
}

/** درجة من درجة: «٧٫٠٠ من ١٠٫٠٠» بأرقامٍ مصطفّة. */
export function formatScore(score: number | null, max: number | null): string {
  if (score === null || max === null) return "—";
  return `${MONEY_FMT.format(score)} من ${MONEY_FMT.format(max)}`;
}

export function formatPercent(score: number | null, max: number | null): string {
  if (score === null || max === null || max === 0) return "—";
  return `${Math.round((score / max) * 100)}٪`;
}

/** عدّ عربيّ سليم: «لا بنوك» و«بنك واحد» و«بنكان» و«٣ بنوك». */
export function countLabel(n: number, none: string, one: string, two: string, many: string): string {
  if (n === 0) return none;
  if (n === 1) return one;
  if (n === 2) return two;
  return `${n} ${many}`;
}
