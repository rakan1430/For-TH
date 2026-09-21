import { useEffect, useMemo, useRef, useState } from "react";
import { StoredImage } from "../../components/StoredImage";
import { Icon } from "../../components/Icon";
import {
  cellState, examStats, formatClock, clockIsUrgent, stepFont,
  optionLetter, submitWarning, FONT_SIZES, DEFAULT_FONT_STEP,
  type CellInput, type FontStep,
} from "../../lib/exam";
import type { Option, Question } from "../../lib/types";
import type { ReviewRow } from "../../lib/api";
import { Scratchpad } from "../../components/Scratchpad";
import type { Stroke } from "../../lib/scratch";

/**
 * شاشة الاختبار — واجهةٌ **واحدة** لكل اختبارات المنصّة.
 *
 * ⚠️ لا نسخة ثانية «مبسّطة» لاختبارات البنوك: نسختان تتباعدان، فيقارن
 *    الطالب بين اختبارٍ وآخر ويشعر أنّ أحدهما أقلّ جدّية. والفرق بين اختبار
 *    البنك والاختبار الكامل في **المحتوى والمؤقّت**، لا في الشاشة.
 *
 * ⚠️ وهي مطابقةٌ عمداً لواجهة قياس: الطالب يتدرّب على الواجهة التي سيواجهها
 *    في الاختبار الحقيقي.
 */

export interface ExamProps {
  title: string;
  subject: string;
  studentName: string;
  teacherName: string;
  questions: Question[];
  options: Option[];
  /** المتبقّي بالثواني، أو `null` لاختبارٍ بلا مؤقّت */
  remaining: number | null;
  picked: Record<string, string>;
  /** `null` قبل التسليم؛ صفوف المراجعة بعده */
  review: ReviewRow[] | null;
  busy?: boolean;
  onPick: (questionId: string, optionId: string) => void;
  onSubmit: () => void;
  onExit: () => void;
  onToggleSave?: (questionId: string, saved: boolean) => void;
}

export function ExamShell(p: ExamProps) {
  const [current, setCurrent] = useState(0);
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [font, setFont] = useState<FontStep>(DEFAULT_FONT_STEP);
  const [sideOpen, setSideOpen] = useState(false);
  /*
   * ⚠️ مسودّةٌ **لكل سؤال** لا واحدةٌ للاختبار: الطالب يعود إلى سؤالٍ تركه
   *    فيجد عمله كما تركه. ولو كانت واحدة لوجد فوقها حساب سؤالٍ آخر.
   *
   * ⚠️ وتعيش في الذاكرة وحدها: ورقة شطبٍ لا تُرسل ولا تُصحَّح ولا تُحفظ
   *    (`lib/scratch.ts`).
   */
  const [pads, setPads] = useState<Record<string, Stroke[]>>({});
  const [padOpen, setPadOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const reviewing = p.review !== null;
  const byQuestion = useMemo(() => {
    const m = new Map<string, ReviewRow>();
    for (const r of p.review ?? []) m.set(r.question_id, r);
    return m;
  }, [p.review]);

  const cells: CellInput[] = p.questions.map((q) => ({
    answered: Boolean(p.picked[q.id]),
    flagged: Boolean(flags[q.id]),
    correct: reviewing ? (byQuestion.get(q.id)?.is_correct ?? false) : null,
  }));
  const stats = examStats(cells);

  const q = p.questions[current];
  const row = q ? byQuestion.get(q.id) : undefined;

  // ⚠️ الانتقال بين الأسئلة يُعيد التمرير للأعلى: سؤالٌ طويلٌ سبقه يترك
  //    الطالب في منتصف السؤال التالي فيظنّ أوّله مفقوداً.
  useEffect(() => { scrollRef.current?.scrollTo({ top: 0 }); }, [current]);

  function go(i: number) {
    setCurrent(Math.max(0, Math.min(p.questions.length - 1, i)));
    setSideOpen(false);
  }

  function trySubmit() {
    const warn = submitWarning(stats.remaining);
    // ⚠️ تحذيرٌ لا منع: قد يترك الطالب سؤالاً عمداً — لكن يجب أن يعرف.
    if (warn && !window.confirm(warn)) return;
    p.onSubmit();
  }

  const urgent = clockIsUrgent(p.remaining);

  return (
    <div className={`exam${sideOpen ? " exam--side-open" : ""}`}>
      {/* ═══ الشريط الجانبي ═══ */}
      <aside className="exam__side">
        {p.remaining !== null ? (
          <div className={`exam__clock${urgent ? " exam__clock--urgent" : ""}`}>
            <span className="exam__clock-label">الوقت المتبقّي</span>
            <span className="exam__clock-value">{formatClock(p.remaining)}</span>
          </div>
        ) : null}

        <div className="exam__who">
          <b>{p.studentName}</b>
          <span className="muted">{p.teacherName}</span>
        </div>

        <div className="exam__meta">
          <b>{p.title}</b>
          <div>{p.subject}</div>
        </div>

        {/* ⚠️ الإحصاءات تُحسب في `examStats` مرّةً واحدة — هي نفسها التي
            تلوّن لوحة الأرقام، فلا تفترق بطاقةٌ عن خليّة. */}
        <div className="exam__stats">
          {reviewing ? (
            <>
              <Stat n={stats.correct} k="صحيحة" tone="ok" />
              <Stat n={stats.wrong}   k="خاطئة" tone="warn" />
            </>
          ) : (
            <>
              <Stat n={stats.answered}  k="مُجاب"   tone="ok" />
              <Stat n={stats.remaining} k="متبقٍّ"  tone="warn" />
              <Stat n={stats.flagged}   k="مُميَّز" tone="flag" />
              <Stat n={stats.total}     k="الكلّ"   tone="info" />
            </>
          )}
        </div>

        <div className="exam__pad" role="list" aria-label="أرقام الأسئلة">
          {p.questions.map((qq, i) => {
            const st = cellState(cells[i]!);
            return (
              <button
                key={qq.id} type="button"
                className={`exam__cell exam__cell--${st}${i === current ? " exam__cell--current" : ""}`}
                onClick={() => go(i)}
                aria-current={i === current ? "true" : undefined}
                aria-label={`السؤال ${i + 1} — ${CELL_LABEL[st]}`}
              >
                {i + 1}
              </button>
            );
          })}
        </div>

        <span className="spacer" />

        {!reviewing ? (
          <button className="btn btn--primary" onClick={trySubmit} disabled={p.busy}>
            {p.busy ? "…" : "تسليم الاختبار"}
          </button>
        ) : null}
        <button type="button" className="btn btn--quiet" onClick={p.onExit}>
          خروج
        </button>
      </aside>

      {/* ═══ المنطقة الرئيسية ═══ */}
      <main className="exam__main">
        <div className="exam__bar">
          <button
            type="button"
            className="btn btn--quiet btn--sm exam__side-toggle"
            onClick={() => setSideOpen((v) => !v)}
            aria-expanded={sideOpen}
          >
            <Icon name="grip" size={16} />
            <span className="sr-only">لوحة الأسئلة</span>
          </button>

          <span className="exam__counter">
            السؤال {current + 1} من {p.questions.length}
          </span>

          {p.remaining !== null ? (
            <span className="exam__counter exam__bar-clock" style={{ direction: "ltr" }}>
              {formatClock(p.remaining)}
            </span>
          ) : null}

          <span className="spacer" />

          {q ? (
            <button
              type="button"
              className={padOpen ? "btn btn--sm" : "btn btn--quiet btn--sm"}
              aria-pressed={padOpen}
              onClick={() => setPadOpen((v) => !v)}
            >
              <Icon name="edit" size={16} />
              مسودّة
              {/* علامةٌ صامتة: في السؤال عملٌ سابق، فلا يظنّه ضاع */}
              {(pads[q.id]?.length ?? 0) > 0 ? (
                <span aria-hidden="true" style={{ color: "var(--gold)" }}>•</span>
              ) : null}
            </button>
          ) : null}

          {/* ⚠️ ثلاث حالات لا تدرّجٌ حرّ: أزرارٌ ثلاثة أوضح من شريطٍ لا يعرف
              الطالب أين يقف منه. */}
          <div className="row exam__font" role="group" aria-label="حجم الخطّ">
            <button type="button" className="btn btn--quiet btn--sm"
                    onClick={() => setFont((f) => stepFont(f, -1))}
                    disabled={font === 0} aria-label="تصغير الخطّ">A-</button>
            <button type="button" className="btn btn--quiet btn--sm"
                    onClick={() => setFont(DEFAULT_FONT_STEP)} aria-label="الحجم المعتاد">A</button>
            <button type="button" className="btn btn--quiet btn--sm"
                    onClick={() => setFont((f) => stepFont(f, 1))}
                    disabled={font === 2} aria-label="تكبير الخطّ">A+</button>
          </div>
        </div>

        {/* ⚠️ غلافٌ موضعيّ للمسودّة وحدها: تغطّي السؤال ولا تغطّي الشريط
            العلويّ ولا أزرار التنقّل. فيقلّب الطالب الأسئلة ومسودّته مفتوحة،
            ولا يبقى محبوساً في لوحٍ لا يرى منه رقم سؤاله ولا وقته. */}
        <div className="exam__body">
        <div className="exam__scroll" ref={scrollRef}>
          {q ? (
            <div className="exam__q" style={{ fontSize: `${FONT_SIZES[font]}px` }}>
              {q.prompt ? <p className="exam__prompt">{q.prompt}</p> : null}
              {q.prompt_image_path ? (
                <StoredImage
                  bucket="question-images" path={q.prompt_image_path}
                  alt={`صورة السؤال ${current + 1}`} maxHeight={420}
                />
              ) : null}

              <div className="exam__opts" role="radiogroup" aria-label="الخيارات">
                {p.options.filter((o) => o.question_id === q.id).map((o, oi) => (
                  <button
                    key={o.id} type="button" role="radio"
                    aria-checked={p.picked[q.id] === o.id}
                    className={`exam__opt${optionClass(o.id, q.id, p.picked, row, reviewing)}`}
                    onClick={() => !reviewing && p.onPick(q.id, o.id)}
                    disabled={reviewing}
                  >
                    <span className="exam__letter" aria-hidden="true">{optionLetter(oi)}</span>
                    <span className="stack-s" style={{ minWidth: 0, alignItems: "flex-start" }}>
                      {o.label ? <span>{o.label}</span> : null}
                      {o.image_path ? (
                        <StoredImage
                          bucket="question-images" path={o.image_path}
                          alt={o.label || `صورة الخيار ${oi + 1}`} maxHeight={200}
                        />
                      ) : null}
                    </span>
                  </button>
                ))}
              </div>

              {/* ⚠️ الشرح **بعد التسليم وحده**، ولمن أخطأ أو ترك. ومن أصاب
                  لا يُشرح له ما عرفه — الشرح علاجٌ لا زينة. */}
              {reviewing && row && row.is_correct !== true
                && (row.explanation || row.explanation_image_path) ? (
                <div className="exam__why">
                  <span className="exam__why-label">طريقة الحلّ</span>
                  {row.explanation ? <p>{row.explanation}</p> : null}
                  {row.explanation_image_path ? (
                    <StoredImage
                      bucket="question-images" path={row.explanation_image_path}
                      alt="صورة شرح الحلّ" maxHeight={420}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : (
            <p className="muted">لا أسئلة في هذا الاختبار.</p>
          )}
        </div>

        {padOpen && q ? (
          <Scratchpad
            key={q.id}
            strokes={pads[q.id] ?? []}
            onChange={(next) => setPads((m) => ({ ...m, [q.id]: next }))}
            onClose={() => setPadOpen(false)}
          />
        ) : null}
        </div>

        <div className="exam__foot">
          {reviewing ? (
            q && p.onToggleSave ? (
              <button
                type="button"
                className={row?.is_saved ? "btn btn--sm" : "btn btn--quiet btn--sm"}
                style={row?.is_saved ? { borderColor: "var(--gold)", color: "var(--gold)" } : undefined}
                onClick={() => p.onToggleSave!(q.id, !row?.is_saved)}
              >
                <Icon name={row?.is_saved ? "check" : "plus"} size={16} />
                {row?.is_saved ? "في أسئلة المراجعة" : "أضف لأسئلة المراجعة"}
              </button>
            ) : null
          ) : q ? (
            <label className="row" style={{ gap: "var(--u-qtr)", cursor: "pointer" }}>
              <input
                type="checkbox" checked={Boolean(flags[q.id])}
                onChange={(e) => setFlags((f) => ({ ...f, [q.id]: e.target.checked }))}
              />
              <span>تمييز السؤال للمراجعة</span>
            </label>
          ) : null}

          <span className="spacer" />

          <button type="button" className="btn btn--quiet btn--sm"
                  onClick={() => go(current - 1)} disabled={current === 0}>
            السابق
          </button>
          <button type="button" className="btn btn--quiet btn--sm"
                  onClick={() => go(current + 1)}
                  disabled={current >= p.questions.length - 1}>
            التالي
          </button>
        </div>
      </main>
    </div>
  );
}

const CELL_LABEL: Record<string, string> = {
  blank: "لم يُجَب", answered: "مُجاب", flagged: "مُميَّز",
  correct: "صحيح", wrong: "خاطئ",
};

/**
 * ⚠️ في المراجعة: الصحيح **يُحاط بالأخضر دائماً** ولو لم يختره الطالب،
 *    وإجابته الخاطئة بالأحمر. فيرى الفرق بين ما اختاره وما كان صحيحاً —
 *    وهو كلّ الغرض من المراجعة.
 */
function optionClass(
  optionId: string, questionId: string,
  picked: Record<string, string>,
  row: ReviewRow | undefined,
  reviewing: boolean
): string {
  if (!reviewing) return picked[questionId] === optionId ? " exam__opt--picked" : "";
  if (row?.correct_option_id === optionId) return " exam__opt--correct";
  if (row?.chosen_option_id === optionId) return " exam__opt--wrong";
  return "";
}

function Stat({ n, k, tone }: { n: number; k: string; tone: "ok" | "warn" | "flag" | "info" }) {
  return (
    <div className={`exam__stat exam__stat--${tone}`}>
      <span className="exam__stat-n">{n}</span>
      <span className="exam__stat-k">{k}</span>
    </div>
  );
}
