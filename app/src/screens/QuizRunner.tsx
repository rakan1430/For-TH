import { useEffect, useMemo, useState } from "react";
import {
  attemptAnswers, listOptions, listQuestions, listQuizzes, myAttempts,
  saveAnswer, startAttempt, submitAttempt,
} from "../lib/api";
import type { Attempt, Option, Question, Quiz, Track } from "../lib/types";
import { formatDateTime, formatPercent, formatScore } from "../lib/format";
import { Icon } from "../components/Icon";
import { Notice } from "../components/ui";
import { navigate } from "../lib/router";

const REFUSAL: Record<string, string> = {
  not_found: "الاختبار غير متاح.",
  not_published: "الاختبار غير منشور بعد.",
  no_subscription: "اشتراكك في هذا المسار غير ساري.",
  not_assigned: "لم يُرسَل إليك هذا الاختبار.",
  not_open_yet: "لم يُفتح الاختبار بعد.",
  past_due: "انتهى موعد تسليم هذا الاختبار.",
  attempts_exhausted: "استنفدت عدد المحاولات المسموح بها.",
  subscription_expired: "انتهى اشتراكك، فلا يمكن حفظ الإجابة ولا تسليمها.",
  already_submitted: "سُلِّمت هذه المحاولة من قبل.",
};

export function QuizRunner({ quizId, track }: { quizId: string; track: Track }) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [past, setPast] = useState<Attempt[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [result, setResult] = useState<
    { score: number | null; max: number | null; correct: number | null; total: number | null; late: boolean } | null
  >(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    Promise.all([listQuizzes(track), myAttempts(quizId), listQuestions(quizId)])
      .then(async ([qs, at, qq]) => {
        setQuiz(qs.find((q) => q.id === quizId) ?? null);
        setPast(at);
        setQuestions(qq);
        setOptions(await listOptions(qq.map((q) => q.id)));
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [quizId, track]);

  // مؤقّتٌ للعرض فقط: **المهلة الحقيقية محسوبة في الخادم** ويرفض بعدها
  useEffect(() => {
    if (!attempt?.expires_at) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [attempt?.expires_at]);

  const remaining = useMemo(() => {
    if (!attempt?.expires_at) return null;
    return Math.max(0, Math.floor((new Date(attempt.expires_at).getTime() - now) / 1000));
  }, [attempt?.expires_at, now]);

  async function begin() {
    setBusy(true); setError(null);
    try {
      const r = await startAttempt(quizId);
      if (!r.ok || !r.attempt_id) {
        setError(REFUSAL[r.reason] ?? `تعذّر بدء المحاولة (${r.reason}).`);
        return;
      }
      setAttempt({
        id: r.attempt_id, quiz_id: quizId, student_id: "", attempt_no: r.attempt_no ?? 1,
        status: "in_progress", started_at: new Date().toISOString(),
        expires_at: r.expires_at, submitted_at: null, score: null, max_score: null,
      });
      setPicked({}); setResult(null);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally { setBusy(false); }
  }

  async function pick(questionId: string, optionId: string) {
    setPicked((p) => ({ ...p, [questionId]: optionId }));
    if (!attempt) return;
    // حفظٌ مرحليّ: لو أُغلق التبويب لم يضع ما أُجيب. ولا تعود منه صحّةٌ إطلاقاً.
    const r = await saveAnswer(attempt.id, questionId, optionId).catch(() => null);
    if (r && !r.ok) setError(REFUSAL[r.reason] ?? null);
  }

  async function finish() {
    if (!attempt) return;
    setBusy(true); setError(null);
    try {
      const answers = questions.map((q) => ({
        question_id: q.id,
        option_id: picked[q.id] ?? null,
      }));
      const r = await submitAttempt(attempt.id, answers);
      if (!r.ok) {
        setError(REFUSAL[r.reason] ?? `تعذّر التسليم (${r.reason}).`);
        return;
      }
      setResult({
        score: r.score, max: r.max_score,
        correct: r.correct_count, total: r.question_count, late: r.late,
      });
      setAttempt(null);
      setPast(await myAttempts(quizId));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally { setBusy(false); }
  }

  if (error && !quiz) return <Notice kind="error">{error}</Notice>;
  if (!quiz) return <p className="muted">…</p>;

  return (
    <div className="stack">
      <button type="button" className="btn btn--quiet btn--sm" onClick={() => navigate("/")}>
        <Icon name="chevron" size={16} /> رجوع
      </button>

      <div className="row-between">
        <h1>{quiz.title}</h1>
        {remaining !== null ? (
          <span className={remaining < 60 ? "tag tag--pen" : "tag"}>
            <Icon name="clock" size={16} />
            <span className="mono">
              {String(Math.floor(remaining / 60)).padStart(2, "0")}:
              {String(remaining % 60).padStart(2, "0")}
            </span>
          </span>
        ) : null}
      </div>

      {error ? <Notice kind="error">{error}</Notice> : null}

      {result ? (
        <div className="card stack-s">
          <h2>النتيجة</h2>
          <p style={{ fontSize: "22px" }} className="mono">
            {formatScore(result.score, result.max)} · {formatPercent(result.score, result.max)}
          </p>
          <p className="muted">
            {result.correct} إجابة صحيحة من {result.total}
          </p>
          {result.late ? (
            <Notice kind="info">
              سُلِّمت بعد انتهاء الوقت، فصُحِّحت الإجابات المحفوظة قبل انتهائه.
            </Notice>
          ) : null}
          {quiz.retention === "permanent" ? (
            <button className="btn btn--primary" onClick={begin} disabled={busy}>
              إعادة الاختبار
            </button>
          ) : null}
        </div>
      ) : null}

      {!attempt && !result ? (
        <div className="card stack-s">
          <p className="muted">
            {quiz.retention === "permanent"
              ? quiz.max_attempts === null
                ? "اختبار مسجَّل: أعِده متى شئت، وكل محاولةٍ تُحفظ بدرجتها."
                : `اختبار مسجَّل: حتى ${quiz.max_attempts} محاولات.`
              : "اختبار مؤقّت: محاولةٌ لمرّة."}
          </p>
          <p className="subtle">{questions.length} سؤالاً</p>
          <button className="btn btn--primary" onClick={begin} disabled={busy}>
            {past.length > 0 ? "محاولة جديدة" : "ابدأ"}
          </button>
        </div>
      ) : null}

      {attempt ? (
        <form className="stack" onSubmit={(e) => { e.preventDefault(); void finish(); }}>
          <p className="subtle">المحاولة رقم {attempt.attempt_no}</p>
          {questions.map((q, i) => (
            <fieldset key={q.id} className="card stack-s" style={{ border: "1px solid var(--border)" }}>
              <legend className="subtle">السؤال {i + 1} من {questions.length}</legend>
              {q.prompt ? <p className="mono" style={{ fontSize: "17px" }}>{q.prompt}</p> : null}
              <div className="stack-s">
                {options.filter((o) => o.question_id === q.id).map((o) => (
                  <button
                    key={o.id} type="button" className="choice" role="radio"
                    aria-checked={picked[q.id] === o.id}
                    onClick={() => void pick(q.id, o.id)}
                  >
                    <span className="mono">{o.label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
          ))}
          <button className="btn btn--primary" disabled={busy}>
            {busy ? "…" : "تسليم"}
          </button>
        </form>
      ) : null}

      {/*
        ⚠️ كل المحاولات معروضة، لا آخرها. الاختبار المسجَّل يُعاد للتدريب،
           والقيمة في رؤية التقدّم لا في رقمٍ واحد يدوس ما قبله.
      */}
      {past.length > 0 ? (
        <section className="stack-s">
          <h2>محاولاتك</h2>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th className="num">المحاولة</th>
                  <th>التاريخ</th>
                  <th className="num">الدرجة</th>
                  <th className="num">النسبة</th>
                </tr>
              </thead>
              <tbody>
                {past.filter((a) => a.status === "submitted").map((a) => (
                  <tr key={a.id}>
                    <td className="num">{a.attempt_no}</td>
                    <td>{formatDateTime(a.submitted_at)}</td>
                    <td className="num">{formatScore(a.score, a.max_score)}</td>
                    <td className="num">{formatPercent(a.score, a.max_score)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Review attempts={past} questions={questions} options={options} />
        </section>
      ) : null}
    </div>
  );
}

/** مراجعة آخر محاولةٍ مُسلَّمة — الصحّة تظهر **بعد** التسليم لا قبله. */
function Review({ attempts, questions, options }: {
  attempts: Attempt[]; questions: Question[]; options: Option[];
}) {
  const last = attempts.find((a) => a.status === "submitted");
  const [answers, setAnswers] = useState<Record<string, { option_id: string | null; is_correct: boolean | null }>>({});
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || !last) return;
    attemptAnswers(last.id).then((rows) => {
      const m: Record<string, { option_id: string | null; is_correct: boolean | null }> = {};
      for (const r of rows) m[r.question_id] = { option_id: r.option_id, is_correct: r.is_correct };
      setAnswers(m);
    }).catch(() => {});
  }, [open, last]);

  if (!last) return null;

  return (
    <div className="stack-s">
      <button type="button" className="btn btn--quiet btn--sm" onClick={() => setOpen(!open)}>
        {open ? "إخفاء المراجعة" : `مراجعة المحاولة ${last.attempt_no}`}
      </button>
      {open ? questions.map((q, i) => {
        const a = answers[q.id];
        return (
          <div key={q.id} className="card stack-s">
            <span className="subtle">السؤال {i + 1}</span>
            {q.prompt ? <p className="mono">{q.prompt}</p> : null}
            <div className="row">
              {a?.is_correct === true
                ? <span className="tag tag--ok"><Icon name="check" size={16} /> صحيحة</span>
                : <span className="tag tag--pen"><Icon name="x" size={16} /> خاطئة</span>}
              <span className="muted mono">
                {options.find((o) => o.id === a?.option_id)?.label ?? "بلا إجابة"}
              </span>
            </div>
          </div>
        );
      }) : null}
    </div>
  );
}
