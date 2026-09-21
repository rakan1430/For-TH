import { seed, DEMO_TEACHER, DEMO_STUDENT, type DemoDb } from "./demo-data";

/**
 * عميلٌ وهميّ يحاكي ما تستعمله هذه الواجهة من Supabase — **لوضع العرض وحده**.
 *
 * ⚠️⚠️ ما الذي لا يفعله هذا الملفّ، ويجب ألّا يُظنّ أنّه يفعله:
 *
 *    · **لا يحرس شيئاً.** لا سياسات صفوف، ولا صلاحيات، ولا فصل بين المسارين
 *      مفروضاً. كل ما يحرسه المشروع فعلاً يقع في قاعدة البيانات، وهي غائبة
 *      هنا. فما تراه في وضع العرض يقول: «هكذا يبدو الشكل»، لا «هكذا يتصرّف
 *      النظام».
 *    · **ولا يثبت صحّة شيء.** إثبات الحراسة في `db/test/` على Postgres حقيقيّ
 *      بانتحال كل دور، وهو المرجع.
 *
 *    ولهذا يُعلن الشريط في أعلى الصفحة أنّ هذه بيانات تجريبية — بلا التباس.
 *
 * والبيانات تُحفظ في `localStorage` لتبقى بين الفتحات، فتُجرَّب شاشات
 * التأليف فعلاً: تُنشئ بنكاً وترتّبه وتعود فتجده.
 */

const KEY = "demo-db-v1";

function load(): DemoDb {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoDb;
  } catch { /* تخزينٌ محجوب أو تالف — نبدأ من البذرة */ }
  return seed();
}

let db: DemoDb = load();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* لا يضرّ */ }
}

export function resetDemo() {
  db = seed();
  save();
}

/** من يتصفّح الآن — يبدّله الشريط بين المعلّم والطالب. */
export function demoRole(): "teacher" | "student" {
  try { return localStorage.getItem("demo-role") === "student" ? "student" : "teacher"; }
  catch { return "teacher"; }
}
export function setDemoRole(r: "teacher" | "student") {
  try { localStorage.setItem("demo-role", r); } catch { /* لا يضرّ */ }
}
const uid = () => (demoRole() === "teacher" ? DEMO_TEACHER : DEMO_STUDENT);

type Row = Record<string, unknown>;
type Res<T> = { data: T; error: { message: string } | null };

const ok = <T,>(data: T): Res<T> => ({ data, error: null });
const err = (message: string): Res<null> => ({ data: null, error: { message } });

/* ------------------------------ الاستعلام -------------------------------- */

class Query implements PromiseLike<Res<Row[] | Row | null>> {
  private rows: Row[];
  private selectCols = "*";
  private oneRow = false;
  private maybe = false;

  constructor(private table: string, rows: Row[]) { this.rows = rows; }

  select(cols = "*") { this.selectCols = cols; return this; }
  eq(col: string, val: unknown) { this.rows = this.rows.filter((r) => r[col] === val); return this; }
  in(col: string, vals: unknown[]) { this.rows = this.rows.filter((r) => vals.includes(r[col])); return this; }
  order(col: string, opts?: { ascending?: boolean }) {
    const dir = opts?.ascending === false ? -1 : 1;
    this.rows = [...this.rows].sort((a, b) => {
      const x = a[col], y = b[col];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return (x > y ? 1 : -1) * dir;
    });
    return this;
  }
  limit(n: number) { this.rows = this.rows.slice(0, n); return this; }
  single() { this.oneRow = true; return this; }
  maybeSingle() { this.maybe = true; return this; }

  private resolve(): Res<Row[] | Row | null> {
    let out = this.rows;

    // الانضمام الوحيد الذي تستعمله الواجهة: تصدير المشتركين مع ملفّاتهم
    if (this.selectCols.includes("profiles(")) {
      out = out.map((r) => ({
        ...r,
        profiles: db.profiles.find((p) => p.id === r["student_id"]) ?? null,
      }));
    }

    if (this.oneRow) {
      const first = out[0];
      return first ? ok(first) : (err(`لا صفّ في ${this.table}`) as Res<Row | null>);
    }
    if (this.maybe) return ok(out[0] ?? null);
    return ok(out);
  }

  then<R1 = Res<Row[] | Row | null>, R2 = never>(
    onFulfilled?: ((v: Res<Row[] | Row | null>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.resolve()).then(onFulfilled, onRejected);
  }
}

/** كتابةٌ مؤجَّلة: تُنفَّذ عند الانتظار، بعد جمع المرشّحات. */
class Mutation implements PromiseLike<Res<Row[] | Row | null>> {
  private filters: { col: string; vals: unknown[] }[] = [];
  private wantSelect = false;
  private wantSingle = false;

  constructor(
    private table: keyof DemoDb,
    private kind: "insert" | "update" | "upsert" | "delete",
    private payload: Row | Row[] | null
  ) {}

  select() { this.wantSelect = true; return this; }
  single() { this.wantSingle = true; return this; }
  eq(col: string, val: unknown) { this.filters.push({ col, vals: [val] }); return this; }
  in(col: string, vals: unknown[]) { this.filters.push({ col, vals }); return this; }

  private matches(r: Row) {
    return this.filters.every((f) => f.vals.includes(r[f.col]));
  }

  private run(): Res<Row[] | Row | null> {
    const arr = db[this.table] as unknown as Row[];
    let touched: Row[] = [];

    if (this.kind === "insert" || this.kind === "upsert") {
      const items = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      for (const item of items) {
        const row: Row = { id: item["id"] ?? crypto.randomUUID(), ...item };
        const existing = arr.findIndex((r) => r["id"] !== undefined && r["id"] === row["id"]);
        if (this.kind === "upsert" && existing !== -1) {
          arr[existing] = { ...arr[existing], ...row };
          touched.push(arr[existing]!);
        } else {
          arr.push(row);
          touched.push(row);
        }
      }
    } else if (this.kind === "update") {
      for (const r of arr) {
        if (this.matches(r)) { Object.assign(r, this.payload as Row); touched.push(r); }
      }
    } else {
      const keep = arr.filter((r) => !this.matches(r));
      touched = arr.filter((r) => this.matches(r));
      (db[this.table] as unknown as Row[]) = keep;
    }

    save();
    if (this.wantSingle) return ok(touched[0] ?? null);
    return ok(this.wantSelect ? touched : null);
  }

  then<R1 = Res<Row[] | Row | null>, R2 = never>(
    onFulfilled?: ((v: Res<Row[] | Row | null>) => R1 | PromiseLike<R1>) | null,
    onRejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }
}

/* -------------------------------- الدوالّ -------------------------------- */

const isTeacher = () => demoRole() === "teacher";

function isAssigned(itemType: string, itemId: string): boolean {
  const mine = db.group_members.filter((m) => m.student_id === uid()).map((m) => m.group_id);
  return db.assignments.some((a) =>
    a.item_type === itemType && a.item_id === itemId && (
      a.audience === "track" ||
      (a.audience === "student" && a.student_id === uid()) ||
      (a.audience === "group" && a.group_id !== null && mine.includes(a.group_id))
    ));
}

function activeTrack(track: string): boolean {
  const d = new Date().toISOString().slice(0, 10);
  return db.subscriptions.some((s) =>
    s.student_id === uid() && s.track === track && !s.is_revoked &&
    s.starts_on <= d && d <= s.ends_on);
}

/** يقابل ما تفعله السياسات — للعرض فقط، لا حراسةً. */
function visible<T extends { track?: string; is_published?: boolean }>(
  rows: T[], kind: "bank" | "resource" | "quiz" | "section"
): T[] {
  if (isTeacher()) return rows;
  return rows.filter((r) => {
    if (!activeTrack(String(r.track))) return false;
    if (kind === "section") return true;
    if (!r.is_published) return false;
    const row = r as unknown as { id: string; bank_id?: string | null };
    return isAssigned(kind, row.id) ||
      (row.bank_id != null && isAssigned("bank", row.bank_id));
  });
}

const RPC: Record<string, (args: Row) => unknown> = {
  is_teacher: () => isTeacher(),
  // وضع العرض يبدأ بملفٍّ مكتمل: شاشة الإكمال ليست ما جاء الزائر ليراه
  profile_complete: () => true,

  teacher_overview: () => (["qudurat", "tahsili"] as const).map((t) => {
    const d = new Date().toISOString().slice(0, 10);
    return {
      track: t,
      active_subscribers: new Set(db.subscriptions
        .filter((s) => s.track === t && !s.is_revoked && s.starts_on <= d && d <= s.ends_on)
        .map((s) => s.student_id)).size,
      pending_requests: db.subscription_requests.filter((r) => r.track === t && r.status === "pending").length,
    };
  }),

  teacher_answer_key: (a) => {
    const qids = db.quiz_questions.filter((q) => q.quiz_id === a["p_quiz_id"]).map((q) => q.id);
    return db.answer_key.filter((k) => qids.includes(k.question_id));
  },

  confirm_identity: () => new Date().toISOString(),

  /*
   * ⚠️ المراجعة في وضع العرض تُحاكي **شرط** الإنتاج لا مخرجاته وحدها:
   *    ترفض ما لم يُسلَّم. فلو اكتفى العرض بإظهار الصحيح دائماً لتعلّم
   *    منه المالك توقّعاً مخالفاً لما سيراه طلّابه.
   */
  attempt_review: (a) => {
    const at = db.quiz_attempts.find((x) => x.id === a["p_attempt_id"]);
    if (!at || at.student_id !== uid()) throw new Error("لا محاولة بهذا المعرّف");
    if (at.status !== "submitted") throw new Error("المراجعة بعد التسليم");
    return db.quiz_questions
      .filter((q) => q.quiz_id === at.quiz_id)
      .sort((x, y) => x.position - y.position)
      .map((q) => {
        const ans = db.attempt_answers.find(
          (x) => x.attempt_id === at.id && x.question_id === q.id);
        const ex = db.question_explanations.find((x) => x.question_id === q.id);
        return {
          question_id: q.id,
          q_position: q.position,
          prompt: q.prompt,
          prompt_image_path: q.prompt_image_path ?? null,
          points: q.points,
          explanation: ex?.body ?? null,
          explanation_image_path: ex?.image_path ?? null,
          chosen_option_id: ans?.option_id ?? null,
          correct_option_id:
            db.answer_key.find((k) => k.question_id === q.id)?.option_id ?? null,
          is_correct: ans?.is_correct ?? null,
          is_saved: db.saved_questions.some(
            (x) => x.student_id === uid() && x.question_id === q.id),
        };
      });
  },

  save_question: (a) => {
    const qid = String(a["p_question_id"]);
    const ok = db.quiz_attempts.some((at) =>
      at.student_id === uid() && at.status === "submitted" &&
      db.quiz_questions.some((q) => q.id === qid && q.quiz_id === at.quiz_id));
    if (!ok) return [{ ok: false, reason: "not_reviewable" }];
    if (!db.saved_questions.some((x) => x.student_id === uid() && x.question_id === qid)) {
      db.saved_questions.push({
        student_id: uid(), question_id: qid,
        note: (a["p_note"] as string) ?? null, saved_at: new Date().toISOString(),
      });
      save();
    }
    return [{ ok: true, reason: "saved" }];
  },

  unsave_question: (a) => {
    const qid = String(a["p_question_id"]);
    const i = db.saved_questions.findIndex(
      (x) => x.student_id === uid() && x.question_id === qid);
    if (i !== -1) { db.saved_questions.splice(i, 1); save(); }
    return [{ ok: true, reason: "removed" }];
  },

  my_saved_questions: () =>
    db.saved_questions
      .filter((x) => x.student_id === uid())
      .map((x) => {
        const q = db.quiz_questions.find((y) => y.id === x.question_id)!;
        const quiz = db.quizzes.find((y) => y.id === q.quiz_id)!;
        const ex = db.question_explanations.find((y) => y.question_id === q.id);
        return {
          question_id: q.id, quiz_id: quiz.id, quiz_title: quiz.title, track: quiz.track,
          prompt: q.prompt, prompt_image_path: q.prompt_image_path ?? null,
          explanation: ex?.body ?? null, explanation_image_path: ex?.image_path ?? null,
          correct_option_id:
            db.answer_key.find((k) => k.question_id === q.id)?.option_id ?? null,
          note: x.note, saved_at: x.saved_at,
        };
      })
      .sort((m, n) => n.saved_at.localeCompare(m.saved_at)),

  // ⚠️ يُعيد العددين الصريحين كما تفعل الدالّة الحقيقية — فلا يتعلّم المالك
  //    من وضع العرض توقّعاً مخالفاً لما سيراه في الإنتاج.
  assign_items: (a) => {
    const ids = (a["p_item_ids"] as string[]) ?? [];
    const audience = String(a["p_audience"]);
    const groups = (a["p_group_ids"] as string[] | null) ?? [null];
    const students = (a["p_student_ids"] as string[] | null) ?? [null];
    const targets = audience === "group" ? groups : audience === "student" ? students : [null];
    let created = 0, targeted = 0;
    for (const id of ids) {
      for (const t of targets) {
        targeted++;
        const dup = db.assignments.some((x) =>
          x.item_type === a["p_item_type"] && x.item_id === id && x.audience === audience &&
          (audience === "group" ? x.group_id === t : audience === "student" ? x.student_id === t : true));
        if (dup) continue;
        db.assignments.push({
          id: crypto.randomUUID(), track: db.banks.find((b) => b.id === id)?.track ?? "qudurat",
          item_type: String(a["p_item_type"]), item_id: id, audience,
          group_id: audience === "group" ? (t as string) : null,
          student_id: audience === "student" ? (t as string) : null,
        });
        created++;
      }
    }
    save();
    return [{ created, skipped: targeted - created, targeted }];
  },

  reorder: (a) => {
    const kind = String(a["p_kind"]);
    const ids = (a["p_ids"] as string[]) ?? [];
    if (!["section", "bank", "group"].includes(kind)) throw new Error(`نوع غير مسموح: ${kind}`);
    const arr = (kind === "section" ? db.sections : kind === "bank" ? db.banks : db.groups) as Row[];
    ids.forEach((id, i) => { const r = arr.find((x) => x["id"] === id); if (r) r["position"] = i; });
    save();
    return ids.length;
  },

  reorder_bank_items: (a) => {
    const ordered = (a["p_ordered"] as { type: string; id: string }[]) ?? [];
    ordered.forEach((o, i) => {
      const arr = o.type === "resource" ? (db.resources as Row[]) : (db.quizzes as Row[]);
      const r = arr.find((x) => x["id"] === o.id);
      if (r) r["position"] = i;
    });
    save();
    return ordered.length;
  },

  save_quiz: (a) => {
    const q = a["p_quiz"] as Row;
    const questions = (q["questions"] as Row[]) ?? [];
    if (!String(q["title"] ?? "").trim()) return [{ ok: false, reason: "title_required", quiz_id: null, questions_saved: 0, questions_locked: 0 }];
    if (q["scope"] === "bank" && !q["bank_id"]) return [{ ok: false, reason: "bank_required", quiz_id: null, questions_saved: 0, questions_locked: 0 }];
    for (const qq of questions) {
      if (!((qq["options"] as Row[]) ?? []).some((o) => o["is_correct"])) {
        return [{ ok: false, reason: "question_without_answer", quiz_id: null, questions_saved: 0, questions_locked: 0 }];
      }
    }

    const id = (q["id"] as string) || crypto.randomUUID();
    const base = {
      id, track: q["track"], scope: q["scope"], bank_id: q["bank_id"] ?? null,
      section_id: q["section_id"] ?? null, title: String(q["title"]).trim(),
      retention: q["retention"] ?? "permanent", is_published: Boolean(q["is_published"]),
      opens_at: q["opens_at"] ?? null, due_at: q["due_at"] ?? null,
      time_limit_minutes: q["time_limit_minutes"] ?? null,
      max_attempts: q["max_attempts"] ?? null, position: q["position"] ?? 0,
    } as unknown as DemoDb["quizzes"][number];

    const at = db.quizzes.findIndex((x) => x.id === id);
    if (at === -1) db.quizzes.push(base); else db.quizzes[at] = { ...db.quizzes[at]!, ...base };

    const lockedIds = new Set(db.attempt_answers.map((x) => x.question_id));
    let saved = 0, locked = 0;
    const keep: string[] = [];

    questions.forEach((qq, i) => {
      const qid = (qq["id"] as string) || crypto.randomUUID();
      keep.push(qid);
      if (lockedIds.has(qid)) {
        const row = db.quiz_questions.find((x) => x.id === qid);
        if (row) row.position = i;
        locked++;
        return;
      }
      const row = db.quiz_questions.find((x) => x.id === qid);
      const next = {
        id: qid, quiz_id: id, position: i, prompt: String(qq["prompt"] ?? ""),
        prompt_image_path: (qq["prompt_image_path"] as string | null) ?? null,
        points: Number(qq["points"] ?? 1),
      };
      if (row) Object.assign(row, next); else db.quiz_questions.push(next);

      db.quiz_options = db.quiz_options.filter((o) => o.question_id !== qid);
      db.answer_key = db.answer_key.filter((k) => k.question_id !== qid);
      ((qq["options"] as Row[]) ?? []).forEach((o, oi) => {
        const oid = (o["id"] as string) || crypto.randomUUID();
        db.quiz_options.push({
          id: oid, question_id: qid, position: oi,
          label: String(o["label"] ?? ""), image_path: (o["image_path"] as string | null) ?? null,
        });
        if (o["is_correct"]) db.answer_key.push({ question_id: qid, option_id: oid });
      });
      saved++;
    });

    // المقفل لا يُحذف ولو حُذف من الطلب — كما في الخادم
    const removed = db.quiz_questions.filter((x) => x.quiz_id === id && !keep.includes(x.id));
    db.quiz_questions = db.quiz_questions.filter(
      (x) => x.quiz_id !== id || keep.includes(x.id) || lockedIds.has(x.id));
    locked += removed.filter((x) => lockedIds.has(x.id)).length;

    save();
    return [{ ok: true, reason: "saved", quiz_id: id, questions_saved: saved, questions_locked: locked }];
  },

  start_attempt: (a) => {
    const quiz = db.quizzes.find((q) => q.id === a["p_quiz_id"]);
    const no = (x: string) => [{ ok: false, reason: x, attempt_id: null, attempt_no: null, expires_at: null }];
    if (!quiz) return no("not_found");
    if (!quiz.is_published) return no("not_published");
    if (!isTeacher()) {
      if (!activeTrack(quiz.track)) return no("no_subscription");
      if (!isAssigned("quiz", quiz.id) && !(quiz.bank_id && isAssigned("bank", quiz.bank_id))) return no("not_assigned");
    }
    const mine = db.quiz_attempts.filter((x) => x.quiz_id === quiz.id && x.student_id === uid());
    const n = Math.max(0, ...mine.map((x) => x.attempt_no)) + 1;
    const limit = quiz.max_attempts ?? (quiz.retention === "temporary" ? 1 : null);
    if (limit !== null && n > limit) return no("attempts_exhausted");

    const expires = quiz.time_limit_minutes
      ? new Date(Date.now() + quiz.time_limit_minutes * 6e4).toISOString() : null;
    const id = crypto.randomUUID();
    db.quiz_attempts.push({
      id, quiz_id: quiz.id, student_id: uid(), attempt_no: n, status: "in_progress",
      started_at: new Date().toISOString(), expires_at: expires,
      submitted_at: null, score: null, max_score: null,
    });
    save();
    return [{ ok: true, reason: "started", attempt_id: id, attempt_no: n, expires_at: expires }];
  },

  save_answer: (a) => {
    const row = db.attempt_answers.find(
      (x) => x.attempt_id === a["p_attempt_id"] && x.question_id === a["p_question_id"]);
    if (row) row.option_id = a["p_option_id"] as string | null;
    else db.attempt_answers.push({
      attempt_id: String(a["p_attempt_id"]), question_id: String(a["p_question_id"]),
      option_id: (a["p_option_id"] as string | null) ?? null, is_correct: null,
    });
    save();
    return [{ ok: true, reason: "saved" }];
  },

  submit_attempt: (a) => {
    const at = db.quiz_attempts.find((x) => x.id === a["p_attempt_id"]);
    if (!at) return [{ ok: false, reason: "not_found", score: null, max_score: null, correct_count: null, question_count: null, late: false }];
    if (at.status === "submitted") return [{ ok: false, reason: "already_submitted", score: at.score, max_score: at.max_score, correct_count: null, question_count: null, late: false }];

    for (const ans of ((a["p_answers"] as Row[]) ?? [])) {
      const qid = String(ans["question_id"]);
      const row = db.attempt_answers.find((x) => x.attempt_id === at.id && x.question_id === qid);
      if (row) row.option_id = (ans["option_id"] as string | null) ?? null;
      else db.attempt_answers.push({ attempt_id: at.id, question_id: qid, option_id: (ans["option_id"] as string | null) ?? null, is_correct: null });
    }

    const qs = db.quiz_questions.filter((q) => q.quiz_id === at.quiz_id);
    for (const q of qs) {
      if (!db.attempt_answers.some((x) => x.attempt_id === at.id && x.question_id === q.id)) {
        db.attempt_answers.push({ attempt_id: at.id, question_id: q.id, option_id: null, is_correct: null });
      }
    }

    let score = 0, max = 0, correct = 0;
    for (const q of qs) {
      max += q.points;
      const ans = db.attempt_answers.find((x) => x.attempt_id === at.id && x.question_id === q.id);
      const good = Boolean(ans?.option_id) &&
        db.answer_key.some((k) => k.question_id === q.id && k.option_id === ans!.option_id);
      if (ans) ans.is_correct = good;
      if (good) { score += q.points; correct++; }
    }
    at.status = "submitted";
    at.submitted_at = new Date().toISOString();
    at.score = score; at.max_score = max;
    save();
    return [{ ok: true, reason: "submitted", score, max_score: max, correct_count: correct, question_count: qs.length, late: false }];
  },

  request_subscription: () => [{ ok: true, reason: "created", request_id: crypto.randomUUID() }],

  decide_subscription_request: (a) => {
    const r = db.subscription_requests.find((x) => x.id === a["p_request_id"]);
    if (!r) return [{ ok: false, reason: "not_found", subscription_id: null }];
    if (r.status !== "pending") return [{ ok: false, reason: "already_decided", subscription_id: null }];
    r.status = a["p_accept"] ? "accepted" : "rejected";
    r.decided_at = new Date().toISOString();
    if (a["p_accept"]) {
      const months = Number(a["p_months"] ?? 1);
      const start = new Date();
      const end = new Date(start); end.setMonth(end.getMonth() + months);
      db.subscriptions.push({
        id: crypto.randomUUID(), student_id: r.student_id, track: r.track,
        starts_on: start.toISOString().slice(0, 10), ends_on: end.toISOString().slice(0, 10),
        is_revoked: false,
      });
    }
    save();
    return [{ ok: true, reason: a["p_accept"] ? "accepted" : "rejected", subscription_id: null }];
  },
};

/* ------------------------------- العميل ---------------------------------- */

export function makeDemoClient() {
  return {
    from(table: string) {
      const rows = () => {
        const arr = [...((db[table as keyof DemoDb] as unknown as Row[]) ?? [])];
        if (isTeacher()) return arr;
        // ترشيحٌ يشبه ما تراه السياسات — للعرض لا للحراسة
        if (table === "banks" || table === "resources" || table === "quizzes") {
          return visible(arr as never, table.slice(0, -1) as never) as Row[];
        }
        if (table === "sections") return visible(arr as never, "section") as Row[];
        if (table === "profiles") return arr.filter((r) => r["id"] === uid());
        if (table === "subscriptions" || table === "subscription_requests" || table === "quiz_attempts") {
          return arr.filter((r) => r["student_id"] === uid());
        }
        if (table === "groups" || table === "group_members" || table === "assignments") return [];
        return arr;
      };
      return {
        select: (cols?: string) => new Query(table, rows()).select(cols),
        insert: (p: Row | Row[]) => new Mutation(table as keyof DemoDb, "insert", p),
        update: (p: Row) => new Mutation(table as keyof DemoDb, "update", p),
        upsert: (p: Row | Row[]) => new Mutation(table as keyof DemoDb, "upsert", p),
        delete: () => new Mutation(table as keyof DemoDb, "delete", null),
      };
    },

    async rpc(name: string, args: Row = {}) {
      const fn = RPC[name];
      if (!fn) return err(`دالّة غير معروفة في وضع العرض: ${name}`);
      try { return ok(fn(args)); }
      catch (e) { return err(e instanceof Error ? e.message : String(e)); }
    },

    storage: {
      from() {
        return {
          async upload() { return err("الرفع معطَّل في وضع العرض — لا مخزن."); },
          async remove() { return ok(null); },
          async createSignedUrl() { return err("لا ملفّات حقيقية في وضع العرض."); },
        };
      },
    },

    auth: {
      async getSession() {
        return ok({ session: { user: { id: uid(), email: "demo@example.test" } } });
      },
      onAuthStateChange() {
        return { data: { subscription: { unsubscribe() { /* لا شيء */ } } } };
      },
      async signUp() { return err("التسجيل معطَّل في وضع العرض."); },
      async signInWithPassword() { return ok({ user: { id: uid() } }); },
      async signOut() { return ok(null); },
    },
  };
}
