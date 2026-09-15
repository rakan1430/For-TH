/**
 * أيقونات SVG خطّية بسماكةٍ موحّدة على شبكة 20px.
 * ⚠️ «لا إيموجي إطلاقاً» — والإيموجي يختلف رسمه بين الأجهزة ولا يتبع لون
 *    النصّ ولا سماكته، فيكسر انتظام الواجهة.
 */
export type IconName =
  | "sun" | "moon" | "file" | "link" | "image" | "quiz" | "bank"
  | "users" | "check" | "x" | "clock" | "download" | "chevron" | "plus" | "send"
  | "grip" | "up" | "down" | "edit" | "trash" | "eye" | "eyeOff";

const PATHS: Record<IconName, string> = {
  sun:      "M10 3v2M10 15v2M3 10h2M15 10h2M5.4 5.4l1.4 1.4M13.2 13.2l1.4 1.4M14.6 5.4l-1.4 1.4M6.8 13.2l-1.4 1.4M10 7a3 3 0 100 6 3 3 0 000-6z",
  moon:     "M16 11.2A6.2 6.2 0 018.8 4a6.5 6.5 0 107.2 7.2z",
  file:     "M5.5 2.5h6l3.5 3.5v11.5h-9.5zM11.5 2.5V6H15",
  link:     "M8.5 11.5a3 3 0 004.2 0l2.1-2.1a3 3 0 10-4.2-4.2l-.8.8M11.5 8.5a3 3 0 00-4.2 0l-2.1 2.1a3 3 0 104.2 4.2l.8-.8",
  image:    "M3 4.5h14v11H3zM3 12.5l3.5-3 3 2.5 3.5-3.5L17 12M7 8a1 1 0 100-2 1 1 0 000 2z",
  quiz:     "M4 3.5h12v13H4zM7 7.5h6M7 10.5h6M7 13.5h3",
  bank:     "M3 6.5l7-3.5 7 3.5M4.5 8v6M8 8v6M12 8v6M15.5 8v6M3 16.5h14",
  users:    "M7.5 9a2.75 2.75 0 100-5.5 2.75 2.75 0 000 5.5zM2.5 16.5c0-2.6 2.2-4.2 5-4.2s5 1.6 5 4.2M13.5 4.2a2.6 2.6 0 010 5M14.5 12.6c1.9.4 3 1.8 3 3.9",
  check:    "M4 10.5l4 4 8-9",
  x:        "M5 5l10 10M15 5L5 15",
  clock:    "M10 3a7 7 0 100 14 7 7 0 000-14zM10 6v4.2l2.8 1.8",
  download: "M10 3v9.5M6.5 9.5L10 13l3.5-3.5M4 16.5h12",
  chevron:  "M12 5l-5 5 5 5",
  plus:     "M10 4v12M4 10h12",
  send:     "M17 3L2.5 9.2l6 2.3 2.3 6z",
  grip:     "M7.5 5h.01M12.5 5h.01M7.5 10h.01M12.5 10h.01M7.5 15h.01M12.5 15h.01",
  up:       "M10 16V4M5 9l5-5 5 5",
  down:     "M10 4v12M5 11l5 5 5-5",
  edit:     "M13.5 3.5l3 3L7 16H4v-3zM11.5 5.5l3 3",
  trash:    "M3.5 5.5h13M8 5.5V3.5h4v2M5 5.5l.8 11h8.4l.8-11M8.5 8.5v5M11.5 8.5v5",
  eye:      "M1.5 10S4.5 4.5 10 4.5 18.5 10 18.5 10 15.5 15.5 10 15.5 1.5 10 1.5 10zM10 12.2a2.2 2.2 0 100-4.4 2.2 2.2 0 000 4.4z",
  eyeOff:   "M3 3l14 14M8.2 8.3a2.2 2.2 0 003.5 3.4M6 6.1C3.3 7.6 1.5 10 1.5 10s3 5.5 8.5 5.5c1.4 0 2.7-.36 3.8-.92M11.6 4.7A8.6 8.6 0 0010 4.5C9.4 4.5 8.9 4.55 8.4 4.64M15.4 7c1.9 1.5 3.1 3 3.1 3s-.7 1.3-2 2.6",
};

export function Icon({
  name, size = 20, className,
}: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 20 20" fill="none"
      className={className} aria-hidden="true" focusable="false"
      style={{ flexShrink: 0 }}
    >
      <path
        d={PATHS[name]} stroke="currentColor" strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round"
      />
    </svg>
  );
}
