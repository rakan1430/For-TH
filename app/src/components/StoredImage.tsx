import { useEffect, useState } from "react";
import { signedUrl } from "../lib/api";

/**
 * صورةٌ من مخزنٍ مقيَّد.
 *
 * ⚠️ الدلاء الثلاثة **خاصّة** (`public = false`)، فلا رابط ثابت لأي ملفّ.
 *    والرابط يُوقَّع لحظة العرض ويُؤقَّت، فلا يصلح لمن نسخه بعد انتهائه —
 *    وهذا هو ما يمنع تسريب صور بنك الأسئلة برابطٍ يُتداول.
 *
 * ⚠️ والتوقيع **يُعاد مرّةً واحدة عند فشل التحميل**: اختبارٌ مؤقّتٌ بستّين
 *    دقيقة يتجاوز عمر الرابط، فتظهر صور الأسئلة الأخيرة مكسورةً للطالب في
 *    منتصف اختباره. وإعادة التوقيع بلا حدّ تصير حلقةً لا تنتهي على مسارٍ
 *    محذوف، فمرّةً واحدة ثمّ رسالة.
 */
const TTL_SECONDS = 3600;

export function StoredImage({ bucket, path, alt, maxHeight }: {
  bucket: string;
  path: string;
  alt: string;
  maxHeight?: number;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [retried, setRetried] = useState(false);

  useEffect(() => {
    let alive = true;
    setUrl(null); setFailed(false); setRetried(false);
    signedUrl(bucket, path, TTL_SECONDS)
      .then((u) => { if (alive) { if (u) setUrl(u); else setFailed(true); } })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [bucket, path]);

  if (failed) {
    return <span className="subtle">تعذّر عرض الصورة.</span>;
  }
  if (!url) {
    return <span className="subtle">…</span>;
  }
  return (
    <img
      src={url}
      alt={alt}
      loading="lazy"
      style={{ maxWidth: "100%", height: "auto", maxHeight, borderRadius: "var(--radius)" }}
      onError={() => {
        if (retried) { setFailed(true); return; }
        setRetried(true);
        signedUrl(bucket, path, TTL_SECONDS)
          .then((u) => (u ? setUrl(u) : setFailed(true)))
          .catch(() => setFailed(true));
      }}
    />
  );
}
