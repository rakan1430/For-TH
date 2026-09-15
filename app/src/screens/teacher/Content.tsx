import { useCallback, useEffect, useState } from "react";
import {
  bankItems, listBanks, listGroups, listQuizzes, listResources, listSections,
  signedUrl, assignItems,
} from "../../lib/api";
import * as A from "../../lib/authoring";
import type { Bank, Group, Quiz, Resource, Section, Track, Audience } from "../../lib/types";
import { TRACKS, TRACK_SHORT } from "../../lib/types";
import { Icon } from "../../components/Icon";
import { Empty, Field, Notice } from "../../components/ui";
import { Sortable, DragHandle } from "../../components/Sortable";
import { QuizEditor, emptyQuiz } from "./QuizEditor";

type Mode =
  | { kind: "list" }
  | { kind: "bank"; bankId: string }
  | { kind: "quiz"; draft: A.DraftQuiz; bankId: string | null };

export function Content() {
  const [track, setTrack] = useState<Track>("qudurat");
  const [mode, setMode] = useState<Mode>({ kind: "list" });

  const [sections, setSections] = useState<Section[]>([]);
  const [banks, setBanks] = useState<Bank[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [quizzes, setQuizzes] = useState<Quiz[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [se, b, r, q, g] = await Promise.all([
        listSections(track), listBanks(track), listResources(track),
        listQuizzes(track), listGroups(track),
      ]);
      setSections(se); setBanks(b); setResources(r); setQuizzes(q); setGroups(g);
      setError(null);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally {
      setLoading(false);
    }
  }, [track]);

  useEffect(() => { setMode({ kind: "list" }); void reload(); }, [reload]);

  /** يلفّ كل فعلٍ يكتب: يعرض الخطأ ولا يبتلعه، ويعيد التحميل بعد النجاح. */
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

  if (mode.kind === "quiz") {
    return (
      <QuizEditor
        initial={mode.draft}
        onCancel={() => setMode(mode.bankId ? { kind: "bank", bankId: mode.bankId } : { kind: "list" })}
        onDone={async (r) => {
          await reload();
          // ⚠️ لا «حُفظ ✅» مجرّدة: نقول كم حُفظ وكم قُفل، فيرى المعلّم الحقيقة
          setInfo(
            `حُفظ الاختبار — ${r.questions_saved} سؤالاً` +
            (r.questions_locked > 0
              ? ` · و${r.questions_locked} مقفلاً لأنّها دخلت في نتائج مسلَّمة`
              : "")
          );
          setMode(mode.bankId ? { kind: "bank", bankId: mode.bankId } : { kind: "list" });
        }}
      />
    );
  }

  if (mode.kind === "bank") {
    const bank = banks.find((b) => b.id === mode.bankId);
    if (!bank) return <Empty>لم يُعثر على البنك.</Empty>;
    return (
      <div className="stack">
        {error ? <Notice kind="error">{error}</Notice> : null}
        {info ? <Notice kind="ok">{info}</Notice> : null}
        <BankEditor
          bank={bank} sections={sections} resources={resources} quizzes={quizzes} groups={groups}
          onBack={() => setMode({ kind: "list" })}
          onAct={act}
          onNewQuiz={() =>
            setMode({
              kind: "quiz", bankId: bank.id,
              draft: emptyQuiz(track, bank.id, bankItems(bank.id, resources, quizzes).length),
            })
          }
          onEditQuiz={async (q) => {
            try {
              const draft = await A.loadQuizDraft(q);
              setMode({ kind: "quiz", bankId: bank.id, draft });
            } catch (e) {
              setError(String((e as Error)?.message ?? e));
            }
          }}
        />
      </div>
    );
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

      <SectionsPanel sections={sections} track={track} onAct={act} />

      <BanksPanel
        banks={banks} sections={sections} track={track} onAct={act}
        onOpen={(id) => setMode({ kind: "bank", bankId: id })}
      />

      <LooseResources
        resources={resources.filter((r) => !r.bank_id)}
        sections={sections} track={track} onAct={act}
      />
    </div>
  );
}

/* ========================================================================== */

function SectionsPanel({ sections, track, onAct }: {
  sections: Section[]; track: Track;
  onAct: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");

  return (
    <section className="card stack-s">
      <h2 className="card__title">أقسام صفحة الطالب</h2>
      <p className="subtle">
        تقسّم ما يراه الطالب كما تريد أنت — لا مراحل دراسية ولا بنية يفرضها
        النظام. والترتيب هنا هو ترتيب صفحته.
      </p>

      {sections.length === 0 ? (
        <p className="subtle">لا أقسام بعد. البنوك بلا قسمٍ تظهر تحت «متفرّقات».</p>
      ) : (
        <Sortable
          items={sections} getKey={(s) => s.id} label="ترتيب الأقسام"
          onReorder={(next) => void onAct(() => A.reorder("section", next.map((s) => s.id)))}
          renderItem={(s, api) => (
            <div className="row" style={{ flexWrap: "nowrap" }}>
              <DragHandle api={api} title={s.title} />
              <input className="input" style={{ flex: 1 }} defaultValue={s.title}
                     aria-label={`اسم القسم ${s.title}`}
                     onBlur={(e) => {
                       if (e.target.value.trim() && e.target.value !== s.title) {
                         void onAct(() => A.renameSection(s.id, e.target.value.trim()));
                       }
                     }} />
              <button type="button" className="btn btn--quiet btn--sm"
                      aria-label={`حذف القسم ${s.title}`}
                      onClick={() => void onAct(
                        () => A.deleteSection(s.id),
                        "حُذف القسم، وبقيت بنوكه تحت «متفرّقات»."
                      )}>
                <Icon name="trash" size={16} />
              </button>
            </div>
          )}
        />
      )}

      <form className="row" style={{ flexWrap: "nowrap" }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              void onAct(() => A.createSection(track, title.trim(), sections.length));
              setTitle("");
            }}>
        <input className="input" style={{ flex: 1 }} value={title} placeholder="قسم جديد"
               aria-label="اسم القسم الجديد" onChange={(e) => setTitle(e.target.value)} />
        <button className="btn btn--sm" disabled={!title.trim()}>
          <Icon name="plus" size={16} /> إضافة
        </button>
      </form>
    </section>
  );
}

/* ========================================================================== */

function BanksPanel({ banks, sections, track, onAct, onOpen }: {
  banks: Bank[]; sections: Section[]; track: Track;
  onAct: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const [title, setTitle] = useState("");

  return (
    <section className="card stack-s">
      <h2 className="card__title">البنوك</h2>
      <p className="subtle">
        حاوية تضع فيها ملفّاتك واختباراتك بالترتيب الذي تريده أنت.
      </p>

      {banks.length === 0 ? (
        <p className="subtle">لا بنوك في هذا المسار بعد.</p>
      ) : (
        <Sortable
          items={banks} getKey={(b) => b.id} label="ترتيب البنوك"
          onReorder={(next) => void onAct(() => A.reorder("bank", next.map((b) => b.id)))}
          renderItem={(b, api) => (
            <div className="card stack-s" style={{ background: "var(--bg)" }}>
              <div className="row-between">
                <span className="row" style={{ flexWrap: "nowrap" }}>
                  <DragHandle api={api} title={b.title} />
                  <strong>{b.title}</strong>
                </span>
                <span className="row">
                  {b.is_published
                    ? <span className="tag tag--ok">منشور</span>
                    : <span className="tag tag--muted">مسودّة</span>}
                  <button type="button" className="btn btn--sm" onClick={() => onOpen(b.id)}>
                    فتح
                  </button>
                </span>
              </div>
              <div className="row">
                <select className="select" value={b.section_id ?? ""} style={{ maxWidth: "220px" }}
                        aria-label={`قسم البنك ${b.title}`}
                        onChange={(e) => void onAct(
                          () => A.updateBank(b.id, { section_id: e.target.value || null })
                        )}>
                  <option value="">بلا قسم</option>
                  {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
                </select>
                <button type="button" className="btn btn--quiet btn--sm"
                        onClick={() => void onAct(() => A.updateBank(b.id, { is_published: !b.is_published }))}>
                  <Icon name={b.is_published ? "eyeOff" : "eye"} size={16} />
                  {b.is_published ? "إلغاء النشر" : "نشر"}
                </button>
                <button type="button" className="btn btn--quiet btn--sm"
                        aria-label={`حذف البنك ${b.title}`}
                        onClick={() => void onAct(() => A.deleteBank(b.id))}>
                  <Icon name="trash" size={16} />
                </button>
              </div>
            </div>
          )}
        />
      )}

      <form className="row" style={{ flexWrap: "nowrap" }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              void onAct(() => A.createBank({
                track, title: title.trim(), sectionId: null, position: banks.length,
              }));
              setTitle("");
            }}>
        <input className="input" style={{ flex: 1 }} value={title} placeholder="بنك جديد"
               aria-label="اسم البنك الجديد" onChange={(e) => setTitle(e.target.value)} />
        <button className="btn btn--primary btn--sm" disabled={!title.trim()}>
          <Icon name="plus" size={16} /> إنشاء بنك
        </button>
      </form>
    </section>
  );
}

/* ========================================================================== */

function BankEditor({
  bank, sections, resources, quizzes, groups, onBack, onAct, onNewQuiz, onEditQuiz,
}: {
  bank: Bank; sections: Section[]; resources: Resource[]; quizzes: Quiz[]; groups: Group[];
  onBack: () => void;
  onAct: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
  onNewQuiz: () => void;
  onEditQuiz: (q: Quiz) => void;
}) {
  const items = bankItems(bank.id, resources, quizzes);

  return (
    <div className="stack">
      <button type="button" className="btn btn--quiet btn--sm" onClick={onBack}>
        <Icon name="chevron" size={16} /> كل البنوك
      </button>

      <div className="row-between">
        <h2>{bank.title}</h2>
        {bank.is_published
          ? <span className="tag tag--ok">منشور</span>
          : <span className="tag tag--muted">مسودّة</span>}
      </div>

      <div className="card stack-s">
        <Field label="عنوان البنك">
          <input className="input" defaultValue={bank.title}
                 onBlur={(e) => {
                   if (e.target.value.trim() && e.target.value !== bank.title) {
                     void onAct(() => A.updateBank(bank.id, { title: e.target.value.trim() }));
                   }
                 }} />
        </Field>
        <Field label="وصف" hint="اختياري — يراه الطالب تحت العنوان">
          <textarea className="textarea" defaultValue={bank.description ?? ""}
                    onBlur={(e) => void onAct(
                      () => A.updateBank(bank.id, { description: e.target.value.trim() || null })
                    )} />
        </Field>
        <Field label="القسم">
          <select className="select" value={bank.section_id ?? ""}
                  onChange={(e) => void onAct(
                    () => A.updateBank(bank.id, { section_id: e.target.value || null })
                  )}>
            <option value="">بلا قسم</option>
            {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          </select>
        </Field>
      </div>

      <div className="row-between">
        <h3>عناصر البنك ({items.length})</h3>
      </div>
      <p className="subtle">
        الترتيب هنا هو ما يراه الطالب — اسحب بالمقبض، أو استعمل السهمين.
      </p>

      {items.length === 0 ? (
        <Empty>لا عناصر بعد. ارفع ملفّاً أو أضف رابطاً أو أنشئ اختباراً.</Empty>
      ) : (
        <Sortable
          items={items}
          getKey={(it) => (it.kind === "resource" ? it.resource.id : it.quiz.id)}
          label="ترتيب عناصر البنك"
          onReorder={(next) => void onAct(() => A.reorderBankItems(
            bank.id,
            next.map((it) => it.kind === "resource"
              ? { type: "resource" as const, id: it.resource.id }
              : { type: "quiz" as const, id: it.quiz.id })
          ))}
          renderItem={(it, api) =>
            it.kind === "resource"
              ? <ResourceRow resource={it.resource} api={api} onAct={onAct} />
              : <QuizRow quiz={it.quiz} api={api} onAct={onAct} onEdit={() => onEditQuiz(it.quiz)} />
          }
        />
      )}

      <AddToBank bank={bank} count={items.length} onAct={onAct} onNewQuiz={onNewQuiz} />
      <SendBox
        itemType="bank" itemId={bank.id} track={bank.track} groups={groups}
        published={bank.is_published}
      />
    </div>
  );
}

type Api = Parameters<Parameters<typeof Sortable>[0]["renderItem"]>[1];

function ResourceRow({ resource, api, onAct }: {
  resource: Resource; api: Api;
  onAct: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
}) {
  const icon = resource.kind === "link" ? "link" : resource.kind === "image" ? "image" : "file";
  return (
    /* ⚠️ سطرٌ واحد يلتفّ عند الضيق، لا `row-between` بطرفٍ واحد — فذلك يترك
          فراغاً واسعاً على اليسار يبدو كأنّ شيئاً لم يُرسم. */
    <div className="card row" style={{ background: "var(--bg)", gap: "var(--u-half)" }}>
      <DragHandle api={api} title={resource.title} />
      <Icon name={icon} />
      <input
        className="input" style={{ flex: "1 1 180px", minWidth: "140px" }}
        defaultValue={resource.title} aria-label={`عنوان ${resource.title}`}
        onBlur={(e) => {
          if (e.target.value.trim() && e.target.value !== resource.title) {
            void onAct(() => A.updateResource(resource.id, { title: e.target.value.trim() }));
          }
        }}
      />
      <button type="button" className="btn btn--quiet btn--sm"
              aria-label={resource.is_published ? "إلغاء نشر" : "نشر"}
              title={resource.is_published ? "منشور — اضغط لإلغاء النشر" : "مسودّة — اضغط للنشر"}
              style={resource.is_published ? { borderColor: "var(--green)", color: "var(--green)" } : undefined}
              onClick={() => void onAct(
                () => A.updateResource(resource.id, { is_published: !resource.is_published })
              )}>
        <Icon name={resource.is_published ? "eye" : "eyeOff"} size={16} />
        {resource.is_published ? "منشور" : "مسودّة"}
      </button>
      <PreviewButton resource={resource} />
      <button type="button" className="btn btn--quiet btn--sm"
              aria-label={`حذف ${resource.title}`}
              onClick={() => void onAct(() => A.deleteResource(resource))}>
        <Icon name="trash" size={16} />
      </button>
    </div>
  );
}

function PreviewButton({ resource }: { resource: Resource }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="btn btn--quiet btn--sm" disabled={busy}
      onClick={async () => {
        if (resource.kind === "link" && resource.url) {
          window.open(resource.url, "_blank", "noopener,noreferrer");
          return;
        }
        if (!resource.storage_path) return;
        setBusy(true);
        const url = await signedUrl("resources", resource.storage_path, 300);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        setBusy(false);
      }}>
      معاينة
    </button>
  );
}

function QuizRow({ quiz, api, onAct, onEdit }: {
  quiz: Quiz; api: Api; onEdit: () => void;
  onAct: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
}) {
  return (
    <div className="card row" style={{ background: "var(--bg)", gap: "var(--u-half)" }}>
      <DragHandle api={api} title={quiz.title} />
      <Icon name="quiz" />
      <strong style={{ flex: "1 1 160px", minWidth: "140px" }}>{quiz.title}</strong>
      <span className="tag">{quiz.retention === "permanent" ? "مسجَّل" : "مؤقّت"}</span>
      <button type="button" className="btn btn--quiet btn--sm"
              title={quiz.is_published ? "منشور" : "مسودّة"}
              style={quiz.is_published ? { borderColor: "var(--green)", color: "var(--green)" } : undefined}>
        <Icon name={quiz.is_published ? "eye" : "eyeOff"} size={16} />
        {quiz.is_published ? "منشور" : "مسودّة"}
      </button>
      <button type="button" className="btn btn--sm" onClick={onEdit}>
        <Icon name="edit" size={16} /> تعديل
      </button>
      <button type="button" className="btn btn--quiet btn--sm"
              aria-label={`حذف ${quiz.title}`}
              onClick={() => void onAct(() => A.deleteQuiz(quiz.id))}>
        <Icon name="trash" size={16} />
      </button>
    </div>
  );
}

function AddToBank({ bank, count, onAct, onNewQuiz }: {
  bank: Bank; count: number; onNewQuiz: () => void;
  onAct: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
}) {
  const [linkTitle, setLinkTitle] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [uploading, setUploading] = useState(false);

  async function upload(file: File) {
    setUploading(true);
    await onAct(() => A.uploadResource({
      track: bank.track, bankId: bank.id, sectionId: null,
      file, title: file.name.replace(/\.[^.]+$/, ""), position: count,
    }), "رُفع الملفّ.");
    setUploading(false);
  }

  return (
    <section className="card stack-s">
      <h3 className="card__title">إضافة إلى البنك</h3>

      <div className="row">
        <label className="btn btn--sm" style={{ cursor: uploading ? "wait" : "pointer" }}>
          <Icon name="file" size={16} /> {uploading ? "…يُرفع" : "رفع ملفّ"}
          <input type="file" hidden disabled={uploading}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        </label>

        <label className="btn btn--sm" style={{ cursor: uploading ? "wait" : "pointer" }}>
          <Icon name="image" size={16} /> رفع صورة
          <input type="file" accept="image/*" hidden disabled={uploading}
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
        </label>

        <button type="button" className="btn btn--sm" onClick={onNewQuiz}>
          <Icon name="quiz" size={16} /> اختبار جديد
        </button>
      </div>

      <form className="stack-s" onSubmit={(e) => {
        e.preventDefault();
        if (!linkTitle.trim() || !linkUrl.trim()) return;
        void onAct(() => A.createLink({
          track: bank.track, bankId: bank.id, sectionId: null,
          title: linkTitle.trim(), url: linkUrl.trim(), position: count,
        }), "أُضيف الرابط.");
        setLinkTitle(""); setLinkUrl("");
      }}>
        <div className="row" style={{ flexWrap: "nowrap" }}>
          <input className="input" style={{ flex: 1 }} value={linkTitle} placeholder="عنوان الرابط"
                 aria-label="عنوان الرابط" onChange={(e) => setLinkTitle(e.target.value)} />
          <input className="input" style={{ flex: 1 }} value={linkUrl} type="url" dir="ltr"
                 placeholder="https://…" aria-label="عنوان URL"
                 onChange={(e) => setLinkUrl(e.target.value)} />
          <button className="btn btn--sm" disabled={!linkTitle.trim() || !linkUrl.trim()}>
            <Icon name="link" size={16} /> إضافة
          </button>
        </div>
        <span className="field__hint">الروابط تبدأ بـ https — يرفض غيرها القيدُ في القاعدة.</span>
      </form>
    </section>
  );
}

/* ========================================================================== */

function LooseResources({ resources, sections, track, onAct }: {
  resources: Resource[]; sections: Section[]; track: Track;
  onAct: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
}) {
  const [uploading, setUploading] = useState(false);

  return (
    <section className="card stack-s">
      <h2 className="card__title">ملفّات وروابط بلا بنك</h2>
      <p className="subtle">البنوك تنظيم اختياري لا إجباري — يمكنك إرسال ملفٍّ مفرد.</p>

      {resources.length === 0 ? <p className="subtle">لا شيء هنا.</p> : null}
      {resources.map((r) => (
        <div key={r.id} className="row-between">
          <span className="row">
            <Icon name={r.kind === "link" ? "link" : r.kind === "image" ? "image" : "file"} />
            <span>{r.title}</span>
            {r.is_published ? null : <span className="tag tag--muted">مسودّة</span>}
          </span>
          <span className="row">
            <select className="select" value={r.section_id ?? ""} style={{ maxWidth: "180px" }}
                    aria-label={`قسم ${r.title}`}
                    onChange={(e) => void onAct(
                      () => A.updateResource(r.id, { section_id: e.target.value || null })
                    )}>
              <option value="">بلا قسم</option>
              {sections.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
            <button type="button" className="btn btn--quiet btn--sm"
                    onClick={() => void onAct(() => A.updateResource(r.id, { is_published: !r.is_published }))}>
              <Icon name={r.is_published ? "eyeOff" : "eye"} size={16} />
            </button>
            <button type="button" className="btn btn--quiet btn--sm" aria-label={`حذف ${r.title}`}
                    onClick={() => void onAct(() => A.deleteResource(r))}>
              <Icon name="trash" size={16} />
            </button>
          </span>
        </div>
      ))}

      <label className="btn btn--sm" style={{ cursor: "pointer", alignSelf: "flex-start" }}>
        <Icon name="plus" size={16} /> {uploading ? "…يُرفع" : "رفع ملفّ مفرد"}
        <input type="file" hidden disabled={uploading}
               onChange={async (e) => {
                 const f = e.target.files?.[0];
                 e.target.value = "";
                 if (!f) return;
                 setUploading(true);
                 await onAct(() => A.uploadResource({
                   track, bankId: null, sectionId: null, file: f,
                   title: f.name.replace(/\.[^.]+$/, ""), position: resources.length,
                 }), "رُفع الملفّ.");
                 setUploading(false);
               }} />
      </label>
    </section>
  );
}

/* ========================================================================== */

/**
 * الإرسال.
 * ⚠️ يعرض **عددين صريحين** كما تعيدهما الدالّة: كم وصل جديداً وكم كان
 *    مُرسَلاً من قبل. لا «أُرسل ✅» — تلك الرسالة بعينها هي التي جعلت
 *    المعلّم في المشروع السابق يظنّ أنّ اختباراً وصل ولم يصل أحداً.
 */
function SendBox({ itemType, itemId, track, groups, published }: {
  itemType: "bank" | "resource" | "quiz";
  itemId: string; track: Track; groups: Group[]; published: boolean;
}) {
  const [audience, setAudience] = useState<Audience>("track");
  const [groupId, setGroupId] = useState("");
  const [report, setReport] = useState<{ created: number; skipped: number; targeted: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="card stack-s">
      <h3 className="card__title">الإرسال</h3>

      {!published ? (
        <Notice kind="info">
          هذا البنك غير منشور. الإرسال يسجّل من يصله، لكنّه لا يظهر لأحدٍ حتى
          تنشره — والشرطان مستقلّان.
        </Notice>
      ) : null}

      {error ? <Notice kind="error">{error}</Notice> : null}
      {report ? (
        <Notice kind={report.created > 0 ? "ok" : "info"}>
          {report.created > 0 ? `وصل ${report.created} هدفاً جديداً` : "لم يصل شيءٌ جديد"}
          {report.skipped > 0 ? ` · وكان ${report.skipped} مُرسَلاً من قبل` : ""}
          {` · من أصل ${report.targeted}.`}
        </Notice>
      ) : null}

      <div className="row">
        <Field label="إلى">
          <select className="select" value={audience}
                  onChange={(e) => { setAudience(e.target.value as Audience); setReport(null); }}>
            <option value="track">كل مشتركي {TRACK_SHORT[track]}</option>
            <option value="group">مجموعة</option>
          </select>
        </Field>
        {audience === "group" ? (
          <Field label="المجموعة">
            <select className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">— اختر —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
        ) : null}
      </div>

      {audience === "group" && groups.length === 0 ? (
        <p className="subtle">لا مجموعات في هذا المسار بعد — أنشئها من تبويب «المجموعات».</p>
      ) : null}

      <button type="button" className="btn btn--primary"
              disabled={busy || (audience === "group" && !groupId)}
              onClick={async () => {
                setBusy(true); setError(null); setReport(null);
                try {
                  setReport(await assignItems({
                    itemType, itemIds: [itemId], audience,
                    groupIds: audience === "group" ? [groupId] : null,
                  }));
                } catch (e) {
                  setError(String((e as Error)?.message ?? e));
                } finally { setBusy(false); }
              }}>
        <Icon name="send" size={18} /> إرسال
      </button>
    </section>
  );
}
