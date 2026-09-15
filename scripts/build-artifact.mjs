#!/usr/bin/env node
/**
 * يحوّل صفحة البناء إلى صفحةٍ تصلح للنشر داخل غلافٍ خارجي.
 *
 * ⚠️ الغلاف يوفّر `<!doctype>` و`<html>` و`<head>` و`<body>` بنفسه، فلا
 *    يجوز أن تحويها الصفحة. ولمّا كان وسم `<html>` ليس لنا، انتقل ضبط
 *    `dir="rtl"` و`lang` إلى `theme-init.js` — وبدونه ينقلب التخطيط كلّه.
 *
 * ⚠️ وتُحذف سياسة المحتوى من الوسم: للمضيف سياسته، وسياستان تتنازعان تحجبان
 *    ما لا يُقصد حجبه — وبصمت، كعادة هذا الصنف من الأعطال.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(join(ROOT, "app/dist/index.html"), "utf8");

let html = src;
// الرؤوس التي يوفّرها الغلاف
html = html.replace(/<!doctype html>/i, "");
html = html.replace(/<html[^>]*>/i, "").replace(/<\/html>/i, "");
html = html.replace(/<head>/i, "").replace(/<\/head>/i, "");
html = html.replace(/<body>/i, "").replace(/<\/body>/i, "");
// ما لا معنى له هنا، أو ما يتنازع مع المضيف
html = html.replace(/<meta charset[^>]*>/i, "");
html = html.replace(/<meta name="viewport"[^>]*>/i, "");
html = html.replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?\/>/i, "");
html = html.replace(/<link rel="manifest"[^>]*>/i, "");
// تعليقات البناء الطويلة لا تُنشر
html = html.replace(/<!--[\s\S]*?-->/g, "");
// أسطر فارغة متتالية
html = html.split("\n").map((l) => l.trimEnd()).filter((l, i, a) => l !== "" || a[i - 1] !== "").join("\n");

const out = join(ROOT, "app/dist/artifact.html");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html.trim() + "\n", "utf8");

for (const bad of ["<html", "<head", "<body", "<!doctype"]) {
  if (html.toLowerCase().includes(bad)) throw new Error(`بقي وسمٌ يوفّره الغلاف: ${bad}`);
}
console.log(`كُتبت: ${out}`);
