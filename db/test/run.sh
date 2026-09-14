#!/usr/bin/env bash
# =============================================================================
# تشغيل فحوص قاعدة البيانات على Postgres حقيقيّ
#
# «لا يُصدَّق شيء إلا بقياس»: الصلاحيات تُجرَّب بانتحال كل دور **فعلياً** على
# قاعدةٍ حقيقية — ماذا يرى مشترك القدرات؟ ومشترك التحصيلي؟ ومن انتهى اشتراكه؟
# والزائر المجهول؟ لا قراءةً للسياسة واستنتاجاً لما تفعله.
#
#   ./db/test/run.sh              قاعدة مؤقّتة تُنشأ وتُهدَم
#   DATABASE_URL=… ./db/test/run.sh   قاعدة قائمة (للتكامل المستمرّ)
# =============================================================================
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

PG_BIN="${PG_BIN:-/usr/lib/postgresql/16/bin}"
TMP_CLUSTER=""
OWN_CLUSTER=0

log()  { printf '\n\033[1m%s\033[0m\n' "$*"; }
fail() { printf '\n\033[31m%s\033[0m\n' "$*" >&2; exit 1; }

cleanup() {
  if [[ $OWN_CLUSTER -eq 1 && -n "$TMP_CLUSTER" ]]; then
    as_pg "$PG_BIN/pg_ctl -D '$TMP_CLUSTER/data' -m immediate stop" >/dev/null 2>&1 || true
    rm -rf "$TMP_CLUSTER"
  fi
}
trap cleanup EXIT

# Postgres يرفض العمل بحساب الجذر، فنُسند التشغيل لحساب postgres عند اللزوم
as_pg() {
  if [[ "$(id -u)" -eq 0 ]]; then su postgres -c "$1"; else bash -c "$1"; fi
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  log "تهيئة قاعدة مؤقّتة…"
  [[ -x "$PG_BIN/initdb" ]] || fail "لم يُعثر على Postgres في $PG_BIN — عيّن PG_BIN أو DATABASE_URL"

  TMP_CLUSTER="$(mktemp -d)"
  OWN_CLUSTER=1
  mkdir -p "$TMP_CLUSTER/data"
  if [[ "$(id -u)" -eq 0 ]]; then
    chown -R postgres:postgres "$TMP_CLUSTER"
    chmod 750 "$TMP_CLUSTER"
  fi

  as_pg "$PG_BIN/initdb -D '$TMP_CLUSTER/data' -U postgres --auth=trust --encoding=UTF8 --locale=C" >/dev/null
  # منفذٌ حرّ عشوائي حتى لا نصطدم بقاعدةٍ أخرى تعمل على الجهاز
  PORT=$(( ( RANDOM % 10000 ) + 45000 ))
  as_pg "$PG_BIN/pg_ctl -D '$TMP_CLUSTER/data' -o \"-p $PORT -k '$TMP_CLUSTER/data' -c listen_addresses=''\" -w -l '$TMP_CLUSTER/data/server.log' start" >/dev/null \
    || { cat "$TMP_CLUSTER/data/server.log" >&2; fail "تعذّر تشغيل القاعدة المؤقّتة"; }
  as_pg "$PG_BIN/createdb -h '$TMP_CLUSTER/data' -p $PORT -U postgres muallim_test" >/dev/null
  export PGHOST="$TMP_CLUSTER/data" PGPORT="$PORT" PGUSER=postgres PGDATABASE=muallim_test
  if [[ "$(id -u)" -eq 0 ]]; then chmod 755 "$TMP_CLUSTER"; fi
else
  export PGDATABASE="" # يأتي من DATABASE_URL
fi

psql_run() {
  local file="$1"
  if [[ -n "${DATABASE_URL:-}" ]]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -P tuples_only=on -P format=unaligned -f "$file"
  else
    psql -v ON_ERROR_STOP=1 -q -P tuples_only=on -P format=unaligned -f "$file"
  fi
}
psql_cmd() {
  if [[ -n "${DATABASE_URL:-}" ]]; then
    psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "$1"
  else
    psql -v ON_ERROR_STOP=1 -At -c "$1"
  fi
}

log "١) تهيئة ما يوفّره Supabase (أدوار، مخطّط auth، أدوات الفحص)"
psql_run db/local/bootstrap.sql

log "٢) تطبيق المهاجرات بالترتيب"
for m in supabase/migrations/*.sql; do
  printf '   %s\n' "$(basename "$m")"
  psql_run "$m"
done

log "٣) بذرة بيانات الفحص"
psql_run db/test/seed.sql

# ⚠️ مدخلٌ لحقن خللٍ مقصود — يستعمله `db/test/negative-control.sh` وحده.
# الغرض إثبات أنّ هذه الفحوص تلتقط ما بُنيت لالتقاطه: فحصٌ لا يرسب أبداً
# لا قيمة لنجاحه. ولا يُستعمل هذا المدخل في بناءٍ عاديّ.
if [[ -n "${INJECT_SQL:-}" ]]; then
  log "⚠ حقن خللٍ مقصود: $INJECT_SQL"
  psql_run "$INJECT_SQL"
fi

log "٤) الفحوص"
# ⚠️ المخرجات تُحفظ كاملةً ثم تُرشَّح للعرض — لا تُرشَّح وهي تمرّ.
#    ترشيحُها في الأنبوب يبتلع رسالة الفشل نفسها، فيصمت الفحص عند الرسوب
#    بدل أن يصرخ. وقعت هذه هنا فعلاً وكلّفت جولة.
PASS_LOG="$(mktemp)"
OUT="$(mktemp)"
for t in db/test/*.test.sql; do
  printf '\n  ── %s\n' "$(basename "$t")"
  if ! psql_run "$t" > "$OUT" 2>&1; then
    printf '\n'; cat "$OUT" >&2
    rm -f "$OUT" "$PASS_LOG"
    fail "رسب الفحص: $(basename "$t")"
  fi
  # مخرجات `notice` تخرج على مسار الأخطاء، وقد دُمجت أعلاه
  # psql يسبق كل تنبيه بـ`الملفّ:السطر:` — والنمط يحتسب ذلك
  awk '
    /NOTICE:  PASS\|/ { sub(/^.*NOTICE:  PASS\|/, ""); sub(/\|.*$/, "");
                        print "     ✓ " $0; next }
    /NOTICE:/          { next }
    /^[[:space:]]*$/   { next }
                       { print "  " $0 }
  ' "$OUT"
  cat "$OUT" >> "$PASS_LOG"
done
rm -f "$OUT"

log "٥) تدقيق الصلاحيات مقابل القائمة البيضاء المكتوبة"
ACTUAL="$(mktemp)"
if [[ -n "${DATABASE_URL:-}" ]]; then
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -f db/security/audit-grants.sql | LC_ALL=C sort > "$ACTUAL"
else
  psql -v ON_ERROR_STOP=1 -At -f db/security/audit-grants.sql | LC_ALL=C sort > "$ACTUAL"
fi

# القائمة البيضاء تحتمل تعليقات تشرح سبب كشف كل دالّة: صلاحيةٌ بلا سببٍ
# مكتوب صلاحيةٌ لا يجرؤ أحدٌ على حذفها لاحقاً.
EXPECTED="$(mktemp)"
# تُرتَّب قبل المقارنة: القائمة مكتوبةٌ مجمّعةً حسب الغرض ليقرأها إنسان،
# والتدقيق يقارن المحتوى لا الترتيب.
grep -v -e '^[[:space:]]*#' -e '^[[:space:]]*$' db/security/expected-grants.txt | LC_ALL=C sort > "$EXPECTED"

if ! diff -u --label 'المتوقَّع (db/security/expected-grants.txt)' --label 'الفعليّ في القاعدة' "$EXPECTED" "$ACTUAL"; then
  cat >&2 <<'MSG'

  ┌────────────────────────────────────────────────────────────────────────┐
  │ صلاحيات التنفيذ الفعلية تخالف القائمة البيضاء المكتوبة.                │
  │                                                                        │
  │ سطرٌ زائد في اليمين = دالّةٌ صار تنفيذها متاحاً ولم يُقصد ذلك. وإن كان   │
  │ الدور فيه PUBLIC فهي **ثغرة**: أي زائرٍ مجهول يستدعيها عبر الشبكة.      │
  │                                                                        │
  │ إن كانت الإضافة مقصودة: اسحب التنفيذ من PUBLIC في `0007_grants.sql`،   │
  │ وامنحه للدور المحتاج وحده، ثم حدّث `expected-grants.txt`.               │
  └────────────────────────────────────────────────────────────────────────┘
MSG
  rm -f "$ACTUAL" "$EXPECTED"
  exit 1
fi
rm -f "$ACTUAL" "$EXPECTED"
printf '   طابقت القائمة البيضاء.\n'

PASSED=$(grep -c 'NOTICE:  PASS|' "$PASS_LOG" || true)
rm -f "$PASS_LOG"
# أي فشلٍ كان سيوقف التشغيل قبل بلوغ هذا السطر (ON_ERROR_STOP + raise exception)
log "تمّت جميع الفحوص: ${PASSED} تحقّقاً ناجحاً."
[[ "${PASSED:-0}" -gt 0 ]] || fail "لم يُنفَّذ أي تحقّق — الفحص أعمى، وهذا عطلٌ لا نجاح."
