import { describe, it, expect } from "vitest";
import { AR_LOCALE, formatDate, formatDateTime, daysUntil, formatPrice, formatScore, formatPercent, countLabel } from "./format";

/*
 * فحص التقويم — البند ١٧.
 *
 * ⚠️ ونبدأ بإثبات أنّ الفخّ **حقيقيّ**: لو كان `"ar-SA"` يعطي ميلادياً أصلاً
 *    لكان هذا الملفّ كلّه احتياطاً بلا سبب، ولحُذف يوماً بحجّة التبسيط. فنقيس
 *    الاثنين ونُظهر الفرق.
 */
describe("التقويم: ميلاديّ لا هجريّ", () => {
  const d = new Date(Date.UTC(2026, 2, 15, 12, 0, 0)); // ١٥ مارس ٢٠٢٦

  /** يحوّل الأرقام الهندية إلى لاتينية ليصير النصّ قابلاً للقراءة رقماً. */
  const toLatinDigits = (s: string) =>
    s.replace(/[\u0660-\u0669]/g, (c) => String(c.charCodeAt(0) - 0x0660));

  /*
   * ⚠️⚠️ تنبيه مهمّ اكتشفه هذا الفحص، ويخالف حرفيّة ما في ملف الخبرات:
   *
   *   ملف الخبرات يقول إنّ `"ar-SA"` وحدها **تُعطي التقويم الهجري**. وكان
   *   ذلك صحيحاً، ولم يعد مضموناً: في ICU 78 (Node 22) تُحلّ `"ar-SA"` إلى
   *   التقويم **الميلادي**، لأنّ CLDR غيّر التقويم المفضَّل للسعودية.
   *
   *   وهذا **لا يُبطل الدرس بل يشدّده**: القيمة الافتراضية تتبدّل تحتك بين
   *   إصدارات المتصفّحات و Node. فمتصفّح طالبٍ قديم قد يعطي هجرياً بينما
   *   جهاز المعلّم يعطي ميلادياً — من نفس الشفرة، ولنفس الموعد. وهذا أسوأ
   *   من خطأٍ ثابت: خطأٌ لا يُعاد إنتاجه عند من يصلحه.
   *
   *   فالادّعاء الذي نفحصه ليس «ما الافتراضي؟» — لا يصحّ تثبيت فحصٍ على قيمةٍ
   *   تتغيّر بإصدار المكتبة — بل: **نحن لا نعتمد على الافتراضي إطلاقاً.**
   */
  it("الفرق حقيقيّ وكبير: نفس اللحظة سنتها ١٤٤٧ هجرياً و٢٠٢٦ ميلادياً", () => {
    const hijri = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", { year: "numeric" }).format(d);
    const hYear = Number(toLatinDigits(hijri).replace(/[^\d]/g, ""));
    expect(hYear).toBeGreaterThan(1400);
    expect(hYear).toBeLessThan(1500);
    // ومعلّمٌ يكتب «١٥ مارس» ويراه طالبه «٢٦ رمضان» يفقد الموعد بلا رسالة خطأ
    expect(hYear).not.toBe(2026);
  });

  it("والثابت المعتمد يثبّت التقويم والأرقام صراحةً، مهما كان افتراضي البيئة", () => {
    const resolved = new Intl.DateTimeFormat(AR_LOCALE).resolvedOptions();
    expect(resolved.calendar).toBe("gregory");
    expect(resolved.numberingSystem).toBe("latn");
  });

  it('و"ar-SA" ما تزال تعطي أرقاماً هندية — فالجزء `nu-latn` ليس زينة', () => {
    // هذا الشقّ من الفخّ ما زال قائماً في كل البيئات الحالية
    const raw = new Intl.DateTimeFormat("ar-SA", { year: "numeric" }).format(d);
    expect(raw).toMatch(/[\u0660-\u0669]/);
    expect(formatDate(d)).not.toMatch(/[\u0660-\u0669]/);
  });

  it("والمحلّية المعتمدة في المشروع تعطي الميلادي", () => {
    expect(AR_LOCALE).toBe("ar-SA-u-ca-gregory-nu-latn");
    expect(formatDate(d)).toContain("2026");
    expect(formatDate(d)).not.toContain("1447");
  });

  it("والأرقام لاتينية لا هندية — تصطفّ مع بقيّة أرقام المنصّة", () => {
    const out = formatDate(d);
    expect(out).toMatch(/\d/);
    expect(out).not.toMatch(/[٠-٩]/);
  });

  it("والوقت كذلك", () => {
    expect(formatDateTime(d)).toContain("2026");
    expect(formatDateTime(d)).not.toMatch(/[٠-٩]/);
  });

  it("وقيمةٌ غير صالحة تُعطي «—» ولا ترمي — موعدٌ لا يظهر خيرٌ من صفحةٍ تنكسر", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("ليس تاريخاً")).toBe("—");
  });
});

describe("الأيام المتبقّية", () => {
  it("تُحسب بالتقويم لا بالساعات", () => {
    // ٢٣ ساعة فقط بينهما، لكنّهما يومان مختلفان
    const from = new Date(2026, 0, 1, 23, 30);
    expect(daysUntil(new Date(2026, 0, 2, 0, 30), from)).toBe(1);
  });
  it("صفر في يوم الانتهاء نفسه", () => {
    const from = new Date(2026, 0, 10, 1, 0);
    expect(daysUntil(new Date(2026, 0, 10, 23, 0), from)).toBe(0);
  });
  it("سالب بعد الانتهاء", () => {
    expect(daysUntil(new Date(2026, 0, 1), new Date(2026, 0, 5))).toBe(-4);
  });
});

describe("السعر: لا يُخترع رقم", () => {
  it("NULL تعني «لم يحدّده المالك» — لا صفراً ولا مجّاناً", () => {
    const p = formatPrice(null);
    expect(p.kind).toBe("placeholder");
    expect(p.text).toBe("[السعر]");
  });
  it("undefined مثلها", () => {
    expect(formatPrice(undefined).kind).toBe("placeholder");
  });
  it("والصفر سعرٌ حقيقيّ لا غياب سعر — فرقٌ يهمّ", () => {
    const p = formatPrice(0);
    expect(p.kind).toBe("amount");
    expect(p.text).toBe("0 ريالاً");
  });
  it("والقيمة بالهللات تُعرض بالريالات", () => {
    expect(formatPrice(15000).text).toBe("150 ريالاً");
  });

  /*
   * ⚠️ نفس درس «١٨ أيام»: العربية خمس حالات لا اثنتان. والسعر أظهر ما في
   *    صفحة الاشتراك — خطأٌ نحويّ فيه يُقرأ قبل أي شيءٍ آخر.
   */
  it("وصيغة «ريال» تتبع العدد", () => {
    expect(formatPrice(100).text).toBe("1 ريال");
    expect(formatPrice(200).text).toBe("2 ريالان");
    expect(formatPrice(500).text).toBe("5 رِيالات");
    expect(formatPrice(1100).text).toBe("11 ريالاً");
  });

  /*
   * ⚠️ الكسور عند الحاجة وحدها: سعرٌ مستدير بكسرين صفريّين يبدو نسخةً من
   *    نظامٍ محاسبيّ لا سعراً على بطاقة.
   */
  it("ولا تظهر كسورٌ صفرية", () => {
    expect(formatPrice(15000).text).not.toContain(".00");
    expect(formatPrice(15050).text).toContain("150.5");
  });
});

describe("الدرجات", () => {
  it("تُعرض كاملةً بمرجعها", () => {
    expect(formatScore(7, 10)).toBe("7.00 من 10.00");
  });
  it("ونسبةً", () => {
    expect(formatPercent(7, 10)).toBe("70٪");
  });
  it("ولا تقسم على صفر", () => {
    expect(formatPercent(0, 0)).toBe("—");
  });
  it("وغير المصحّحة «—»", () => {
    expect(formatScore(null, null)).toBe("—");
  });
});

/*
 * قواعد العدد في العربية — خمس حالات لا اثنتان.
 * «١٨ أيام» خطأ شائع يقع فيه كل من يعامل العربية كالإنجليزية، ويظهر في
 * أوّل سطرٍ يراه الطالب على شاشته.
 */
describe("العدّ العربي", () => {
  const يوم = {
    none: "ينتهي اليوم", one: "يبقى يوم واحد", two: "يبقى يومان",
    few: "أيام", many: "يوماً",
  };

  it("الصفر صيغةٌ خاصّة لا «٠ أيام»", () => {
    expect(countLabel(0, يوم)).toBe("ينتهي اليوم");
  });
  it("والسالب مثله — اشتراكٌ انتهى لا يقول «‎-٣ أيام»", () => {
    expect(countLabel(-3, يوم)).toBe("ينتهي اليوم");
  });
  it("المفرد بلا رقم", () => {
    expect(countLabel(1, يوم)).toBe("يبقى يوم واحد");
  });
  it("والمثنّى كذلك — لا «٢ أيام»", () => {
    expect(countLabel(2, يوم)).toBe("يبقى يومان");
  });
  it("٣ إلى ١٠: جمع قلّة", () => {
    expect(countLabel(3, يوم)).toBe("3 أيام");
    expect(countLabel(10, يوم)).toBe("10 أيام");
  });
  it("١١ فأكثر: مفرد منصوب — وهنا يقع الخطأ عادةً", () => {
    expect(countLabel(11, يوم)).toBe("11 يوماً");
    expect(countLabel(18, يوم)).toBe("18 يوماً");
    expect(countLabel(100, يوم)).toBe("100 يوماً");
  });
});
