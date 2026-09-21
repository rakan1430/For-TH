import { useState } from "react";
import { cancelAccountDeletion, type PendingDeletion as Row } from "../lib/api";
import { formatDateTime } from "../lib/format";
import { Icon } from "../components/Icon";
import { Notice } from "../components/ui";

/**
 * شاشة «حسابك قيد الحذف».
 *
 * ⚠️ تحلّ محلّ الموقع كلّه ولا تُعرض بجانبه، بعمد: حسابه مخفيٌّ في القاعدة
 *    فالمحتوى لا يصل أصلاً. ولولا هذه الشاشة لرأى موقعاً **فارغاً** بلا
 *    سبب — لا بنوك ولا اختبارات ولا رسالة — فيظنّ العطل في المنصّة ويُبلغ
 *    المعلّم. العطل الصامت أسوأ من الخبر الصريح.
 */
export function PendingDeletion({ row, onCancelled }: {
  row: Row;
  onCancelled: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cancel() {
    setBusy(true); setError(null);
    try {
      const r = await cancelAccountDeletion();
      if (!r.ok) {
        setError(r.reason === "not_pending"
          ? "لا طلب حذفٍ قائم — حدّث الصفحة."
          : "تعذّر إلغاء الطلب.");
        return;
      }
      onCancelled();
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر إلغاء الطلب.");
    } finally { setBusy(false); }
  }

  return (
    <div className="stack" style={{ maxWidth: "560px" }}>
      <h1>حسابك قيد الحذف</h1>

      {error ? <Notice kind="error">{error}</Notice> : null}

      <div className="card stack-s" style={{ borderColor: "var(--accent)" }}>
        <p style={{ margin: 0 }}>
          طلبتَ حذف حسابك، فأُخفي من المنصّة. ويُمحى نهائياً:
        </p>
        <p className="mono" style={{ fontSize: "20px", margin: 0 }}>
          {formatDateTime(row.purge_at)}
        </p>
        <p className="subtle" style={{ margin: 0 }}>
          وعندها تذهب نتائجك ودرجاتك ودفتر مراجعتك معه، ولا تُستعاد.
        </p>
      </div>

      <button type="button" className="btn btn--primary" onClick={() => void cancel()}
              disabled={busy}>
        <Icon name="check" size={16} /> {busy ? "…" : "إلغاء الطلب وإعادة حسابي"}
      </button>

      <p className="subtle">
        ما دامت المهلة قائمة فالإلغاء يُعيد كلّ شيء كما كان. وبعدها لا رجعة.
      </p>
    </div>
  );
}
