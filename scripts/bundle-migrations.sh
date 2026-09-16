#!/usr/bin/env bash
# يجمع المهاجرات في ملفٍّ واحد يُلصق في محرّر SQL بلوحة Supabase.
#
# يلزم حين لا يكون الموصل (Connector) مرتبطاً بحساب المشروع، أو حين تحجب
# سياسة الخروج منافذ Postgres و`supabase.co` — انظر خ-١٣ في سجلّ المشروع.
set -Eeuo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
OUT="${1:-migrations-all.sql}"
{
  cat <<'HDR'
-- منصّة أ. ‹اسم المعلّم› — كل المهاجرات في ملفّ واحد.
-- لوحة Supabase ← SQL Editor ← New query ← الصق ← Run.
--
-- ⚠️ بعدها بخطوة واحدة: سجّل الدخول في الموقع مرّةً لينشأ الحساب، ثم:
--      insert into private.teachers (user_id)
--      select id from auth.users order by created_at limit 1;
--    ولا يفعل هذا أي زرٍّ في الواجهة بعمد — فلا باب ترقيةٍ ذاتية.
HDR
  for f in supabase/migrations/*.sql; do
    printf '\n-- ═══ %s ═══\n' "$(basename "$f")"
    cat "$f"
  done
} > "$OUT"
echo "كُتب: $OUT  ($(wc -l < "$OUT") سطراً)"
