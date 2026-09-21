import { useState } from "react";
import { assignItems } from "../../lib/api";
import type { Audience, Group, Track } from "../../lib/types";
import { TRACK_SHORT } from "../../lib/types";
import { Icon } from "../../components/Icon";
import { Field, Notice } from "../../components/ui";

const ITEM_NAME: Record<"bank" | "resource" | "quiz", string> = {
  bank: "البنك", resource: "الملفّ", quiz: "الاختبار",
};

/**
 * الإرسال.
 * ⚠️ يعرض **عددين صريحين** كما تعيدهما الدالّة: كم وصل جديداً وكم كان
 *    مُرسَلاً من قبل. لا «أُرسل ✅» — تلك الرسالة بعينها هي التي جعلت
 *    المعلّم في المشروع السابق يظنّ أنّ اختباراً وصل ولم يصل أحداً.
 */
export function SendBox({ itemType, itemId, track, groups, published }: {
  itemType: "bank" | "resource" | "quiz";
  itemId: string; track: Track; groups: Group[]; published: boolean;
}) {
  const [audience, setAudience] = useState<Audience>("track");
  const [groupId, setGroupId] = useState("");
  const [report, setReport] = useState<{ created: number; skipped: number; targeted: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="card stack-s">
      <h3 className="card__title">الإرسال</h3>

      {!published ? (
        <Notice kind="info">
          {ITEM_NAME[itemType]} غير منشور. الإرسال يسجّل من يصله، لكنّه لا يظهر
          لأحدٍ حتى تنشره — والشرطان مستقلّان.
        </Notice>
      ) : null}

      {error ? <Notice kind="error">{error}</Notice> : null}
      {report ? (
        <Notice kind={report.created > 0 ? "ok" : "info"}>
          {report.created > 0 ? `وصل ${report.created} هدفاً جديداً` : "لم يصل شيءٌ جديد"}
          {report.skipped > 0 ? ` · وكان ${report.skipped} مُرسَلاً من قبل` : ""}
          {` · من أصل ${report.targeted}.`}
        </Notice>
      ) : null}

      <div className="row">
        <Field label="إلى">
          <select className="select" value={audience}
                  onChange={(e) => { setAudience(e.target.value as Audience); setReport(null); }}>
            <option value="track">كل مشتركي {TRACK_SHORT[track]}</option>
            <option value="group">مجموعة</option>
          </select>
        </Field>
        {audience === "group" ? (
          <Field label="المجموعة">
            <select className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">— اختر —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
        ) : null}
      </div>

      {audience === "group" && groups.length === 0 ? (
        <p className="subtle">لا مجموعات في هذا المسار بعد — أنشئها من تبويب «المجموعات».</p>
      ) : null}

      <button type="button" className="btn btn--primary"
              disabled={busy || (audience === "group" && !groupId)}
              onClick={async () => {
                setBusy(true); setError(null); setReport(null);
                try {
                  setReport(await assignItems({
                    itemType, itemIds: [itemId], audience,
                    groupIds: audience === "group" ? [groupId] : null,
                  }));
                } catch (e) {
                  setError(String((e as Error)?.message ?? e));
                } finally { setBusy(false); }
              }}>
        <Icon name="send" size={18} /> إرسال
      </button>
    </section>
  );
}
