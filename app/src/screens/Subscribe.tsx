import { useEffect, useState } from "react";
import { listPlans, requestSubscription, getMyProfile } from "../lib/api";
import { requireClient } from "../lib/supabase";
import type { Plan, Track, PayMethod } from "../lib/types";
import { PERIOD_LABEL, TRACK_LABEL } from "../lib/types";
import { formatPrice } from "../lib/format";
import { Field, Notice, PriceTag } from "../components/ui";
import { navigate } from "../lib/router";

export function Subscribe({ track, planId, userId }: { track: Track; planId: string; userId: string }) {
  const [plan, setPlan] = useState<Plan | null>(null);
  const [fullName, setFullName] = useState("");
  const [grade, setGrade] = useState("");
  const [contact, setContact] = useState("");
  const [method, setMethod] = useState<PayMethod>("transfer");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    listPlans().then((ps) => setPlan(ps.find((p) => p.id === planId) ?? null)).catch(() => {});
    getMyProfile().then((p) => {
      if (p) { setFullName(p.full_name); setGrade(p.grade ?? ""); setContact(p.contact ?? ""); }
    }).catch(() => {});
  }, [planId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setDone(null);
    try {
      let receiptPath: string | null = null;

      if (method === "transfer") {
        if (!receipt) throw new Error("أرفق صورة الإيصال");
        /*
         * ⚠️ المسار يبدأ بمعرّف المستخدم: سياسة المخزن تشترط أن يكون أوّل
         *    جزءٍ من المسار هو معرّف الرافع. فلا يكتب أحدٌ في مجلّد غيره،
         *    ولا يقرأ إيصال غيره. والدلو خاصّ — لا رابط عامّ لإيصالٍ بنكيّ.
         */
        const safeExt = (receipt.name.split(".").pop() ?? "jpg").replace(/[^a-zA-Z0-9]/g, "").slice(0, 5);
        receiptPath = `${userId}/${Date.now()}.${safeExt || "jpg"}`;
        const { error: upErr } = await requireClient()
          .storage.from("receipts").upload(receiptPath, receipt, { upsert: false });
        if (upErr) throw upErr;
      }

      const res = await requestSubscription({
        track, planId, fullName, grade: grade || null, contact, method, receiptPath,
      });

      /*
       * ⚠️ لا نعرض «تمّ ✅» على كل حال. الدالّة تُعيد سبباً صريحاً، ونقوله
       *    كما هو: «طلبك السابق ما زال معلّقاً» ليست نجاحاً ولا خطأً غامضاً.
       */
      if (!res.ok) {
        if (res.reason === "already_pending") {
          setError("لديك طلبٌ معلّق في هذا المسار بالفعل، وهو ينتظر قرار المعلّم.");
        } else if (res.reason === "receipt_required") {
          setError("مسار التحويل يحتاج صورة إيصال.");
        } else if (res.reason === "plan_not_found") {
          setError("الخطّة غير متاحة الآن.");
        } else {
          setError(`تعذّر إرسال الطلب (${res.reason}).`);
        }
        return;
      }
      setDone("وصل طلبك. يبدأ اشتراكك فور قبول المعلّم له.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر إرسال الطلب");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ maxWidth: "560px" }}>
      <h1>طلب اشتراك</h1>
      <div className="card stack-s">
        <div className="row-between">
          <strong>{TRACK_LABEL[track]}</strong>
          {plan ? <span className="tag">{PERIOD_LABEL[plan.period]}</span> : null}
        </div>
        {plan ? <PriceTag price={formatPrice(plan.price_minor, plan.currency)} /> : null}
      </div>

      {error ? <Notice kind="error">{error}</Notice> : null}
      {done ? (
        <>
          <Notice kind="ok">{done}</Notice>
          <button className="btn" onClick={() => navigate("/")}>العودة</button>
        </>
      ) : (
        <form className="card stack" onSubmit={submit}>
          <Field label="الاسم الكامل">
            <input className="input" value={fullName} required minLength={2}
                   onChange={(e) => setFullName(e.target.value)} />
          </Field>
          <Field label="الصفّ">
            <input className="input" value={grade} onChange={(e) => setGrade(e.target.value)} />
          </Field>
          <Field label="رقم التواصل">
            <input className="input" value={contact} required inputMode="tel"
                   onChange={(e) => setContact(e.target.value)} dir="ltr"
                   style={{ textAlign: "start" }} />
          </Field>

          <Field label="طريقة الدفع">
            <select className="select" value={method}
                    onChange={(e) => setMethod(e.target.value as PayMethod)}>
              <option value="transfer">تحويل بنكي — أرفع الإيصال</option>
              <option value="gateway" disabled>الدفع داخل المنصّة (قيد الإعداد)</option>
            </select>
          </Field>

          {method === "transfer" ? (
            <Field label="صورة الإيصال" hint="تُحفظ في مخزنٍ خاصّ، ويراها المعلّم وحده">
              <input className="input" type="file" accept="image/*,application/pdf"
                     onChange={(e) => setReceipt(e.target.files?.[0] ?? null)} required />
            </Field>
          ) : null}

          <button className="btn btn--primary" disabled={busy}>
            {busy ? "…" : "إرسال الطلب"}
          </button>
        </form>
      )}
    </div>
  );
}
