import { useState } from "react";
import type { DraftQuiz, DraftQuestion, SaveQuizResult } from "../../lib/authoring";
import { saveQuiz, uploadQuestionImage } from "../../lib/authoring";
import type { Track } from "../../lib/types";
import { Icon } from "../../components/Icon";
import { Field, Notice } from "../../components/ui";
import { Sortable, DragHandle } from "../../components/Sortable";
import { Scratchpad } from "../../components/Scratchpad";
import { StoredImage } from "../../components/StoredImage";
import type { Stroke } from "../../lib/scratch";

export function emptyQuiz(track: Track, bankId: string | null, position: number): DraftQuiz {
  return {
    id: null, track, scope: bankId ? "bank" : "general",
    bank_id: bankId, section_id: null, title: "",
    // ⚠️ الافتراضي «مسجَّل»: يُعاد بلا حدّ للتدريب، وهو ما يريده المعلّم غالباً.
    //    والمؤقّت اختيارٌ واعٍ لأنّه محاولةٌ واحدة لا رجعة فيها.
    retention: "permanent", is_published: false,
    opens_at: null, due_at: null, time_limit_minutes: null, max_attempts: null,
    position,
    questions: [newQuestion()],
  };
}

function newQuestion(): DraftQuestion {
  return {
    id: null, prompt: "", prompt_image_path: null, points: 1,
    explanation: null, explanation_image_path: null,
    options: [
      { label: "", is_correct: true },
      { label: "", is_correct: false },
    ],
  };
}

export function QuizEditor({
  initial, onDone, onCancel,
}: {
  initial: DraftQuiz;
  onDone: (result: SaveQuizResult) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<DraftQuiz>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = <K extends keyof DraftQuiz>(k: K, v: DraftQuiz[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  function patchQuestion(i: number, patch: Partial<DraftQuestion>) {
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, n) => (n === i ? { ...q, ...patch } : q)),
    }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      // تحقّقٌ في الواجهة ليصل الخطأ مبكّراً — والخادم يفحص مرّةً أخرى ويرفض
      const bad = draft.questions.findIndex((q) => !q.options.some((o) => o.is_correct));
      if (bad !== -1) {
        setError(`السؤال ${bad + 1} بلا إجابةٍ صحيحة — لن يُصحَّح.`);
        return;
      }
      const empty = draft.questions.findIndex(
        (q) => !q.prompt.trim() && !q.prompt_image_path
      );
      if (empty !== -1) {
        setError(`السؤال ${empty + 1} بلا نصٍّ ولا صورة.`);
        return;
      }

      /*
       * ⚠️ القيد في القاعدة على الخيار: `label` غير فارغ **أو** `image_path`.
       *    فخيارٌ خالٍ من الاثنين يُرفض عند الحفظ برسالةٍ من Postgres لا يفهمها
       *    المعلّم. والفحص هنا يسمّي رقم السؤال ورقم الخيار.
       */
      for (let qi = 0; qi < draft.questions.length; qi++) {
        const oi = draft.questions[qi]!.options.findIndex(
          (o) => !o.label.trim() && !o.image_path
        );
        if (oi !== -1) {
          setError(`الخيار ${oi + 1} في السؤال ${qi + 1} بلا نصٍّ ولا صورة.`);
          return;
        }
      }

      const r = await saveQuiz(draft);
      if (!r.ok) {
        setError(
          r.reason === "question_without_answer" ? "سؤالٌ بلا إجابة صحيحة."
          : r.reason === "title_required" ? "الاختبار يحتاج عنواناً."
          : r.reason === "bank_required" ? "اختبار البنك يحتاج بنكاً."
          : `تعذّر الحفظ (${r.reason}).`
        );
        return;
      }
      onDone(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر الحفظ");
    } finally {
      setBusy(false);
    }
  }

  const lockedCount = draft.questions.filter((q) => q.locked).length;

  return (
    <form className="stack" onSubmit={submit}>
      <div className="row-between">
        <h2>{draft.id ? "تعديل اختبار" : "اختبار جديد"}</h2>
        <button type="button" className="btn btn--quiet btn--sm" onClick={onCancel}>
          إلغاء
        </button>
      </div>

      {error ? <Notice kind="error">{error}</Notice> : null}

      {lockedCount > 0 ? (
        <Notice kind="info">
          {lockedCount === 1 ? "سؤالٌ واحد" : `${lockedCount} أسئلة`} دخلت في نتائج
          مسلَّمة، فلا تُعدَّل ولا تُحذف — تعديلها يجعل درجاتٍ مسجَّلة محسوبةً على
          سؤالٍ غير الذي رآه الطالب. يمكنك إضافة أسئلة جديدة.
        </Notice>
      ) : null}

      <div className="card stack-s">
        <Field label="عنوان الاختبار">
          <input className="input" value={draft.title} required
                 onChange={(e) => set("title", e.target.value)} />
        </Field>

        <div className="grid-2">
          <Field label="النوع" hint={
            draft.retention === "permanent"
              ? "يُعاد بلا حدّ للتدريب، ونتائجه تبقى"
              : "محاولةٌ واحدة لكل طالب"
          }>
            <select className="select" value={draft.retention}
                    onChange={(e) => set("retention", e.target.value as DraftQuiz["retention"])}>
              <option value="permanent">مسجَّل — دائم</option>
              <option value="temporary">مؤقّت — لمرّة</option>
            </select>
          </Field>

          <Field label="عدد المحاولات" hint={
            draft.max_attempts === null
              ? (draft.retention === "permanent" ? "بلا حدّ" : "واحدة")
              : undefined
          }>
            <input className="input" type="number" min={1} max={99}
                   value={draft.max_attempts ?? ""}
                   placeholder={draft.retention === "permanent" ? "بلا حدّ" : "١"}
                   onChange={(e) =>
                     set("max_attempts", e.target.value === "" ? null : Number(e.target.value))} />
          </Field>
        </div>

        <div className="grid-2">
          <Field label="موعد التسليم" hint="اختياري">
            <input className="input" type="datetime-local"
                   value={toLocalInput(draft.due_at)}
                   onChange={(e) => set("due_at", fromLocalInput(e.target.value))} />
          </Field>
          <Field label="المؤقّت بالدقائق" hint="اختياري — يُحسب في الخادم">
            <input className="input" type="number" min={1} max={600}
                   value={draft.time_limit_minutes ?? ""}
                   onChange={(e) =>
                     set("time_limit_minutes", e.target.value === "" ? null : Number(e.target.value))} />
          </Field>
        </div>

        <label className="row" style={{ cursor: "pointer" }}>
          <input type="checkbox" checked={draft.is_published}
                 onChange={(e) => set("is_published", e.target.checked)} />
          <span>منشور — يصل الطلّاب الذين أُرسل إليهم</span>
        </label>
      </div>

      <div className="row-between">
        <h3>الأسئلة ({draft.questions.length})</h3>
        <button type="button" className="btn btn--sm"
                onClick={() => set("questions", [...draft.questions, newQuestion()])}>
          <Icon name="plus" size={16} /> سؤال
        </button>
      </div>

      <Sortable
        items={draft.questions.map((q, i) => ({ q, i, key: q.id ?? `new-${i}` }))}
        getKey={(x) => x.key}
        label="ترتيب الأسئلة"
        onReorder={(next) => set("questions", next.map((x) => x.q))}
        renderItem={({ q, i }, api) => (
          <QuestionCard
            question={q} index={api.index} api={api} track={draft.track}
            onPatch={(patch) => patchQuestion(i, patch)}
            onRemove={
              draft.questions.length > 1 && !q.locked
                ? () => set("questions", draft.questions.filter((_, n) => n !== i))
                : null
            }
          />
        )}
      />

      <button className="btn btn--primary" disabled={busy}>
        {busy ? "…" : "حفظ الاختبار"}
      </button>
    </form>
  );
}

function QuestionCard({
  question, index, api, track, onPatch, onRemove,
}: {
  question: DraftQuestion;
  index: number;
  api: Parameters<Parameters<typeof Sortable>[0]["renderItem"]>[1];
  track: Track;
  onPatch: (patch: Partial<DraftQuestion>) => void;
  onRemove: (() => void) | null;
}) {
  const [uploading, setUploading] = useState(false);
  const [imgError, setImgError] = useState<string | null>(null);
  /*
   * ⚠️ لوح الكتابة بخطّ اليد — طلب المعلّم: «مربّعٌ بسيط يكتب فيه بالقلم
   *    بخطّ يده، ثمّ يُحفظ». والخطوط محلّيةٌ هنا ولا تُحفظ في القاعدة:
   *    المحفوظ هو **الصورة** الناتجة، في نفس الحقل الذي تُرفع إليه صورة
   *    الحلّ. فلا جدول جديد ولا سياسة جديدة، ويعمل عرضُها للطالب من أوّل
   *    يوم لأنّ مسار القراءة قائمٌ منذ ٠٠١٦.
   */
  const [penOpen, setPenOpen] = useState(false);
  const [ink, setInk] = useState<Stroke[]>([]);
  const locked = Boolean(question.locked);

  function setOption(oi: number, patch: Partial<DraftQuestion["options"][number]>) {
    onPatch({
      options: question.options.map((o, n) => (n === oi ? { ...o, ...patch } : o)),
    });
  }

  /** الصحيح واحد: اختيار خيارٍ يُلغي ما سواه. */
  function markCorrect(oi: number) {
    onPatch({ options: question.options.map((o, n) => ({ ...o, is_correct: n === oi })) });
  }

  return (
    <div className="card stack-s">
      <div className="row-between">
        <span className="row">
          <DragHandle api={api} title={`السؤال ${index + 1}`} />
          <strong>السؤال {index + 1}</strong>
          {locked ? <span className="tag tag--muted">مقفل — له نتائج</span> : null}
        </span>
        {onRemove ? (
          <button type="button" className="btn btn--quiet btn--sm" onClick={onRemove}
                  aria-label={`حذف السؤال ${index + 1}`}>
            <Icon name="trash" size={16} />
          </button>
        ) : null}
      </div>

      <Field label="نصّ السؤال">
        <textarea className="textarea mono" value={question.prompt} disabled={locked}
                  onChange={(e) => onPatch({ prompt: e.target.value })}
                  placeholder="مثال:  f(x) = 3x² − 12x + 7 ، أوجد قيمة x عند القيمة الصغرى" />
      </Field>

      <div className="row">
        <Field label="الدرجة">
          <input className="input" type="number" min={0.5} step={0.5} style={{ width: "96px" }}
                 value={question.points} disabled={locked}
                 onChange={(e) => onPatch({ points: Number(e.target.value) || 1 })} />
        </Field>

        {!locked ? (
          <label className="btn btn--quiet btn--sm" style={{ cursor: "pointer" }}>
            <Icon name="image" size={16} />
            {question.prompt_image_path ? "تغيير الصورة" : "صورة للسؤال"}
            <input type="file" accept="image/*" hidden disabled={uploading}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                try {
                  onPatch({ prompt_image_path: await uploadQuestionImage(track, f) });
                } finally { setUploading(false); }
              }} />
          </label>
        ) : null}

        {question.prompt_image_path ? (
          <span className="tag tag--ok"><Icon name="check" size={14} /> صورة مرفقة</span>
        ) : null}
      </div>

      <div className="stack-s">
        <span className="field__label">الخيارات — اختر الصحيح</span>
        {question.options.map((o, oi) => (
          <div key={oi} className="row" style={{ flexWrap: "nowrap", alignItems: "stretch" }}>
            <button
              type="button"
              className={o.is_correct ? "btn btn--sm" : "btn btn--quiet btn--sm"}
              style={o.is_correct
                ? { borderColor: "var(--green)", color: "var(--green)" }
                : undefined}
              onClick={() => markCorrect(oi)}
              disabled={locked}
              aria-pressed={o.is_correct}
              aria-label={`تعليم الخيار ${oi + 1} صحيحاً`}
            >
              <Icon name={o.is_correct ? "check" : "x"} size={16} />
            </button>
            <input
              className="input mono" style={{ flex: 1 }} value={o.label} disabled={locked}
              placeholder={o.image_path ? "نصٌّ اختياري مع الصورة" : `الخيار ${oi + 1}`}
              onChange={(e) => setOption(oi, { label: e.target.value })}
            />
            {/*
              ⚠️ خيارٌ بصورة: القاعدة تقبله بلا نصّ (`label` أو `image_path`).
                 وسؤال القدرات كثيراً ما يكون أشكالاً هندسية لا كلمات — فخيارٌ
                 نصّيٌّ وحده يجعل نصف بنك الأسئلة غير قابلٍ للإدخال أصلاً.
            */}
            {!locked ? (
              <label
                className={o.image_path ? "btn btn--sm" : "btn btn--quiet btn--sm"}
                style={{ cursor: "pointer", ...(o.image_path ? { borderColor: "var(--green)", color: "var(--green)" } : {}) }}
                title={o.image_path ? "تغيير صورة الخيار" : "صورة للخيار"}
              >
                <Icon name="image" size={16} />
                <span className="sr-only">
                  {o.image_path ? `تغيير صورة الخيار ${oi + 1}` : `صورة للخيار ${oi + 1}`}
                </span>
                <input type="file" accept="image/*" hidden disabled={uploading}
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    setUploading(true);
                    try {
                      setOption(oi, { image_path: await uploadQuestionImage(track, f) });
                    } finally {
                      setUploading(false);
                      // ⚠️ يُفرَّغ الحقل، وإلّا لم يُطلق `change` عند اختيار
                      //    الملفّ نفسه مرّةً ثانية بعد فشلٍ أو تراجع.
                      e.target.value = "";
                    }
                  }} />
              </label>
            ) : null}
            {o.image_path && !locked ? (
              <button type="button" className="btn btn--quiet btn--sm"
                      onClick={() => setOption(oi, { image_path: null })}
                      aria-label={`إزالة صورة الخيار ${oi + 1}`}
                      title="إزالة الصورة">
                <Icon name="x" size={16} />
              </button>
            ) : null}
            {question.options.length > 2 && !locked ? (
              <button type="button" className="btn btn--quiet btn--sm"
                      onClick={() => onPatch({
                        options: question.options.filter((_, n) => n !== oi),
                      })}
                      aria-label={`حذف الخيار ${oi + 1}`}>
                <Icon name="trash" size={16} />
              </button>
            ) : null}
          </div>
        ))}
        {!locked ? (
          <button type="button" className="btn btn--quiet btn--sm"
                  onClick={() => onPatch({
                    options: [...question.options, { label: "", is_correct: false }],
                  })}>
            <Icon name="plus" size={16} /> خيار
          </button>
        ) : null}
      </div>

      {/*
        ⚠️ الشرح **غير معطَّلٍ مع القفل**، خلافاً لكل ما فوقه. والفرق مقصود:
           القفل يحمي ما رآه الطالب وما يُصحَّح عليه، والشرح ليس منهما — بل
           أحوج ما يكون المعلّم إلى كتابته بعد أن يرى من أخطأ فيه.
      */}
      <div className="stack-s">
        <Field label="طريقة الحلّ — يراها الطالب بعد التسليم وحده">
          <textarea
            className="textarea mono" rows={2}
            value={question.explanation ?? ""}
            onChange={(e) => onPatch({ explanation: e.target.value })}
            placeholder="اشرح الخطوات نصّاً — أو اكتبها بخطّ يدك في اللوح أدناه" />
        </Field>

        {/* ⚠️ الخطأ يُعلَن: رفعٌ يفشل بصمتٍ يجعل المعلّم يظنّ أنّه أرفق
            حلّاً ولم يُرفق — ولا يكتشفه إلّا الطالب. */}
        {imgError ? <Notice kind="error">{imgError}</Notice> : null}

        <div className="row">
          <label className={question.explanation_image_path ? "btn btn--sm" : "btn btn--quiet btn--sm"}
                 style={{ cursor: "pointer",
                          ...(question.explanation_image_path
                              ? { borderColor: "var(--green)", color: "var(--green)" } : {}) }}>
            <Icon name="image" size={16} />
            {question.explanation_image_path ? "تغيير صورة الحلّ" : "صورة للحلّ"}
            <input type="file" accept="image/*" hidden disabled={uploading}
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true); setImgError(null);
                try {
                  onPatch({ explanation_image_path: await uploadQuestionImage(track, f) });
                } catch (err) {
                  setImgError(err instanceof Error ? err.message : "تعذّر رفع الصورة.");
                } finally { setUploading(false); e.target.value = ""; }
              }} />
          </label>

          {/* ⚠️ زرٌّ ثالث لا بديلٌ عن الرفع: المعلّم على حاسوبٍ يرفع صورةً
              ممسوحة، وعلى لوحٍ بقلمٍ يكتب مباشرةً. والوجهتان حقلٌ واحد. */}
          <button type="button"
                  className={penOpen ? "btn btn--sm" : "btn btn--quiet btn--sm"}
                  aria-expanded={penOpen}
                  onClick={() => { setPenOpen((v) => !v); setImgError(null); }}>
            <Icon name="edit" size={16} />
            {penOpen ? "إغلاق اللوح" : "اكتب الحلّ بخطّ يدك"}
          </button>

          {question.explanation_image_path ? (
            <button type="button" className="btn btn--quiet btn--sm"
                    onClick={() => onPatch({ explanation_image_path: null })}
                    title="إزالة صورة الحلّ"
                    aria-label={`إزالة صورة حلّ السؤال ${index + 1}`}>
              <Icon name="x" size={16} />
            </button>
          ) : null}
          {locked ? (
            <span className="subtle">الشرح وحده قابلٌ للتعديل في سؤالٍ له نتائج.</span>
          ) : null}
        </div>

        {penOpen ? (
          <>
            <Scratchpad
              variant="paper"
              strokes={ink}
              onChange={setInk}
              busy={uploading}
              onClose={() => setPenOpen(false)}
              onSave={async (png) => {
                setUploading(true); setImgError(null);
                try {
                  // ⚠️ اسمٌ بامتدادٍ صريح: الرافع يشتقّ الامتداد من الاسم،
                  //    و`Blob` بلا اسم يُحفظ بلا امتدادٍ فلا يُعرض صورةً.
                  const file = new File([png], "handwriting.png", { type: "image/png" });
                  onPatch({ explanation_image_path: await uploadQuestionImage(track, file) });
                  setPenOpen(false);
                } catch (err) {
                  setImgError(err instanceof Error ? err.message : "تعذّر حفظ الرسم.");
                } finally { setUploading(false); }
              }}
            />
            <p className="subtle" style={{ margin: 0 }}>
              اكتب بالقلم أو بإصبعك، ثمّ اضغط «حفظ الرسم». يُحفظ صورةً في خانة
              صورة الحلّ — ولتعديله لاحقاً أعد كتابته.
            </p>
          </>
        ) : null}

        {/* ⚠️ معاينةٌ لما أُرفق: المعلّم يحتاج أن **يرى** أنّ خطّ يده حُفظ،
            لا أن يُخبَر بذلك. */}
        {question.explanation_image_path ? (
          <StoredImage bucket="question-images" path={question.explanation_image_path}
                       alt="صورة حلّ السؤال" maxHeight={240} />
        ) : null}
      </div>
    </div>
  );
}

/* ⚠️ حقل `datetime-local` يتكلّم التوقيت المحلّي، والقاعدة تخزّن UTC.
      التحويل هنا في موضعٍ واحد — ولو نُثر في الشاشات لانحرف موعدٌ بساعات. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
