import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { DEMO, isConfigured, onSession, supabase } from "./lib/supabase";
import { readNext, stripNext } from "./lib/oauth";
import {
  amITeacher, activeTracks, ensureProfile, getMyProfile, isProfileComplete, mySubscriptions,
} from "./lib/api";
import { takeName } from "./lib/pending-name";
import { pickName } from "./lib/profile-name";
import type { Profile, Subscription, Track } from "./lib/types";
import { match, navigate, useRoute } from "./lib/router";
import { Brand } from "./components/Logo";
import { Empty, Notice, ThemeToggle } from "./components/ui";
import { Setup } from "./screens/Setup";
import { ProfileSetup } from "./screens/ProfileSetup";
import { DemoBanner } from "./components/DemoBanner";
import { Auth } from "./screens/Auth";
import { Plans } from "./screens/Plans";
import { Subscribe } from "./screens/Subscribe";
import { Student } from "./screens/Student";
import { QuizRunner } from "./screens/QuizRunner";
import { Teacher } from "./screens/Teacher";
import { Account } from "./screens/Account";

export default function App() {
  const route = useRoute();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [complete, setComplete] = useState(true);
  /*
   * ⚠️ «لم تُقرأ بعد» ≠ «لا توجد». ولولا هذا العلم لرُسمت الشاشات ببياناتٍ
   *    فارغة قبل وصولها: المعلّم يُرسم طالباً للحظة، وشاشة «حسابي» تُفتح
   *    بحقولٍ خاوية — فمن ضغط «حفظ» قبل وصول القراءة **محا اسمه ومدرسته
   *    بفراغ**. نموذجٌ يُملأ من بياناتٍ لم تصل بعد بابُ فقدٍ لا وميضُ عرض.
   */
  const [loaded, setLoaded] = useState(false);
  const [track, setTrack] = useState<Track>("qudurat");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    /*
     * ⚠️ المستمع مسجَّلٌ في `lib/supabase` **لحظة إنشاء العميل** لا هنا،
     *    لأنّ العميل يبدأ معالجة الرابط فوراً وقد يُطلق الحدث قبل أن يصل
     *    React. و`onSession` تُعيد آخر جلسةٍ معروفة للمشترك المتأخّر —
     *    فلا يضيع حدثٌ لأنّ أحداً لم يكن يستمع بعد.
     */
    return onSession((s) => { setSession(s); setReady(true); });
  }, []);

  /*
   * العودة من Google: المسار محمولٌ في `?next=` لا في الشذرة (تصادمها مع
   * رموز الجلسة موثَّق في ملحق Google §٢). يُستهلك مرّةً ثمّ يُمحى من
   * الرابط — و`code` تبقى ليقرأها عميل المصادقة ويُبادلها بجلسة.
   */
  useEffect(() => {
    const next = readNext(window.location.search);
    if (!next) return;
    window.history.replaceState({}, "", stripNext(window.location.href));
    navigate(next);
  }, []);

  /*
   * ⚠️ المفتاح `userId` لا `session`: عميل المصادقة يُجدّد الرمز دورياً
   *    ويُطلق الحدث بكائن جلسةٍ **جديد** في كل مرّة. ولو كان المفتاح
   *    الكائن نفسه لأُعيد جلب كل شيء كلّما جُدّد الرمز — فيومض المحتوى
   *    ويُستهلك النطاق بلا سبب، والمستخدم هو المستخدم نفسه.
   */
  const userId = session?.user.id ?? null;
  const userEmail = session?.user.email ?? null;
  const userMeta = session?.user.user_metadata;

  useEffect(() => {
    if (!userId) { setIsTeacher(false); setSubs([]); setLoaded(false); return; }
    setLoaded(false);
    /*
     * ⚠️ إصلاحٌ ذاتيّ: أيّ حسابٍ بلا صفّ `profiles` لا يستطيع صاحبه طلب
     *    اشتراك — المفتاح الأجنبي يمنعه. وقد يقع ذلك لمن سجّل قبل إصلاح
     *    شاشة التسجيل، أو لمن ضاع تخزين متصفّحه. فيُستدرك هنا **بعد**
     *    وجود الجلسة، حيث تسمح السياسة بالكتابة.
     */
    const prepare = DEMO
      ? Promise.resolve()
      : ensureProfile(
          userId,
          // الداخل بـGoogle لم يملأ نموذجاً — فاسمه يأتي من `user_metadata`
          pickName({ typed: takeName(), metadata: userMeta, email: userEmail }),
        );

    prepare
      .then(() => Promise.all([
        amITeacher(), mySubscriptions(), isProfileComplete(), getMyProfile(userId),
      ]))
      .then(([t, s, done, prof]) => {
        setComplete(done);
        setProfile(prof);
        setIsTeacher(t);
        setSubs(s);
        const live = activeTracks(s);
        if (live.length > 0 && live[0]) setTrack(live[0]);
        setLoaded(true);
      })
      // ⚠️ يُرفع العلم عند الفشل أيضاً، وإلّا بقيت الصفحة على «…» أبداً
      //    بلا رسالة — وهو أسوأ من خطأٍ ظاهر.
      .catch((e) => { setError(String(e?.message ?? e)); setLoaded(true); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (!isConfigured) return <Setup />;
  if (!ready) return <div className="page"><p className="muted">…</p></div>;

  // صفحة الأسعار تُقرأ قبل تسجيل الدخول
  if (!session) {
    return route === "/plans"
      ? <Shell onSignOut={null}><Plans signedIn={false} /></Shell>
      : <Auth />;
  }

  if (!loaded) {
    return (
      <Shell onSignOut={null} signedIn={false}>
        <p className="muted">…</p>
      </Shell>
    );
  }

  /*
   * ⚠️ بوّابة إكمال الملفّ — للطالب وحده. المعلّم لا «مستوى دراسيّ» له ولا
   *    مدرسة، فاشتراطهما عليه يحبسه خارج لوحته بلا معنى.
   *
   * ⚠️ وهي **تهذيبٌ لا حراسة**: الحارس أنّ `request_subscription` ترفض بملفٍّ
   *    ناقص. فلو أُزيلت هذه الشاشة كلّها لما استطاع أحدٌ الاشتراك ببياناتٍ
   *    ناقصة — وذلك هو الفرق بين شاشةٍ تُخفي وقاعدةٍ تمنع.
   */
  if (!isTeacher && !complete) {
    return (
      <ProfileSetup
        userId={session.user.id}
        profile={profile}
        onDone={() => setComplete(true)}
      />
    );
  }

  const live = activeTracks(subs);
  const quizMatch = match("/quiz/:id", route);
  const subMatch = match("/subscribe/:track/:planId", route);

  return (
    <Shell
      onSignOut={DEMO ? null : () => void supabase?.auth.signOut()}
      isTeacher={isTeacher}
      signedIn
    >
      {error ? <Notice kind="error">{error}</Notice> : null}

      {route === "/plans" ? <Plans signedIn /> : null}

      {subMatch ? (
        <Subscribe
          track={subMatch.track as Track}
          planId={subMatch.planId!}
          userId={session.user.id}
        />
      ) : null}

      {route === "/account" ? (
        <Account
          userId={session.user.id}
          email={session.user.email ?? ""}
          profile={profile}
          isTeacher={isTeacher}
          subs={subs}
          /*
           * ⚠️ تُحدَّث الحالة هنا بلا إعادة جلب: `profiles` صفٌّ واحد كتبناه
           *    للتوّ ونعرف محتواه. وإعادة الجلب تُومض الشاشة وتُعيد رسم كل
           *    شيء لتؤكّد ما نعلمه.
           */
          onSaved={(d) => setProfile((prev) => prev && {
            ...prev,
            full_name: d.fullName.trim(),
            grade:   isTeacher ? prev.grade   : d.grade.trim(),
            school:  isTeacher ? prev.school  : d.school.trim(),
            contact: d.contact.trim(),
          })}
        />
      ) : null}

      {route === "/teacher" ? (
        isTeacher
          ? <Teacher email={session.user.email ?? ""} />
          : <Notice kind="error">هذه الصفحة للمعلّم وحده.</Notice>
      ) : null}

      {quizMatch ? (
        <QuizRunner
          quizId={quizMatch.id!}
          track={track}
          // ⚠️ بطاقة الطالب في شريط الاختبار تحمل اسمه — من ملفّه لا من
          //    Google: هو ما صحّحه بالعربية عند إكمال بياناته.
          studentName={profile?.full_name ?? ""}
        />
      ) : null}

      {route === "/" ? (
        isTeacher ? (
          <Teacher email={session.user.email ?? ""} />
        ) : live.length === 0 ? (
          <NoSubscription />
        ) : (
          <Student subs={subs.filter((s) => live.includes(s.track))} track={live.includes(track) ? track : live[0]!} onTrack={setTrack} />
        )
      ) : null}
    </Shell>
  );
}

function NoSubscription() {
  return (
    <div className="stack">
      <h1>لا اشتراك ساري</h1>
      <Empty>
        <p>لا يوجد لديك اشتراكٌ ساري في أي مسار.</p>
        <p className="subtle">
          نتائجك السابقة — إن وُجدت — محفوظةٌ ولم تُحذف، وتعود إليك بتجديد
          الاشتراك.
        </p>
      </Empty>
      <button className="btn btn--primary" onClick={() => navigate("/plans")}>
        عرض الاشتراكات
      </button>
    </div>
  );
}

function Shell({ children, onSignOut, isTeacher, signedIn }: {
  children: React.ReactNode;
  onSignOut: (() => void) | null;
  isTeacher?: boolean;
  /*
   * ⚠️ علمٌ صريح لا استدلالٌ من `onSignOut`: وضع العرض يُخفي زرّ الخروج
   *    والمستخدم فيه «داخل» — فلو قيس الدخول بوجود الزرّ لاختفى رابط
   *    الحساب في وضع العرض وحده، وهو أوّل ما يُفتح لاستعراض المنصّة.
   */
  signedIn?: boolean;
}) {
  return (
    <>
      {DEMO ? <DemoBanner /> : null}
      <header className="appbar">
        <div className="appbar__inner">
          <button type="button" className="tab" onClick={() => navigate("/")}
                  style={{ padding: 0, background: "none", border: 0 }}>
            <Brand />
          </button>
          <span className="spacer" />
          {isTeacher ? (
            <button type="button" className="tab" onClick={() => navigate("/teacher")}>
              اللوحة
            </button>
          ) : (
            <button type="button" className="tab" onClick={() => navigate("/plans")}>
              الاشتراك
            </button>
          )}
          {signedIn ? (
            <button type="button" className="tab" onClick={() => navigate("/account")}>
              حسابي
            </button>
          ) : null}
          <ThemeToggle />
          {onSignOut ? (
            <button type="button" className="btn btn--quiet btn--sm" onClick={onSignOut}>
              خروج
            </button>
          ) : null}
        </div>
      </header>
      <main className="page">{children}</main>
    </>
  );
}
