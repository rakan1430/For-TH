import { describe, it, expect, beforeEach } from "vitest";
import { setTheme, getTheme, toggleTheme, initTheme, DEFAULT_THEME } from "./theme";

describe("السمة", () => {
  beforeEach(() => {
    document.documentElement.removeAttribute("data-theme");
    document.body.removeAttribute("data-theme");
    localStorage.clear();
  });

  /*
   * ⚠️ لبّ البند ١٥. لو كُتبت السمة على `body` لعملت الصفحة كلّها بشكلٍ صحيح
   *    ظاهرياً — ولظلّ شريط تمرير الصفحة بلون الورق فوق سبّورةٍ داكنة، لأنّ
   *    شريط الصفحة يُرسم من `html`. وهذا ما ضاعت فيه أسابيع.
   */
  it("تُكتب على html (العنصر الجذر) لا على body", () => {
    setTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.body.getAttribute("data-theme")).toBeNull();
  });

  it("الافتراضي داكن — قرار المالك، لا إعداد النظام", () => {
    expect(DEFAULT_THEME).toBe("dark");
    expect(initTheme()).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("والتبديل يعمل في الاتّجاهين", () => {
    setTheme("dark");
    expect(toggleTheme()).toBe("light");
    expect(getTheme()).toBe("light");
    expect(toggleTheme()).toBe("dark");
    expect(getTheme()).toBe("dark");
  });

  it("والاختيار يُحفظ فيعود معه الزائر", () => {
    setTheme("light");
    expect(localStorage.getItem("theme")).toBe("light");
    document.documentElement.removeAttribute("data-theme");
    expect(initTheme()).toBe("light");
  });

  it("وقيمةٌ فاسدة في التخزين تعود للداكن لا لحالةٍ ثالثة", () => {
    localStorage.setItem("theme", "سبّورة");
    expect(initTheme()).toBe("dark");
  });

  it("ويتبع لون شريط المتصفّح السمة", () => {
    const meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
    setTheme("light");
    expect(meta.getAttribute("content")).toBe("#FBFAF6");
    setTheme("dark");
    expect(meta.getAttribute("content")).toBe("#101820");
  });
});
