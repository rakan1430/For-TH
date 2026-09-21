import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { initTheme } from "./lib/theme";
import "./styles/base.css";
import "./styles/exam.css";

// النصّ في `index.html` ضبط السمة قبل أول رسم لمنع الوميض؛ وهذا يوحّد الحالة
// (لون شريط المتصفّح، والقيمة المحفوظة) بعد إقلاع التطبيق.
initTheme();

const root = document.getElementById("root");
if (!root) throw new Error("لم يُعثر على عنصر الجذر #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>
);
