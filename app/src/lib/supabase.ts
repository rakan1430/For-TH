import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import { makeDemoClient } from "./demo-client";

/**
 * عميل قاعدة البيانات.
 *
 * ⚠️ «أي سرّ توضع قيمته في شفرة المتصفّح **ليس سرّاً**. من يفتح أدوات المطوّر
 *    يقرأه.» والمفتاح أدناه **معلَن** (publishable) ومصمَّمٌ لذلك: لا يمنح
 *    شيئاً بذاته، والحراسة كلّها في سياسات الصفوف وصلاحيات الدوالّ.
 *
 * ⚠️⚠️ ومفتاح الخدمة (service role) **لا يوضع في المتصفّح أبداً**، ولا في
 *      متغيّرٍ يبدأ بـ`VITE_` — فكل ما يبدأ بذلك يُحقن في الحزمة المنشورة.
 *      ويفحص `scripts/check-env.mjs` أن لا مفتاح خدمة تسلّل إلى الشفرة.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/**
 * وضع العرض — بناءٌ منفصل ببيانات في المتصفّح وحده، لرؤية الشكل قبل أن
 * يُنشأ مشروع القاعدة.
 *
 * ⚠️ لا يُفعَّل إلا بـ`VITE_DEMO=1` **صراحةً عند البناء**. وما دام الرابط
 *    والمفتاح مضبوطين فالبناء العاديّ يتجاهله تماماً. ويعلن الشريط في أعلى
 *    الصفحة أنّ البيانات تجريبية، فلا يُظنّ عرضٌ إنتاجاً.
 */
export const DEMO = import.meta.env.VITE_DEMO === "1";

export const isConfigured = DEMO || Boolean(url && publishableKey);

/**
 * إن لم يُضبط المشروع بعد، لا نُنشئ عميلاً بقيمٍ وهمية: عميلٌ بعنوانٍ خاطئ
 * يفشل بأخطاء شبكةٍ غامضة تبدو أعطالاً في الشفرة. والفشل الصريح أرحم.
 */
export const supabase: SupabaseClient | null = DEMO
  ? (makeDemoClient() as unknown as SupabaseClient)
  : isConfigured
    ? createClient(url!, publishableKey!, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          /*
           * ⚠️ `pkce` صراحةً — والافتراضي `implicit`، وهو خطأٌ هنا لسببين:
           *
           *    ١· يُعيد `implicit` **رمز الوصول نفسه في شذرة الرابط**
           *       (`#access_token=…`). والشذرة موضع مسارات هذا التطبيق
           *       (`#/teacher`)، فيتصادمان. والأسوأ أنّ الرمز يستقرّ في
           *       تاريخ المتصفّح وفي كل رابطٍ يُنسخ من شريط العنوان.
           *    ٢· `pkce` يُعيد **رمزاً للتبادل مرّةً واحدة** لا يُقبل إلّا
           *       مع مُتحقّقٍ مخزَّنٍ في المتصفّح ذاته. فمن سرق الرابط لم
           *       يسرق شيئاً.
           */
          flowType: "pkce",
        },
      })
    : null;

export function requireClient(): SupabaseClient {
  if (!supabase) {
    throw new Error(
      "لم يُضبط مشروع Supabase بعد. انسخ `.env.example` إلى `.env` واملأ " +
        "VITE_SUPABASE_URL و VITE_SUPABASE_PUBLISHABLE_KEY."
    );
  }
  return supabase;
}

/* ===========================================================================
   الجلسة: مستمعٌ يُسجَّل **فور إنشاء العميل**، وطابورٌ يُصرَف عند الجاهزية

   ⚠️ عطلٌ وقع في الإنتاج (ملحق Google، القسم ٩-أ و٩-ب): عميل المصادقة
      يبدأ معالجة الرابط **فور إنشائه**، وقد يُطلق حدث «سُجّل الدخول» قبل
      أن يسجّل React مستمعه داخل `useEffect`. فيضيع الحدث، ويعمل الدخول
      على جهازٍ ويفشل على آخر **حسب سرعة التحميل** — وهو أسوأ أنواع
      الأعطال: متقطّعٌ لا يُعاد إنتاجه عند من يصلحه.

   ⚠️ فالتسجيل هنا، في نفس الوحدة وفي نفس اللحظة التي يُنشأ فيها العميل.
      وآخر جلسةٍ معروفة تُحفظ، فمن اشترك متأخّراً تصله فوراً — وهذا هو
      «الطابور» بأبسط صوره: لا حدث يُفقد لأنّ أحداً لم يكن يستمع بعد.
   =========================================================================== */

type Listener = (s: Session | null) => void;

const listeners = new Set<Listener>();
let known: { session: Session | null } | null = null;   // null = لم تُعرف بعد

function publish(s: Session | null) {
  known = { session: s };
  for (const fn of [...listeners]) fn(s);
}

if (supabase) {
  supabase.auth.onAuthStateChange((_event, s) => publish(s));
  void supabase.auth.getSession().then(({ data }) => {
    if (!known) publish(data.session ?? null);
  });
}

/**
 * يشترك في تغيّر الجلسة، ويستدعي المشترك فوراً بآخر جلسةٍ معروفة إن وُجدت.
 * يُعيد دالّة إلغاء الاشتراك.
 */
export function onSession(fn: Listener): () => void {
  listeners.add(fn);
  if (known) fn(known.session);
  return () => { listeners.delete(fn); };
}

/** هل عُرفت الجلسة بعد؟ تُميّز «لا أحد داخل» عن «لم نعرف بعد». */
export function sessionKnown(): boolean {
  return known !== null;
}
