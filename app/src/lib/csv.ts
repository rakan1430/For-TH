/**
 * تصدير CSV — لتقارير الدرجات وقوائم المشتركين.
 *
 * ⚠️ البند ١٨: Excel العربي على ويندوز يقرأ CSV بترميز النظام لا UTF-8.
 *    فبلا **BOM** في أوّل الملفّ تُفتح الأسماء حروفاً مشوّهة، ويظنّ المستخدم
 *    أنّ الملفّ تالف — ويبلّغ عن عطلٍ ليس في الشفرة.
 */

/** علامة ترتيب البايتات — أوّل محرفٍ في الملفّ، بلا استثناء. */
export const BOM = "﻿";

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);

  /*
   * ⚠️ حقنُ الصيغ: خليّةٌ تبدأ بـ`=` أو `+` أو `-` أو `@` يفسّرها Excel
   *    **معادلةً** وينفّذها. واسم طالبٍ لن يبدأ بها عادةً — لكنّ الاسم يأتي
   *    ممّا يكتبه المستخدم، وهذا يكفي. نسبقها بفاصلةٍ عليا فتبقى نصّاً.
   */
  const guarded = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;

  return /[",\n\r]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(",")];
  for (const row of rows) lines.push(row.map(escapeCell).join(","));
  // نهايات أسطر ويندوز: أكثر أماناً مع Excel العربي
  return BOM + lines.join("\r\n") + "\r\n";
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const blob = new Blob([toCsv(headers, rows)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
