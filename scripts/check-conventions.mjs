#!/usr/bin/env node
/**
 * فحوصٌ ساكنة تحرس دروساً كلّفت وقتاً في مشروعٍ سابق.
 *
 * كلّها من نوعٍ واحد: خطأٌ **لا يُنتج رسالة خطأ**. متغيّر لونٍ باسمٍ خاطئ
 * يُبطل الخاصيّة بصمت، وتاريخٌ بمحلّيةٍ ناقصة يظهر سليماً وهو خطأ، ومفتاحُ
 * خدمةٍ في المتصفّح يعمل تماماً — حتى يقرأه أحد.
 *
 * ⚠️ ولكل فحصٍ هنا تحقّقٌ من نفسه (`--self-test`) يُثبت أنّه يرسب حالةً
 *    سيّئة معروفة. البند ٢٢: «فحصٌ لا يلتقط شيئاً لا قيمة له حتى تُثبت
 *    أنّه يستطيع.»
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, dirname, relative, extname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF_TEST = process.argv.includes("--self-test");

/* ------------------------------ أدوات ----------------------------------- */

function walk(dir, exts, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".git" || entry === "dist") continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, exts, out);
    else if (exts.includes(extname(p))) out.push(p);
  }
  return out;
}

/**
 * ⚠️ تُحذف التعليقات قبل الفحص. ملفّات هذا المشروع تشرح الدروس في تعليقاتٍ
 *    تذكر الأنماط الخطأ بنصّها («لا تكتب `::-webkit-scrollbar`»)، فلو فُحص
 *    النصّ الخام لأرسبَ الشرحُ نفسه البناءَ — ولَحُذفت التعليقات إرضاءً
 *    للفاحص، وضاع الدرس. الفاحص يخدم الشفرة لا العكس.
 */
function stripComments(text, kind) {
  // نستبدل التعليق بأسطرٍ فارغة بعدد أسطره، فتبقى أرقام الأسطر مطابقةً
  // للملفّ الأصلي. فاحصٌ يشير إلى السطر الخطأ يُرسل قارئه في رحلةٍ عبثية.
  const blank = (m) => "\n".repeat((m.match(/\n/g) ?? []).length);
  let out = text;
  if (kind === "html") out = out.replace(/<!--[\s\S]*?-->/g, blank);
  return out
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const problems = [];
const report = (check, file, line, msg) =>
  problems.push({ check, file: relative(ROOT, file), line, msg });

/* ===========================================================================
   ١) متغيّرات CSS: كل `var(--x)` بلا قيمةٍ احتياطية يجب أن يكون معرَّفاً.

   البند ١٦: «`var()` لا تجد قيمتها **تُبطل الإعلان كلّه**، فيعود لقيمته
   الابتدائية — أي بلا خلفية إطلاقاً، لا لونٍ افتراضي.» وقعت في شريطٍ مثبَّت
   بعرض الشاشة خلفيته متغيّرٌ بالاسم الخطأ، فظهر مستطيلاً شفّافاً فوق كل شيء.

   ولا نُرسب `var(--x, fallback)`: القيمة الاحتياطية تمنع المشكلة أصلاً.
   =========================================================================== */
function checkCssVars(cssFiles, tokensSource) {
  const defined = new Set(
    [...tokensSource.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1])
  );
  for (const file of cssFiles) {
    const text = stripComments(readFileSync(file, "utf8"), "css");
    // نتجاهل أسماءً تُضبط سطرياً من JS (تُستعمل دائماً مع قيمةٍ احتياطية)
    text.split("\n").forEach((line, i) => {
      for (const m of line.matchAll(/var\(\s*(--[^\s,)]+)\s*\)/g)) {
        if (!defined.has(m[1])) {
          report("متغيّرات CSS", file, i + 1,
            `\`${m[1]}\` غير معرَّف — و\`var()\` بلا قيمة تُبطل الإعلان كلّه بصمت`);
        }
      }
    });
  }
  return defined;
}

/* ===========================================================================
   ٢) لا قواعد `::-webkit-scrollbar-*` مع ضبط `scrollbar-color`.

   البند ١٥: «`scrollbar-color` القياسية إن ضُبطت **يتجاهل كروم الحديث**
   قواعد `::-webkit-scrollbar-*` بالكامل — فمحاولة إصلاحها بها شفرة ميتة.»
   وشفرةٌ ميتة تُقرأ على أنّها علاجٌ قائم، فيُبحث عن العلّة في مكانٍ آخر.
   =========================================================================== */
function checkScrollbarRules(cssFiles) {
  const usesStandard = cssFiles.some((f) => /scrollbar-color\s*:/.test(readFileSync(f, "utf8")));
  if (!usesStandard) return;
  for (const file of cssFiles) {
    stripComments(readFileSync(file, "utf8"), "css").split("\n").forEach((line, i) => {
      if (line.includes("::-webkit-scrollbar")) {
        report("شريط التمرير", file, i + 1,
          "قاعدة webkit مع ضبط `scrollbar-color` — يتجاهلها كروم الحديث، فهي شفرة ميتة");
      }
    });
  }
}

/* ===========================================================================
   ٣) سمة العرض على `html` لا على `body`.

   البند ١٥ — أُهدرت أسابيع بسببه: شريط تمرير الصفحة يُرسم من `html`.
   =========================================================================== */
function checkThemeTarget(tsFiles) {
  for (const file of tsFiles) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (/document\.body\S*\.(setAttribute|classList)\s*[.(]/.test(line) &&
          /theme|dark|light|سمة/i.test(line)) {
        report("السمة", file, i + 1,
          "السمة تُكتب على `body` — موضعها `documentElement` (أي `html`)");
      }
    });
  }
}

/* ===========================================================================
   ٤) لا تنسيق تاريخٍ خارج `lib/format.ts`.

   البند ١٧: المحلّية الناقصة تعطي تقويماً و/أو أرقاماً غير المقصودة، بلا أي
   رسالة خطأ. «وموعدٌ يُفهم خطأً أسوأ من موعدٍ لا يظهر.»
   =========================================================================== */
const DATE_API = /\.toLocaleDateString\s*\(|\.toLocaleTimeString\s*\(|\.toLocaleString\s*\(|new\s+Intl\.DateTimeFormat\s*\(/;

function checkLocaleUsage(tsFiles) {
  for (const file of tsFiles) {
    const rel = relative(ROOT, file);
    if (rel.endsWith("lib/format.ts")) continue;          // المصدر المعتمد
    if (rel.includes(".test.")) continue;                  // الفحوص تقارن عمداً
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (DATE_API.test(line)) {
        report("التاريخ", file, i + 1,
          "تنسيق تاريخٍ خارج `lib/format.ts` — استعمل formatDate/formatDateTime");
      }
    });
  }
}

/* ===========================================================================
   ٥) لا مفتاح خدمةٍ في شفرة المتصفّح.

   «مفتاح الخدمة (service role) لا يُوضع في المتصفّح أبداً» — وهو يتجاوز
   سياسات الصفوف كلّها. وكل متغيّرٍ يبدأ بـ`VITE_` يُحقن في الحزمة المنشورة.
   =========================================================================== */
function checkSecrets(tsFiles) {
  for (const file of tsFiles) {
    readFileSync(file, "utf8").split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;         // التحذيرات في التعليقات مطلوبة
      if (/VITE_[A-Z_]*SERVICE/i.test(line) || /service_role\s*[:=]/i.test(line)) {
        report("الأسرار", file, i + 1, "إشارةٌ إلى مفتاح الخدمة في شفرة المتصفّح");
      }
      // رمز JWT مكتوبٌ حرفياً
      if (/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/.test(line)) {
        report("الأسرار", file, i + 1, "رمزٌ مكتوب حرفياً في الشفرة");
      }
    });
  }
}

/* ===========================================================================
   ٦) لا إيموجي في الواجهة المبنيّة.

   «الأيقونات SVG خطّي… **لا إيموجي إطلاقاً**.» ونفحص **الحزمة المبنيّة** لا
   المصدر: البناء يحذف التعليقات، فما يبقى فيها نصٌّ يصل المستخدم فعلاً —
   وتحذيرات ⚠️ في تعليقات المصدر لا تُحسب علينا.
   =========================================================================== */
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}\u{2600}-\u{27BF}\u{FE0F}]/u;

function checkNoEmojiInBundle() {
  const dist = join(ROOT, "app/dist");
  if (!existsSync(dist)) {
    console.log("  (تخطّي فحص الإيموجي: لا حزمة مبنيّة. شغّل `npm run build` أوّلاً.)");
    return;
  }
  for (const file of walk(dist, [".js", ".css", ".html"])) {
    const raw = readFileSync(file, "utf8");
    const text = stripComments(raw, file.endsWith(".html") ? "html" : "css");
    text.split("\n").forEach((line, i) => {
      const m = line.match(EMOJI);
      if (m) report("الإيموجي", file, i + 1, `إيموجي في الحزمة المنشورة: ${m[0]}`);
    });
  }
}

/* ------------------------------ التشغيل --------------------------------- */

const cssFiles = walk(join(ROOT, "app/src"), [".css"]);
const tsFiles = walk(join(ROOT, "app/src"), [".ts", ".tsx"]);
const tokens = readFileSync(join(ROOT, "app/src/styles/tokens.css"), "utf8");

if (SELF_TEST) {
  console.log("تحقّق الفحوص من نفسها:\n");
  let ok = true;

  const probe = (label, fn) => {
    const before = problems.length;
    fn();
    const caught = problems.length > before;
    problems.length = before;
    console.log(`  ${caught ? "✓" : "✗"} ${label}`);
    if (!caught) ok = false;
  };

  // نكتب حالاتٍ سيّئة إلى ملفٍّ مؤقّت ونتأكّد أنّ كل فحصٍ يصرخ
  const tmp = join(ROOT, "scripts/.selftest");
  const { mkdirSync, writeFileSync, rmSync } = await import("node:fs");
  mkdirSync(tmp, { recursive: true });

  const badCss = join(tmp, "bad.css");
  writeFileSync(badCss, ".x { background: var(--اسم-غير-موجود); }\n::-webkit-scrollbar { width: 8px; }\n");
  probe("متغيّر CSS غير معرَّف يُرصد", () => checkCssVars([badCss], tokens));
  probe("قاعدة webkit للتمرير تُرصد", () => checkScrollbarRules([badCss, join(ROOT, "app/src/styles/base.css")]));

  const badTs = join(tmp, "bad.ts");
  writeFileSync(badTs,
    'document.body.setAttribute("data-theme", "dark");\n' +
    'const s = d.toLocaleDateString("ar-SA");\n' +
    'const k = "service_role: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.abcdefghijklmnopqrstuvwxyz";\n');
  probe("كتابة السمة على body تُرصد", () => checkThemeTarget([badTs]));
  probe("تنسيق تاريخٍ خارج format.ts يُرصد", () => checkLocaleUsage([badTs]));
  probe("مفتاح خدمةٍ أو رمزٌ حرفيّ يُرصد", () => checkSecrets([badTs]));

  // وعكسه: يجب ألّا ترسب الشفرة السليمة
  const cleanBefore = problems.length;
  checkCssVars(cssFiles, tokens);
  checkScrollbarRules(cssFiles);
  checkThemeTarget(tsFiles);
  checkLocaleUsage(tsFiles);
  checkSecrets(tsFiles);
  const falsePositives = problems.length - cleanBefore;
  problems.length = cleanBefore;
  console.log(`  ${falsePositives === 0 ? "✓" : "✗"} الشفرة السليمة تمرّ بلا إنذارٍ كاذب`);
  if (falsePositives !== 0) ok = false;

  rmSync(tmp, { recursive: true, force: true });
  console.log("");
  if (!ok) { console.error("فحصٌ واحدٌ على الأقلّ أعمى."); process.exit(1); }
}

checkCssVars(cssFiles, tokens);
checkScrollbarRules(cssFiles);
checkThemeTarget(tsFiles);
checkLocaleUsage(tsFiles);
checkSecrets(tsFiles);
checkNoEmojiInBundle();

if (problems.length === 0) {
  console.log("فحوص الاتّفاقيات: كلّها سليمة.");
} else {
  console.error(`\nفحوص الاتّفاقيات: ${problems.length} مخالفة\n`);
  for (const p of problems) {
    console.error(`  [${p.check}] ${p.file}:${p.line}\n      ${p.msg}`);
  }
  process.exit(1);
}
