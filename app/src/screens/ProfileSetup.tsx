import { useState } from "react";
import { upsertMyProfile } from "../lib/api";
import { Brand } from "../components/Logo";
import { Notice, ThemeToggle } from "../components/ui";
import { ProfileFields, digitsOf, type ProfileDraft } from "../components/ProfileFields";
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
export function ProfileSetup({ userId, profile, onDone }: {
  userId: string;
  profile: Profile | null;
  onDone: () => void;
}) {
  const [draft, setDraft] = useState<ProfileDraft>({
    fullName: profile?.full_name ?? "",
    grade: profile?.grade ?? "",
    contact: profile?.contact ?? "",
    school: profile?.school ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (digitsOf(draft.contact) < 8) {
      setError("رقم الجوّال غير مكتمل — ثمانية أرقام فأكثر.");
      return;
    }
    setBusy(true); setError(null);
    try {
      await upsertMyProfile({
        id: userId,
        full_name: draft.fullName.trim(),
        grade: draft.grade.trim(),
        contact: draft.contact.trim(),
        school: draft.school.trim(),
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
        وتستطيع تعديلها متى شئت من صفحة حسابك.
      </p>

      {error ? <Notice kind="error">{error}</Notice> : null}

      <form className="card stack" onSubmit={submit}>
        <ProfileFields value={draft} onChange={setDraft} />
        {/* ⚠️ الزرّ الأحمر واحدٌ في الشاشة: الفعل الأساسي وحده */}
        <button className="btn btn--primary" disabled={busy}>
          {busy ? "…" : "حفظ ومتابعة"}
        </button>
      </form>
    </div>
  );
}
