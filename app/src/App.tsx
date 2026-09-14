import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { isConfigured, supabase } from "./lib/supabase";
import { amITeacher, activeTracks, mySubscriptions } from "./lib/api";
import type { Subscription, Track } from "./lib/types";
import { match, navigate, useRoute } from "./lib/router";
import { Brand } from "./components/Logo";
import { Empty, Notice, ThemeToggle } from "./components/ui";
import { Setup } from "./screens/Setup";
import { Auth } from "./screens/Auth";
import { Plans } from "./screens/Plans";
import { Subscribe } from "./screens/Subscribe";
import { Student } from "./screens/Student";
import { QuizRunner } from "./screens/QuizRunner";
import { Teacher } from "./screens/Teacher";

export default function App() {
  const route = useRoute();
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [track, setTrack] = useState<Track>("qudurat");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session); setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setIsTeacher(false); setSubs([]); return; }
    Promise.all([amITeacher(), mySubscriptions()])
      .then(([t, s]) => {
        setIsTeacher(t);
        setSubs(s);
        const live = activeTracks(s);
        if (live.length > 0 && live[0]) setTrack(live[0]);
      })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [session]);

  if (!isConfigured) return <Setup />;
  if (!ready) return <div className="page"><p className="muted">…</p></div>;

  // صفحة الأسعار تُقرأ قبل تسجيل الدخول
  if (!session) {
    return route === "/plans"
      ? <Shell onSignOut={null}><Plans signedIn={false} /></Shell>
      : <Auth />;
  }

  const live = activeTracks(subs);
  const quizMatch = match("/quiz/:id", route);
  const subMatch = match("/subscribe/:track/:planId", route);

  return (
    <Shell onSignOut={() => void supabase?.auth.signOut()} isTeacher={isTeacher}>
      {error ? <Notice kind="error">{error}</Notice> : null}

      {route === "/plans" ? <Plans signedIn /> : null}

      {subMatch ? (
        <Subscribe
          track={subMatch.track as Track}
          planId={subMatch.planId!}
          userId={session.user.id}
        />
      ) : null}

      {route === "/teacher" ? (
        isTeacher
          ? <Teacher email={session.user.email ?? ""} />
          : <Notice kind="error">هذه الصفحة للمعلّم وحده.</Notice>
      ) : null}

      {quizMatch ? <QuizRunner quizId={quizMatch.id!} track={track} /> : null}

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

function Shell({ children, onSignOut, isTeacher }: {
  children: React.ReactNode;
  onSignOut: (() => void) | null;
  isTeacher?: boolean;
}) {
  return (
    <>
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
