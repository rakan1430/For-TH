import { describe, it, expect } from "vitest";
import { pickName } from "./profile-name";

describe("اختيار اسم الملفّ", () => {
  it("ما كتبه المستخدم أولى من اسم Google", () => {
    expect(pickName({ typed: "عبدالله", metadata: { full_name: "Abdullah S" } }))
      .toBe("عبدالله");
  });

  it("وحين يدخل بـGoogle بلا نموذج، يأتي الاسم من `user_metadata`", () => {
    expect(pickName({ metadata: { full_name: "سعد المطيري" } })).toBe("سعد المطيري");
    expect(pickName({ metadata: { name: "Saad" } })).toBe("Saad");
  });

  /*
   * ⚠️ لبّ الملفّ: القيد في القاعدة `between 2 and 120`. وكلّ ما دونه يجب
   *    أن يُستبدل هنا — لا أن يُرسل فيُرفض الإدراج ويبقى المستخدم بلا ملفّ.
   */
  it("لا تُعيد ما يرفضه القيد: أقصر من حرفين", () => {
    expect(pickName({ typed: "  أ  ", email: "a@x.com" })).toBe("مستخدم جديد");
    expect(pickName({ typed: "", metadata: { full_name: " " } })).toBe("مستخدم جديد");
  });

  it("ولا أطول من ١٢٠", () => {
    const out = pickName({ typed: "م".repeat(300) });
    expect(out.length).toBeLessThanOrEqual(120);
    expect(out.length).toBeGreaterThanOrEqual(2);
  });

  it("وتحتاط بمقطع البريد قبل الاسم العامّ", () => {
    expect(pickName({ email: "soosrakan@gmail.com" })).toBe("soosrakan");
    expect(pickName({ email: "a@gmail.com" })).toBe("مستخدم جديد");
    expect(pickName({})).toBe("مستخدم جديد");
  });

  it("وتتجاهل قيم `user_metadata` غير النصّية", () => {
    expect(pickName({ metadata: { full_name: 42, name: null }, email: "zz@x.com" }))
      .toBe("zz");
  });
});
