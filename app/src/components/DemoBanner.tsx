import { demoRole, setDemoRole, resetDemo } from "../lib/demo-client";

/**
 * شريطٌ يعلن أنّ هذه ليست بيانات حقيقية.
 *
 * ⚠️ لا يُخفى ولا يُصغَّر. عرضٌ يُظنّ إنتاجاً أسوأ من ألّا يكون هناك عرض:
 *    يقود إلى حكمٍ على سلوكٍ لا يوجد — ولا حراسة هنا إطلاقاً.
 */
export function DemoBanner() {
  const role = demoRole();
  return (
    <div
      role="status"
      style={{
        background: "var(--surface)",
        borderBottom: "2px solid var(--accent)",
        padding: "var(--u-half) var(--u)",
      }}
    >
      <div className="row-between" style={{ maxWidth: "1104px", margin: "0 auto" }}>
        <span className="stack-s" style={{ gap: 0 }}>
          <strong style={{ color: "var(--accent)", fontFamily: "var(--font-title)" }}>
            وضع عرض — بيانات تجريبية
          </strong>
          <span className="subtle">
            لا قاعدة بيانات ولا حراسة. للحكم على الشكل والتخطيط، لا على السلوك.
          </span>
        </span>

        <span className="row">
          <span className="tabs" role="group" aria-label="تبديل الدور">
            <button type="button" className="tab" aria-selected={role === "teacher"}
                    onClick={() => { setDemoRole("teacher"); location.reload(); }}>
              المعلّم
            </button>
            <button type="button" className="tab" aria-selected={role === "student"}
                    onClick={() => { setDemoRole("student"); location.reload(); }}>
              الطالب
            </button>
          </span>
          <button type="button" className="btn btn--quiet btn--sm"
                  onClick={() => { resetDemo(); location.reload(); }}>
            تصفير
          </button>
        </span>
      </div>
    </div>
  );
}
