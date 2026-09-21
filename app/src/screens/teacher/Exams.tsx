import { useCallback, useEffect, useState } from "react";
import {
  listBanks, listGroups, listQuizzes, quizAttempts, submittedCounts,
  type AttemptWithStudent,
} from "../../lib/api";
import * as A from "../../lib/authoring";
import type { Bank, Group, Quiz, Track } from "../../lib/types";
import { TRACKS, TRACK_SHORT } from "../../lib/types";
import { formatDateTime, formatPercent, formatScore, countLabel } from "../../lib/format";
import { downloadCsv } from "../../lib/csv";
import { Icon } from "../../components/Icon";
import { Empty, Notice } from "../../components/ui";
import { QuizEditor, emptyQuiz } from "./QuizEditor";
import { SendBox } from "./SendBox";

/**
 * تبويب «الاختبارات» في لوحة المعلّم.
 *
 * ⚠️ أبلغ المالك أنّ لوحته **لا تحوي قائمةً للاختبارات** إطلاقاً: كان كل
 *    اختبارٍ يُنشأ من داخل بنكٍ ولا سبيل إلى اختبارٍ مستقلّ، ولا موضعَ يرى
 *    فيه اختباراته كلّها مجتمعة.
 *
 * ⚠️⚠️ والأهمّ ممّا طلب: **لم يكن يرى نتائج طلّابه في أي شاشة.** معلّمٌ
 *    يؤدّي طلّابه اختباراته ولا يعرف درجاتهم — والقاعدة تحفظها كلّها منذ
 *    اليوم الأوّل. فالنقص كان في الشاشة وحدها.
 */
type Mode =
  | { kind: "list" }
  | { kind: "results"; quizId: string }
  | { kind: "edit"; draft: A.DraftQuiz };

export function Exams() {
  const [track, setTrack] = useState<Track>("qudurat");
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [q, b, g] = await Promise.all([listQuizzes(track), listBanks(track), listGroups(track)]);
      setQuizzes(q); setBanks(b); setGroups(g);
      setCounts(await submittedCounts(q.map((x) => x.id)));
      setError(null);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally { setLoading(false); }
  }, [track]);

  useEffect(() => { setMode({ kind: "list" }); void reload(); }, [reload]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null); setInfo(null);
    try {
      await fn();
      await reload();
      if (done) setInfo(done);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  };

  if (mode.kind === "edit") {
    return (
      <QuizEditor
        initial={mode.draft}
        onCancel={() => setMode({ kind: "list" })}
        onDone={async (r) => {
          await reload();
          setInfo(
            `حُفظ الاختبار — ${r.questions_saved} سؤالاً` +
            (r.questions_locked > 0
              ? ` · و${r.questions_locked} مقفلاً لأنّها دخلت في نتائج مسلَّمة`
              : "")
          );
          setMode({ kind: "list" });
        }}
      />
    );
  }

  if (mode.kind === "results") {
    const quiz = quizzes.find((q) => q.id === mode.quizId);
    if (!quiz) return <Empty>لم يُعثر على الاختبار.</Empty>;
    return <Results quiz={quiz} onBack={() => setMode({ kind: "list" })} />;
  }

  return (
    <div className="stack">
      <div className="tabs" role="tablist" aria-label="المسار">
        {TRACKS.map((t) => (
          <button key={t} role="tab" className="tab" aria-selected={t === track}
                  onClick={() => setTrack(t)}>{TRACK_SHORT[t]}</button>
        ))}
      </div>

      {error ? <Notice kind="error">{error}</Notice> : null}
      {info ? <Notice kind="ok">{info}</Notice> : null}
      {loading ? <p className="muted">…</p> : null}

      <button type="button" className="btn btn--primary" style={{ alignSelf: "flex-start" }}
              onClick={() => setMode({
                kind: "edit",
                draft: emptyQuiz(track, null, quizzes.filter((q) => !q.bank_id).length),
              })}>
        <Icon name="plus" size={16} /> اختبار محاكٍ جديد
      </button>

      {!loading && quizzes.length === 0 ? (
        <Empty>لا اختبارات في هذا المسار بعد.</Empty>
      ) : null}

      {quizzes.map((q) => (
        <ExamRow
          key={q.id} quiz={q} banks={banks} groups={groups}
          submitted={counts[q.id] ?? 0}
          onAct={act}
          onResults={() => setMode({ kind: "results", quizId: q.id })}
          onEdit={async () => {
            try {
              setMode({ kind: "edit", draft: await A.loadQuizDraft(q) });
            } catch (e) {
              setError(String((e as Error)?.message ?? e));
            }
          }}
        />
      ))}
    </div>
  );
}

/* ========================================================================== */

function ExamRow({ quiz, banks, groups, submitted, onAct, onResults, onEdit }: {
  quiz: Quiz; banks: Bank[]; groups: Group[]; submitted: number;
  onAct: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
  onResults: () => void;
  onEdit: () => void;
}) {
  const [sending, setSending] = useState(false);
  const bank = quiz.bank_id ? banks.find((b) => b.id === quiz.bank_id) : null;

  return (
    <article className="card stack-s">
      <div className="row" style={{ gap: "var(--u-half)" }}>
        <Icon name="quiz" />
        <span className="stack-s" style={{ gap: 0, flex: "1 1 200px", minWidth: "160px" }}>
          <strong>{quiz.title}</strong>
          <span className="subtle" style={{ fontSize: "13px" }}>
            {bank ? bank.title : "اختبار محاكٍ"}
            {` · ${quiz.retention === "permanent" ? "مسجَّل" : "مؤقّت"}`}
            {quiz.time_limit_minutes ? ` · ${quiz.time_limit_minutes} دقيقة` : ""}
          </span>
        </span>

        {/* ⚠️ العدد ظاهرٌ في القائمة لا داخل الشاشة وحدها: المعلّم يريد أن
            يعرف بنظرةٍ أيّ اختبارٍ أدّاه طلّابه وأيّهما لم يمسّه أحد. */}
        <span className={submitted > 0 ? "tag tag--ok" : "tag tag--muted"}>
          {countLabel(submitted, {
            none: "لا محاولات", one: "محاولة واحدة", two: "محاولتان",
            few: "محاولات", many: "محاولة",
          })}
        </span>

        <button type="button" className="btn btn--quiet btn--sm"
                title={quiz.is_published ? "منشور — اضغط لإلغاء النشر" : "مسودّة — اضغط للنشر"}
                style={quiz.is_published ? { borderColor: "var(--green)", color: "var(--green)" } : undefined}
                onClick={() => void onAct(
                  () => A.updateQuiz(quiz.id, { is_published: !quiz.is_published }),
                  quiz.is_published ? "أُلغي نشر الاختبار." : "نُشر الاختبار."
                )}>
          <Icon name={quiz.is_published ? "eye" : "eyeOff"} size={16} />
          {quiz.is_published ? "منشور" : "مسودّة"}
        </button>

        <button type="button" className="btn btn--sm" onClick={onResults} disabled={submitted === 0}>
          <Icon name="users" size={16} /> النتائج
        </button>
        <button type="button" className="btn btn--quiet btn--sm" onClick={onEdit}>
          <Icon name="edit" size={16} /> تعديل
        </button>
        <button type="button" className="btn btn--quiet btn--sm"
                onClick={() => setSending((v) => !v)}>
          <Icon name="send" size={16} /> إرسال
        </button>
        <button type="button" className="btn btn--quiet btn--sm"
                aria-label={`حذف ${quiz.title}`}
                onClick={() => void onAct(() => A.deleteQuiz(quiz.id))}>
          <Icon name="trash" size={16} />
        </button>
      </div>

      {sending ? (
        <SendBox itemType="quiz" itemId={quiz.id} track={quiz.track}
                 groups={groups} published={quiz.is_published} />
      ) : null}
    </article>
  );
}

/* ========================================================================== */

/**
 * نتائج اختبارٍ واحد.
 *
 * ⚠️ صفٌّ لكل **محاولة** لا لكل طالب: الاختبار المسجَّل يُعاد بلا حدّ،
 *    وإخفاءُ المحاولات السابقة خلف «الأفضل» يخفي عن المعلّم أهمّ ما يريد
 *    رؤيته — هل تحسّن الطالب أم كرّر الخطأ نفسه؟
 */
function Results({ quiz, onBack }: { quiz: Quiz; onBack: () => void }) {
  const [rows, setRows] = useState<AttemptWithStudent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    quizAttempts(quiz.id)
      .then((r) => alive && setRows(r))
      .catch((e) => alive && setError(String(e?.message ?? e)));
    return () => { alive = false; };
  }, [quiz.id]);

  const submitted = (rows ?? []).filter((r) => r.status === "submitted");

  function exportCsv() {
    downloadCsv(
      `نتائج-${quiz.title}`,
      ["الطالب", "الصفّ", "المدرسة", "التواصل", "المحاولة", "الدرجة", "من", "النسبة", "التسليم"],
      submitted.map((r) => [
        r.profiles?.full_name ?? "",
        r.profiles?.grade ?? "",
        r.profiles?.school ?? "",
        r.profiles?.contact ?? "",
        r.attempt_no,
        r.score ?? "",
        r.max_score ?? "",
        formatPercent(r.score, r.max_score),
        r.submitted_at ? formatDateTime(r.submitted_at) : "",
      ])
    );
  }

  return (
    <div className="stack">
      <button type="button" className="btn btn--quiet btn--sm" style={{ alignSelf: "flex-start" }}
              onClick={onBack}>
        <Icon name="chevron" size={16} /> رجوع
      </button>

      <h2 style={{ fontSize: "20px", margin: 0 }}>نتائج: {quiz.title}</h2>

      {error ? <Notice kind="error">{error}</Notice> : null}
      {!rows ? <p className="muted">…</p> : null}

      {rows && submitted.length === 0 ? (
        <Empty>لم يسلّم أحدٌ هذا الاختبار بعد.</Empty>
      ) : null}

      {submitted.length > 0 ? (
        <>
          <button type="button" className="btn btn--quiet btn--sm" style={{ alignSelf: "flex-start" }}
                  onClick={exportCsv}>
            <Icon name="download" size={16} /> تصدير النتائج (CSV)
          </button>

          {submitted.map((r) => (
            <div key={r.id} className="card row-between">
              <span className="stack-s" style={{ gap: 0 }}>
                <b>{r.profiles?.full_name ?? "—"}</b>
                <span className="subtle" style={{ fontSize: "13px" }}>
                  {[r.profiles?.grade, r.profiles?.school].filter(Boolean).join(" · ")}
                  {r.attempt_no > 1 ? ` · المحاولة ${r.attempt_no}` : ""}
                  {r.submitted_at ? ` · ${formatDateTime(r.submitted_at)}` : ""}
                </span>
              </span>
              <span className="row" style={{ gap: "var(--u-half)" }}>
                <span className="mono">{formatScore(r.score, r.max_score)}</span>
                <span className="tag">{formatPercent(r.score, r.max_score)}</span>
              </span>
            </div>
          ))}
        </>
      ) : null}
    </div>
  );
}
