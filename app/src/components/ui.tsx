import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { getTheme, toggleTheme } from "../lib/theme";
import { useState } from "react";

export function ThemeToggle() {
  const [theme, setThemeState] = useState(getTheme);
  return (
    <button
      type="button"
      className="btn btn--quiet btn--sm"
      onClick={() => setThemeState(toggleTheme())}
      aria-label={theme === "dark" ? "التبديل إلى الوضع الفاتح" : "التبديل إلى الوضع الداكن"}
      title={theme === "dark" ? "الوضع الفاتح" : "الوضع الداكن"}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} size={18} />
    </button>
  );
}

export function Notice({
  kind = "info", children,
}: { kind?: "info" | "error" | "ok"; children: ReactNode }) {
  const cls = kind === "error" ? "notice notice--error" : kind === "ok" ? "notice notice--ok" : "notice";
  return <div className={cls} role={kind === "error" ? "alert" : "status"}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="card" style={{ textAlign: "center", color: "var(--text-3)" }}>
      {children}
    </div>
  );
}

export function Field({
  label, hint, children,
}: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      {children}
      {hint ? <span className="field__hint">{hint}</span> : null}
    </label>
  );
}

/**
 * عرض السعر.
 * ⚠️ حين لا يكون السعر محدَّداً تعرض «[السعر]» بإطارٍ متقطّع ظاهر — ولا
 *    تُخفي البطاقة ولا تضع صفراً. الغياب معلومةٌ يجب أن يراها المالك في كل
 *    مرّة يفتح فيها الصفحة، حتى يحسمه.
 */
export function PriceTag({ price }: { price: { kind: string; text: string } }) {
  if (price.kind === "placeholder") {
    return <span className="price-placeholder" title="لم يحدّد المالك السعر بعد">{price.text}</span>;
  }
  return <span className="mono">{price.text}</span>;
}
