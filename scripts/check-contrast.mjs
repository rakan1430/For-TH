#!/usr/bin/env node
/**
 * قياس وضوح النصّ — البند ٢٠ من ملف الخبرات.
 *
 *   «زرّ أساسي أبيض على ذهبيّ بدا جميلاً، وقياسه أعطى تبايناً أقلّ من نصف
 *    الحدّ العالمي (4.5).»
 *
 * لا يُقدَّر الوضوح ولا يُستحسن بالنظر: يُقاس. يقرأ هذا الفاحص قيم الألوان من
 * `app/src/styles/tokens.css` نفسه — لا نسخةً ثانية منها تفترق عنه بصمت —
 * ويحسب نسبة التباين لكل زوجٍ في `scripts/contrast-pairs.json` في الوضعين.
 *
 * وللفاحص وضع تحقّقٍ من نفسه (`--self-test`) يثبت أنّه يرسب زوجاً رديئاً
 * فعلاً — البند ٢٢: «فحصٌ لا يلتقط شيئاً لا قيمة له حتى تُثبت أنّه يستطيع».
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TOKENS = join(root, "app/src/styles/tokens.css");
const PAIRS = join(root, "scripts/contrast-pairs.json");

/** يستخرج إعلانات المتغيّرات داخل كتلة محدّدة بمُحدِّدها. */
function readBlock(css, selector) {
  const at = css.indexOf(selector);
  if (at === -1) throw new Error(`لم يُعثر على الكتلة: ${selector}`);
  const open = css.indexOf("{", at);
  const close = css.indexOf("}", open);
  if (open === -1 || close === -1) throw new Error(`كتلة غير مغلقة: ${selector}`);
  const body = css.slice(open + 1, close);
  const vars = {};
  for (const m of body.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    vars[m[1]] = m[2];
  }
  return vars;
}

function parseThemes(css) {
  const dark = readBlock(css, ":root {");
  const light = { ...dark, ...readBlock(css, ':root[data-theme="light"]') };
  return { داكن: dark, فاتح: light };
}

function toRgb(hex) {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length === 8) h = h.slice(0, 6); // نتجاهل قناة الشفافية: القياس على لونٍ صريح
  if (h.length !== 6) throw new Error(`قيمة لون غير مفهومة: ${hex}`);
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

/** الإضاءة النسبية بصيغة WCAG 2.x */
function luminance(hex) {
  const [r, g, b] = toRgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

function measure(themes, pairs) {
  const rows = [];
  for (const [themeName, vars] of Object.entries(themes)) {
    for (const p of pairs) {
      const fg = vars[p.fg];
      const bg = vars[p.bg];
      // البند ١٦: متغيّر غير معرَّف لا يُتجاهَل بصمت — في CSS يُبطل الإعلان
      // كلّه، وهنا يُسقط الفحص. الفشل الصريح أرحم.
      if (!fg) throw new Error(`متغيّر غير معرَّف في الوضع ${themeName}: --${p.fg}`);
      if (!bg) throw new Error(`متغيّر غير معرَّف في الوضع ${themeName}: --${p.bg}`);
      const ratio = contrast(fg, bg);
      rows.push({ theme: themeName, ...p, fgHex: fg, bgHex: bg, ratio, pass: p.min ? ratio >= p.min : true });
    }
  }
  return rows;
}

function report(rows, { gating }) {
  const w = (s, n) => String(s).padEnd(n);
  let failed = 0;
  let current = "";
  for (const r of rows) {
    if (r.theme !== current) {
      current = r.theme;
      console.log(`\n  الوضع ${current}`);
      console.log("  " + "─".repeat(78));
    }
    if (!r.pass) failed++;
    const mark = gating ? (r.pass ? "نجح" : "رسب") : "قيس";
    const bar = gating ? `(الحدّ ${r.min})` : "(للعلم)";
    console.log(
      `  ${mark}  ${w(`--${r.fg} على --${r.bg}`, 32)} ` +
      `${w(r.ratio.toFixed(2), 7)} ${w(bar, 12)} ${r.use}`
    );
  }
  return failed;
}

const selfTest = process.argv.includes("--self-test");

const css = readFileSync(TOKENS, "utf8");
const themes = parseThemes(css);
const { gates, informational } = JSON.parse(readFileSync(PAIRS, "utf8"));

if (selfTest) {
  // ⚠️ البند ٢٢: نثبت أنّ الفاحص يصرخ فعلاً. نحقن زوجاً رديئاً معروفاً
  // (رمادي باهت على أبيض ≈ 1.6) ونتأكّد أنّه يُرصد رسوباً. ولو مرّ، فالفاحص
  // أعمى ولا قيمة لنجاحه في الحالة الطبيعية.
  const poison = { داكن: { ...themes.داكن, bad: "#CCCCCC", paper: "#FFFFFF" } };
  const probe = measure(poison, [{ fg: "bad", bg: "paper", min: 4.5, use: "زوج رديء مقصود" }]);
  const caught = probe.length === 1 && probe[0].pass === false;
  console.log(
    caught
      ? `تحقّق الفاحص من نفسه: رصد الزوج الرديء (${probe[0].ratio.toFixed(2)} < 4.5). الفحص ليس أعمى.`
      : "تحقّق الفاحص من نفسه: فشل — لم يرصد زوجاً رديئاً معروفاً."
  );
  if (!caught) process.exit(1);

  // وعكسه: يجب أن يُمرّر زوجاً ممتازاً، وإلا فهو يرسب كل شيء بلا تمييز.
  const ok = measure({ داكن: { good: "#000000", paper: "#FFFFFF" } }, [
    { fg: "good", bg: "paper", min: 4.5, use: "زوج ممتاز مقصود" },
  ]);
  if (!ok[0].pass) {
    console.log("تحقّق الفاحص من نفسه: فشل — أرسب زوجاً ممتازاً (21.00).");
    process.exit(1);
  }
  console.log("تحقّق الفاحص من نفسه: مرّر الزوج الممتاز (21.00). الفحص يميّز.\n");
}

console.log("أزواج تُرسِب البناء — نصوص وعناصر تفاعلية:");
const failed = report(measure(themes, gates), { gating: true });

console.log("\n\nأزواج تُقاس للعلم — لا يفرض معيار WCAG عليها حدّاً:");
report(measure(themes, informational), { gating: false });
console.log("");

if (failed) {
  console.error(`رسب ${failed} زوجاً. القيم أعلاه مقيسة لا مقدَّرة — أصلح اللون أو راجع المالك.`);
  process.exit(1);
}
console.log("كل الأزواج المُلزِمة نجحت.");
