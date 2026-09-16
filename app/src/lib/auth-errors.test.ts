import { describe, it, expect } from "vitest";
import { authErrorMessage } from "./auth-errors";

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
