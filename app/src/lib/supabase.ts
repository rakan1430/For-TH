import { createClient, type SupabaseClient } from "@supabase/supabase-js";

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

export const isConfigured = Boolean(url && publishableKey);

/**
 * إن لم يُضبط المشروع بعد، لا نُنشئ عميلاً بقيمٍ وهمية: عميلٌ بعنوانٍ خاطئ
 * يفشل بأخطاء شبكةٍ غامضة تبدو أعطالاً في الشفرة. والفشل الصريح أرحم.
 */
export const supabase: SupabaseClient | null = isConfigured
  ? createClient(url!, publishableKey!, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
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
