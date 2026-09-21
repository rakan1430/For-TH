import { describe, it, expect } from "vitest";
import { countFromState, FALLBACK } from "./presence";

describe("countFromState", () => {
  it("تعدّ الحاضرين بعدد المفاتيح", () => {
    expect(countFromState({ a: [{}], b: [{}], c: [{}] })).toBe(3);
  });

  it("المفتاح هو المستخدم: جهازان لشخصٍ واحد = واحد", () => {
    // جلستان تحت مفتاحٍ واحد — وهذا ما يجعل `key: uid` مهمّاً
    expect(countFromState({ u1: [{ at: "x" }, { at: "y" }] })).toBe(1);
  });

  it("حالةٌ فارغة تُعيد البديل الآمن لا صفراً", () => {
    // ⚠️ صفرٌ كذب: القارئ نفسه متصل. والرقم الجانبي لا يُظهر عطلاً.
    expect(countFromState({})).toBe(FALLBACK);
  });

  it("وغيابُ الحالة كذلك", () => {
    expect(countFromState(null)).toBe(FALLBACK);
    expect(countFromState(undefined)).toBe(FALLBACK);
  });
});
