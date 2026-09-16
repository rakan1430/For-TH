import { useEffect, useState } from "react";
import { DEMO, requireClient } from "../lib/supabase";
import { GoogleButton } from "../components/GoogleButton";
import { authErrorMessage, readAuthRedirectError } from "../lib/auth-errors";
import { markOAuthStart, misredirectMessage, oauthRedirectTo, takeOAuthMark } from "../lib/oauth";
import { stashName, takeName } from "../lib/pending-name";
import { ensureProfile } from "../lib/api";
import { pickName } from "../lib/profile-name";
import { Brand } from "../components/Logo";
import { Field, Notice, ThemeToggle } from "../components/ui";
import { navigate } from "../lib/router";

type Mode = "signin" | "signup";

export function Auth() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  /*
   * ⚠️ يُقرأ خطأ العودة **مرّةً عند الفتح**، ثمّ يُمحى من الرابط بـ
   *    `replaceState` — وإلّا بقي في تاريخ المتصفّح، فيعود الخطأ عند كل
   *    رجوعٍ إلى الخلف وإن نجح الدخول بعده.
   */
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setInfo(null);
    try {
      const sb = requireClient();
      if (mode === "signup") {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;

        /*
         * ⚠️ فرقٌ جوهريّ سقط منّي أوّل مرّة: `signUp` تُعيد `user` بلا
         *    `session` حين يكون تأكيد البريد مفعَّلاً. فالكتابة في
         *    `profiles` حينها تجري بدور `anon` وترفضها السياسة — وكنتُ
         *    لا أفحص خطأها، فيرى المستخدم «أُنشئ الحساب» واسمُه ضائع.
         *    الآن: نكتب إن وُجدت جلسة، وإلّا نحفظ الاسم حتى أوّل دخول.
         */
        stashName(fullName);
        if (data.session && data.user) {
          // ملفّ المستخدم: صفّه هو، وسياسة الإدراج تشترط أن يكون معرّفه هو
          await ensureProfile(data.user.id, pickName({ typed: takeName(), email }));
          return; // الجلسة قائمة — يتكفّل `App` بالتوجيه
        }

        setInfo(
          "أُنشئ الحساب، لكنّه ينتظر تأكيد البريد. إن لم تصلك رسالة خلال " +
          "دقائق فأبلغ المعلّم ليؤكّده لك — لا تُعد إنشاء الحساب."
        );
        setMode("signin");
      } else {
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // أوّل دخولٍ بعد تسجيلٍ انتظر التأكيد: الآن توجد جلسة، فيُكتب الملفّ
        if (data.user) {
          await ensureProfile(data.user.id, pickName({ typed: takeName(), email }));
        }
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  /**
   * الدخول بحساب Google.
   *
   * ⚠️ لا `setBusy(false)` بعد النجاح: `signInWithOAuth` **تغادر الصفحة**
   *    إلى Google. فإعادة الزرّ إلى حالته تُومض لحظةً قبل الانتقال وتوهم
   *    أنّ شيئاً لم يحدث. يبقى «…» حتى يغادر المتصفّح فعلاً.
   *
   * ⚠️ و`redirectTo` يُحسب من `location` لا من ثابتٍ مكتوب: البناء ذاته
   *    يعمل على المعاينة وعلى النطاق الحيّ، ورابطٌ مثبَّتٌ في الشفرة كان
   *    سيُعيد كل معاينةٍ إلى الموقع الحيّ — وهو بالضبط العَرَض الذي وقع في
   *    المشروع السابق. ويحمل مسار المستخدم في `?next=` فيعود إلى صفحته.
   */
  async function withGoogle() {
    setBusy(true); setError(null); setInfo(null);
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

      <h1>{mode === "signin" ? "تسجيل الدخول" : "حساب جديد"}</h1>

      {error ? <Notice kind="error">{error}</Notice> : null}
      {info ? <Notice kind="ok">{info}</Notice> : null}

      {/*
        ⚠️ Google أوّلاً بعمد: هو الطريق المقصود للطلّاب — بلا كلمة مرورٍ
           تُنسى، وبلا رسالة تأكيدٍ قد لا تصل. والبريد وكلمة المرور تبقى
           تحته لمن لا حساب Google له، لا العكس.
      */}
      {/*
        ⚠️ بطاقةٌ واحدة لا بطاقتان: الطريقان فعلٌ واحد — «ادخل» — بمسلكين.
           وفصلهما في بطاقتين جعل «أو» تفصل البطاقة عن نفسها، وترك سطر
           «الدخول بالبريد» يتيماً بعيداً عن الحقول التي يصفها.
      */}
      <div className="card stack">
        {DEMO ? null : (
          <>
            <GoogleButton
              busy={busy}
              onClick={() => void withGoogle()}
              label="المتابعة بحساب Google"
            />
            <p className="field__hint" style={{ margin: 0 }}>
              بلا كلمة مرورٍ تُنسى. وإن كان لك حسابٌ بنفس البريد فسيُربط به.
            </p>
            <div className="or">أو</div>
          </>
        )}

        <form className="stack" onSubmit={submit}>
          {mode === "signup" ? (
            <Field label="الاسم الكامل">
              <input
                className="input" value={fullName} required minLength={2}
                onChange={(e) => setFullName(e.target.value)} autoComplete="name"
              />
            </Field>
          ) : null}

          <Field label="البريد الإلكتروني">
            <input
              className="input" type="email" value={email} required
              onChange={(e) => setEmail(e.target.value)} autoComplete="email"
              dir="ltr" style={{ textAlign: "start" }}
            />
          </Field>

          <Field label="كلمة المرور" hint={mode === "signup" ? "٨ محارف فأكثر" : undefined}>
            <input
              className="input" type="password" value={password} required minLength={8}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              dir="ltr" style={{ textAlign: "start" }}
            />
          </Field>

          {/* ⚠️ الزرّ الأحمر واحدٌ في الشاشة: الفعل الأساسي وحده */}
          <button className="btn btn--primary" disabled={busy}>
            {busy ? "…" : mode === "signin" ? "دخول" : "إنشاء الحساب"}
          </button>

          <button
            type="button" className="btn btn--quiet"
            onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(null); }}
          >
            {mode === "signin" ? "ليس لديّ حساب" : "لديّ حساب بالفعل"}
          </button>
        </form>
      </div>

      <button type="button" className="btn btn--quiet" onClick={() => navigate("/plans")}>
        عرض الاشتراكات والأسعار
      </button>
    </div>
  );
}
