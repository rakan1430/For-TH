import { DEMO, supabase } from "./supabase";

/**
 * عدّاد «المتصلون الآن» — حضورٌ حيّ لا عدّ زيارات.
 *
 * طلب المالك: «يريد أن يتمكّن من رؤية عدد الطلّاب الحيّ في الموقع». والفرق
 * جوهريّ: هذا يقول **من عنده الموقع مفتوحٌ هذه اللحظة**، ويهبط حين يُغلق
 * أحدهم صفحته. لا «كم زيارةً وصلت منذ البداية».
 *
 * ⚠️ ولا سؤالٌ دوريّ للخادم (ملحق العدّاد §٢): كل متصفّحٍ مفتوح يسأل كل
 *    ثلاثين ثانية = حِملٌ دائم، وبطاريةٌ تُستهلك على جهاز الطالب، وتأخّرٌ
 *    ثلاثون ثانية قبل أن يظهر من دخل. الحضور المدمج يبثّ التغيّر فوراً
 *    عبر اتصالٍ واحدٍ قائم.
 *
 * ⚠️⚠️ **العدّاد زينةٌ لا حارس.** لا يُبنى عليه قرارٌ ولا يُقرأ كإشارة
 *      صلاحية: قناة الحضور مفتوحةٌ لكل من يحمل رمزاً صالحاً، فالرقم
 *      يقبل التضخيم من خارج الواجهة. وهو مقبولٌ لأنّه لا يحرس شيئاً —
 *      ولو حرس لكان عطلاً.
 *
 * ⚠️ وعند أي فشل (شبكة، أو Realtime غير مفعَّل) يبقى الرقم على البديل
 *    الآمن ولا تظهر رسالة خطأ: «لا يجوز أن يتعطّل الموقع كلّه مع ميزةٍ
 *    جانبية» (§٣-ج).
 */

/** غرفةٌ واحدة للموقع كلّه: من في الغرفة هم المتصلون. */
const ROOM = "itqan-presence";

/** البديل الآمن: أنت على الأقلّ. صفرٌ كذبٌ ورقمٌ مكسور أسوأ. */
export const FALLBACK = 1;

/**
 * عدد الحاضرين من حالة الحضور.
 *
 * ⚠️ المفاتيح **معرّفات المستخدمين** لا معرّفات الجلسات: من فتح الموقع على
 *    هاتفه وحاسوبه شخصٌ واحد لا اثنان (§٣-أ).
 */
export function countFromState(state: Record<string, unknown> | null | undefined): number {
  if (!state) return FALLBACK;
  const n = Object.keys(state).length;
  return n > 0 ? n : FALLBACK;
}

type Listener = (n: number) => void;

let initialized = false;
let current = FALLBACK;
let channel: { unsubscribe: () => void } | null = null;
const listeners = new Set<Listener>();

function emit(n: number): void {
  if (n === current) return;
  current = n;
  listeners.forEach((fn) => fn(n));
}

/**
 * يبدأ تسجيل الحضور مرّةً واحدة لكل جلسة.
 *
 * ⚠️ الحارس `initialized` لازم لا تحسين (§٤): بدونه تُنشأ قناةٌ فوق قناة
 *    كلّما أُعيد رسم المكوّن — تسريب اتصالاتٍ وعدٌّ مضاعف لنفس الشخص.
 *
 * ⚠️ ويشترك **كل من دخل** لا المعلّم وحده: لو لم يسجّل الطلّاب حضورهم لما
 *    عدّ المعلّم إلّا نفسه. الاشتراك شيء، وعرضُ الرقم شيءٌ آخر — والرقم
 *    لا يُعرض إلّا للمعلّم.
 */
export function startPresence(userId: string): void {
  if (initialized || !userId) return;
  initialized = true;

  // وضع العرض: رقمٌ ثابت مفتعَل كبقيّة أرقام الشاشة، والشريط يعلن أنّها تجريبية.
  if (DEMO) { emit(3); return; }

  try {
    const sb = supabase;
    if (!sb) return;
    const ch = sb.channel(ROOM, { config: { presence: { key: userId } } });
    channel = ch;
    ch.on("presence", { event: "sync" }, () => {
      emit(countFromState(ch.presenceState() as unknown as Record<string, unknown>));
    }).subscribe((status: string) => {
      if (status !== "SUBSCRIBED") return;
      // ⚠️ لا اسم ولا بريد في الحمولة: الغرفة يقرؤها كل من فيها، ولا حاجة
      //    لأكثر من «أنا هنا».
      void ch.track({ at: new Date().toISOString() });
    });
  } catch (e) {
    // للمطوّر في وحدة التحكّم، لا للطالب على الشاشة
    console.error("تعذّر تفعيل الحضور اللحظي:", e);
  }
}

/**
 * ⚠️ يُستدعى عند الخروج: لولاه لبقي مفتاح المستخدم السابق مسجَّلاً، ثمّ
 *    مُنع من دخل بعده من التسجيل لأنّ الحارس مرفوع.
 */
export function stopPresence(): void {
  try { channel?.unsubscribe(); } catch { /* الإغلاق لا يُفشل شيئاً */ }
  channel = null;
  initialized = false;
  emit(FALLBACK);
}

/** يشترك في الرقم، ويستلم آخر قيمةٍ معروفة فوراً. */
export function onOnline(fn: Listener): () => void {
  listeners.add(fn);
  fn(current);
  return () => { listeners.delete(fn); };
}
