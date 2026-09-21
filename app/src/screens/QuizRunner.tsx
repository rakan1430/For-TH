import { useEffect, useMemo, useRef, useState } from "react";
import {
  attemptReview, listOptions, listQuestions, listQuizzes, myAttempts,
  saveAnswer, saveQuestion, startAttempt, submitAttempt, unsaveQuestion,
  type ReviewRow,
} from "../lib/api";
import type { Attempt, Option, Question, Quiz, Track } from "../lib/types";
import { TRACK_SHORT } from "../lib/types";
import { formatDate, formatPercent, formatScore } from "../lib/format";
import { PLATFORM_NAME } from "../components/Logo";
import { Icon } from "../components/Icon";
import { Notice } from "../components/ui";
import { navigate } from "../lib/router";
import { ExamShell } from "./exam/ExamShell";

const REFUSAL: Record<string, string> = {
  not_found: "الاختبار غير متاح.",
  not_published: "الاختبار غير منشور بعد.",
  no_subscription: "اشتراكك في هذا المسار غير ساري.",
  not_assigned: "لم يُرسَل إليك هذا الاختبار.",
  not_open_yet: "لم يُفتح الاختبار بعد.",
  past_due: "انتهى موعد تسليم هذا الاختبار.",
  attempts_exhausted: "استنفدت عدد المحاولات المسموح بها.",
  quiz_closed: "سحب المعلّم هذا الاختبار، فلا يمكن حفظ الإجابة ولا تسليمها.",
  already_submitted: "سُلِّمت هذه المحاولة من قبل.",
};

export function QuizRunner({ quizId, track, studentName }: {
  quizId: string; track: Track; studentName: string;
}) {
  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [past, setPast] = useState<Attempt[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [review, setReview] = useState<ReviewRow[] | null>(null);
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

  /*
   * ⚠️ انتهى الوقت ⇒ **تسليمٌ تلقائيّ** (ملحق الاختبارات §٣-أ). ولا يُترك
   *    الطالب في شاشةٍ منتهية الصلاحية بلا فعل، فيضغط «تسليم» فيُردّ
   *    بـ«انتهى الوقت» ولا يفهم لماذا احتُفظ بإجاباته أصلاً.
   *
   * ⚠️ و`useRef` حارسٌ لازم: المؤقّت يعيد الرسم كل ثانية، وبلا الحارس
   *    يُستدعى التسليم مرّةً في كل ثانيةٍ بعد الصفر.
   */
  const autoSubmitted = useRef(false);
  useEffect(() => {
    if (remaining === 0 && attempt && !autoSubmitted.current) {
      autoSubmitted.current = true;
      void finish();
    }
  }, [remaining, attempt]);

  async function begin() {
    setBusy(true); setError(null);
    try {
      const r = await startAttempt(quizId);
      if (!r.ok || !r.attempt_id) {
        setError(REFUSAL[r.reason] ?? `تعذّر بدء المحاولة (${r.reason}).`);
        return;
      }
      autoSubmitted.current = false;
      setAttempt({
        id: r.attempt_id, quiz_id: quizId, student_id: "", attempt_no: r.attempt_no ?? 1,
        status: "in_progress", started_at: new Date().toISOString(),
        expires_at: r.expires_at, submitted_at: null, score: null, max_score: null,
      });
      setPicked({}); setResult(null); setReview(null);
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
    const attemptId = attempt.id;
    try {
      const answers = questions.map((q) => ({
        question_id: q.id,
        option_id: picked[q.id] ?? null,
      }));
      const r = await submitAttempt(attemptId, answers);
      if (!r.ok) {
        setError(REFUSAL[r.reason] ?? `تعذّر التسليم (${r.reason}).`);
        return;
      }
      setResult({
        score: r.score, max: r.max_score,
        correct: r.correct_count, total: r.question_count, late: r.late,
      });
      setAttempt(null);
      // ⚠️ المراجعة تُقرأ من الخادم لا تُبنى محلّياً: الصحيح لم يصل الجهاز
      //    قبل هذه اللحظة، وهو الشرط الأوّل في ملحق الاختبارات §٦.
      setReview(await attemptReview(attemptId).catch(() => null));
      setPast(await myAttempts(quizId));
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally { setBusy(false); }
  }

  async function openReview(a: Attempt) {
    setBusy(true); setError(null);
    try {
      const rows = await attemptReview(a.id);
      setReview(rows);
      setPicked(Object.fromEntries(
        rows.filter((r) => r.chosen_option_id).map((r) => [r.question_id, r.chosen_option_id!])
      ));
      setResult({
        score: a.score, max: a.max_score,
        correct: rows.filter((r) => r.is_correct).length, total: rows.length, late: false,
      });
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally { setBusy(false); }
  }

  async function toggleSave(questionId: string, save: boolean) {
    const fn = save ? saveQuestion(questionId) : unsaveQuestion(questionId);
    const r = await fn.catch(() => null);
    if (!r || !r.ok) {
      setError(r?.reason === "not_reviewable"
        ? "لا يمكن حفظ سؤالٍ لم تُسلّم اختباره."
        : "تعذّر تعديل أسئلة المراجعة.");
      return;
    }
    setReview((rows) => rows && rows.map((x) =>
      x.question_id === questionId ? { ...x, is_saved: save } : x));
  }

  if (error && !quiz) return <Notice kind="error">{error}</Notice>;
  if (!quiz) return <p className="muted">…</p>;

  /* ═══ الشاشة الكاملة: أثناء المحاولة، أو في المراجعة ═══ */
  if (attempt || review) {
    return (
      <ExamShell
        title={quiz.title}
        subject={TRACK_SHORT[track]}
        studentName={studentName}
        teacherName={PLATFORM_NAME}
        questions={questions}
        options={options}
        remaining={attempt ? remaining : null}
        picked={picked}
        review={review}
        busy={busy}
        onPick={(q, o) => void pick(q, o)}
        onSubmit={() => void finish()}
        onExit={() => { setAttempt(null); setReview(null); }}
        onToggleSave={(q, s) => void toggleSave(q, s)}
      />
    );
  }

  /* ═══ شاشة المدخل: النتيجة والمحاولات السابقة والبدء ═══ */
  return (
    <div className="stack">
      <button type="button" className="btn btn--quiet btn--sm" onClick={() => navigate("/")}>
        <Icon name="chevron" size={16} /> رجوع
      </button>

      <h1>{quiz.title}</h1>
      {error ? <Notice kind="error">{error}</Notice> : null}

      {result ? (
        <div className="card stack-s">
          <h2>النتيجة</h2>
          <p style={{ fontSize: "22px" }} className="mono">
            {formatScore(result.score, result.max)} · {formatPercent(result.score, result.max)}
          </p>
          <p className="muted">{result.correct} إجابة صحيحة من {result.total}</p>
          {result.late ? (
            <Notice kind="info">
              سُلِّمت بعد انتهاء الوقت، فصُحِّحت الإجابات المحفوظة قبل انتهائه.
            </Notice>
          ) : null}
        </div>
      ) : null}

      <div className="card stack-s">
        <p className="muted">
          {quiz.retention === "permanent"
            ? quiz.max_attempts === null
              ? "اختبار مسجَّل: أعِده متى شئت، وكل محاولةٍ تُحفظ بدرجتها."
              : `اختبار مسجَّل: حتى ${quiz.max_attempts} محاولات.`
            : "اختبار مؤقّت: محاولةٌ لمرّة."}
        </p>
        <p className="subtle">{questions.length} سؤالاً</p>
        <button className="btn btn--primary" onClick={() => void begin()} disabled={busy}>
          {past.length > 0 ? "محاولة جديدة" : "ابدأ"}
        </button>
      </div>

      {/* ⚠️ المحاولات السابقة بمراجعتها: «يرى اختباراته السابقة ونتيجتها
          والدخول لرؤية الأسئلة التي أخطأ بها» — طلب المالك حرفياً. */}
      {past.length > 0 ? (
        <section className="stack-s">
          <h2 style={{ fontSize: "18px" }}>محاولاتك السابقة</h2>
          {past.map((a) => (
            <div key={a.id} className="card row-between">
              <span>
                <b>المحاولة {a.attempt_no}</b>
                <span className="subtle" style={{ display: "block", fontSize: "13px" }}>
                  {a.submitted_at ? formatDate(a.submitted_at) : "لم تُسلَّم"}
                  {a.score !== null ? ` · ${formatScore(a.score, a.max_score)}` : ""}
                </span>
              </span>
              {a.status === "submitted" ? (
                <button type="button" className="btn btn--quiet btn--sm"
                        onClick={() => void openReview(a)} disabled={busy}>
                  <Icon name="eye" size={16} /> مراجعة
                </button>
              ) : null}
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
