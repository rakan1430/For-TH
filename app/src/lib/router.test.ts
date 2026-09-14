import { describe, it, expect, beforeEach, vi } from "vitest";
import { currentPath, navigate, match } from "./router";

describe("مطابقة المسارات", () => {
  it("تطابق المسار الثابت", () => {
    expect(match("/teacher", "/teacher")).toEqual({});
    expect(match("/teacher", "/student")).toBeNull();
  });
  it("وتلتقط الوسائط", () => {
    expect(match("/quiz/:id", "/quiz/abc-123")).toEqual({ id: "abc-123" });
    expect(match("/quiz/:id/:n", "/quiz/a/2")).toEqual({ id: "a", n: "2" });
  });
  it("وتردّ اختلاف الطول", () => {
    expect(match("/quiz/:id", "/quiz")).toBeNull();
    expect(match("/quiz/:id", "/quiz/a/b")).toBeNull();
  });
  it("وتفكّ الترميز", () => {
    expect(match("/x/:v", "/x/%D8%A3")).toEqual({ v: "أ" });
  });
});

describe("التنقّل", () => {
  beforeEach(() => { window.location.hash = ""; });

  it("يضبط الشذرة", () => {
    navigate("/teacher");
    expect(currentPath()).toBe("/teacher");
  });

  /*
   * ⚠️ البند ٢٧: الانتقال لنفس الشذرة لا يُطلق `hashchange` إطلاقاً. ولولا
   *    الحدث الخاصّ لبقي زرّ «تحديث» ميتاً بلا أي أثرٍ ظاهر يدلّ على السبب.
   */
  it("والانتقال لنفس المسار يُطلق حدثاً رغم صمت المتصفّح", () => {
    navigate("/teacher");
    const seen = vi.fn();
    window.addEventListener("app:routechange", seen);
    const hashBefore = window.location.hash;
    navigate("/teacher");
    expect(window.location.hash).toBe(hashBefore);
    expect(seen).toHaveBeenCalledTimes(1);
    window.removeEventListener("app:routechange", seen);
  });

  it("ومسارٌ بلا شرطة مائلة يُصحَّح", () => {
    navigate("teacher");
    expect(currentPath()).toBe("/teacher");
  });
});
