/**
 * السمة: داكن (الافتراضي) وفاتح، والتبديل بينهما.
 *
 * ⚠️ البند ١٥ — أهمّ سطرٍ في هذا الملفّ:
 *    السمة تُكتب على **`document.documentElement`** (أي `html`)، لا على
 *    `body`. شريط تمرير الصفحة يُرسم من `html`؛ فلو كانت السمة تحته قرأ
 *    `html` القيم الفاتحة فظهر شريطٌ بلون الورق فوق صفحةٍ داكنة. ولا يظهر
 *    ذلك في لقطات الشاشة ولا على الجوّال — فيبقى لغزاً.
 */

export type Theme = "dark" | "light";

const KEY = "theme";

/** ⚠️ الافتراضي داكن بقرار المالك — لا يتبع إعداد النظام. */
export const DEFAULT_THEME: Theme = "dark";

export function getTheme(): Theme {
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "light" ? "light" : "dark";
}

export function setTheme(theme: Theme): void {
  // ← `documentElement`، لا `document.body`
  document.documentElement.setAttribute("data-theme", theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* وضع التصفّح الخاصّ قد يمنع الكتابة — السمة تعمل، والاختيار لا يُحفظ */
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "light" ? "#FBFAF6" : "#101820");
}

export function toggleTheme(): Theme {
  const next: Theme = getTheme() === "dark" ? "light" : "dark";
  setTheme(next);
  return next;
}

/** يُستدعى مرّةً عند الإقلاع — والنصّ في `index.html` سبقه لمنع الوميض. */
export function initTheme(): Theme {
  let saved: string | null = null;
  try {
    saved = localStorage.getItem(KEY);
  } catch {
    saved = null;
  }
  const theme: Theme = saved === "light" ? "light" : DEFAULT_THEME;
  setTheme(theme);
  return theme;
}
