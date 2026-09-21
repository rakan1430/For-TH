/**
 * منطق شاشة الاختبار — مفصولٌ عن رسمها.
 *
 * ⚠️ كل ما هنا دوالّ خالصة تُفحص بلا متصفّح: حالةُ كل سؤال، والإحصاءات،
 *    وصيغة المؤقّت. والرسم يقرؤها ولا يحسب شيئاً — فلو حُسبت الحالة في
 *    مكانين (لوحة الأرقام والبطاقات) لافترقا عند أوّل تعديل.
 */

/** حالة السؤال في لوحة الأرقام — لغة ألوانٍ واحدة في كل الاختبارات. */
export type CellState =
  | "blank"     // لم يُجَب
  | "answered"  // أُجيب
  | "flagged"   // مُميَّز للمراجعة
  | "correct"   // صحيح (بعد التسليم)
  | "wrong";    // خاطئ (بعد التسليم)

export interface CellInput {
  answered: boolean;
  flagged: boolean;
  /** `null` قبل التسليم؛ بعده: أصاب أم لا */
  correct: boolean | null;
}

/**
 * ⚠️ الترتيب مقصود: **بعد التسليم** لا معنى لـ«مُميَّز» ولا لـ«أُجيب» —
 *    صار للسؤال جواب. والتمييز أداةُ تنقّلٍ أثناء الاختبار، لا نتيجة.
 */
export function cellState(c: CellInput): CellState {
  if (c.correct !== null) return c.correct ? "correct" : "wrong";
  if (c.flagged) return "flagged";
  return c.answered ? "answered" : "blank";
}

export interface ExamStats {
  answered: number;
  remaining: number;
  flagged: number;
  total: number;
  correct: number;
  wrong: number;
}

export function examStats(cells: CellInput[]): ExamStats {
  const s: ExamStats = { answered: 0, remaining: 0, flagged: 0, total: cells.length, correct: 0, wrong: 0 };
  for (const c of cells) {
    if (c.correct !== null) { if (c.correct) s.correct++; else s.wrong++; }
    if (c.answered) s.answered++;
    if (c.flagged) s.flagged++;
  }
  s.remaining = s.total - s.answered;
  return s;
}

/**
 * مؤقّتٌ بصيغة `م:ث` أو `س:د:ث`.
 *
 * ⚠️ `direction: ltr` على الصندوق الذي يعرضه: الأرقام لا تُقرأ من اليمين
 *    إلى اليسار حتى في صفحةٍ عربية. و«١٢:٤٥» معكوسةً تصير «٤٥:١٢».
 */
export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return hh > 0 ? `${hh}:${two(mm)}:${two(ss)}` : `${mm}:${two(ss)}`;
}

/** آخر دقيقة: تحذيرٌ لا مفاجأة. */
export const WARN_SECONDS = 60;
export function clockIsUrgent(remaining: number | null): boolean {
  return remaining !== null && remaining <= WARN_SECONDS;
}

/* ---------------------------- حجم الخطّ ---------------------------------- */

/** ثلاث حالات لا تدرّجٌ حرّ — والقيم من ملحق الاختبارات §٤. */
export const FONT_SIZES = [14, 16, 19] as const;
export type FontStep = 0 | 1 | 2;
export const DEFAULT_FONT_STEP: FontStep = 1;

export function stepFont(current: FontStep, delta: -1 | 1): FontStep {
  const next = current + delta;
  if (next < 0) return 0;
  if (next > 2) return 2;
  return next as FontStep;
}

/* ------------------------- حروف الخيارات --------------------------------- */

/**
 * ⚠️ حرفٌ عربيّ في دائرة، لا نقطةٌ صغيرة. وبعد «د» تعود الأرقام: اختبارٌ
 *    بخمسة خيارات لا يُترك بخيارٍ بلا شارة.
 */
const LETTERS = ["أ", "ب", "ج", "د", "هـ", "و"] as const;
export function optionLetter(index: number): string {
  return LETTERS[index] ?? String(index + 1);
}

/* -------------------------- تحذير التسليم -------------------------------- */

/**
 * ⚠️ تحذيرٌ لا منع (ملحق §٧): قد يترك الطالب سؤالاً عمداً. لكن يجب أن
 *    **يعرف** أنّه فعل، لا أن يُفاجأ بدرجةٍ ناقصة ويظنّ المنصّة أخطأت.
 */
export function submitWarning(unanswered: number): string | null {
  if (unanswered <= 0) return null;
  const noun =
    unanswered === 1 ? "سؤالاً واحداً"
    : unanswered === 2 ? "سؤالين"
    : unanswered <= 10 ? `${unanswered} أسئلة`
    : `${unanswered} سؤالاً`;
  return `تركتَ ${noun} بلا إجابة. أتسلّم الآن؟`;
}
