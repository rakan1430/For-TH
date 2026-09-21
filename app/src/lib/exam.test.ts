import { describe, it, expect } from "vitest";
import {
  cellState, examStats, formatClock, clockIsUrgent, stepFont,
  optionLetter, submitWarning, FONT_SIZES,
} from "./exam";

const cell = (o: Partial<Parameters<typeof cellState>[0]> = {}) =>
  ({ answered: false, flagged: false, correct: null, ...o });

describe("حالة خليّة السؤال", () => {
  it("لم يُجَب ← فارغة، وأُجيب ← مُجاب", () => {
    expect(cellState(cell())).toBe("blank");
    expect(cellState(cell({ answered: true }))).toBe("answered");
  });

  it("والمُميَّز يغلب المُجاب — لأنّه ما يبحث عنه الطالب ليعود إليه", () => {
    expect(cellState(cell({ answered: true, flagged: true }))).toBe("flagged");
  });

  /*
   * ⚠️ بعد التسليم لا معنى لـ«مُميَّز»: صار للسؤال جواب. والتمييز أداةُ
   *    تنقّلٍ أثناء الاختبار لا نتيجة — ولو بقي لونه لأخفى الخطأ.
   */
  it("وبعد التسليم تغلب النتيجة كل شيء", () => {
    expect(cellState(cell({ answered: true, flagged: true, correct: false }))).toBe("wrong");
    expect(cellState(cell({ answered: true, flagged: true, correct: true }))).toBe("correct");
  });
});

describe("إحصاءات الاختبار", () => {
  it("تُحسب مرّةً واحدة — فلا تفترق البطاقات عن لوحة الأرقام", () => {
    const s = examStats([
      cell({ answered: true }),
      cell({ answered: true, flagged: true }),
      cell(),
      cell({ flagged: true }),
    ]);
    expect(s).toMatchObject({ total: 4, answered: 2, remaining: 2, flagged: 2 });
  });

  it("وبعد التسليم: صحيحة وخاطئة", () => {
    const s = examStats([
      cell({ answered: true, correct: true }),
      cell({ answered: true, correct: false }),
      cell({ answered: false, correct: false }),
    ]);
    expect(s.correct).toBe(1);
    expect(s.wrong).toBe(2);
  });
});

describe("المؤقّت", () => {
  it("«م:ث» ما دون الساعة، و«س:د:ث» فوقها", () => {
    expect(formatClock(765)).toBe("12:45");
    expect(formatClock(59)).toBe("0:59");
    expect(formatClock(3661)).toBe("1:01:01");
  });

  /*
   * ⚠️ لا يهبط تحت الصفر ولا يعرض سالباً: الخادم قد يتأخّر ثانيةً عن
   *    المتصفّح، فيرى الطالب «−٣» في آخر لحظة ويظنّ الشاشة معطوبة.
   */
  it("ولا ينزل تحت الصفر", () => {
    expect(formatClock(-30)).toBe("0:00");
    expect(formatClock(0)).toBe("0:00");
  });

  it("وآخر دقيقة تحذير", () => {
    expect(clockIsUrgent(61)).toBe(false);
    expect(clockIsUrgent(60)).toBe(true);
    expect(clockIsUrgent(0)).toBe(true);
    expect(clockIsUrgent(null)).toBe(false);   // اختبارٌ بلا مؤقّت
  });
});

describe("حجم الخطّ", () => {
  it("ثلاث حالات لا تدرّجٌ حرّ، ولا يخرج عن طرفيه", () => {
    expect(FONT_SIZES).toEqual([14, 16, 19]);
    expect(stepFont(0, -1)).toBe(0);
    expect(stepFont(2, 1)).toBe(2);
    expect(stepFont(1, 1)).toBe(2);
    expect(stepFont(1, -1)).toBe(0);
  });
});

describe("حروف الخيارات", () => {
  it("عربيّة، وتعود أرقاماً بعد نفادها", () => {
    expect(optionLetter(0)).toBe("أ");
    expect(optionLetter(3)).toBe("د");
    // ⚠️ اختبارٌ بسبعة خيارات لا يُترك بخيارٍ بلا شارة
    expect(optionLetter(6)).toBe("7");
  });
});

describe("تحذير التسليم", () => {
  /*
   * ⚠️ تحذيرٌ لا منع: قد يترك الطالب سؤالاً عمداً. لكنّه يجب أن **يعرف**،
   *    لا أن يُفاجأ بدرجةٍ ناقصة ويظنّ المنصّة أخطأت.
   */
  it("يصمت حين لا متروك", () => {
    expect(submitWarning(0)).toBeNull();
  });

  it("ويسمّي العدد بصيغته العربية الصحيحة", () => {
    expect(submitWarning(1)).toContain("سؤالاً واحداً");
    expect(submitWarning(2)).toContain("سؤالين");
    expect(submitWarning(3)).toContain("3 أسئلة");
    expect(submitWarning(18)).toContain("18 سؤالاً");
  });
});
