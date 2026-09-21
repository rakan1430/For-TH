import { requireClient } from "./supabase";
import type {
  Bank, Group, Profile, Quiz, Resource, ResourceKind, Section, Track,
  QuizRetention,
} from "./types";

/**
 * التأليف — ما يحتاجه المعلّم لينشئ محتواه بنفسه.
 *
 * ⚠️ الكتابة هنا مباشرةٌ على الجداول حيث يكفي ذلك، لأنّ سياسات الصفوف
 *    تحرسها: `banks_write` و`resources_write` وأخواتها تشترط `is_teacher()`.
 *    فلا دالّةَ خادمٍ لكل زرّ — الدالّة تُكتب حين تُضيف شيئاً لا تفعله
 *    السياسة: ذرّيةً (شجرة الاختبار)، أو قراراً لا يُشتقّ من صفٍّ واحد.
 */

/* ------------------------------ الأقسام ---------------------------------- */

export async function createSection(track: Track, title: string, position: number): Promise<Section> {
  const { data, error } = await requireClient()
    .from("sections").insert({ track, title, position }).select().single();
  if (error) throw error;
  return data as Section;
}

export async function renameSection(id: string, title: string): Promise<void> {
  const { error } = await requireClient().from("sections").update({ title }).eq("id", id);
  if (error) throw error;
}

/**
 * ⚠️ حذف قسمٍ فيه بنوك يرفضه القيد المركّب (`on delete restrict`) — بعمد:
 *    القسم حاوية تخطيط، وحذفه لا يجوز أن يجرّ محتوى معه. فننقل بنوكه خارجه
 *    أوّلاً ثم نحذفه، ويبقى المحتوى.
 */
export async function deleteSection(id: string): Promise<void> {
  const sb = requireClient();
  const { error: e1 } = await sb.from("banks").update({ section_id: null }).eq("section_id", id);
  if (e1) throw e1;
  const { error: e2 } = await sb.from("resources").update({ section_id: null }).eq("section_id", id);
  if (e2) throw e2;
  const { error } = await sb.from("sections").delete().eq("id", id);
  if (error) throw error;
}

/* ------------------------------- البنوك ---------------------------------- */

export async function createBank(args: {
  track: Track; title: string; sectionId: string | null; position: number;
}): Promise<Bank> {
  const { data, error } = await requireClient().from("banks").insert({
    track: args.track, title: args.title,
    section_id: args.sectionId, position: args.position,
  }).select().single();
  if (error) throw error;
  return data as Bank;
}

export async function updateBank(id: string, patch: Partial<Pick<Bank,
  "title" | "description" | "section_id" | "is_published">>): Promise<void> {
  const { error } = await requireClient().from("banks").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteBank(id: string): Promise<void> {
  const { error } = await requireClient().from("banks").delete().eq("id", id);
  if (error) throw error;
}

/** يعيد ترتيب الأقسام أو البنوك أو المجموعات — النوع من قائمةٍ مغلقة في الخادم. */
export async function reorder(kind: "section" | "bank" | "group", ids: string[]): Promise<number> {
  const { data, error } = await requireClient().rpc("reorder", { p_kind: kind, p_ids: ids });
  if (error) throw error;
  return Number(data ?? 0);
}

/** ترتيب عناصر البنك: ملفّاتٌ واختبارات في خيطٍ واحد يختاره المعلّم. */
export async function reorderBankItems(
  bankId: string, ordered: { type: "resource" | "quiz"; id: string }[]
): Promise<number> {
  const { data, error } = await requireClient()
    .rpc("reorder_bank_items", { p_bank_id: bankId, p_ordered: ordered });
  if (error) throw error;
  return Number(data ?? 0);
}

/* ------------------------- الملفّات والروابط ------------------------------ */

const BUCKET = "resources";

/**
 * يرفع ملفّاً ثمّ يُنشئ صفّه.
 *
 * ⚠️ الترتيب مقصود: نرفع أوّلاً ثمّ نكتب الصفّ. فلو انقطعت الشبكة بينهما
 *    بقي ملفٌّ يتيمٌ في المخزن — وهو أرحم من صفٍّ يشير إلى ملفٍّ غير موجود،
 *    لأنّ اليتيم لا يراه أحد، أمّا الصفّ المكسور فيصل الطالب ويفتحه فيفشل.
 */
export async function uploadResource(args: {
  track: Track; bankId: string | null; sectionId: string | null;
  file: File; title: string; position: number;
}): Promise<Resource> {
  const sb = requireClient();
  const ext = (args.file.name.split(".").pop() ?? "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const path = `${args.track}/${crypto.randomUUID()}${ext ? `.${ext}` : ""}`;

  const { error: upErr } = await sb.storage.from(BUCKET)
    .upload(path, args.file, { upsert: false, contentType: args.file.type || undefined });
  if (upErr) throw upErr;

  const kind: ResourceKind = args.file.type.startsWith("image/") ? "image" : "file";
  const { data, error } = await sb.from("resources").insert({
    track: args.track, bank_id: args.bankId, section_id: args.sectionId,
    kind, title: args.title, storage_path: path, position: args.position,
  }).select().single();

  if (error) {
    // الصفّ لم يُكتب: نُزيل الملفّ بدل تركه يتيماً بلا سببٍ الآن
    await sb.storage.from(BUCKET).remove([path]).catch(() => {});
    throw error;
  }
  return data as Resource;
}

export async function createLink(args: {
  track: Track; bankId: string | null; sectionId: string | null;
  title: string; url: string; position: number;
}): Promise<Resource> {
  const { data, error } = await requireClient().from("resources").insert({
    track: args.track, bank_id: args.bankId, section_id: args.sectionId,
    kind: "link", title: args.title, url: args.url, position: args.position,
  }).select().single();
  if (error) throw error;
  return data as Resource;
}

export async function updateResource(id: string, patch: Partial<Pick<Resource,
  "title" | "is_published" | "bank_id" | "section_id">>): Promise<void> {
  const { error } = await requireClient().from("resources").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteResource(r: Resource): Promise<void> {
  const sb = requireClient();
  const { error } = await sb.from("resources").delete().eq("id", r.id);
  if (error) throw error;
  if (r.storage_path) await sb.storage.from(BUCKET).remove([r.storage_path]).catch(() => {});
}

/** صورة سؤالٍ أو خيار — دلوٌ خاصّ، ورابطها يُوقَّع عند العرض. */
export async function uploadQuestionImage(track: Track, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() ?? "png").replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const path = `${track}/${crypto.randomUUID()}.${ext || "png"}`;
  const { error } = await requireClient().storage.from("question-images")
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw error;
  return path;
}

/* ------------------------------ الاختبارات -------------------------------- */

export interface DraftOption {
  id?: string | null;
  label: string;
  image_path?: string | null;
  is_correct: boolean;
}

export interface DraftQuestion {
  id?: string | null;
  prompt: string;
  prompt_image_path?: string | null;
  points: number;
  options: DraftOption[];
  /**
   * شرح الحلّ — نصّاً أو صورة أو كليهما.
   *
   * ⚠️ **غياب المفتاح غير خلوّه** في الخادم: حمولةٌ لا تذكر الشرح لا تمسّه،
   *    وحمولةٌ تذكره فارغاً تمحوه. ولهذا يُرسَلان دائماً ولو `null` — فمحو
   *    المعلّم لما كتبه يجب أن يصل، ونسياننا للحقل يجب ألّا يمحو شيئاً.
   */
  explanation?: string | null;
  explanation_image_path?: string | null;
  /** يملؤه الخادم عند القراءة: سؤالٌ دخل في نتيجةٍ مسلَّمة لا يُعدَّل ولا يُحذف. */
  locked?: boolean;
}

export interface DraftQuiz {
  id?: string | null;
  track: Track;
  scope: "bank" | "general";
  bank_id: string | null;
  section_id: string | null;
  title: string;
  retention: QuizRetention;
  is_published: boolean;
  opens_at: string | null;
  due_at: string | null;
  time_limit_minutes: number | null;
  max_attempts: number | null;
  position: number;
  questions: DraftQuestion[];
}

export interface SaveQuizResult {
  ok: boolean; reason: string; quiz_id: string | null;
  questions_saved: number; questions_locked: number;
}

/**
 * ⚠️ تُعيد **عددين صريحين**: كم سؤالاً حُفظ، وكم قُفل لأنّه دخل في نتيجةٍ
 *    مسلَّمة. والواجهة تعرضهما كما هما — لا «حُفظ ✅» يُخفي أنّ نصف ما طلبه
 *    المعلّم لم يقع.
 */
export async function saveQuiz(draft: DraftQuiz): Promise<SaveQuizResult> {
  const { data, error } = await requireClient().rpc("save_quiz", { p_quiz: draft });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as SaveQuizResult;
}

/**
 * تعديلٌ موضعيّ على الاختبار نفسه — النشر خاصّةً.
 *
 * ⚠️ ولا يمرّ بـ`save_quiz`: تلك تكتب الشجرة كلّها (أسئلةً وخياراتٍ ومفتاحاً)،
 *    فاستعمالها لقلب علمٍ واحد يعيد كتابة كل شيء بلا داعٍ — ويحسب الأسئلة
 *    المقفلة من جديد فيُبلغ المعلّم بما لم يطلبه.
 */
export async function updateQuiz(
  id: string, patch: Partial<Pick<Quiz, "is_published" | "title" | "section_id" | "position">>
): Promise<void> {
  const { error } = await requireClient().from("quizzes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteQuiz(id: string): Promise<void> {
  const { error } = await requireClient().from("quizzes").delete().eq("id", id);
  if (error) throw error;
}

/**
 * يجمع اختباراً كاملاً للتحرير: الأسئلة والخيارات ومفتاح الإجابة.
 * والمفتاح يأتي من دالّةٍ تفحص `is_teacher()` — لا طريق منها إلى الطالب.
 */
export async function loadQuizDraft(quiz: Quiz): Promise<DraftQuiz> {
  const sb = requireClient();
  const [{ data: qs, error: e1 }, { data: key, error: e3 }] = await Promise.all([
    sb.from("quiz_questions").select("*").eq("quiz_id", quiz.id).order("position"),
    sb.rpc("teacher_answer_key", { p_quiz_id: quiz.id }),
  ]);
  if (e1) throw e1;
  if (e3) throw e3;

  const ids = (qs ?? []).map((q) => q.id as string);
  const { data: opts, error: e2 } = ids.length
    ? await sb.from("quiz_options").select("*").in("question_id", ids).order("position")
    : { data: [], error: null };
  if (e2) throw e2;

  const { data: answered } = ids.length
    ? await sb.from("attempt_answers").select("question_id").in("question_id", ids)
    : { data: [] };

  // ⚠️ الشروح تُقرأ هنا **وجوباً** لا تحسيناً: الحفظ يُرسل الحقل دائماً،
  //    فلو فُتح المحرّر بلا شروحٍ محمّلة لأرسلها فارغةً فمحاها كلّها. نافذةُ
  //    الفقد نفسها التي أُصلحت في شاشة الحساب (خ-١٩)، في ثوبٍ آخر.
  const { data: expl, error: e4 } = ids.length
    ? await sb.from("question_explanations").select("*").in("question_id", ids)
    : { data: [], error: null };
  if (e4) throw e4;
  const explOf = new Map<string, { body: string | null; image_path: string | null }>(
    (expl ?? []).map((x) => [x.question_id as string,
                             { body: x.body as string | null, image_path: x.image_path as string | null }])
  );
  const lockedIds = new Set((answered ?? []).map((a) => a.question_id as string));
  const correct = new Set((key ?? []).map((k: { option_id: string }) => k.option_id));

  return {
    id: quiz.id, track: quiz.track, scope: quiz.scope,
    bank_id: quiz.bank_id, section_id: quiz.section_id,
    title: quiz.title, retention: quiz.retention, is_published: quiz.is_published,
    opens_at: quiz.opens_at, due_at: quiz.due_at,
    time_limit_minutes: quiz.time_limit_minutes, max_attempts: quiz.max_attempts,
    position: quiz.position,
    questions: (qs ?? []).map((q) => ({
      id: q.id as string,
      prompt: (q.prompt as string) ?? "",
      prompt_image_path: q.prompt_image_path as string | null,
      points: Number(q.points),
      explanation: explOf.get(q.id as string)?.body ?? null,
      explanation_image_path: explOf.get(q.id as string)?.image_path ?? null,
      locked: lockedIds.has(q.id as string),
      options: (opts ?? [])
        .filter((o) => o.question_id === q.id)
        .map((o) => ({
          id: o.id as string,
          label: (o.label as string) ?? "",
          image_path: o.image_path as string | null,
          is_correct: correct.has(o.id as string),
        })),
    })),
  };
}

/* ------------------------------ المجموعات -------------------------------- */

export async function createGroup(track: Track, name: string, color: string, position: number): Promise<Group> {
  const { data, error } = await requireClient()
    .from("groups").insert({ track, name, color, position }).select().single();
  if (error) throw error;
  return data as Group;
}

export async function updateGroup(id: string, patch: Partial<Pick<Group, "name" | "color">>): Promise<void> {
  const { error } = await requireClient().from("groups").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteGroup(id: string): Promise<void> {
  const { error } = await requireClient().from("groups").delete().eq("id", id);
  if (error) throw error;
}

export async function groupMembers(groupId: string): Promise<string[]> {
  const { data, error } = await requireClient()
    .from("group_members").select("student_id").eq("group_id", groupId);
  if (error) throw error;
  return (data ?? []).map((r) => r.student_id as string);
}

/**
 * ⚠️ يضبط العضوية إلى ما طُلب بالضبط: يُضيف الجديد ويحذف المرفوع.
 *    و`on conflict do nothing` بدل الإدراج الأعمى — فطالبٌ موجودٌ مسبقاً
 *    لا يُسقط الدفعة كلّها بخطأ تكرار. (البند ٤.)
 */
export async function setGroupMembers(groupId: string, studentIds: string[]): Promise<{
  added: number; removed: number;
}> {
  const sb = requireClient();
  const current = await groupMembers(groupId);
  const toAdd = studentIds.filter((id) => !current.includes(id));
  const toRemove = current.filter((id) => !studentIds.includes(id));

  if (toAdd.length) {
    const { error } = await sb.from("group_members")
      .upsert(toAdd.map((student_id) => ({ group_id: groupId, student_id })),
              { onConflict: "group_id,student_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  if (toRemove.length) {
    const { error } = await sb.from("group_members")
      .delete().eq("group_id", groupId).in("student_id", toRemove);
    if (error) throw error;
  }
  return { added: toAdd.length, removed: toRemove.length };
}

/** طلّاب هذا المسار: من له اشتراكٌ فيه (سارياً أو منتهياً). */
export async function studentsOfTrack(track: Track): Promise<Profile[]> {
  const sb = requireClient();
  const { data: subs, error } = await sb.from("subscriptions").select("student_id").eq("track", track);
  if (error) throw error;
  const ids = [...new Set((subs ?? []).map((s) => s.student_id as string))];
  if (ids.length === 0) return [];
  const { data, error: e2 } = await sb.from("profiles").select("*").in("id", ids).order("full_name");
  if (e2) throw e2;
  return (data ?? []) as Profile[];
}
