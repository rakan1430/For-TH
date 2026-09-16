/**
 * اسم المستخدم المؤجَّل.
 *
 * ⚠️ الدرس: كان التسجيل يكتب صفّ `profiles` مباشرةً بعد `signUp`. وحين
 *    يكون «تأكيد البريد» مفعَّلاً لا تُعيد `signUp` جلسةً — فيجري الكتابة
 *    دورُ `anon`، فترفضه سياسة الصفوف، **ولم يكن أحدٌ يفحص الخطأ**. فيرى
 *    المستخدم «أُنشئ الحساب» ويكون اسمه قد ضاع. هذا هو النجاح الكاذب الذي
 *    يحذّر منه البند ٤: عمليةٌ تُعلن تمامها وقد فشل شطرها الثاني بصمت.
 *
 *    فالاسم يُحفظ هنا حتى تُوجد جلسةٌ حقيقية، ثم يُكتب ويُمحى. وإن ضاع
 *    التخزين (تصفّحٌ خاصّ، أو جهازٌ آخر) فالحلّ أدناه: `ensureProfile`
 *    تكتب صفّاً بالبريد كاسمٍ مؤقّت، فلا يبقى مستخدمٌ بلا ملفّ.
 */

const KEY = "for-th:pending-name";

export function stashName(name: string): void {
  try { localStorage.setItem(KEY, name); } catch { /* تخزينٌ ممنوع — لا بأس */ }
}

export function takeName(): string | null {
  try {
    const v = localStorage.getItem(KEY);
    if (v) localStorage.removeItem(KEY);
    return v;
  } catch { return null; }
}
