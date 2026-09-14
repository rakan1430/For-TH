import { describe, it, expect } from "vitest";
import { toCsv, BOM } from "./csv";

describe("تصدير CSV", () => {
  it("يبدأ بـBOM — البند ١٨: بدونها يفتح Excel العربي الأسماء حروفاً مشوّهة", () => {
    const out = toCsv(["الاسم"], [["محمد"]]);
    expect(out.charCodeAt(0)).toBe(0xfeff);
    expect(out.startsWith(BOM)).toBe(true);
  });

  it("والنصّ العربي يبقى سليماً بعدها", () => {
    expect(toCsv(["الاسم"], [["عبدالرحمن"]])).toContain("عبدالرحمن");
  });

  it("يقتبس الفواصل وعلامات الاقتباس والأسطر", () => {
    const out = toCsv(["أ"], [['يحوي, فاصلة']]);
    expect(out).toContain('"يحوي, فاصلة"');
    expect(toCsv(["أ"], [['يحوي "اقتباساً"']])).toContain('"يحوي ""اقتباساً"""');
  });

  it("يحمي من حقن الصيغ: خليّة تبدأ بـ= لا ينفّذها Excel معادلةً", () => {
    const out = toCsv(["الاسم"], [["=1+1"]]);
    expect(out).toContain("'=1+1");
    for (const bad of ["+x", "-x", "@x"]) {
      expect(toCsv(["أ"], [[bad]])).toContain(`'${bad}`);
    }
  });

  it("والقيم الفارغة خلايا فارغة لا «null»", () => {
    const out = toCsv(["أ", "ب"], [[null, undefined]]);
    expect(out).not.toContain("null");
    expect(out).not.toContain("undefined");
  });

  it("ونهايات أسطر ويندوز", () => {
    expect(toCsv(["أ"], [["١"]])).toContain("\r\n");
  });
});
