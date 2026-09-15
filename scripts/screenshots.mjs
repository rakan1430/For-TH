/**
 * لقطات الشاشات في متصفّحٍ حقيقيّ.
 *
 * «الواجهة تُفتح في متصفّح حقيقي بمقاسات حقيقية» — والبناء الناجح وفحص
 * الأنواع لا يقولان شيئاً عن الشكل. وقد كشف هذا السكربت فعلاً ثلاثة أشياء
 * لم يرها أي فحصٍ آخر: سياسة المحتوى تحجب نصّ ضبط السمة، و`frame-ancestors`
 * مهملةً في وسم <meta>، وصفوفاً تترك فراغاً واسعاً.
 *
 * التشغيل:
 *     cd app && npm i -D playwright     # غير مثبّتة افتراضياً
 *     VITE_DEMO=1 npx vite build && npx vite preview --port 4174 &
 *     node ../scripts/screenshots.mjs
 *
 * ⚠️ الخطوط من Google Fonts قد تُحجب داخل حاويات معزولة، فتظهر اللقطات
 *    بخطوطٍ بديلة. لا يُحكم على الطباعة منها.
 */
import { chromium } from "playwright";
const OUT = "/tmp/claude-0/-home-user-For-TH/277947b1-d576-5187-bfac-11a274d4c45d/scratchpad";
const errors = [];

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });

async function shot(name, { width, height }, steps) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, locale: "ar-SA" });
  const page = await ctx.newPage();
  page.on("console", (m) => { if (m.type() === "error") errors.push(`[${name}] ${m.text()}`); });
  page.on("pageerror", (e) => errors.push(`[${name}] PAGEERROR ${e.message}`));
  await page.goto("http://localhost:4174/", { waitUntil: "networkidle" });
  if (steps) await steps(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  await ctx.close();
}

const DESK = { width: 1280, height: 900 };
const PHONE = { width: 390, height: 844 };

// المعلّم — نظرة عامّة
await shot("01-teacher-overview", DESK);
// المعلّم — المحتوى
await shot("02-teacher-content", DESK, async (p) => {
  await p.getByRole("tab", { name: "المحتوى" }).click();
  await p.waitForTimeout(500);
});
// المعلّم — داخل بنك
await shot("03-bank-editor", DESK, async (p) => {
  await p.getByRole("tab", { name: "المحتوى" }).click();
  await p.waitForTimeout(500);
  await p.getByRole("button", { name: "فتح" }).first().click();
  await p.waitForTimeout(500);
});
// المعلّم — الطلبات
await shot("04-requests", DESK, async (p) => {
  await p.getByRole("tab", { name: "طلبات الاشتراك" }).click();
  await p.waitForTimeout(500);
});
// المعلّم — المجموعات
await shot("05-groups", DESK, async (p) => {
  await p.getByRole("tab", { name: "المجموعات" }).click();
  await p.waitForTimeout(500);
});
// الطالب — الجوّال
await shot("06-student-phone", PHONE, async (p) => {
  await p.getByRole("button", { name: "الطالب" }).click();
  await p.waitForTimeout(900);
});
// المعلّم — الجوّال
await shot("07-teacher-phone", PHONE, async (p) => {
  await p.getByRole("tab", { name: "المحتوى" }).click();
  await p.waitForTimeout(600);
});
// الوضع الفاتح
await shot("08-light", DESK, async (p) => {
  await p.getByRole("button", { name: /الوضع الفاتح|التبديل إلى الوضع الفاتح/ }).click();
  await p.waitForTimeout(500);
});

await browser.close();
console.log(errors.length ? "أخطاء وحدة التحكّم:\n" + errors.join("\n") : "لا أخطاء في وحدة التحكّم.");
