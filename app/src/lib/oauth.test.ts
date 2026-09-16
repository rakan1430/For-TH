import { describe, it, expect } from "vitest";
import { oauthRedirectTo, readNext, stripNext, misredirectMessage } from "./oauth";

const at = (hash: string) => ({ origin: "https://for-th.netlify.app", pathname: "/", hash });

describe("عنوان العودة من Google", () => {
  it("يقصّ الشذرة ويحمل المسار في الاستعلام", () => {
    expect(oauthRedirectTo(at("#/teacher")))
      .toBe("https://for-th.netlify.app/?next=%2Fteacher");
  });

  it("ولا يضيف استعلاماً بلا داعٍ من الجذر", () => {
    expect(oauthRedirectTo(at(""))).toBe("https://for-th.netlify.app/");
    expect(oauthRedirectTo(at("#/"))).toBe("https://for-th.netlify.app/");
  });

  /*
   * ⚠️ بوّابة التحويل المفتوحة: لو قُبل أي نصّ في `next` لصار رابط الدخول
   *    وسيلةً لإرسال الطالب إلى موقعٍ آخر بعد دخوله — من نطاقنا نحن.
   */
  it("ولا يقبل عند العودة إلّا مساراً داخلياً", () => {
    expect(readNext("?next=%2Fteacher")).toBe("/teacher");
    expect(readNext("?next=%2F%2Fevil.com")).toBeNull();
    expect(readNext("?next=https%3A%2F%2Fevil.com")).toBeNull();
    expect(readNext("?next=teacher")).toBeNull();
    expect(readNext("?code=abc")).toBeNull();
    expect(readNext("")).toBeNull();
  });

  /*
   * ⚠️ `code` **لا تُمحى هنا**: عميل المصادقة يقرؤها ليُبادلها بجلسة.
   *    محوُها مبكّراً يُسقط الدخول كلّه بصمت.
   */
  it("ويمحو `next` وحدها ويُبقي `code`", () => {
    expect(stripNext("https://x.app/?next=%2Fteacher&code=abc#/teacher"))
      .toBe("/?code=abc#/teacher");
    expect(stripNext("https://x.app/?next=%2Fteacher")).toBe("/");
  });
});

describe("كشف تجاهل عنوان العودة", () => {
  it("يشخّص العودة إلى أصلٍ آخر — وهو خطأ إعدادٍ صامت", () => {
    const m = misredirectMessage("https://preview--for-th.netlify.app", "https://for-th.netlify.app");
    expect(m).toContain("Redirect URLs");
    expect(m).toContain("خطأ إعدادٍ لا خطأ منك");
  });

  it("ويصمت حين يكون كلّ شيء سليماً", () => {
    expect(misredirectMessage("https://a.app", "https://a.app")).toBeNull();
    expect(misredirectMessage(null, "https://a.app")).toBeNull();
  });
});
