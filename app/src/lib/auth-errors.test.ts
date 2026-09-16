import { describe, it, expect } from "vitest";
import { authErrorMessage, readAuthRedirectError } from "./auth-errors";

describe("رسائل أخطاء المصادقة", () => {
  /*
   * ⚠️ الحالة التي أوقفت المالك فعلاً: حسابٌ أُنشئ، ورسالة تأكيدٍ لم تصل،
   *    فظهر `Email not confirmed` بالإنجليزية. الرسالة الصحيحة يجب أن تقول
   *    إنّ الحساب **موجود** وأنّ العطب في البريد — لا في كلمة المرور.
   */
  it("«البريد غير مؤكَّد» تقول إنّ الحساب موجود وتدلّ على الخطوة التالية", () => {
    const m = authErrorMessage({ code: "email_not_confirmed", message: "Email not confirmed" });
    expect(m).toContain("موجود");
    expect(m).toContain("المعلّم");
    expect(m).not.toMatch(/[A-Za-z]{4}/);
  });

  it("تُطابق على الرمز قبل النصّ — والرموز أثبت من نصوص GoTrue", () => {
    // نصٌّ إنجليزيٌّ مضلّل مع رمزٍ صحيح: الرمز هو الذي يُعتمد
    expect(authErrorMessage({ code: "invalid_credentials", message: "Email not confirmed" }))
      .toContain("كلمة المرور");
  });

  it("وتحتاط بالنصّ حين لا يرسل الخادم رمزاً", () => {
    expect(authErrorMessage({ message: "Invalid login credentials" })).toContain("كلمة المرور");
    expect(authErrorMessage({ message: "User already registered" })).toContain("سجّل الدخول");
    expect(authErrorMessage({ message: "Email rate limit exceeded" })).toContain("ساعة");
  });

  it("وتفرّق انقطاع الشبكة عن خطأ بيانات الدخول", () => {
    expect(authErrorMessage(new TypeError("Failed to fetch"))).toContain("اتّصالك");
  });

  /*
   * ⚠️ البند: لا يُبتلع المجهول خلف عبارةٍ مهذّبة. نصٌّ إنجليزيٌّ ينقله
   *    المالك إليّ خيرٌ من «حدث خطأ» لا تُشخّص شيئاً.
   */
  it("ولا تبتلع ما لا تعرفه", () => {
    expect(authErrorMessage({ message: "Database error saving new user" }))
      .toBe("Database error saving new user");
    expect(authErrorMessage(null)).toBe("تعذّر إتمام العملية.");
  });
});

describe("خطأ العودة من مزوّد الهويّة", () => {
  /*
   * ⚠️ الحالة التي ستقع فعلاً بين نشر الزرّ وتفعيل Google في الإعدادات:
   *    المستخدم يضغط، فيعود بخطأٍ في الرابط، فتُرسم الشاشة كأنّ شيئاً لم
   *    يكن. بلا هذه القراءة لا رسالة ولا سجلّ ولا أثر.
   */
  it("تقرأ «المزوّد غير مفعَّل» وتقول البديل", () => {
    const m = readAuthRedirectError(
      "?error=400&error_code=validation_failed" +
      "&error_description=Unsupported+provider%3A+provider+is+not+enabled", "");
    expect(m).toContain("غير مفعَّل");
    expect(m).toContain("البريد وكلمة المرور");
  });

  it("وتقرأ من الشذرة أيضاً — `implicit` يضع الخطأ هناك", () => {
    expect(readAuthRedirectError("", "#error=access_denied&error_description=cancelled"))
      .toContain("أُلغي");
  });

  it("ولا ترى خطأً حيث لا خطأ", () => {
    expect(readAuthRedirectError("", "#/teacher")).toBeNull();
    expect(readAuthRedirectError("?code=abc123", "")).toBeNull();
    expect(readAuthRedirectError("", "")).toBeNull();
  });
});
