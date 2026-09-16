import { useState } from "react";
import { upsertMyProfile, isActive } from "../lib/api";
import { formatDate, daysUntil, countLabel } from "../lib/format";
import { Notice, Empty } from "../components/ui";
import { ProfileFields, digitsOf, type ProfileDraft } from "../components/ProfileFields";
import { GoogleMark } from "../components/GoogleButton";
import { navigate } from "../lib/router";
import type { Profile, Subscription } from "../lib/types";

const TRACK_NAME: Record<string, string> = {
  qudurat: "القدرات",
  tahsili: "التحصيلي",
};

/**
 * حسابي — الهويّة والبيانات والاشتراكات في صفحةٍ واحدة.
 *
 * ⚠️ البريد وطريقة الدخول **تُعرض ولا تُعدَّل**: هويّتك تأتي من Google، فلا
 *    معنى لحقلٍ هنا يوهم أنّها تُغيَّر من عندنا. وتغييرها فعلاً يعني حساباً
 *    آخر — واشتراكك معلّقٌ بالحساب لا بالبريد وحده.
 */
export function Account({ userId, email, profile, isTeacher, subs, onSaved }: {
  userId: string;
  email: string;
  profile: Profile | null;
  isTeacher: boolean;
  subs: Subscription[];
  onSaved: (draft: ProfileDraft) => void;
}) {
  const [draft, setDraft] = useState<ProfileDraft>({
    fullName: profile?.full_name ?? "",
    grade: profile?.grade ?? "",
    contact: profile?.contact ?? "",
    school: profile?.school ?? "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (digitsOf(draft.contact) < 8) {
      setError("رقم الجوّال غير مكتمل — ثمانية أرقام فأكثر.");
      return;
    }
    setBusy(true); setError(null); setSaved(false);
    try {
      await upsertMyProfile({
        id: userId,
        full_name: draft.fullName.trim(),
        // ⚠️ المعلّم لا يُسأل عنهما، فلا يُكتب فوقهما بفراغٍ من نموذجٍ لا يعرضهما
        grade:   isTeacher ? (profile?.grade   ?? null) : draft.grade.trim(),
        school:  isTeacher ? (profile?.school  ?? null) : draft.school.trim(),
        contact: draft.contact.trim(),
      });
      setSaved(true);
      onSaved(draft);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack">
      <h1>حسابي</h1>

      {/* ── الهويّة: تُقرأ ولا تُكتب ───────────────────────────────────── */}
      <section className="card stack">
        <h2 style={{ fontSize: "18px", margin: 0 }}>الهويّة</h2>
        <div className="row-between">
          <span className="muted">البريد</span>
          <span dir="ltr" style={{ fontFamily: "var(--font-mono)", fontSize: "14px" }}>
            {email}
          </span>
        </div>
        <div className="row-between">
          <span className="muted">طريقة الدخول</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
            <GoogleMark /> Google
          </span>
        </div>
        <p className="subtle" style={{ margin: 0 }}>
          بريدك وطريقة دخولك يأتيان من Google ولا يُغيَّران من هنا. ولا كلمة
          مرور لك في هذه المنصّة أصلاً — فلا شيء يُنسى ولا شيء يُسرَق.
        </p>
      </section>

      {/* ── البيانات: تُعدَّل ──────────────────────────────────────────── */}
      <section className="stack">
        <h2 style={{ fontSize: "18px", margin: 0 }}>بياناتي</h2>
        {error ? <Notice kind="error">{error}</Notice> : null}
        {saved ? <Notice kind="ok">حُفظت بياناتك.</Notice> : null}
        <form className="card stack" onSubmit={submit}>
          <ProfileFields
            value={draft}
            onChange={(next) => { setDraft(next); setSaved(false); }}
            forTeacher={isTeacher}
          />
          <button className="btn btn--primary" disabled={busy}>
            {busy ? "…" : "حفظ التعديلات"}
          </button>
        </form>
      </section>

      {/* ── الاشتراكات: للطالب وحده ───────────────────────────────────── */}
      {isTeacher ? null : (
        <section className="stack">
          <h2 style={{ fontSize: "18px", margin: 0 }}>اشتراكاتي</h2>
          {subs.length === 0 ? (
            <Empty>
              <p>لا اشتراك لك بعد.</p>
            </Empty>
          ) : (
            <ul className="stack" style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {subs.map((s) => {
                const live = isActive(s);
                const left = daysUntil(s.ends_on);
                return (
                  <li key={s.id} className="card row-between">
                    <span>
                      <b>{TRACK_NAME[s.track] ?? s.track}</b>
                      <span className="subtle" style={{ display: "block", fontSize: "13px" }}>
                        {live
                          ? `ينتهي ${formatDate(s.ends_on)} — ${countLabel(left, {
                              none: "ينتهي اليوم", one: "يبقى يوم واحد", two: "يبقى يومان",
                              few: "أيام", many: "يوماً",
                            })}`
                          : `انتهى ${formatDate(s.ends_on)}`}
                      </span>
                    </span>
                    <span className={live ? "tag tag--ok" : "tag tag--muted"}>
                      {live ? "ساري" : "منتهٍ"}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <button type="button" className="btn btn--quiet" onClick={() => navigate("/plans")}>
            عرض الاشتراكات والأسعار
          </button>
          <p className="subtle" style={{ margin: 0 }}>
            نتائجك محفوظةٌ ولا تُحذف بانتهاء الاشتراك، وتعود إليك بتجديده.
          </p>
        </section>
      )}
    </div>
  );
}
