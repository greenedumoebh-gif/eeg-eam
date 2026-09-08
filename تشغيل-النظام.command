#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════
#  نظام الخدمات المساندة المطور — تشغيل بنقرة واحدة (macOS / Linux)
#  يثبّت Deno إن لم يكن موجوداً، ثم يشغّل النظام ويفتح المتصفح.
# ═══════════════════════════════════════════════════════════════
set -e
cd "$(dirname "$0")"

echo "════════════════════════════════════════════"
echo "  نظام الخدمات المساندة المطور — عرض تجريبي"
echo "════════════════════════════════════════════"
echo

if ! command -v deno >/dev/null 2>&1; then
  export PATH="$HOME/.deno/bin:$PATH"
fi

if ! command -v deno >/dev/null 2>&1; then
  echo "» تثبيت Deno لأول مرة (مرة واحدة فقط)..."
  curl -fsSL https://deno.land/install.sh | sh
  export PATH="$HOME/.deno/bin:$PATH"
  echo "» تم التثبيت."
  echo
fi

export INSECURE_COOKIES=true
export DEMO_MODE=true
export KV_PATH="$PWD/data/demo.db"
mkdir -p "$PWD/data"

echo "» تشغيل الخادم على http://localhost:8000"
echo "» لإيقاف النظام: أغلق هذه النافذة أو اضغط Ctrl+C"
echo

( sleep 4
  if command -v open >/dev/null 2>&1; then open http://localhost:8000
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open http://localhost:8000
  fi ) &

exec deno run --allow-net --allow-env --allow-read --allow-write --unstable-kv src/main.ts
