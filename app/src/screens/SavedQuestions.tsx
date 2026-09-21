import { useEffect, useState } from "react";
import { listOptions, mySavedQuestions, unsaveQuestion, type SavedRow } from "../lib/api";
import type { Option } from "../lib/types";
import { TRACK_SHORT } from "../lib/types";
import { countLabel, formatDate } from "../lib/format";
import { optionLetter } from "../lib/exam";
import { Icon } from "../components/Icon";
import { StoredImage } from "../components/StoredImage";
import { Empty, Notice } from "../components/ui";

/**
 * دفتر أسئلة المراجعة — طلب المالك: «قسمٌ خاصٌّ بالطالب يحفظ فيه ما أخطأ
 * فيه أو استصعبه، ليعود إليه».
 *
 * ⚠️ وهو **لا يراه المعلّم**: ما استصعبه الطالب ليس تقييماً يُرفع، ولو عُرض
 *    عليه لتردّد الطالب قبل أن يحفظ فتفقد الميزة معناها. الحارس في القاعدة
 *    (`saved_read` على صاحب الصفّ وحده)، لا في هذه الشاشة.
 *
 * ⚠️ والدفتر **يعبر المسارين**: هو دفتر الطالب لا تبويبُ مسار. ولذلك يحمل
 *    كل سطرٍ وسم مساره، فلا يختلط عليه من أين جاء السؤال.
 */
export function SavedQuestions() {
  const [rows, setRows] = useState<SavedRow[] | null>(null);
  const [options, setOptions] = useState<Option[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    mySavedQuestions()
      .then(async (r) => {
        if (!alive) return;
        setRows(r);
        // الخيارات تُجلب دفعةً واحدة: سطرٌ لكل سؤالٍ يعني نداءً لكل سؤال.
        setOptions(await listOptions(r.map((x) => x.question_id)));
      })
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => { alive = false; };
  }, []);

  async function remove(questionId: string) {
    setBusy(questionId); setError(null);
    try {
      const r = await unsaveQuestion(questionId);
      if (!r.ok) { setError("تعذّر نزع السؤال من دفترك."); return; }
      setRows((prev) => prev && prev.filter((x) => x.question_id !== questionId));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally { setBusy(null); }
  }

  if (error && !rows) return <Notice kind="error">{error}</Notice>;
  if (!rows) return <p className="muted">…</p>;

  if (rows.length === 0) {
    return (
      <Empty>
        <p>دفترك فارغ.</p>
        <p className="subtle">
          بعد تسليم أي اختبار، اضغط «أضف لأسئلة المراجعة» تحت السؤال الذي
          تريد العودة إليه.
        </p>
      </Empty>
    );
  }

  return (
    <div className="stack">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {/* ⚠️ العربية خمس صيغ لا اثنتان (خ-١١): «١ سؤالاً» خطأٌ يراه الطالب
          في أوّل سطر. والعدّ يمرّ بـ`countLabel` دائماً. */}
      <p className="subtle">
        {countLabel(rows.length, {
          none: "دفترك فارغ", one: "سؤالٌ واحد في دفترك", two: "سؤالان في دفترك",
          few: "أسئلة في دفترك", many: "سؤالاً في دفترك",
        })}. ولا يراه المعلّم.
      </p>

      {rows.map((row) => (
        <article key={row.question_id} className="card stack-s">
          <div className="row-between">
            <span className="subtle">
              {row.quiz_title} · {TRACK_SHORT[row.track]} · حُفظ {formatDate(row.saved_at)}
            </span>
            <button type="button" className="btn btn--quiet btn--sm"
                    onClick={() => void remove(row.question_id)}
                    disabled={busy === row.question_id}
                    aria-label="نزع من دفتر المراجعة">
              <Icon name="trash" size={16} /> نزع
            </button>
          </div>

          {row.prompt ? <p className="mono">{row.prompt}</p> : null}
          {row.prompt_image_path ? (
            <StoredImage bucket="question-images" path={row.prompt_image_path}
                         alt="صورة السؤال" maxHeight={320} />
          ) : null}

          <ol className="stack-s" style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {options.filter((o) => o.question_id === row.question_id).map((o, i) => (
              <li key={o.id}
                  className={o.id === row.correct_option_id ? "saved__opt saved__opt--correct" : "saved__opt"}>
                <b className="mono">{optionLetter(i)}</b>
                {o.label ? <span>{o.label}</span> : null}
                {o.image_path ? (
                  <StoredImage bucket="question-images" path={o.image_path}
                               alt={`صورة الخيار ${optionLetter(i)}`} maxHeight={160} />
                ) : null}
                {o.id === row.correct_option_id ? (
                  <span className="tag tag--ok"><Icon name="check" size={14} /> الصحيح</span>
                ) : null}
              </li>
            ))}
          </ol>

          {row.explanation || row.explanation_image_path ? (
            <div className="stack-s">
              <span className="field__label">طريقة الحلّ</span>
              {row.explanation ? <p className="mono">{row.explanation}</p> : null}
              {row.explanation_image_path ? (
                <StoredImage bucket="question-images" path={row.explanation_image_path}
                             alt="صورة الحلّ" maxHeight={320} />
              ) : null}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}
