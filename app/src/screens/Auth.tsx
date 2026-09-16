import { useEffect, useState } from "react";
import { requireClient } from "../lib/supabase";
import { authErrorMessage, readAuthRedirectError } from "../lib/auth-errors";
import { markOAuthStart, misredirectMessage, oauthRedirectTo, takeOAuthMark } from "../lib/oauth";
import { GoogleButton } from "../components/GoogleButton";
import { Brand } from "../components/Logo";
import { Notice, ThemeToggle } from "../components/ui";
import { navigate } from "../lib/router";

/**
 * الدخول — بحساب Google وحده.
 *
 * ⚠️ قرار المالك بعد أن جرّب المسارين. وما يزول معه: كلمات مرورٍ تُنسى
 *    فتُستنزف في «نسيت كلمة المرور»، ورسائل تأكيدٍ قد لا تصل أصلاً (وهي
 *    التي عطّلت أوّل حسابٍ في هذه المنصّة)، وكلمةُ مرورٍ ضعيفة أو مُعادة من
 *    موقعٍ مُخترَق. ويبقى الأهمّ لمنصّةٍ مدفوعة: **البريد مُثبَتٌ مسبقاً**،
 *    فالاشتراك يُربط بهويّةٍ لا بسطرٍ كتبه الطالب.
 *
 * ⚠️ وحذفُ النموذج من هنا **لا يُغلق الباب**: من يعرف المفتاح المعلَن يستدعي
 *    `/auth/v1/signup` مباشرةً. الإغلاق الحقيقيّ أن يُعطَّل مزوّد البريد في
 *    إعدادات المشروع — وذلك في لوحة Supabase لا في هذه الشفرة.
 */
export function Auth() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    /*
     * ⚠️⚠️ التشخيص الذي أضاع جلسةً كاملة في المشروع السابق: حين يكون عنوان
     *    العودة غير مُدرَجٍ في `Redirect URLs` **لا يقع خطأ إطلاقاً** —
     *    الدخول ينجح، والمزوّد يتجاهل الطلب ويقذف المستخدم إلى `Site URL`.
     *    فلا رسالة ولا سطر في وحدة التحكّم. وعَلامةُ الانطلاق تكشفه يقيناً:
     *    انطلقنا من أصلٍ وعدنا إلى غيره.
     */
    const started = takeOAuthMark();
    const wrong = misredirectMessage(started, window.location.origin);
    const msg = wrong ?? readAuthRedirectError(window.location.search, window.location.hash);
    if (!msg) return;
    setError(msg);
    const clean = window.location.pathname +
      (window.location.hash.startsWith("#/") ? window.location.hash : "");
    window.history.replaceState({}, "", clean);
  }, []);

  /**
   * ⚠️ لا `setBusy(false)` بعد النجاح: `signInWithOAuth` **تغادر الصفحة** إلى
   *    Google. فإعادة الزرّ إلى حالته تُومض لحظةً قبل الانتقال وتوهم أنّ
   *    شيئاً لم يحدث. يبقى «…» حتى يغادر المتصفّح فعلاً.
   *
   * ⚠️ و`redirectTo` يُحسب من `location` لا من ثابتٍ مكتوب: البناء ذاته يعمل
   *    على المعاينة وعلى النطاق الحيّ، ورابطٌ مثبَّتٌ في الشفرة كان سيُعيد كل
   *    معاينةٍ إلى الموقع الحيّ — وهو بالضبط العَرَض الذي وقع في المشروع
   *    السابق. ويحمل مسار المستخدم في `?next=` فيعود إلى صفحته.
   */
  async function withGoogle() {
    setBusy(true); setError(null);
    try {
      markOAuthStart(window.location.origin);
      const { error } = await requireClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: oauthRedirectTo(window.location) },
      });
      if (error) throw error;
    } catch (err) {
      setError(authErrorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div className="page stack" style={{ maxWidth: "480px" }}>
      <div className="row-between">
        <Brand />
        <ThemeToggle />
      </div>

      <h1>تسجيل الدخول</h1>

      {error ? <Notice kind="error">{error}</Notice> : null}

      <div className="card stack">
        <GoogleButton
          busy={busy}
          onClick={() => void withGoogle()}
          label="المتابعة بحساب Google"
        />
        <p className="field__hint" style={{ margin: 0 }}>
          بلا كلمة مرورٍ تُنسى، وبلا رسالة تأكيدٍ تنتظرها. وإن لم يكن لك حساب
          فسيُنشأ لك في الخطوة نفسها.
        </p>
      </div>

      <button type="button" className="btn btn--quiet" onClick={() => navigate("/plans")}>
        عرض الاشتراكات والأسعار
      </button>
    </div>
  );
}
