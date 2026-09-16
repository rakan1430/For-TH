import { useState } from "react";
import { requireClient } from "../lib/supabase";
import { authErrorMessage } from "../lib/auth-errors";
import { stashName, takeName } from "../lib/pending-name";
import { ensureProfile } from "../lib/api";
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
          await ensureProfile(data.user.id, email, takeName());
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
        if (data.user) await ensureProfile(data.user.id, email, takeName());
      }
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
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

      <form className="card stack" onSubmit={submit}>
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

      <button type="button" className="btn btn--quiet" onClick={() => navigate("/plans")}>
        عرض الاشتراكات والأسعار
      </button>
    </div>
  );
}
