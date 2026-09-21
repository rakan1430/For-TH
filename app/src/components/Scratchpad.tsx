import { useEffect, useRef, useState } from "react";
import { Icon } from "./Icon";
import {
  beginStroke, extendStroke, normalize, undo, type Stroke,
} from "../lib/scratch";

/**
 * لوح المسودّة — ورقة الشطب أثناء الاختبار.
 *
 * ⚠️ **بالقلم لا بلوحة المفاتيح**: مسائل القدرات تُحلّ برسمٍ وشطبٍ وسهمٍ،
 *    لا بكتابةٍ منسّقة. ولهذا قماشٌ حرّ لا حقل نصّ.
 *
 * ⚠️ وأحداث **المؤشّر** لا اللمس ولا الفأرة: `pointer*` تغطّي الإصبع والقلم
 *    والفأرة بمسارٍ واحد، فلا يُكتب المنطق مرّتين ولا يعمل على جهازٍ دون آخر.
 *
 * ⚠️ و`setPointerCapture` لازم: بدونه يفلت الخطّ متى خرج الإصبع عن حدود
 *    القماش وهو مضغوط، فينقطع الرسم في منتصفه.
 */
export function Scratchpad({ strokes: initial, onChange, onClose }: {
  strokes: Stroke[];
  onChange: (next: Stroke[]) => void;
  onClose: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [erasing, setErasing] = useState(false);
  const drawing = useRef(false);

  /*
   * ⚠️ الخطوط تُمسك **محلّياً** وتُرفع إلى الأعلى عند رفع الإصبع لا مع كل
   *    حركة. و`pointermove` يصل عشرات المرّات في الثانية — ولو حُدّثت حالة
   *    شاشة الاختبار مع كلّ حركةٍ لأُعيد رسم الشريط الجانبي ولوحة الأرقام
   *    كلّها (مئة زرٍّ في اختبارٍ كامل) بين نقطةٍ ونقطة.
   *
   * ⚠️ والمكوّن يُعطى `key` برقم السؤال في `ExamShell`، فيُستأنف من جديد
   *    عند كل سؤال — فلا حاجة لمزامنةٍ يدويّة بين المحلّي والوارد، ولا باب
   *    لاختلافهما.
   */
  const [strokes, setStrokes] = useState<Stroke[]>(initial);

  /*
   * ⚠️ مرآةٌ في `ref` بجانب الحالة، وليست تكراراً بلا داعٍ: عند رفع الإصبع
   *    نحتاج **آخر** الخطوط لنرفعها، و`strokes` في الإغلاق قيمةُ آخر رسمٍ
   *    وقع لا قيمةُ اللحظة. فالمرآة تُكتب فوراً، والحالة تُرسم متى شاءت.
   */
  const latest = useRef<Stroke[]>(initial);

  function put(next: Stroke[]): void {
    latest.current = next;
    setStrokes(next);
  }

  /** تغييرٌ مستقرّ: يُحفظ محلّياً ويُرفع فوراً (تراجع، مسح). */
  function commit(next: Stroke[]): void {
    put(next);
    onChange(next);
  }

  /*
   * ⚠️ الرسم يُعاد كاملاً عند كل تغيير وعند كل تغيّرٍ في الحجم. والقماش
   *    يُقاس بالبكسل الفيزيائي (`devicePixelRatio`) وإلّا ظهر الخطّ مشوّشاً
   *    على شاشات الهواتف عالية الكثافة.
   */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    function paint() {
      const el = canvasRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.round(rect.width * dpr));
      const h = Math.max(1, Math.round(rect.height * dpr));
      if (el.width !== w || el.height !== h) { el.width = w; el.height = h; }

      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const ink = getComputedStyle(el).getPropertyValue("color") || "#000";
      for (const s of strokes) {
        if (s.points.length === 0) continue;
        ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
        ctx.strokeStyle = ink;
        ctx.lineWidth = (s.erase ? 18 : 2.5) * dpr;
        ctx.beginPath();
        // النِّسب تُضرب في الحجم الحالي — ولهذا خُزّنت نِسباً
        ctx.moveTo(s.points[0]!.x * el.width, s.points[0]!.y * el.height);
        for (const pt of s.points.slice(1)) {
          ctx.lineTo(pt.x * el.width, pt.y * el.height);
        }
        // نقطةٌ واحدة: خطٌّ بلا طولٍ لا يُرسم، فتُرسم دائرةً صغيرة
        if (s.points.length === 1) {
          ctx.lineTo(s.points[0]!.x * el.width + 0.1, s.points[0]!.y * el.height);
        }
        ctx.stroke();
      }
      ctx.globalCompositeOperation = "source-over";
    }

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(canvas);
    return () => ro.disconnect();
  }, [strokes]);

  function at(e: React.PointerEvent<HTMLCanvasElement>) {
    return normalize(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect());
  }

  /** رفع الإصبع: هنا وحده تصعد الخطوط إلى شاشة الاختبار. */
  function endStroke(): void {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(latest.current);
  }

  return (
    <div className="pad">
      <div className="pad__bar">
        <button type="button"
                className={erasing ? "btn btn--sm" : "btn btn--quiet btn--sm"}
                aria-pressed={erasing}
                onClick={() => setErasing((v) => !v)}>
          <Icon name={erasing ? "x" : "edit"} size={16} />
          {erasing ? "ممحاة" : "قلم"}
        </button>
        <button type="button" className="btn btn--quiet btn--sm"
                onClick={() => commit(undo(strokes))}
                disabled={strokes.length === 0}>
          <Icon name="up" size={16} /> تراجع
        </button>
        <button type="button" className="btn btn--quiet btn--sm"
                onClick={() => commit([])}
                disabled={strokes.length === 0}>
          <Icon name="trash" size={16} /> مسح
        </button>
        <span className="spacer" />
        <span className="subtle pad__note">مسودّةٌ لك وحدك — لا تُرسل ولا تُصحَّح</span>
        <button type="button" className="btn btn--quiet btn--sm" onClick={onClose}>
          <Icon name="x" size={16} /> إغلاق
        </button>
      </div>

      <canvas
        ref={canvasRef}
        className="pad__canvas"
        // ⚠️ بلا هذا يسحب المتصفّح الصفحة بدل أن يرسم الإصبع
        style={{ touchAction: "none" }}
        aria-label="لوح المسودّة"
        onPointerDown={(e) => {
          drawing.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          put(beginStroke(latest.current, at(e), erasing));
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          put(extendStroke(latest.current, at(e)));
        }}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
    </div>
  );
}
