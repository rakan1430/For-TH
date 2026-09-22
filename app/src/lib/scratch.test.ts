import { describe, it, expect } from "vitest";
import {
  beginStroke, exportSize, extendStroke, isEmpty, normalize, undo, type Stroke,
} from "./scratch";

const RECT = { left: 100, top: 50, width: 200, height: 400 };

describe("normalize", () => {
  it("تحوّل الموضع إلى نسبةٍ من القماش", () => {
    expect(normalize(200, 250, RECT)).toEqual({ x: 0.5, y: 0.5 });
  });

  it("وتقصّ ما خرج عن الحدود — فلا نقطةٌ سالبة ولا فوق الواحد", () => {
    // ⚠️ المؤشّر يخرج عن القماش وهو مضغوط: `pointermove` يظلّ يصل
    expect(normalize(0, 0, RECT)).toEqual({ x: 0, y: 0 });
    expect(normalize(9999, 9999, RECT)).toEqual({ x: 1, y: 1 });
  });

  it("وقماشٌ بلا حجمٍ لا يقسم على صفر", () => {
    expect(normalize(5, 5, { left: 0, top: 0, width: 0, height: 0 })).toEqual({ x: 0, y: 0 });
  });
});

describe("الخطوط", () => {
  it("تبدأ خطّاً جديداً ولا تمسّ ما قبله", () => {
    const a = beginStroke([], { x: 0, y: 0 }, false);
    const b = beginStroke(a, { x: 1, y: 1 }, true);
    expect(b).toHaveLength(2);
    expect(b[0]!.points).toHaveLength(1);
    expect(b[1]!.erase).toBe(true);
  });

  it("والامتداد يلحق بآخر خطّ", () => {
    const s = extendStroke(beginStroke([], { x: 0, y: 0 }, false), { x: 0.5, y: 0.5 });
    expect(s[0]!.points).toHaveLength(2);
  });

  it("⚠️ وامتدادٌ بلا بدايةٍ يُتجاهَل — لا يُنشئ خطّاً من نقطة", () => {
    expect(extendStroke([], { x: 0.5, y: 0.5 })).toEqual([]);
  });

  it("والتراجع يرفع آخر خطّ، وعلى الفارغ لا يكسر", () => {
    const s: Stroke[] = [{ points: [{ x: 0, y: 0 }], erase: false }];
    expect(undo(s)).toEqual([]);
    expect(undo([])).toEqual([]);
  });

  it("والفراغ فراغ", () => {
    expect(isEmpty([])).toBe(true);
    expect(isEmpty([{ points: [{ x: 0, y: 0 }], erase: false }])).toBe(false);
  });
});

describe("exportSize", () => {
  it("تحفظ نسبة الأبعاد كما رآها الكاتب", () => {
    const s = exportSize(400, 200, 2, 4000);
    expect(s.width / s.height).toBeCloseTo(2, 5);
  });

  it("وتضاعف بمقياس الجهاز ما دامت دون الحدّ", () => {
    expect(exportSize(400, 200, 2, 4000)).toEqual({ width: 800, height: 400 });
  });

  it("⚠️ وتقصّ عند الحدّ الأعلى بلا أن تشوّه النسبة", () => {
    // ٢٠٠٠×١٠٠٠ بمقياس ٣ = ٦٠٠٠×٣٠٠٠، والحدّ ١٦٠٠
    const s = exportSize(2000, 1000, 3, 1600);
    expect(Math.max(s.width, s.height)).toBe(1600);
    expect(s.width / s.height).toBeCloseTo(2, 5);
  });

  it("ولا تُعيد صفراً مهما كان المدخل", () => {
    const s = exportSize(0, 0, 0, 1600);
    expect(s.width).toBeGreaterThan(0);
    expect(s.height).toBeGreaterThan(0);
  });
});
