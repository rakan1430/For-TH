import { useEffect, useState } from "react";

/**
 * توجيهٌ بالشذرة (`#/…`) — بسيطٌ بلا مكتبة.
 *
 * ⚠️ والشذرة اختيارٌ واعٍ لا تبسيط (البند ١٢): الجزء بعد `#` **لا يُرسل إلى
 *    الخادم إطلاقاً** ولا يظهر في سجلّاته ولا في ترويسة المصدر. فلو حملت
 *    رابطاً رمزَ وصولٍ يوماً، فهذا موضعه.
 *
 * ⚠️ والفخّ الذي يقع فيه كل توجيهٍ بالشذرة (البند ٢٧): الانتقال إلى **نفس**
 *    الرابط ونفس الشذرة **لا يُعيد التحميل إطلاقاً** ولا يُطلق `hashchange`.
 *    فالضغط على «الطلبات» وأنت في «الطلبات» لا يفعل شيئاً — وهذا مقبول —
 *    لكن الاعتماد على `hashchange` وحده لتحديث البيانات يجعل زرّ «تحديث»
 *    ميتاً بصمت. ولهذا `navigate` تُطلق حدثاً خاصّاً دائماً.
 */

const CHANGED = "app:routechange";

export function currentPath(): string {
  const h = window.location.hash.replace(/^#/, "");
  return h.startsWith("/") ? h : "/";
}

export function navigate(path: string): void {
  const target = path.startsWith("/") ? path : `/${path}`;
  if (currentPath() === target) {
    // نفس المسار: لن يُطلق المتصفّح `hashchange`، فنُطلقه بأنفسنا
    window.dispatchEvent(new CustomEvent(CHANGED));
    return;
  }
  window.location.hash = target;
}

export function useRoute(): string {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const update = () => setPath(currentPath());
    window.addEventListener("hashchange", update);
    window.addEventListener(CHANGED, update);
    return () => {
      window.removeEventListener("hashchange", update);
      window.removeEventListener(CHANGED, update);
    };
  }, []);
  return path;
}

/** `/quiz/abc` مقابل النمط `/quiz/:id` ← `{ id: "abc" }`، أو null. */
export function match(pattern: string, path: string): Record<string, string> | null {
  const p = pattern.split("/").filter(Boolean);
  const a = path.split("/").filter(Boolean);
  if (p.length !== a.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i]!;
    const val = a[i]!;
    if (seg.startsWith(":")) params[seg.slice(1)] = decodeURIComponent(val);
    else if (seg !== val) return null;
  }
  return params;
}
