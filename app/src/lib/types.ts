/** المسار: القدرات (الكمّي فقط) أو التحصيلي. */
export type Track = "qudurat" | "tahsili";

export const TRACKS: readonly Track[] = ["qudurat", "tahsili"];

export const TRACK_LABEL: Record<Track, string> = {
  qudurat: "القدرات — الكمّي",
  tahsili: "التحصيلي — الرياضيات",
};

export const TRACK_SHORT: Record<Track, string> = {
  qudurat: "القدرات",
  tahsili: "التحصيلي",
};

export type PlanPeriod = "monthly" | "quarterly";
export const PERIOD_LABEL: Record<PlanPeriod, string> = {
  monthly: "شهري",
  quarterly: "فصلي — ٣ أشهر",
};

export type PayMethod = "gateway" | "transfer";
export type RequestStatus = "pending" | "accepted" | "rejected";
export type ResourceKind = "file" | "link" | "image";
export type QuizRetention = "permanent" | "temporary";
export type ItemType = "section" | "bank" | "resource" | "quiz";
export type Audience = "track" | "group" | "student";

export interface Profile {
  id: string;
  full_name: string;
  grade: string | null;
  contact: string | null;
}

export interface Plan {
  id: string;
  track: Track;
  period: PlanPeriod;
  /** ⚠️ null = لم يحدّده المالك بعد. تعرضه الواجهة «[السعر]» ولا تخترع رقماً. */
  price_minor: number | null;
  currency: string;
  is_active: boolean;
}

export interface Subscription {
  id: string;
  student_id: string;
  track: Track;
  starts_on: string;
  ends_on: string;
  is_revoked: boolean;
}

export interface SubscriptionRequest {
  id: string;
  student_id: string;
  track: Track;
  plan_id: string;
  full_name: string;
  grade: string | null;
  contact: string;
  method: PayMethod;
  receipt_path: string | null;
  status: RequestStatus;
  note: string | null;
  created_at: string;
  decided_at: string | null;
}

export interface Section { id: string; track: Track; title: string; position: number; }

export interface Bank {
  id: string; track: Track; section_id: string | null;
  title: string; description: string | null;
  position: number; is_published: boolean;
}

export interface Resource {
  id: string; track: Track; bank_id: string | null; section_id: string | null;
  kind: ResourceKind; title: string;
  storage_path: string | null; url: string | null;
  position: number; is_published: boolean;
}

export interface Quiz {
  id: string; track: Track; scope: "bank" | "general";
  bank_id: string | null; section_id: string | null;
  title: string; retention: QuizRetention; is_published: boolean;
  opens_at: string | null; due_at: string | null;
  time_limit_minutes: number | null;
  /** null = بلا حدّ — وهو الافتراضي للاختبار المسجَّل. */
  max_attempts: number | null;
  position: number;
}

export interface Question {
  id: string; quiz_id: string; position: number;
  prompt: string | null; prompt_image_path: string | null; points: number;
}

/** ⚠️ لاحظ ما ليس هنا: لا حقل صحّة. الإجابة لا تغادر الخادم قبل التسليم. */
export interface Option {
  id: string; question_id: string; position: number;
  label: string | null; image_path: string | null;
}

export interface Attempt {
  id: string; quiz_id: string; student_id: string; attempt_no: number;
  status: "in_progress" | "submitted";
  started_at: string; expires_at: string | null; submitted_at: string | null;
  score: number | null; max_score: number | null;
}

export interface AttemptAnswer {
  attempt_id: string; question_id: string;
  option_id: string | null; is_correct: boolean | null;
}

export interface Group { id: string; track: Track; name: string; color: string; position: number; }

/** عنصرٌ في تسلسل البنك — ملفٌّ أو اختبار، بترتيب المعلّم. */
export type BankItem =
  | { kind: "resource"; position: number; resource: Resource }
  | { kind: "quiz"; position: number; quiz: Quiz };
