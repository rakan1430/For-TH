import { useState } from "react";
import { requestAccountDeletion } from "../lib/api";
import { requireClient } from "../lib/supabase";
import { markOAuthStart, oauthRedirectTo } from "../lib/oauth";
import { authErrorMessage } from "../lib/auth-errors";
import { Icon } from "./Icon";
import { GoogleMark } from "./GoogleButton";
import { Notice } from "./ui";

/**
 * حذف الحساب — الخطوة التي لا رجعة فيها.
 *
 * ⚠️ **التأكيد بإعادة الدخول بحساب Google لا برمزٍ في البريد.** وهذا خروجٌ
 *    عن نصّ طلب المالك لسببٍ مقيس: بريد Supabase المدمج لا يصل إلّا لأعضاء
 *    الفريق، فرمزٌ «يصل الإيميل» لا يصل أحداً. وإثبات Google موقَّعٌ من خادم
 *    المصادقة فلا يُزوَّر — أقوى من رمزٍ يُنسخ من بريد.
 *
 * ⚠️ و`prompt=select_account` مقصودة: بدونها يمرّ المتصفّح بـGoogle ويعود
 *    في لحظةٍ بلا أن يفعل المستخدم شيئاً — فيصير «إثبات الحضور» نقرةً
 *    واحدة، وهو ما بُني ليمنعه.
 *
 * ⚠️ ولا يُعرض للمعلّم إطلاقاً: حسابه هو المنصّة. والقاعدة ترفضه أيضاً
 *    (`teacher_account`) — فالحارس في الأسفل، وهذا إخفاءٌ لا حراسة.
 */
export function DeleteAccount({ onRequested }: { onRequested: () => void }) {
  const [step, setStep] = useState<"idle" | "confirm" | "reauth">("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function proceed() {
    setBusy(true); setError(null);
    try {
      const r = await requestAccountDeletion();
      if (r.ok) { onRequested(); return; }
      if (r.reason === "reauth_required") { setStep("reauth"); return; }
      setError(
        r.reason === "teacher_account" ? "حساب المعلّم لا يُحذف من هنا."
        : r.reason === "already_requested" ? "الطلب مقدَّمٌ من قبل."
        : "تعذّر تقديم الطلب."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر تقديم الطلب.");
    } finally { setBusy(false); }
  }

  async function reauth() {
    setBusy(true); setError(null);
    try {
      markOAuthStart(window.location.origin);
      // ⚠️ لا `setBusy(false)` بعد النجاح: الصفحة تغادر إلى Google.
      const { error: err } = await requireClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: oauthRedirectTo(window.location),
          queryParams: { prompt: "select_account" },
        },
      });
      if (err) throw err;
    } catch (e) {
      setError(authErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <section className="stack">
      <h2 style={{ fontSize: "18px", margin: 0 }}>حذف الحساب</h2>

      <div className="card stack-s" style={{ borderColor: "var(--accent)" }}>
        {error ? <Notice kind="error">{error}</Notice> : null}

        {step === "idle" ? (
          <>
            <p className="muted" style={{ margin: 0 }}>
              يُخفى حسابك فوراً، ثمّ يُمحى نهائياً بعد ٤٨ ساعة. ولك أن تتراجع
              خلال المهلة.
            </p>
            <button type="button" className="btn btn--quiet btn--sm"
                    style={{ alignSelf: "flex-start", borderColor: "var(--accent)", color: "var(--accent)" }}
                    onClick={() => setStep("confirm")}>
              <Icon name="trash" size={16} /> حذف حسابي
            </button>
          </>
        ) : null}

        {step === "confirm" ? (
          <>
            {/*
              ⚠️ تُسمّى الأشياء بأسمائها قبل الضغط لا بعده: «حذف الحساب»
                 وحدها لا تقول للطالب إنّ درجاته تذهب معه.
            */}
            <p style={{ margin: 0 }}><b>بعد ٤٨ ساعة يُمحى كلّ هذا، ولا يُستعاد:</b></p>
            <ul className="stack-s" style={{ margin: 0, paddingInlineStart: "1.2em" }}>
              <li>حسابك وبياناتك ورقم تواصلك.</li>
              <li>نتائج اختباراتك ودرجاتك كلّها.</li>
              <li>دفتر أسئلة المراجعة.</li>
              <li>اشتراكاتك وسجلّ طلباتها.</li>
            </ul>
            <p className="subtle" style={{ margin: 0 }}>
              ولن يراك المعلّم في لوحته من هذه اللحظة.
            </p>
            <div className="row">
              <button type="button" className="btn btn--sm"
                      style={{ borderColor: "var(--accent)", color: "var(--accent)" }}
                      onClick={() => void proceed()} disabled={busy}>
                {busy ? "…" : "متابعة الحذف"}
              </button>
              <button type="button" className="btn btn--quiet btn--sm"
                      onClick={() => setStep("idle")} disabled={busy}>
                تراجع
              </button>
            </div>
          </>
        ) : null}

        {step === "reauth" ? (
          <>
            <p style={{ margin: 0 }}>
              للتأكيد أنّك صاحب الحساب، أعد الدخول بحساب Google ثمّ اضغط
              «متابعة الحذف» مرّةً أخرى.
            </p>
            <div className="row">
              <button type="button" className="btn btn--sm" onClick={() => void reauth()}
                      disabled={busy}>
                <GoogleMark /> {busy ? "…" : "إعادة الدخول بحساب Google"}
              </button>
              <button type="button" className="btn btn--quiet btn--sm"
                      onClick={() => void proceed()} disabled={busy}>
                متابعة الحذف
              </button>
              <button type="button" className="btn btn--quiet btn--sm"
                      onClick={() => setStep("idle")} disabled={busy}>
                إلغاء
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
