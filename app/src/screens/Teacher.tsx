import { useEffect, useState } from "react";
import {
  assignItems, confirmIdentity, decideRequest, listBanks, listGroups,
  listStudents, pendingRequests, signedUrl, teacherOverview,
} from "../lib/api";
import { requireClient } from "../lib/supabase";
import { FALLBACK, onOnline } from "../lib/presence";
import type { Bank, Group, Profile, SubscriptionRequest, Track, Audience } from "../lib/types";
import { TRACKS, TRACK_LABEL, TRACK_SHORT } from "../lib/types";
import type { Overview, AssignReport } from "../lib/api";
import { formatDateTime, countLabel } from "../lib/format";
import { downloadCsv } from "../lib/csv";
import { Icon } from "../components/Icon";
import { Empty, Field, Notice } from "../components/ui";
import { Content } from "./teacher/Content";
import { Exams } from "./teacher/Exams";
import { Groups } from "./teacher/Groups";

type Tab = "overview" | "content" | "exams" | "groups" | "requests" | "distribute";

export function Teacher({ email }: { email: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  return (
    <div className="stack">
      <h1>لوحة المعلّم</h1>
      <div className="tabs" role="tablist">
        {([["overview", "نظرة عامّة"],
           ["content", "المحتوى"],
           ["exams", "الاختبارات"],
           ["groups", "المجموعات"],
           ["requests", "طلبات الاشتراك"],
           ["distribute", "التوزيع"]] as const)
          .map(([key, label]) => (
            <button key={key} role="tab" className="tab" aria-selected={tab === key}
                    onClick={() => setTab(key)}>{label}</button>
          ))}
      </div>
      {tab === "overview" ? <OverviewPane /> : null}
      {tab === "content" ? <Content /> : null}
      {tab === "exams" ? <Exams /> : null}
      {tab === "groups" ? <Groups /> : null}
      {tab === "requests" ? <RequestsPane email={email} /> : null}
      {tab === "distribute" ? <DistributePane /> : null}
    </div>
  );
}

function OverviewPane() {
  const [rows, setRows] = useState<Overview[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    teacherOverview().then(setRows).catch((e) => setError(String(e?.message ?? e)));
  }, []);

  if (error) return <Notice kind="error">{error}</Notice>;
  if (!rows) return <p className="muted">…</p>;

  return (
    <div className="stack">
      <OnlineNow />
      <div className="grid-2">
        {rows.map((r) => (
          <article key={r.track} className="card stack-s">
            <h2 className="card__title">{TRACK_LABEL[r.track]}</h2>
            <p className="mono" style={{ fontSize: "30px", margin: 0 }}>{r.active_subscribers}</p>
            <p className="subtle">مشترك باشتراكٍ ساري</p>
            {r.pending_requests > 0 ? (
              <span className="tag tag--pen">
                {countLabel(r.pending_requests, {
                  none: "", one: "طلب واحد معلّق", two: "طلبان معلّقان",
                  few: "طلبات معلّقة", many: "طلباً معلّقاً",
                })}
              </span>
            ) : <span className="tag tag--muted">لا طلبات معلّقة</span>}
          </article>
        ))}
      </div>
      <ExportSubscribers />
    </div>
  );
}

/**
 * «كم طالباً في موقعي الآن؟» — طلب المالك.
 *
 * ⚠️ الرقم **حيّ**: يهبط حين يُغلق أحدهم صفحته، بلا تحديثٍ ولا سؤالٍ
 *    دوريّ. وهو غير «عدد المشتركين» في البطاقات تحته — ذاك تراكمٌ وهذا
 *    لحظة.
 *
 * ⚠️ ولا يُبنى عليه قرار: زينةٌ لا حارس (انظر `lib/presence.ts`). ولهذا
 *    لا رسالة خطأ له — عند أي تعثّر يبقى على بديله الآمن صامتاً.
 */
function OnlineNow() {
  const [n, setN] = useState(FALLBACK);
  useEffect(() => onOnline(setN), []);

  return (
    <article className="card row-between">
      <span className="row">
        <Icon name="users" />
        <span className="stack-s" style={{ gap: 0 }}>
          <b>المتصلون الآن</b>
          <span className="subtle">من الموقع مفتوحٌ عنده هذه اللحظة</span>
        </span>
      </span>
      <span className="mono" style={{ fontSize: "30px" }}>{n}</span>
    </article>
  );
}

function ExportSubscribers() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true); setError(null);
    try {
      const { data, error: err } = await requireClient()
        .from("subscriptions")
        .select("track, starts_on, ends_on, is_revoked, profiles(full_name, grade, contact)")
        .order("ends_on", { ascending: false });
      if (err) throw err;
      const rows = (data ?? []).map((s) => {
        const p = (s as { profiles?: { full_name?: string; grade?: string; contact?: string } }).profiles;
        return [
          p?.full_name ?? "", p?.grade ?? "", p?.contact ?? "",
          TRACK_SHORT[(s as { track: Track }).track],
          (s as { starts_on: string }).starts_on,
          (s as { ends_on: string }).ends_on,
          (s as { is_revoked: boolean }).is_revoked ? "موقوف" : "ساري",
        ];
      });
      // ⚠️ التصدير يمرّ بـ`downloadCsv` التي تضع BOM — بدونها تُفتح الأسماء
      //    العربية حروفاً مشوّهة في Excel على ويندوز.
      downloadCsv("المشتركون", ["الاسم", "الصفّ", "رقم التواصل", "المسار", "من", "إلى", "الحالة"], rows);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally { setBusy(false); }
  }

  return (
    <div className="stack-s">
      {error ? <Notice kind="error">{error}</Notice> : null}
      <button type="button" className="btn" onClick={run} disabled={busy}>
        <Icon name="download" size={18} /> تصدير المشتركين (CSV)
      </button>
    </div>
  );
}

function RequestsPane({ email }: { email: string }) {
  const [rows, setRows] = useState<SubscriptionRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [months, setMonths] = useState<Record<string, number>>({});
  const [reauth, setReauth] = useState<{ id: string; accept: boolean } | null>(null);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () => pendingRequests().then(setRows).catch((e) => setError(String(e?.message ?? e)));
  useEffect(() => { void reload(); }, []);

  async function decide(id: string, accept: boolean) {
    setBusy(true); setError(null); setInfo(null);
    try {
      const r = await decideRequest({ requestId: id, accept, months: months[id] ?? 1 });
      /*
       * ⚠️ `reauth_required` ليست خطأً يُخفى: تغيير الاشتراك عمليةٌ خطرة
       *    تشترط تأكيد هوية حديثاً (نافذة ١٢ ساعة). فنطلب كلمة المرور مرّة.
       */
      if (!r.ok && r.reason === "reauth_required") { setReauth({ id, accept }); return; }
      if (!r.ok && r.reason === "already_decided") {
        setError("هذا الطلب حُسم من قبل. حُدِّثت القائمة.");
        await reload(); return;
      }
      if (!r.ok) { setError(`تعذّر تنفيذ القرار (${r.reason}).`); return; }
      setInfo(accept ? "قُبل الطلب وبدأ الاشتراك." : "رُفض الطلب.");
      await reload();
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally { setBusy(false); }
  }

  async function confirmAndRetry(e: React.FormEvent) {
    e.preventDefault();
    if (!reauth) return;
    setBusy(true); setError(null);
    try {
      const { error: signErr } = await requireClient().auth
        .signInWithPassword({ email, password });
      if (signErr) throw new Error("كلمة المرور غير صحيحة");
      await confirmIdentity();
      const pending = reauth;
      setReauth(null); setPassword("");
      await decide(pending.id, pending.accept);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تأكيد الهوية");
    } finally { setBusy(false); }
  }

  if (error && !rows) return <Notice kind="error">{error}</Notice>;
  if (!rows) return <p className="muted">…</p>;

  return (
    <div className="stack">
      {error ? <Notice kind="error">{error}</Notice> : null}
      {info ? <Notice kind="ok">{info}</Notice> : null}

      {reauth ? (
        <form className="card stack-s" onSubmit={confirmAndRetry}>
          <h2 className="card__title">تأكيد الهوية</h2>
          <p className="muted">
            تغيير الاشتراك عمليةٌ حسّاسة. أعد إدخال كلمة المرور مرّةً واحدة،
            وتبقى مفتوحةً ١٢ ساعة.
          </p>
          <Field label="كلمة المرور">
            <input className="input" type="password" value={password} required
                   onChange={(ev) => setPassword(ev.target.value)}
                   autoComplete="current-password" dir="ltr" style={{ textAlign: "start" }} />
          </Field>
          <button className="btn btn--primary" disabled={busy}>تأكيد ومتابعة</button>
          <button type="button" className="btn btn--quiet"
                  onClick={() => { setReauth(null); setPassword(""); }}>إلغاء</button>
        </form>
      ) : null}

      {rows.length === 0 ? <Empty>لا طلبات معلّقة.</Empty> : null}

      {rows.map((r) => (
        <article key={r.id} className="card stack-s">
          <div className="row-between">
            <strong>{r.full_name}</strong>
            <span className="tag">{TRACK_SHORT[r.track]}</span>
          </div>
          <p className="subtle">
            {r.grade ? `${r.grade} · ` : ""}
            <span className="mono" dir="ltr">{r.contact}</span>
            {" · "}{formatDateTime(r.created_at)}
          </p>
          {r.receipt_path ? <ReceiptLink path={r.receipt_path} /> : null}
          <div className="row">
            <Field label="المدّة بالأشهر">
              <input className="input" type="number" min={1} max={24}
                     style={{ width: "96px" }}
                     value={months[r.id] ?? 1}
                     onChange={(e) => setMonths((m) => ({ ...m, [r.id]: Number(e.target.value) }))} />
            </Field>
          </div>
          <div className="row">
            {/* الأحمر للفعل الأساسي وحده: القبول. والرفض ثانويّ. */}
            <button className="btn btn--primary" disabled={busy}
                    onClick={() => void decide(r.id, true)}>
              <Icon name="check" size={18} /> قبول
            </button>
            <button className="btn btn--quiet" disabled={busy}
                    onClick={() => void decide(r.id, false)}>رفض</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReceiptLink({ path }: { path: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button type="button" className="btn btn--quiet btn--sm" disabled={busy}
      onClick={async () => {
        setBusy(true);
        // إيصالٌ بنكيّ: رابطٌ موقَّع قصير العمر، لا رابط عامّ يبقى للأبد
        const url = await signedUrl("receipts", path, 120);
        if (url) window.open(url, "_blank", "noopener,noreferrer");
        setBusy(false);
      }}>
      <Icon name="image" size={16} /> عرض الإيصال
    </button>
  );
}

function DistributePane() {
  const [track, setTrack] = useState<Track>("qudurat");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [audience, setAudience] = useState<Audience>("track");
  const [groupId, setGroupId] = useState<string>("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [report, setReport] = useState<AssignReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelected([]); setReport(null);
    Promise.all([listBanks(track), listGroups(track), listStudents()])
      .then(([b, g, s]) => { setBanks(b); setGroups(g); setStudents(s); })
      .catch((e) => setError(String(e?.message ?? e)));
  }, [track]);

  async function send() {
    setBusy(true); setError(null); setReport(null);
    try {
      const r = await assignItems({
        itemType: "bank", itemIds: selected, audience,
        groupIds: audience === "group" ? [groupId] : null,
        studentIds: audience === "student" ? studentIds : null,
      });
      setReport(r);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally { setBusy(false); }
  }

  const canSend = selected.length > 0 && !busy &&
    (audience !== "group" || groupId !== "") &&
    (audience !== "student" || studentIds.length > 0);

  return (
    <div className="stack">
      <div className="tabs" role="tablist">
        {TRACKS.map((t) => (
          <button key={t} role="tab" className="tab" aria-selected={t === track}
                  onClick={() => setTrack(t)}>{TRACK_SHORT[t]}</button>
        ))}
      </div>

      {error ? <Notice kind="error">{error}</Notice> : null}

      {/*
        ⚠️⚠️ هنا تُعرض عبرة «النجاح الكاذب» مباشرةً للمعلّم.
        لا رسالة «أُرسل ✅» واحدة. الدالّة تُعيد عددين صريحين، ونعرضهما كما
        هما — فيرى المعلّم فوراً لو لم يصل شيءٌ جديداً أحداً.
      */}
      {report ? (
        <Notice kind={report.created > 0 ? "ok" : "info"}>
          {report.created > 0
            ? `أُرسل إلى ${report.created} هدفاً جديداً`
            : "لم يُرسَل شيءٌ جديد"}
          {report.skipped > 0 ? ` · وكان ${report.skipped} مُرسَلاً من قبل` : ""}
          {` · من أصل ${report.targeted} هدفاً.`}
        </Notice>
      ) : null}

      <div className="card stack-s">
        <h2 className="card__title">اختر البنوك</h2>
        {banks.length === 0 ? <p className="subtle">لا بنوك في هذا المسار.</p> : null}
        {banks.map((b) => (
          <label key={b.id} className="choice" style={{ cursor: "pointer" }}>
            <input type="checkbox" checked={selected.includes(b.id)}
              onChange={(e) =>
                setSelected((s) => e.target.checked ? [...s, b.id] : s.filter((x) => x !== b.id))
              } />
            <span>
              {b.title}
              {!b.is_published ? <span className="tag tag--muted" style={{ marginInlineStart: 8 }}>غير منشور</span> : null}
            </span>
          </label>
        ))}
      </div>

      <div className="card stack-s">
        <h2 className="card__title">إلى من؟</h2>
        <Field label="الجمهور">
          <select className="select" value={audience}
                  onChange={(e) => setAudience(e.target.value as Audience)}>
            <option value="track">كل مشتركي {TRACK_SHORT[track]}</option>
            <option value="group">مجموعة</option>
            <option value="student">طلّاب بأسمائهم</option>
          </select>
        </Field>

        {audience === "group" ? (
          <Field label="المجموعة">
            <select className="select" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">— اختر —</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </Field>
        ) : null}

        {audience === "student" ? (
          <Field label="الطلّاب">
            <select className="select" multiple size={6} value={studentIds}
              onChange={(e) =>
                setStudentIds(Array.from(e.target.selectedOptions).map((o) => o.value))
              }>
              {students.map((s) => <option key={s.id} value={s.id}>{s.full_name}</option>)}
            </select>
          </Field>
        ) : null}

        <button className="btn btn--primary" disabled={!canSend} onClick={() => void send()}>
          <Icon name="send" size={18} /> إرسال
        </button>
      </div>
    </div>
  );
}
