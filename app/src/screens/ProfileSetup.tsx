import { useState } from "react";
import { upsertMyProfile } from "../lib/api";
import { Brand } from "../components/Logo";
import { Field, Notice, ThemeToggle } from "../components/ui";
import type { Profile } from "../lib/types";

/**
 * إكمال الملفّ — شاشةٌ واحدة بعد أوّل دخول.
 *
 * ⚠️ Google لا يعطي إلّا الاسم والبريد. والمعلّم يحتاج المستوى والجوّال
 *    والمدرسة ليعرف من يخاطب، ولا سبيل إليها إلّا أن يكتبها الطالب.
 *
 * ⚠️ وهذه الشاشة **تهذيبٌ لا حراسة**: الحارس أنّ `request_subscription`
 *    ترفض بملفٍّ ناقص (`profile_incomplete`). فمن يفتح أدوات المطوّر
 *    ويتجاوز النموذج لا يصل إلى شيء. ولولا ذلك لكانت الشاشة زينةً.
 */

/*
 * ⚠️ قائمةٌ لا حقل نصّ: «ثالث ثانوي» و«٣ث» و«الثالث الثانوي» ثلاثةُ نصوصٍ
 *    لشيءٍ واحد، فيصير فرزُ المعلّم لطلّابه مستحيلاً. والقائمة تجعل الحقل
 *    قابلاً للعدّ.
 */
const GRADES = ["أول ثانوي", "ثاني ثانوي", "ثالث ثانوي", "خرّيج"] as const;

/** ثمانية أرقام فأكثر — وهو نفس حدّ القاعدة، لا رقمٌ اخترعته الواجهة. */
function digitsOf(v: string): number {
  return (v.match(/\d/g) ?? []).length;
}

export function ProfileSetup({ userId, profile, onDone }: {
  userId: string;
  profile: Profile | null;
  onDone: () => void;
}) {
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [grade, setGrade] = useState(profile?.grade ?? "");
  const [contact, setContact] = useState(profile?.contact ?? "");
  const [school, setSchool] = useState(profile?.school ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (digitsOf(contact) < 8) {
      setError("رقم الجوّال غير مكتمل — ثمانية أرقام فأكثر.");
      return;
    }
    setBusy(true); setError(null);
    try {
      await upsertMyProfile({
        id: userId,
        full_name: fullName.trim(),
        grade: grade.trim(),
        contact: contact.trim(),
        school: school.trim(),
      });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page stack" style={{ maxWidth: "520px" }}>
      <div className="row-between">
        <Brand />
        <ThemeToggle />
      </div>

      <h1>أكمل بياناتك</h1>
      <p className="muted">
        مرّةً واحدة. يحتاجها المعلّم ليعرف صفّك ويتواصل معك عند الحاجة.
      </p>

      {error ? <Notice kind="error">{error}</Notice> : null}

      <form className="card stack" onSubmit={submit}>
        {/* ⚠️ الاسم يأتي من Google بالإنجليزية غالباً — فيُصحَّح بالعربية هنا */}
        <Field label="الاسم الكامل" hint="بالعربية كما يُنادى به">
          <input
            className="input" value={fullName} required minLength={2} maxLength={120}
            onChange={(e) => setFullName(e.target.value)} autoComplete="name"
          />
        </Field>

        <Field label="المستوى الدراسي">
          <select
            className="select" value={grade} required
            onChange={(e) => setGrade(e.target.value)}
          >
            <option value="" disabled>اختر…</option>
            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>

        <Field label="رقم الجوّال" hint="للتواصل عند الحاجة — لا يظهر لغيرك">
          <input
            className="input" type="tel" value={contact} required maxLength={40}
            onChange={(e) => setContact(e.target.value)}
            autoComplete="tel" inputMode="tel"
            dir="ltr" style={{ textAlign: "start" }}
          />
        </Field>

        <Field label="المدرسة" hint="أو المركز الذي تدرس فيه">
          <input
            className="input" value={school} required minLength={2} maxLength={120}
            onChange={(e) => setSchool(e.target.value)}
          />
        </Field>

        {/* ⚠️ الزرّ الأحمر واحدٌ في الشاشة: الفعل الأساسي وحده */}
        <button className="btn btn--primary" disabled={busy}>
          {busy ? "…" : "حفظ ومتابعة"}
        </button>
      </form>
    </div>
  );
}
