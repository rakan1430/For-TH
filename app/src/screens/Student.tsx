import { useEffect, useState } from "react";
import {
  bankItems, isActive, listBanks, listQuizzes, listResources, listSections, signedUrl,
} from "../lib/api";
import type { Bank, Quiz, Resource, Section, Subscription, Track } from "../lib/types";
import { TRACKS, TRACK_SHORT } from "../lib/types";
import { formatDate } from "../lib/format";
import { Icon } from "../components/Icon";
import { Empty, Notice } from "../components/ui";
import { navigate } from "../lib/router";
import { SavedQuestions } from "./SavedQuestions";

/** أقسام صفحة الطالب: المحتوى، والاختبارات، ودفتر المراجعة. */
type View = "content" | "exams" | "saved";

/**
 * صفحة الطالب.
 *
 * ⚠️ لا شرط صلاحيةٍ في هذا الملفّ. ما يصل من القاعدة هو ما يحقّ له رؤيته:
 *    منشورٌ، ومرئيٌّ له. ولو أُلغيت سطور الترشيح أدناه لما تسرّب صفٌّ
 *    واحد — الترشيح هنا **تبويبٌ لا حراسة**.
 *
 * ⚠️ والمساران يُعرضان دائماً، لا «ما اشترك فيه». صار المسار **تبويب
 *    عرضٍ** لا حقّاً يُملك، يوم صارت المنصّة مجّانية (ق-٤).
 */
export function Student({ subs, track, onTrack }: {
  subs: Subscription[]; track: Track; onTrack: (t: Track) => void;
}) {
  const [sections, setSections] = useState<Section[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [view, setView] = useState<View>("content");
  const sub = subs.find((s) => s.track === track && isActive(s));

  useEffect(() => {
    let alive = true;
    setLoading(true); setError(null);
    Promise.all([listSections(track), listBanks(track), listResources(track), listQuizzes(track)])
      .then(([se, b, r, q]) => {
        if (!alive) return;
        setSections(se); setBanks(b); setResources(r); setQuizzes(q);
      })
      .catch((e) => alive && setError(String(e?.message ?? e)))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [track]);

  return (
    <div className="stack">
      <div className="tabs" role="tablist" aria-label="أقسام الصفحة">
        <button role="tab" className="tab" aria-selected={view === "content"}
                onClick={() => setView("content")}>المحتوى</button>
        <button role="tab" className="tab" aria-selected={view === "exams"}
                onClick={() => setView("exams")}>الاختبارات</button>
        <button role="tab" className="tab" aria-selected={view === "saved"}
                onClick={() => setView("saved")}>أسئلة المراجعة</button>
      </div>

      {/* ⚠️ دفتر المراجعة يعبر المسارات — فيُخفى مبدّلُ المسار معه، ولا
          يُترك زرّاً لا يفعل شيئاً. */}
      {view !== "saved" ? (
        <div className="tabs" role="tablist" aria-label="المسار">
          {TRACKS.map((t) => (
            <button key={t} role="tab" className="tab" aria-selected={t === track}
                    onClick={() => onTrack(t)}>
              {TRACK_SHORT[t]}
            </button>
          ))}
        </div>
      ) : null}

      {view === "saved" ? <SavedQuestions /> : null}

      {view !== "saved" ? (
        <>
      <div className="row-between">
        <h1>{TRACK_SHORT[track]}</h1>
        {/* ⚠️ بلا لون إنذار: المنصّة مجّانية، فلا يسقط شيءٌ بانتهاء
            الاشتراك. تبقى المعلومة لأنّها صحيحة، ويسقط الفزع لأنّه لم يعد. */}
        {sub ? (
          <span className="tag">
            <Icon name="clock" size={16} />
            ينتهي اشتراكك {formatDate(sub.ends_on)}
          </span>
        ) : null}
      </div>

      {error ? <Notice kind="error">{error}</Notice> : null}
      {loading ? <p className="muted">…</p> : null}
        </>
      ) : null}

      {view === "exams" && !loading ? (
        <Exams quizzes={quizzes} banks={banks} />
      ) : null}

      {view === "content" && !loading
        && banks.length === 0 && resources.length === 0 && quizzes.length === 0 ? (
        <Empty>لم يُنشَر محتوىً في هذا المسار بعد.</Empty>
      ) : null}

      {view === "content" ? (
        <>
      {/* المعلّم يقسّم الصفحة كما يريد: الأقسام عناوينه هو، لا بنيةٌ مفروضة */}
      {sections.map((section) => {
        const sBanks = banks.filter((b) => b.section_id === section.id);
        const loose = resources.filter((r) => r.section_id === section.id && !r.bank_id);
        if (sBanks.length === 0 && loose.length === 0) return null;
        return (
          <section key={section.id} className="stack-s">
            <h2>{section.title}</h2>
            {sBanks.map((b) => (
              <BankCard key={b.id} bank={b} resources={resources} quizzes={quizzes} />
            ))}
            {loose.map((r) => <ResourceRow key={r.id} resource={r} />)}
          </section>
        );
      })}

      {(() => {
        const orphanBanks = banks.filter(
          (b) => !b.section_id || !sections.some((s) => s.id === b.section_id)
        );
        const orphanRes = resources.filter(
          (r) => !r.bank_id && (!r.section_id || !sections.some((s) => s.id === r.section_id))
        );
        const orphanQuiz = quizzes.filter((q) => !q.bank_id);
        if (!orphanBanks.length && !orphanRes.length && !orphanQuiz.length) return null;
        return (
          <section className="stack-s">
            {sections.length > 0 ? <h2>متفرّقات</h2> : null}
            {orphanBanks.map((b) => (
              <BankCard key={b.id} bank={b} resources={resources} quizzes={quizzes} />
            ))}
            {orphanRes.map((r) => <ResourceRow key={r.id} resource={r} />)}
            {orphanQuiz.map((q) => <QuizRow key={q.id} quiz={q} />)}
          </section>
        );
      })()}
        </>
      ) : null}
    </div>
  );
}

/**
 * تبويب «الاختبارات» — طلب المالك: «إضافة اختبارات إلكترونية في تبويبٍ
 * كاملٍ جديد».
 *
 * ⚠️ والقسمة بين «محاكية» و«تابعة لبنك» قسمةُ **مكان** لا نوع: الشاشة التي
 *    تفتحها واحدة (ق-٦)، والاختبار المحاكي هو ما لم يوضع في بنك. ولا يُخترع
 *    للطالب تصنيفٌ لا يعرفه المعلّم في محرّره.
 */
function Exams({ quizzes, banks }: { quizzes: Quiz[]; banks: Bank[] }) {
  const standalone = quizzes.filter((q) => !q.bank_id);
  const inBanks = banks
    .map((b) => ({ bank: b, list: quizzes.filter((q) => q.bank_id === b.id) }))
    .filter((g) => g.list.length > 0);

  if (quizzes.length === 0) {
    return <Empty>لا اختبارات في هذا المسار بعد.</Empty>;
  }

  return (
    <div className="stack">
      {standalone.length > 0 ? (
        <section className="stack-s">
          <h2>اختبارات محاكية</h2>
          {standalone.map((q) => <QuizRow key={q.id} quiz={q} />)}
        </section>
      ) : null}

      {inBanks.map(({ bank, list }) => (
        <section key={bank.id} className="stack-s">
          <h2>{bank.title}</h2>
          {list.map((q) => <QuizRow key={q.id} quiz={q} />)}
        </section>
      ))}
    </div>
  );
}

/** البنك: حاوية عناصرَ **بالترتيب الذي وضعه المعلّم** — لا أبجدياً ولا زمنياً. */
function BankCard({ bank, resources, quizzes }: {
  bank: Bank; resources: Resource[]; quizzes: Quiz[];
}) {
  const items = bankItems(bank.id, resources, quizzes);
  return (
    <article className="card stack-s">
      <div className="row">
        <Icon name="bank" />
        <h3 className="card__title">{bank.title}</h3>
      </div>
      {bank.description ? <p className="muted">{bank.description}</p> : null}
      {items.length === 0 ? (
        <p className="subtle">لا عناصر بعد.</p>
      ) : (
        <ol className="stack-s" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((it) => (
            <li key={it.kind === "resource" ? it.resource.id : it.quiz.id}>
              {it.kind === "resource"
                ? <ResourceRow resource={it.resource} />
                : <QuizRow quiz={it.quiz} />}
            </li>
          ))}
        </ol>
      )}
    </article>
  );
}

function ResourceRow({ resource }: { resource: Resource }) {
  const [busy, setBusy] = useState(false);
  const icon = resource.kind === "link" ? "link" : resource.kind === "image" ? "image" : "file";

  async function open() {
    if (resource.kind === "link" && resource.url) {
      window.open(resource.url, "_blank", "noopener,noreferrer");
      return;
    }
    if (!resource.storage_path) return;
    setBusy(true);
    try {
      // ⚠️ رابطٌ موقَّع ومؤقّت يُطلب عند الضغط — لا رابط عامّ دائم في الصفحة
      const url = await signedUrl("resources", resource.storage_path, 300);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } finally { setBusy(false); }
  }

  return (
    <button type="button" className="choice" onClick={open} disabled={busy}>
      <Icon name={icon} />
      <span>{resource.title}</span>
    </button>
  );
}

function QuizRow({ quiz }: { quiz: Quiz }) {
  return (
    <button type="button" className="choice" onClick={() => navigate(`/quiz/${quiz.id}`)}>
      <Icon name="quiz" />
      <span className="stack-s" style={{ gap: 0 }}>
        <span>{quiz.title}</span>
        <span className="subtle">
          {quiz.retention === "permanent"
            ? quiz.max_attempts === null
              ? "اختبار مسجَّل — يُعاد بلا حدّ"
              : `اختبار مسجَّل — حتى ${quiz.max_attempts} محاولات`
            : "اختبار مؤقّت"}
          {quiz.due_at ? ` · يُسلَّم قبل ${formatDate(quiz.due_at)}` : ""}
          {quiz.time_limit_minutes ? ` · ${quiz.time_limit_minutes} دقيقة` : ""}
        </span>
      </span>
    </button>
  );
}
