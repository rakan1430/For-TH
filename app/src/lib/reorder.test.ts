import { describe, it, expect } from "vitest";
import { moveItem, orderChanged } from "./reorder";

const L = ["أ", "ب", "ج", "د"];

describe("نقل عنصر", () => {
  it("للأعلى بخطوة", () => {
    expect(moveItem(L, 2, 1)).toEqual(["أ", "ج", "ب", "د"]);
  });

  /*
   * ⚠️ الحالة التي تنكسر عادةً: النقل للأسفل. بعد الاقتطاع تصير القائمة
   *    أقصر بواحد، فمن يحسب الوجهة على الطول الأصلي يضع العنصر بعد موضعه
   *    بواحد. النتيجة هنا يجب أن تكون «ب» **بعد** «ج» تماماً، لا بعد «د».
   */
  it("للأسفل بخطوة — ولا ينزلق موضعاً زائداً", () => {
    expect(moveItem(L, 1, 2)).toEqual(["أ", "ج", "ب", "د"]);
  });

  it("من الأول إلى الآخر", () => {
    expect(moveItem(L, 0, 3)).toEqual(["ب", "ج", "د", "أ"]);
  });

  it("من الآخر إلى الأول", () => {
    expect(moveItem(L, 3, 0)).toEqual(["د", "أ", "ب", "ج"]);
  });

  it("إلى موضعه نفسه لا يغيّر شيئاً", () => {
    expect(moveItem(L, 2, 2)).toEqual(L);
  });

  it("وموضعٌ خارج القائمة يُعيدها كما هي ولا يرمي", () => {
    expect(moveItem(L, 0, 9)).toEqual(L);
    expect(moveItem(L, -1, 0)).toEqual(L);
    expect(moveItem(L, 0, -1)).toEqual(L);
  });

  it("ولا يُعدّل القائمة الأصلية", () => {
    const orig = [...L];
    moveItem(L, 0, 3);
    expect(L).toEqual(orig);
  });

  it("وقائمة بعنصرٍ واحد أو فارغة", () => {
    expect(moveItem(["أ"], 0, 0)).toEqual(["أ"]);
    expect(moveItem([], 0, 0)).toEqual([]);
  });

  it("والترتيب الناتج لا يفقد عنصراً ولا يكرّره", () => {
    for (let from = 0; from < L.length; from++) {
      for (let to = 0; to < L.length; to++) {
        const out = moveItem(L, from, to);
        expect(out.length).toBe(L.length);
        expect([...out].sort()).toEqual([...L].sort());
      }
    }
  });
});

describe("هل تغيّر الترتيب؟", () => {
  const k = (s: string) => s;
  it("لا، إن كان نفسه", () => {
    expect(orderChanged(L, [...L], k)).toBe(false);
  });
  it("نعم، إن تبدّل موضعان", () => {
    expect(orderChanged(L, moveItem(L, 0, 1), k)).toBe(true);
  });
  it("نعم، إن اختلف الطول", () => {
    expect(orderChanged(L, L.slice(1), k)).toBe(true);
  });
});
