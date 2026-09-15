/*
 * اختيار السمة قبل أوّل رسم — وإلّا ومض الفاتح لحظةً ثم صار داكناً.
 *
 * ⚠️ ولماذا ملفٌّ منفصل لا نصٌّ داخل الصفحة؟
 *    لأنّ سياسة المحتوى (`script-src 'self'`) **ترفض النصوص السطرية**، وكان
 *    هذا النصّ سطرياً فحجبته السياسة بصمت: تعمل الصفحة، ويعمل التبديل، ولا
 *    يظهر خطأ إلّا في وحدة التحكّم — بينما من اختار الفاتح يرى ومضةً داكنة
 *    في كل فتحة. كشفه فتحُ الصفحة في متصفّحٍ حقيقيّ، لا البناء ولا الأنواع.
 *
 *    وهذا هو البند ١٤ بعينه: «سياسة صارمة تحجب شيئاً، والعلّة ليست فيما
 *    تظنّه». والحلّ ملفٌّ من الموقع نفسه — لا `'unsafe-inline'` الذي يفتح
 *    الباب لكل نصٍّ سطريّ في الصفحة.
 *
 * ⚠️ والافتراضي **داكن** بقرار المالك — لا «حسب النظام».
 */
(function () {
  /*
   * لغة الصفحة واتّجاهها.
   * في البناء العاديّ يضبطهما وسم <html> في `index.html`. أمّا حين تُنشر
   * الصفحة داخل غلافٍ لا نملك وسم <html> فيه، فلا سبيل إلّا ضبطهما هنا —
   * وبدون `dir="rtl"` ينقلب التخطيط كلّه إلى اليسار.
   */
  var root = document.documentElement;
  if (root.getAttribute("dir") !== "rtl") root.setAttribute("dir", "rtl");
  if (!root.getAttribute("lang")) root.setAttribute("lang", "ar");

  try {
    var saved = localStorage.getItem("theme");
    document.documentElement.setAttribute("data-theme", saved === "light" ? "light" : "dark");
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "dark");
  }
})();
