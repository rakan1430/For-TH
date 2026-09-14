import { Brand } from "../components/Logo";
import { Notice } from "../components/ui";

/**
 * تُعرض حين لا يكون مشروع Supabase مضبوطاً بعد.
 * ⚠️ شاشةٌ صريحة خيرٌ من عميلٍ بقيمٍ وهمية يفشل بأخطاء شبكةٍ غامضة تبدو
 *    أعطالاً في الشفرة.
 */
export function Setup() {
  return (
    <div className="page stack">
      <Brand />
      <h1>المنصّة لم تُربط بقاعدة بيانات بعد</h1>
      <Notice kind="info">
        <p className="stack-s">
          هذه نسخة التطوير. لتشغيلها فعلياً يلزم مشروع Supabase خاصّ بهذه
          المنصّة — <strong>جديد ومستقلّ</strong>، لا يشارك أي مشروعٍ آخر
          قاعدةً ولا حسابات.
        </p>
      </Notice>
      <div className="card stack-s">
        <h2>الخطوات</h2>
        <ol className="stack-s" style={{ paddingInlineStart: "var(--u)" }}>
          <li>أنشئ مشروع Supabase جديداً.</li>
          <li>
            طبّق المهاجرات بالترتيب من <code>supabase/migrations/</code>.
          </li>
          <li>
            أضف المعلّم مرّةً واحدة بـSQL:
            <pre className="mono card" style={{ overflowX: "auto", marginTop: "var(--u-qtr)" }}>
{`insert into private.teachers (user_id)
values ('<معرّف المستخدم>');`}
            </pre>
          </li>
          <li>
            انسخ <code>.env.example</code> إلى <code>.env</code> واملأ:
            <pre className="mono card" style={{ overflowX: "auto", marginTop: "var(--u-qtr)" }}>
{`VITE_SUPABASE_URL=https://xxxx.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=...`}
            </pre>
          </li>
        </ol>
        {/* تحذيرٌ يُميَّز بالقلم الأحمر، لا بإيموجي: «لا إيموجي إطلاقاً». */}
        <p className="notice notice--error subtle" style={{ margin: 0 }}>
          لا تضع مفتاح الخدمة (service role) في أي متغيّر يبدأ بـ
          <code> VITE_</code> — كل ما يبدأ بذلك يُحقن في الحزمة المنشورة
          ويقرأه أي زائر.
        </p>
      </div>
    </div>
  );
}
