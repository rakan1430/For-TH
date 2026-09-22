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

/* ------------------------- الرسم والتصدير صورةً --------------------------- */

export interface InkStyle {
  /** لون الحبر */
  ink: string;
  /** عرض القلم بالبكسل عند مقياسٍ واحد */
  pen?: number;
  /** عرض الممحاة — أعرض من القلم بكثير، كالممحاة الحقيقية */
  eraser?: number;
}

/**
 * ⚠️⚠️ **دالّة رسمٍ واحدة للقماش الحيّ وللصورة المصدَّرة معاً.** ولو كُتب
 *      الرسم مرّتين — مرّةً للشاشة ومرّةً للتصدير — لاختلفا يوماً في عرض
 *      قلمٍ أو استدارة طرف، فيحفظ المعلّم شيئاً غير الذي رآه. وهذا أسوأ
 *      أنواع العطل: لا رسالة خطأ، ولا يُكتشف إلّا بعد أن يراه الطالب.
 */
export function paintStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  width: number,
  height: number,
  style: InkStyle,
  scale = 1
): void {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const s of strokes) {
    if (s.points.length === 0) continue;
    // ⚠️ الممحاة تمحو إلى الشفافية لا إلى لون الورق: القماش طبقةٌ فوق
    //    الورق، فلو مُحيت بلون الورق لفسدت عند تبديل السمة أو التصدير.
    ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = style.ink;
    ctx.lineWidth = (s.erase ? (style.eraser ?? 18) : (style.pen ?? 2.5)) * scale;
    ctx.beginPath();
    // النِّسب تُضرب في الحجم الحالي — ولهذا خُزّنت نِسباً لا بكسلات
    ctx.moveTo(s.points[0]!.x * width, s.points[0]!.y * height);
    for (const pt of s.points.slice(1)) {
      ctx.lineTo(pt.x * width, pt.y * height);
    }
    // نقطةٌ واحدة: خطٌّ بلا طولٍ لا يُرسم، فتُزاح ذرّةً لتصير نقطة
    if (s.points.length === 1) {
      ctx.lineTo(s.points[0]!.x * width + 0.1, s.points[0]!.y * height);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

/**
 * أبعاد الصورة المصدَّرة.
 *
 * ⚠️ تحفظ **نسبة العرض إلى الارتفاع كما رآها الكاتب**: الإحداثيات معياريّة،
 *    فتصديرها بنسبةٍ أخرى يمطّ خطّ اليد أو يضغطه — ويظهر للطالب مشوّهاً.
 *
 * ⚠️ وبحدٍّ أعلى للضلع: مربّعٌ بمقياس الجهاز على شاشةٍ كبيرة يُنتج صورةً
 *    بملايين البكسلات، تُرفع في دلوٍ وتُحمَّل على جوّال الطالب بلا داعٍ.
 */
export function exportSize(
  cssWidth: number, cssHeight: number, scale: number, maxSide: number
): { width: number; height: number } {
  const w = Math.max(1, cssWidth) * Math.max(1, scale);
  const h = Math.max(1, cssHeight) * Math.max(1, scale);
  const shrink = Math.min(1, maxSide / Math.max(w, h));
  return { width: Math.round(w * shrink), height: Math.round(h * shrink) };
}

/**
 * يحوّل الخطوط إلى صورة PNG على ورقةٍ بيضاء.
 *
 * ⚠️⚠️ **طبقتان لا واحدة.** لو مُلئ الورق أوّلاً ثمّ رُسم فوقه، لثقبت
 *      الممحاة الورقَ إلى الشفافية — فيرى الطالب فجواتٍ في الحلّ. فتُرسم
 *      الخطوط على طبقةٍ شفّافة، ثمّ تُركَّب فوق الورق.
 *
 * ⚠️ والورق **أبيضٌ دائماً والحبر داكن**، لا ألوان السمة: الصورة تُحفظ مرّةً
 *    ويراها الطالب في السمتين. وخطّ يدٍ على ورقةٍ بيضاء يُقرأ في كلتيهما،
 *    وحبرٌ فاتحٌ بلا خلفيّة يختفي في الوضع الفاتح.
 */
export const PAPER = "#FFFFFF";
export const HANDWRITING_INK = "#16202A";

export function strokesToPng(
  strokes: Stroke[],
  size: { width: number; height: number },
  scale: number
): Promise<Blob | null> {
  const layer = document.createElement("canvas");
  layer.width = size.width;
  layer.height = size.height;
  const lctx = layer.getContext("2d");
  if (!lctx) return Promise.resolve(null);
  paintStrokes(lctx, strokes, size.width, size.height, { ink: HANDWRITING_INK }, scale);

  const sheet = document.createElement("canvas");
  sheet.width = size.width;
  sheet.height = size.height;
  const sctx = sheet.getContext("2d");
  if (!sctx) return Promise.resolve(null);
  sctx.fillStyle = PAPER;
  sctx.fillRect(0, 0, sheet.width, sheet.height);
  sctx.drawImage(layer, 0, 0);

  return new Promise((resolve) => sheet.toBlob((b) => resolve(b), "image/png"));
}
