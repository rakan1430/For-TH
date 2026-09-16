import { Field } from "./ui";

/**
 * حقول الملفّ الشخصي — **تعريفٌ واحد** تستعمله شاشة الإكمال وشاشة الحساب.
 *
 * ⚠️ ولماذا مكوّنٌ مشترك لا نسختان؟ لأنّ نسختين تفترقان: تُضاف «المدينة» في
 *    إحداهما وتُنسى في الأخرى، فيملأ الطالب حقلاً عند التسجيل ولا يجده حين
 *    يريد تصحيحه. وهذا هو الدرس نفسه الذي جعل `profile_complete()` تُعرَّف
 *    في القاعدة وحدها: تعريفٌ واحد لا اثنان.
 */

/*
 * ⚠️ قائمةٌ لا حقل نصّ: «ثالث ثانوي» و«٣ث» و«الثالث الثانوي» ثلاثةُ نصوصٍ
 *    لشيءٍ واحد، فيصير فرزُ المعلّم لطلّابه مستحيلاً. والقائمة تجعل الحقل
 *    قابلاً للعدّ.
 */
export const GRADES = ["أول ثانوي", "ثاني ثانوي", "ثالث ثانوي", "خرّيج"] as const;

/** ثمانية أرقام فأكثر — وهو نفس حدّ القاعدة، لا رقمٌ اخترعته الواجهة. */
export function digitsOf(v: string): number {
  return (v.match(/\d/g) ?? []).length;
}

export interface ProfileDraft {
  fullName: string;
  grade: string;
  contact: string;
  school: string;
}

export function ProfileFields({ value, onChange, forTeacher }: {
  value: ProfileDraft;
  onChange: (next: ProfileDraft) => void;
  /** المعلّم لا مستوى دراسيّ له ولا مدرسة — فلا يُسألان عنه */
  forTeacher?: boolean;
}) {
  const set = (patch: Partial<ProfileDraft>) => onChange({ ...value, ...patch });

  return (
    <>
      {/* ⚠️ الاسم يأتي من Google بالإنجليزية غالباً — فيُصحَّح بالعربية هنا */}
      <Field label="الاسم الكامل" hint="بالعربية كما يُنادى به">
        <input
          className="input" value={value.fullName} required minLength={2} maxLength={120}
          onChange={(e) => set({ fullName: e.target.value })} autoComplete="name"
        />
      </Field>

      {forTeacher ? null : (
        <Field label="المستوى الدراسي">
          <select
            className="select" value={value.grade} required
            onChange={(e) => set({ grade: e.target.value })}
          >
            <option value="" disabled>اختر…</option>
            {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </Field>
      )}

      <Field label="رقم الجوّال" hint="للتواصل عند الحاجة — لا يظهر لغيرك">
        <input
          className="input" type="tel" value={value.contact} required maxLength={40}
          onChange={(e) => set({ contact: e.target.value })}
          autoComplete="tel" inputMode="tel"
          dir="ltr" style={{ textAlign: "start" }}
        />
      </Field>

      {forTeacher ? null : (
        <Field label="المدرسة" hint="أو المركز الذي تدرس فيه">
          <input
            className="input" value={value.school} required minLength={2} maxLength={120}
            onChange={(e) => set({ school: e.target.value })}
          />
        </Field>
      )}
    </>
  );
}
