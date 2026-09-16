import { requireClient } from "./supabase";
import type {
  Attempt, AttemptAnswer, Bank, BankItem, Group, Option, Plan, Profile,
  Question, Quiz, Resource, Section, Subscription, SubscriptionRequest, Track,
  ItemType, Audience, PayMethod,
} from "./types";

/**
 * طبقة الوصول للبيانات.
 *
 * ⚠️ قاعدة تحكم هذا الملفّ كلّه: **لا شرط صلاحيةٍ يُكتب هنا.** لا
 *    `.eq("track", …)` لإخفاء المسار الآخر، ولا فحص اشتراكٍ قبل الطلب.
 *    الحارس في الأسفل: تُعيد القاعدة ما يحقّ للمستدعي رؤيته وحده، وما لا
 *    يحقّ له لا يعود أصلاً. ولو كُتب الشرط هنا أيضاً لصار شرطين يفترقان
 *    بمرور الوقت، ولَظُنّ يوماً أنّ الواجهة هي الحارس فخُفّف ما تحتها.
 *
 *    والترشيح بـ`track` أدناه **عرضٌ لا حراسة**: الطالب يختار تبويب مسارٍ
 *    فيرى محتواه. ولو حُذف السطر لما تسرّب صفٌّ واحد.
 */

/* ------------------------------- الحساب ---------------------------------- */

/**
 * ملفّ المستخدم الحالي.
 *
 * ⚠️ `.eq("id", userId)` **لازم**، وغيابه كسر لوحة المعلّم في الإنتاج.
 *    وسياسة `profiles_read` تقول: `id = auth.uid() or is_teacher()`. فالطالب
 *    يرى صفّه وحده — ومن هنا بدا الترشيح زائداً وحُذف. لكنّ **المعلّم يرى
 *    كل الصفوف**، وهو المقصود (يحتاج بيانات طلّابه). فـ`maybeSingle()`
 *    ترفض بـ«multiple rows» فور وجود طالبٍ ثانٍ، فتسقط أوّل قراءةٍ عند
 *    الدخول، ويُرسم المعلّم طالباً بلا اشتراك.
 *
 * ⚠️ وهذا **ترشيحُ اختيارٍ لا حراسة** — الفرق الذي يحكم هذا الملفّ كلّه:
 *    «صفّي أنا» لا «ما يحقّ لي». ولو حُذف السطر لما تسرّب صفٌّ واحد: القاعدة
 *    لا تُعيد للطالب إلّا صفّه. الحارس في الأسفل كما هو، والاختيار هنا.
 */
export async function getMyProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await requireClient()
    .from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertMyProfile(p: {
  id: string; full_name: string;
  grade?: string | null; contact?: string | null; school?: string | null;
}): Promise<void> {
  const { error } = await requireClient().from("profiles").upsert(p);
  if (error) throw error;
}

/**
 * يضمن وجود صفّ `profiles` للمستخدم الحالي.
 *
 * ⚠️ تُستدعى بعد وجود **جلسة**، لا بعد `signUp`. فحين يكون تأكيد البريد
 *    مفعَّلاً لا تُعيد `signUp` جلسةً، والكتابة حينها تجري بدور `anon`
 *    فترفضها السياسة — وكان ذلك يمرّ بصمت ويضيع اسم المستخدم.
 *
 * ⚠️ والاسم يأتي جاهزاً من `pickName` — وهي وحدها التي تضمن اجتيازه قيد
 *    القاعدة (٢ إلى ١٢٠ محرفاً). فمستخدمٌ بلا صفّ `profiles` لا يستطيع طلب
 *    اشتراكٍ أصلاً — المفتاح الأجنبي يمنعه — وذلك عطبٌ لا يظهر إلّا عند الدفع.
 */
export async function ensureProfile(userId: string, fullName: string): Promise<void> {
  if (await getMyProfile(userId)) return;
  await upsertMyProfile({ id: userId, full_name: fullName });
}

/**
 * هل اكتمل ملفّ المستخدم؟
 *
 * ⚠️ تُسأل **القاعدة** ولا يُعاد حساب الشرط هنا. ولو كُتب التعريف في الواجهة
 *    أيضاً لصار تعريفان يفترقان بمرور الوقت: شاشةٌ تقول «أكملتَ» وقاعدةٌ
 *    ترفض الطلب، أو أسوأ — قاعدةٌ تقبل ما لم تجمعه الشاشة.
 */
export async function isProfileComplete(): Promise<boolean> {
  const { data, error } = await requireClient().rpc("profile_complete");
  if (error) throw error;
  return Boolean(data);
}

export async function amITeacher(): Promise<boolean> {
  const { data, error } = await requireClient().rpc("is_teacher");
  if (error) throw error;
  return Boolean(data);
}

export async function mySubscriptions(): Promise<Subscription[]> {
  const { data, error } = await requireClient()
    .from("subscriptions").select("*").order("ends_on", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/** هل الاشتراك ساري **اليوم**؟ يُحسب من التاريخ لا من عمودٍ محفوظ يتأخّر. */
export function isActive(s: Subscription, today = new Date()): boolean {
  if (s.is_revoked) return false;
  const d = today.toISOString().slice(0, 10);
  return s.starts_on <= d && d <= s.ends_on;
}

export function activeTracks(subs: Subscription[], today = new Date()): Track[] {
  return [...new Set(subs.filter((s) => isActive(s, today)).map((s) => s.track))];
}

/* -------------------------------- الخطط ---------------------------------- */

export async function listPlans(): Promise<Plan[]> {
  const { data, error } = await requireClient()
    .from("plans").select("*").order("track").order("period");
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------ المحتوى ---------------------------------- */

export async function listSections(track: Track): Promise<Section[]> {
  const { data, error } = await requireClient()
    .from("sections").select("*").eq("track", track).order("position");
  if (error) throw error;
  return data ?? [];
}

export async function listBanks(track: Track): Promise<Bank[]> {
  const { data, error } = await requireClient()
    .from("banks").select("*").eq("track", track).order("position");
  if (error) throw error;
  return data ?? [];
}

export async function listResources(track: Track): Promise<Resource[]> {
  const { data, error } = await requireClient()
    .from("resources").select("*").eq("track", track).order("position");
  if (error) throw error;
  return data ?? [];
}

export async function listQuizzes(track: Track): Promise<Quiz[]> {
  const { data, error } = await requireClient()
    .from("quizzes").select("*").eq("track", track).order("position");
  if (error) throw error;
  return data ?? [];
}

/**
 * تسلسل البنك كما رتّبه المعلّم: «شرح ١، تمارين ١، شرح ٢، تمارين ٢، اختبار».
 * الملفّات والاختبارات في خيطٍ واحد مرتّبٍ بـ`position`.
 */
export function bankItems(bankId: string, resources: Resource[], quizzes: Quiz[]): BankItem[] {
  const items: BankItem[] = [
    ...resources.filter((r) => r.bank_id === bankId)
      .map((r): BankItem => ({ kind: "resource", position: r.position, resource: r })),
    ...quizzes.filter((q) => q.bank_id === bankId)
      .map((q): BankItem => ({ kind: "quiz", position: q.position, quiz: q })),
  ];
  // ترتيبٌ ثابت: عند تساوي الموضع نرجّح الملفّ ثم العنوان، فلا يتبدّل بين رسمتين
  return items.sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    if (a.kind !== b.kind) return a.kind === "resource" ? -1 : 1;
    const at = a.kind === "resource" ? a.resource.title : a.quiz.title;
    const bt = b.kind === "resource" ? b.resource.title : b.quiz.title;
    return at.localeCompare(bt, "ar");
  });
}

/**
 * رابطٌ **موقَّع ومؤقّت** للملفّ — لا رابط عامّ دائم (البند ٩).
 * ومن لا يحقّ له الملفّ لا يحصل على رابطٍ أصلاً: الدلو خاصّ وسياساته تحرسه.
 */
export async function signedUrl(bucket: string, path: string, seconds = 300): Promise<string | null> {
  const { data, error } = await requireClient().storage.from(bucket).createSignedUrl(path, seconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

/* ------------------------------ الاختبارات -------------------------------- */

export async function listQuestions(quizId: string): Promise<Question[]> {
  const { data, error } = await requireClient()
    .from("quiz_questions").select("*").eq("quiz_id", quizId).order("position");
  if (error) throw error;
  return data ?? [];
}

export async function listOptions(questionIds: string[]): Promise<Option[]> {
  if (questionIds.length === 0) return [];
  const { data, error } = await requireClient()
    .from("quiz_options").select("*").in("question_id", questionIds).order("position");
  if (error) throw error;
  return data ?? [];
}

export async function myAttempts(quizId: string): Promise<Attempt[]> {
  const { data, error } = await requireClient()
    .from("quiz_attempts").select("*").eq("quiz_id", quizId)
    .order("attempt_no", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function attemptAnswers(attemptId: string): Promise<AttemptAnswer[]> {
  const { data, error } = await requireClient()
    .from("attempt_answers").select("*").eq("attempt_id", attemptId);
  if (error) throw error;
  return data ?? [];
}

export interface StartAttemptResult {
  ok: boolean; reason: string;
  attempt_id: string | null; attempt_no: number | null; expires_at: string | null;
}

export async function startAttempt(quizId: string): Promise<StartAttemptResult> {
  const { data, error } = await requireClient().rpc("start_attempt", { p_quiz_id: quizId });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as StartAttemptResult;
}

export interface SubmitResult {
  ok: boolean; reason: string;
  score: number | null; max_score: number | null;
  correct_count: number | null; question_count: number | null;
  late: boolean;
}

/**
 * ⚠️ لا تمرّ درجةٌ ولا صحّةٌ من هنا — اختياراتٌ فقط. الخادم يقارنها بمفتاحٍ
 *    لا يغادره، ويحسب الدرجة من الإجابات المخزَّنة.
 */
export async function submitAttempt(
  attemptId: string,
  answers: { question_id: string; option_id: string | null }[]
): Promise<SubmitResult> {
  const { data, error } = await requireClient().rpc("submit_attempt", {
    p_attempt_id: attemptId,
    p_answers: answers,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as SubmitResult;
}

export async function saveAnswer(
  attemptId: string, questionId: string, optionId: string | null
): Promise<{ ok: boolean; reason: string }> {
  const { data, error } = await requireClient().rpc("save_answer", {
    p_attempt_id: attemptId, p_question_id: questionId, p_option_id: optionId,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as { ok: boolean; reason: string };
}

/* ------------------------------ الاشتراك --------------------------------- */

export interface RequestResult { ok: boolean; reason: string; request_id: string | null; }

export async function requestSubscription(args: {
  track: Track; planId: string; fullName: string; grade: string | null;
  contact: string; method: PayMethod; receiptPath: string | null;
}): Promise<RequestResult> {
  const { data, error } = await requireClient().rpc("request_subscription", {
    p_track: args.track, p_plan_id: args.planId, p_full_name: args.fullName,
    p_grade: args.grade, p_contact: args.contact, p_method: args.method,
    p_receipt_path: args.receiptPath,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as RequestResult;
}

export async function myRequests(): Promise<SubscriptionRequest[]> {
  const { data, error } = await requireClient()
    .from("subscription_requests").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------- المعلّم ---------------------------------- */

export interface Overview { track: Track; active_subscribers: number; pending_requests: number; }

export async function teacherOverview(): Promise<Overview[]> {
  const { data, error } = await requireClient().rpc("teacher_overview");
  if (error) throw error;
  return (data ?? []) as Overview[];
}

export async function pendingRequests(): Promise<SubscriptionRequest[]> {
  const { data, error } = await requireClient()
    .from("subscription_requests").select("*")
    .eq("status", "pending").order("created_at");
  if (error) throw error;
  return data ?? [];
}

export interface DecisionResult { ok: boolean; reason: string; subscription_id: string | null; }

/**
 * ⚠️ قد تُعيد `reason = "reauth_required"`: تغيير الاشتراك عمليةٌ خطرة تشترط
 *    تأكيد هوية خلال ١٢ ساعة. تعرض الواجهة عندها طلب كلمة المرور، وتستدعي
 *    `confirmIdentity` ثم تعيد المحاولة. وليست حالة خطأ تُخفى.
 */
export async function decideRequest(args: {
  requestId: string; accept: boolean; startsOn?: string | null;
  months?: number; note?: string | null;
}): Promise<DecisionResult> {
  const { data, error } = await requireClient().rpc("decide_subscription_request", {
    p_request_id: args.requestId, p_accept: args.accept,
    p_starts_on: args.startsOn ?? null, p_months: args.months ?? 1,
    p_note: args.note ?? null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as DecisionResult;
}

/** يُستدعى بعد إعادة إدخال كلمة المرور بنجاح — يفتح نافذة الـ١٢ ساعة. */
export async function confirmIdentity(): Promise<void> {
  const { error } = await requireClient().rpc("confirm_identity");
  if (error) throw error;
}

export interface AssignReport { created: number; skipped: number; targeted: number; }

/**
 * ⚠️ تُعيد **عددين صريحين** لا قيمةً منطقية. والواجهة تعرضهما كما هما:
 *    «أُرسل إلى ٣، وكان ٢ مُرسَلاً من قبل» — لا «تمّ ✅».
 *    هذه هي العبرة المباشرة من النجاح الكاذب في المشروع السابق.
 */
export async function assignItems(args: {
  itemType: ItemType; itemIds: string[]; audience: Audience;
  groupIds?: string[] | null; studentIds?: string[] | null;
}): Promise<AssignReport> {
  const { data, error } = await requireClient().rpc("assign_items", {
    p_item_type: args.itemType, p_item_ids: args.itemIds, p_audience: args.audience,
    p_group_ids: args.groupIds ?? null, p_student_ids: args.studentIds ?? null,
  });
  if (error) throw error;
  return (Array.isArray(data) ? data[0] : data) as AssignReport;
}

export async function listGroups(track: Track): Promise<Group[]> {
  const { data, error } = await requireClient()
    .from("groups").select("*").eq("track", track).order("position");
  if (error) throw error;
  return data ?? [];
}

export async function listStudents(): Promise<Profile[]> {
  const { data, error } = await requireClient()
    .from("profiles").select("*").order("full_name");
  if (error) throw error;
  return data ?? [];
}
