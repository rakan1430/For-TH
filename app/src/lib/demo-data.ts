/**
 * بيانات وضع العرض — في ذاكرة المتصفّح وحدها.
 *
 * ⚠️ ليست بيانات حقيقية، ولا تمرّ بقاعدة بيانات، ولا تحرسها سياسة صفوف.
 *    غرضها الوحيد: أن يرى المالك **الشكل والتخطيط والألوان** على جهازه قبل
 *    أن يُنشأ مشروع القاعدة. والحكم عليها حكمٌ على الشكل لا على السلوك.
 */

export const DEMO_TEACHER = "11111111-1111-1111-1111-111111111111";
export const DEMO_STUDENT = "22222222-2222-2222-2222-222222222222";

const today = new Date();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (n: number) => { const d = new Date(today); d.setDate(d.getDate() + n); return iso(d); };

export interface DemoDb {
  profiles: { id: string; full_name: string; grade: string | null; contact: string | null }[];
  plans: { id: string; track: string; period: string; price_minor: number | null; currency: string; is_active: boolean }[];
  subscriptions: { id: string; student_id: string; track: string; starts_on: string; ends_on: string; is_revoked: boolean }[];
  subscription_requests: {
    id: string; student_id: string; track: string; plan_id: string; full_name: string;
    grade: string | null; contact: string; method: string; receipt_path: string | null;
    status: string; note: string | null; created_at: string;
    decided_at: string | null; decided_by: string | null;
  }[];
  sections: { id: string; track: string; title: string; position: number }[];
  banks: { id: string; track: string; section_id: string | null; title: string; description: string | null; position: number; is_published: boolean }[];
  resources: {
    id: string; track: string; bank_id: string | null; section_id: string | null;
    kind: string; title: string; storage_path: string | null; url: string | null;
    position: number; is_published: boolean;
  }[];
  quizzes: {
    id: string; track: string; scope: string; bank_id: string | null; section_id: string | null;
    title: string; retention: string; is_published: boolean; opens_at: string | null;
    due_at: string | null; time_limit_minutes: number | null; max_attempts: number | null; position: number;
  }[];
  quiz_questions: { id: string; quiz_id: string; position: number; prompt: string; prompt_image_path: string | null; points: number }[];
  quiz_options: { id: string; question_id: string; position: number; label: string; image_path: string | null }[];
  answer_key: { question_id: string; option_id: string }[];
  question_explanations: { question_id: string; body: string | null; image_path: string | null }[];
  saved_questions: { student_id: string; question_id: string; note: string | null; saved_at: string }[];
  groups: { id: string; track: string; name: string; color: string; position: number }[];
  group_members: { group_id: string; student_id: string }[];
  assignments: { id: string; track: string; item_type: string; item_id: string; audience: string; group_id: string | null; student_id: string | null }[];
  quiz_attempts: {
    id: string; quiz_id: string; student_id: string; attempt_no: number; status: string;
    started_at: string; expires_at: string | null; submitted_at: string | null;
    score: number | null; max_score: number | null;
  }[];
  attempt_answers: { attempt_id: string; question_id: string; option_id: string | null; is_correct: boolean | null }[];
}

export function seed(): DemoDb {
  return {
    profiles: [
      { id: DEMO_TEACHER, full_name: "المعلّم", grade: null, contact: "05xxxxxxxx" },
      { id: DEMO_STUDENT, full_name: "عبدالرحمن الشهري", grade: "ثالث ثانوي", contact: "05xxxxxxx1" },
      { id: "33333333-3333-3333-3333-333333333333", full_name: "فهد القحطاني", grade: "ثالث ثانوي", contact: "05xxxxxxx2" },
      { id: "44444444-4444-4444-4444-444444444444", full_name: "سارة العتيبي", grade: "ثاني ثانوي", contact: "05xxxxxxx3" },
      { id: "55555555-5555-5555-5555-555555555555", full_name: "نورة الدوسري", grade: "ثالث ثانوي", contact: "05xxxxxxx4" },
    ],
    // ⚠️ الأسعار NULL كما في القاعدة: لم يحدّدها المالك، وتظهر «[السعر]»
    /*
     * ⚠️ يطابق الإنتاج بعد قرار المالك: ثلاثة أشهر بـ١٥٠ ريالاً، والشهريّ
     *    معطَّل. ووضعُ عرضٍ يُظهر خططاً لا وجود لها يُريه المالك منتجاً غير
     *    منتجه — وهو ما جاء الوضع ليمنعه أصلاً.
     */
    plans: [
      { id: "p1", track: "qudurat", period: "monthly",   price_minor: null,  currency: "SAR", is_active: false },
      { id: "p2", track: "qudurat", period: "quarterly", price_minor: 15000, currency: "SAR", is_active: true },
      { id: "p3", track: "tahsili", period: "monthly",   price_minor: null,  currency: "SAR", is_active: false },
      { id: "p4", track: "tahsili", period: "quarterly", price_minor: 15000, currency: "SAR", is_active: true },
    ],
    subscriptions: [
      { id: "s1", student_id: DEMO_STUDENT, track: "qudurat", starts_on: plus(-12), ends_on: plus(18), is_revoked: false },
      { id: "s2", student_id: DEMO_STUDENT, track: "tahsili", starts_on: plus(-12), ends_on: plus(4),  is_revoked: false },
      { id: "s3", student_id: "33333333-3333-3333-3333-333333333333", track: "qudurat", starts_on: plus(-30), ends_on: plus(60), is_revoked: false },
      { id: "s4", student_id: "44444444-4444-4444-4444-444444444444", track: "qudurat", starts_on: plus(-40), ends_on: plus(-1), is_revoked: false },
      { id: "s5", student_id: "55555555-5555-5555-5555-555555555555", track: "tahsili", starts_on: plus(-5),  ends_on: plus(25), is_revoked: false },
    ],
    subscription_requests: [
      { id: "r1", student_id: "55555555-5555-5555-5555-555555555555", track: "qudurat", plan_id: "p2",
        full_name: "نورة الدوسري", grade: "ثالث ثانوي", contact: "05xxxxxxx4", method: "transfer",
        receipt_path: "demo/receipt.jpg", status: "pending", note: null,
        created_at: new Date(Date.now() - 36e5 * 5).toISOString(), decided_at: null, decided_by: null },
      { id: "r2", student_id: "44444444-4444-4444-4444-444444444444", track: "qudurat", plan_id: "p1",
        full_name: "سارة العتيبي", grade: "ثاني ثانوي", contact: "05xxxxxxx3", method: "transfer",
        receipt_path: "demo/receipt2.jpg", status: "pending", note: null,
        created_at: new Date(Date.now() - 36e5 * 26).toISOString(), decided_at: null, decided_by: null },
    ],
    sections: [
      { id: "sec1", track: "qudurat", title: "التأسيس الكمّي", position: 0 },
      { id: "sec2", track: "qudurat", title: "المسائل والتحليل", position: 1 },
      { id: "sec3", track: "tahsili", title: "الجبر والمتطابقات", position: 0 },
    ],
    banks: [
      { id: "b1", track: "qudurat", section_id: "sec1", title: "بنك النِّسب والتناسب", description: "الأساسيات ثم تمارين متدرّجة.", position: 0, is_published: true },
      { id: "b2", track: "qudurat", section_id: "sec1", title: "بنك النسبة المئوية", description: null, position: 1, is_published: true },
      { id: "b3", track: "qudurat", section_id: "sec2", title: "بنك التفاضل", description: "للمتقدّمين.", position: 2, is_published: true },
      { id: "b4", track: "qudurat", section_id: null, title: "بنك قيد التجهيز", description: null, position: 3, is_published: false },
      { id: "b5", track: "tahsili", section_id: "sec3", title: "بنك المتطابقات المثلثية", description: null, position: 0, is_published: true },
    ],
    resources: [
      { id: "d1", track: "qudurat", bank_id: "b1", section_id: null, kind: "file",  title: "شرح ١ — مفهوم النسبة", storage_path: "demo/1.pdf", url: null, position: 0, is_published: true },
      { id: "d2", track: "qudurat", bank_id: "b1", section_id: null, kind: "file",  title: "تمارين ١", storage_path: "demo/2.pdf", url: null, position: 1, is_published: true },
      { id: "d3", track: "qudurat", bank_id: "b1", section_id: null, kind: "file",  title: "شرح ٢ — التناسب الطردي", storage_path: "demo/3.pdf", url: null, position: 2, is_published: true },
      { id: "d4", track: "qudurat", bank_id: "b1", section_id: null, kind: "link",  title: "تمارين إضافية على الشبكة", storage_path: null, url: "https://example.org", position: 3, is_published: true },
      { id: "d5", track: "qudurat", bank_id: "b2", section_id: null, kind: "file",  title: "شرح النسبة المئوية", storage_path: "demo/5.pdf", url: null, position: 0, is_published: true },
      { id: "d6", track: "qudurat", bank_id: "b3", section_id: null, kind: "image", title: "خريطة قواعد الاشتقاق", storage_path: "demo/6.png", url: null, position: 0, is_published: true },
      { id: "d7", track: "qudurat", bank_id: null, section_id: "sec2", kind: "file", title: "ملزمة المراجعة الشاملة", storage_path: "demo/7.pdf", url: null, position: 0, is_published: true },
      { id: "d8", track: "tahsili", bank_id: "b5", section_id: null, kind: "file",  title: "شرح المتطابقات", storage_path: "demo/8.pdf", url: null, position: 0, is_published: true },
    ],
    quizzes: [
      { id: "q1", track: "qudurat", scope: "bank", bank_id: "b1", section_id: null, title: "اختبار بنك النِّسب",
        retention: "permanent", is_published: true, opens_at: null, due_at: null,
        time_limit_minutes: 10, max_attempts: null, position: 4 },
      { id: "q2", track: "qudurat", scope: "bank", bank_id: "b2", section_id: null, title: "اختبار سريع — المئوية",
        retention: "temporary", is_published: true, opens_at: null, due_at: null,
        time_limit_minutes: 5, max_attempts: null, position: 1 },
      { id: "q3", track: "tahsili", scope: "bank", bank_id: "b5", section_id: null, title: "اختبار المتطابقات",
        retention: "permanent", is_published: true, opens_at: null, due_at: null,
        time_limit_minutes: null, max_attempts: null, position: 1 },
    ],
    quiz_questions: [
      { id: "qq1", quiz_id: "q1", position: 0, prompt: "إذا كان  3س = 12  فما قيمة  س ؟", prompt_image_path: null, points: 1 },
      { id: "qq2", quiz_id: "q1", position: 1, prompt: "نسبة  4 : 8  تساوي؟", prompt_image_path: null, points: 1 },
      { id: "qq3", quiz_id: "q1", position: 2, prompt: "إذا كانت  أ : ب = 2 : 5  و  ب = 20 ، فما  أ ؟", prompt_image_path: null, points: 2 },
      { id: "qq4", quiz_id: "q2", position: 0, prompt: "25% من 200 =", prompt_image_path: null, points: 1 },
      { id: "qq5", quiz_id: "q3", position: 0, prompt: "جا²س + جتا²س =", prompt_image_path: null, points: 1 },
    ],
    quiz_options: [
      { id: "o1", question_id: "qq1", position: 0, label: "3", image_path: null },
      { id: "o2", question_id: "qq1", position: 1, label: "4", image_path: null },
      { id: "o3", question_id: "qq1", position: 2, label: "6", image_path: null },
      { id: "o4", question_id: "qq2", position: 0, label: "1 : 2", image_path: null },
      { id: "o5", question_id: "qq2", position: 1, label: "2 : 1", image_path: null },
      { id: "o6", question_id: "qq2", position: 2, label: "1 : 4", image_path: null },
      { id: "o7", question_id: "qq3", position: 0, label: "8", image_path: null },
      { id: "o8", question_id: "qq3", position: 1, label: "10", image_path: null },
      { id: "o9", question_id: "qq3", position: 2, label: "50", image_path: null },
      { id: "o10", question_id: "qq4", position: 0, label: "50", image_path: null },
      { id: "o11", question_id: "qq4", position: 1, label: "25", image_path: null },
      { id: "o12", question_id: "qq5", position: 0, label: "1", image_path: null },
      { id: "o13", question_id: "qq5", position: 1, label: "0", image_path: null },
    ],
    /** يقابل `private.answer_key` — وهنا في الذاكرة، فلا حراسة. */
    answer_key: [
      { question_id: "qq1", option_id: "o2" },
      { question_id: "qq2", option_id: "o4" },
      { question_id: "qq3", option_id: "o7" },
      { question_id: "qq4", option_id: "o10" },
      { question_id: "qq5", option_id: "o12" },
    ],

    /* ⚠️ شرحٌ على سؤالٍ واحد: وضع العرض يُري المالك **الحالة** لا كل
       الحالات. وسؤالٌ بلا شرح يُظهر له أنّ الشرح اختياريّ. */
    question_explanations: [
      { question_id: "qq1", body: "اقسم طرفَي المعادلة على ٣، فتحصل على س = ٤.", image_path: null },
    ],

    // سؤالٌ في دفتر مراجعة الطالب: لولاه لظهر التبويب فارغاً في وضع العرض
    // ولم يُرَ منه شيء.
    saved_questions: [
      { student_id: DEMO_STUDENT, question_id: "qq1", note: null,
        saved_at: new Date(Date.now() - 864e5).toISOString() },
    ],
    groups: [
      { id: "g1", track: "qudurat", name: "متقدّم", color: "#85ABE6", position: 0 },
      { id: "g2", track: "qudurat", name: "تأسيس", color: "#5DC79B", position: 1 },
      { id: "g3", track: "tahsili", name: "المتميّزون", color: "#F2786E", position: 0 },
    ],
    group_members: [
      { group_id: "g1", student_id: DEMO_STUDENT },
      { group_id: "g1", student_id: "33333333-3333-3333-3333-333333333333" },
      { group_id: "g2", student_id: "44444444-4444-4444-4444-444444444444" },
    ],
    assignments: [
      { id: "a1", track: "qudurat", item_type: "bank", item_id: "b1", audience: "track", group_id: null, student_id: null },
      { id: "a2", track: "qudurat", item_type: "bank", item_id: "b2", audience: "track", group_id: null, student_id: null },
      { id: "a3", track: "qudurat", item_type: "bank", item_id: "b3", audience: "group", group_id: "g1", student_id: null },
      { id: "a4", track: "qudurat", item_type: "resource", item_id: "d7", audience: "track", group_id: null, student_id: null },
      { id: "a5", track: "tahsili", item_type: "bank", item_id: "b5", audience: "track", group_id: null, student_id: null },
    ],
    quiz_attempts: [
      { id: "at1", quiz_id: "q1", student_id: DEMO_STUDENT, attempt_no: 1, status: "submitted",
        started_at: new Date(Date.now() - 864e5 * 3).toISOString(), expires_at: null,
        submitted_at: new Date(Date.now() - 864e5 * 3 + 6e5).toISOString(), score: 2, max_score: 4 },
      { id: "at2", quiz_id: "q1", student_id: DEMO_STUDENT, attempt_no: 2, status: "submitted",
        started_at: new Date(Date.now() - 864e5).toISOString(), expires_at: null,
        submitted_at: new Date(Date.now() - 864e5 + 5e5).toISOString(), score: 3, max_score: 4 },
    ],
    attempt_answers: [
      { attempt_id: "at1", question_id: "qq1", option_id: "o1", is_correct: false },
      { attempt_id: "at1", question_id: "qq2", option_id: "o4", is_correct: true },
      { attempt_id: "at1", question_id: "qq3", option_id: "o8", is_correct: false },
      { attempt_id: "at2", question_id: "qq1", option_id: "o2", is_correct: true },
      { attempt_id: "at2", question_id: "qq2", option_id: "o4", is_correct: true },
      { attempt_id: "at2", question_id: "qq3", option_id: "o9", is_correct: false },
    ],
  };
}

export type TableName = keyof DemoDb;
