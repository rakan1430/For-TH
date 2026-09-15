import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// ملفّ الإعداد يعمل في Node لا في المتصفّح. تعريفٌ موضعيّ بدل حزمة أنواعٍ
// كاملة من أجل سطرٍ واحد.
declare const process: { env: Record<string, string | undefined> };

/*
 * بناءٌ للنشر كصفحةٍ مستقلّة (Artifact): مساراتٌ نسبية بالكامل، وأسماء ملفّات
 * ثابتة بلا بصمة، وبلا خرائط مصدر — لأنّ الصفحة تُرفع ملفّاً ملفّاً بأسمائها.
 */
const ARTIFACT = process.env.VITE_ARTIFACT === "1";

export default defineConfig({
  /*
   * ⚠️ الجذر يأتي من البيئة لا مثبّتاً في الشفرة.
   *    الاستضافة على نطاقٍ كامل تخدم من «/»، وصفحات GitHub تخدم من
   *    «/For-TH/». ومسارٌ مثبّت يعمل في أحدهما ويكسر الآخر بصمت: تُحمَّل
   *    الصفحة ولا تُحمَّل حزمتها، فتظهر بيضاء بلا رسالة خطأ ظاهرة.
   */
  base: ARTIFACT ? "./" : process.env.VITE_BASE || "/",
  plugins: [react()],
  build: {
    target: "es2022",
    sourcemap: !ARTIFACT,
    ...(ARTIFACT
      ? {
          rollupOptions: {
            output: {
              entryFileNames: "assets/app.js",
              chunkFileNames: "assets/[name].js",
              assetFileNames: "assets/app[extname]",
            },
          },
        }
      : {}),
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
