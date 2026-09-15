/**
 * نقل عنصرٍ داخل قائمة.
 *
 * ⚠️ منطقٌ صغير وسهل الخطأ: النقل **للأسفل** يزيح ما بعده بعد الاقتطاع،
 *    فتُحسب الوجهة على قائمةٍ صارت أقصر بواحد. وأكثر تنفيذات السحب المكسورة
 *    تخطئ هنا بواحد، فيقع العنصر قبل موضعه المقصود أو بعده — ويبدو الأمر
 *    «تقريباً صحيح» فلا يُلاحَظ إلا بعد أن يشتكي المستخدم.
 *
 *    فأُخرج إلى دالّةٍ خالصة تُفحص وحدها، بدل أن يبقى داخل معالج حدثٍ لا
 *    يُفحص إلا بإصبعٍ على شاشة.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to) return items.slice();
  if (from < 0 || from >= items.length) return items.slice();
  if (to < 0 || to >= items.length) return items.slice();

  const next = items.slice();
  const [moved] = next.splice(from, 1);
  if (moved === undefined) return items.slice();
  next.splice(to, 0, moved);
  return next;
}

/** هل اختلف الترتيب فعلاً؟ — فلا نُرسل إلى الخادم ضغطةً بلا سحب. */
export function orderChanged<T>(a: readonly T[], b: readonly T[], key: (x: T) => string): boolean {
  if (a.length !== b.length) return true;
  return a.some((item, i) => key(item) !== key(b[i]!));
}
