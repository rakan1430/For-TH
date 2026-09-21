/**
 * مسودّة الاختبار — ورقة الشطب التي يُعطاها الطالب في قاعة قياس.
 *
 * ⚠️ **لا تُحفظ في الخادم ولا تُرسل إليه**، بعمد: هي ورقة شطب. ولو حُفظت
 *    لصارت بياناتٍ عن كيف يفكّر الطالب، يراها غيره يوماً — وليست جزءاً من
 *    إجابته ولا من تقييمه. تعيش ما دامت الصفحة مفتوحة وتذهب معها.
 *
 * ⚠️⚠️ والإحداثيات **معياريّة (٠..١) لا بالبكسل**: القماش يُعاد رسمه بحجم
 *      العنصر، وحجمه يتغيّر بدوران الهاتف وبفتح الشريط الجانبي. فلو خُزّنت
 *      بالبكسل لانزاح ما رسمه الطالب عن موضعه كلّما تغيّر العرض — وهو يظنّه
 *      ضاع. والنسبة تصمد عند أي حجم.
 */

export interface Point { x: number; y: number }

export interface Stroke {
  points: Point[];
  /** ممحاةٌ لا قلم: تُرسم بنفس المسار وتمحو ما تحتها */
  erase: boolean;
}

/** يحوّل موضع المؤشّر إلى نسبةٍ من القماش، مقصوصةً داخل حدوده. */
export function normalize(
  clientX: number, clientY: number,
  rect: { left: number; top: number; width: number; height: number }
): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function beginStroke(strokes: Stroke[], p: Point, erase: boolean): Stroke[] {
  return [...strokes, { points: [p], erase }];
}

/**
 * ⚠️ الحارس أوّلاً: امتدادٌ بلا بدايةٍ يعني مؤشّراً تحرّك بلا ضغط، أو حدثاً
 *    وصل بعد رفع الإصبع. يُتجاهَل بلا إنشاء خطٍّ من نقطةٍ واحدة (خ-٨).
 */
export function extendStroke(strokes: Stroke[], p: Point): Stroke[] {
  if (strokes.length === 0) return strokes;
  const last = strokes[strokes.length - 1]!;
  return [...strokes.slice(0, -1), { ...last, points: [...last.points, p] }];
}

export function undo(strokes: Stroke[]): Stroke[] {
  return strokes.slice(0, -1);
}

export function isEmpty(strokes: Stroke[]): boolean {
  return strokes.every((s) => s.points.length === 0) || strokes.length === 0;
}
