import { useEffect, useState } from "react";
import { listPlans } from "../lib/api";
import type { Plan, Track } from "../lib/types";
import { PERIOD_LABEL, TRACKS, TRACK_LABEL } from "../lib/types";
import { formatPrice } from "../lib/format";
import { Notice, PriceTag } from "../components/ui";
import { navigate } from "../lib/router";

/**
 * الخطط والأسعار.
 *
 * ⚠️ الأسعار **لم يحدّدها المالك بعد**، والقيمة NULL في القاعدة. فتُعرض
 *    «[السعر]» كما في اللوحات المعتمدة تماماً. ولا يُخترع رقمٌ هنا بحجّة
 *    «قيمة مبدئية»: رقمٌ يظهر لطالبٍ يصير وعداً.
 */
export function Plans({ signedIn }: { signedIn: boolean }) {
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPlans().then(setPlans).catch((e) => setError(String(e?.message ?? e)));
  }, []);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!plans) return <p className="muted">…</p>;

  const undecided = plans.some((p) => p.price_minor === null);

  return (
    <div className="stack">
      <h1>الاشتراك</h1>
      <p className="muted">
        لكل مسارٍ اشتراكه المستقلّ. يمكنك الاشتراك في واحدٍ أو في الاثنين،
        وانتهاء أحدهما لا يؤثّر على الآخر.
      </p>

      {undecided ? (
        <Notice kind="info">
          الأسعار لم تُحدَّد بعد وتظهر <span className="price-placeholder">[السعر]</span>.
          يُضبط السعر من جدول <code>plans</code> ويظهر هنا مباشرةً.
        </Notice>
      ) : null}

      {TRACKS.map((track: Track) => {
        const forTrack = plans.filter((p) => p.track === track && p.is_active);
        return (
          <section key={track} className="stack-s">
            <h2>{TRACK_LABEL[track]}</h2>
            <div className="grid-2">
              {forTrack.map((plan) => (
                <article key={plan.id} className="card stack-s">
                  <h3 className="card__title">{PERIOD_LABEL[plan.period]}</h3>
                  <p style={{ fontSize: "22px" }}>
                    <PriceTag price={formatPrice(plan.price_minor, plan.currency)} />
                  </p>
                  <p className="subtle">
                    وصولٌ كاملٌ لمحتوى {TRACK_LABEL[track]} طوال مدّة الاشتراك.
                  </p>
                  <button
                    type="button"
                    className="btn"
                    onClick={() =>
                      navigate(signedIn ? `/subscribe/${track}/${plan.id}` : "/")
                    }
                  >
                    {signedIn ? "طلب هذا الاشتراك" : "سجّل الدخول للاشتراك"}
                  </button>
                </article>
              ))}
              {forTrack.length === 0 ? (
                <p className="subtle">لا خطط مفعّلة في هذا المسار بعد.</p>
              ) : null}
            </div>
          </section>
        );
      })}

      <div className="card stack-s">
        <h3 className="card__title">كيف يتمّ الاشتراك؟</h3>
        <ol className="stack-s muted" style={{ paddingInlineStart: "var(--u)" }}>
          <li>تختار الخطّة والمسار.</li>
          <li>تدفع — داخل المنصّة أو بتحويلٍ ترفع إيصاله.</li>
          <li>ترسل طلباً ببياناتك.</li>
          <li>يقبله المعلّم، فيبدأ اشتراكك من يوم القبول.</li>
        </ol>
        {/* ⚠️ مزوّد الدفع داخل المنصّة لم يُحسم بعد — يُقال ذلك ولا يُدّعى جاهزية */}
        <p className="subtle">
          الدفع داخل المنصّة قيد الإعداد؛ ومسار رفع الإيصال متاح.
        </p>
      </div>
    </div>
  );
}
