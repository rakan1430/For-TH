import { useCallback, useEffect, useState } from "react";
import { listGroups } from "../../lib/api";
import * as A from "../../lib/authoring";
import type { Group, Profile, Track } from "../../lib/types";
import { TRACKS, TRACK_SHORT } from "../../lib/types";
import { Icon } from "../../components/Icon";
import { Empty, Field, Notice } from "../../components/ui";
import { Sortable, DragHandle } from "../../components/Sortable";
import { countLabel } from "../../lib/format";

/**
 * المجموعات — «متقدّم»، «تأسيس»، وما شئت.
 *
 * ⚠️ المجموعة تتبع **مساراً واحداً** (قرار ق-٤ في سجلّ المشروع): مجموعةٌ
 *    تعبر المسارين تجعل «أرسل إلى متقدّم» أمراً غامضاً، وتفتح طريقاً لتسريب
 *    محتوى مسارٍ إلى مشتركي الآخر. فـ«متقدّم» في القدرات غير «متقدّم» في
 *    التحصيلي.
 *
 * ⚠️ وليست مراحل دراسية ولا فصولاً رسمية — تلك خارج النطاق صراحةً.
 */
export function Groups() {
  const [track, setTrack] = useState<Track>("qudurat");
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<Profile[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [g, s] = await Promise.all([listGroups(track), A.studentsOfTrack(track)]);
      setGroups(g); setStudents(s); setError(null);
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    } finally { setLoading(false); }
  }, [track]);

  useEffect(() => { setOpen(null); void reload(); }, [reload]);

  const act = async (fn: () => Promise<unknown>, done?: string) => {
    setError(null); setInfo(null);
    try { await fn(); await reload(); if (done) setInfo(done); }
    catch (e) { setError(String((e as Error)?.message ?? e)); }
  };

  return (
    <div className="stack">
      <div className="tabs" role="tablist" aria-label="المسار">
        {TRACKS.map((t) => (
          <button key={t} role="tab" className="tab" aria-selected={t === track}
                  onClick={() => setTrack(t)}>{TRACK_SHORT[t]}</button>
        ))}
      </div>

      <p className="subtle">
        تقسّم طلّابك كما تريد. والمجموعة تخصّ هذا المسار وحده — لا تعبر إلى
        المسار الآخر.
      </p>

      {error ? <Notice kind="error">{error}</Notice> : null}
      {info ? <Notice kind="ok">{info}</Notice> : null}
      {loading ? <p className="muted">…</p> : null}

      {students.length === 0 && !loading ? (
        <Notice kind="info">
          لا طلّاب في {TRACK_SHORT[track]} بعد. المجموعات تُملأ من مشتركي المسار،
          فأنشئ الاشتراكات أوّلاً من تبويب «طلبات الاشتراك».
        </Notice>
      ) : null}

      {groups.length === 0 && !loading ? <Empty>لا مجموعات بعد.</Empty> : null}

      <Sortable
        items={groups} getKey={(g) => g.id} label="ترتيب المجموعات"
        onReorder={(next) => void act(() => A.reorder("group", next.map((g) => g.id)))}
        renderItem={(g, api) => (
          <GroupCard
            group={g} api={api} students={students}
            isOpen={open === g.id}
            onToggle={() => setOpen(open === g.id ? null : g.id)}
            onAct={act}
          />
        )}
      />

      <form className="card row" style={{ flexWrap: "nowrap" }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!name.trim()) return;
              void act(() => A.createGroup(track, name.trim(), "#85ABE6", groups.length));
              setName("");
            }}>
        <input className="input" style={{ flex: 1 }} value={name}
               placeholder="مجموعة جديدة — مثل: متقدّم" aria-label="اسم المجموعة الجديدة"
               onChange={(e) => setName(e.target.value)} />
        <button className="btn btn--primary btn--sm" disabled={!name.trim()}>
          <Icon name="plus" size={16} /> إنشاء
        </button>
      </form>
    </div>
  );
}

function GroupCard({ group, api, students, isOpen, onToggle, onAct }: {
  group: Group;
  api: Parameters<Parameters<typeof Sortable>[0]["renderItem"]>[1];
  students: Profile[];
  isOpen: boolean;
  onToggle: () => void;
  onAct: (fn: () => Promise<unknown>, done?: string) => Promise<void>;
}) {
  const [members, setMembers] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    A.groupMembers(group.id).then(setMembers).catch(() => setMembers([]));
  }, [isOpen, group.id]);

  return (
    <div className="card card--tagged stack-s"
         style={{ ["--tag" as string]: group.color, background: "var(--bg)" }}>
      <div className="row-between">
        <span className="row" style={{ flexWrap: "nowrap" }}>
          <DragHandle api={api} title={group.name} />
          <input className="input" style={{ minWidth: "160px" }} defaultValue={group.name}
                 aria-label={`اسم المجموعة ${group.name}`}
                 onBlur={(e) => {
                   if (e.target.value.trim() && e.target.value !== group.name) {
                     void onAct(() => A.updateGroup(group.id, { name: e.target.value.trim() }));
                   }
                 }} />
        </span>
        <span className="row">
          <input type="color" value={group.color} aria-label={`لون وسم ${group.name}`}
                 style={{ width: "44px", height: "44px", padding: 0, border: "1px solid var(--border-strong)",
                          background: "var(--surface)", borderRadius: "var(--radius)" }}
                 onChange={(e) => void onAct(() => A.updateGroup(group.id, { color: e.target.value }))} />
          <button type="button" className="btn btn--sm" onClick={onToggle}>
            <Icon name="users" size={16} /> {isOpen ? "إخفاء" : "الأعضاء"}
          </button>
          <button type="button" className="btn btn--quiet btn--sm"
                  aria-label={`حذف المجموعة ${group.name}`}
                  onClick={() => void onAct(() => A.deleteGroup(group.id))}>
            <Icon name="trash" size={16} />
          </button>
        </span>
      </div>

      {isOpen ? (
        members === null ? <p className="muted">…</p> : (
          <div className="stack-s">
            <Field label="الأعضاء" hint="من مشتركي هذا المسار وحدهم">
              <select className="select" multiple size={Math.min(8, Math.max(3, students.length))}
                      value={members}
                      onChange={(e) =>
                        setMembers(Array.from(e.target.selectedOptions).map((o) => o.value))}>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}{s.grade ? ` — ${s.grade}` : ""}
                  </option>
                ))}
              </select>
            </Field>
            <span className="subtle">
              {countLabel(members.length, {
                none: "لا أعضاء", one: "عضوٌ واحد", two: "عضوان",
                few: "أعضاء", many: "عضواً",
              })} مختارون
            </span>
            <button type="button" className="btn btn--sm" disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      await onAct(async () => {
                        const r = await A.setGroupMembers(group.id, members);
                        // أعدادٌ صريحة لا «حُفظ»: أُضيف كم، وأُخرج كم
                        return r;
                      }, "حُفظت العضوية.");
                      setBusy(false);
                    }}>
              حفظ الأعضاء
            </button>
          </div>
        )
      ) : null}
    </div>
  );
}
