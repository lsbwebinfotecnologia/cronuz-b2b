#!/usr/bin/env bash
# =============================================================================
#  adb-reverse-watch.sh
#  Fica em loop mantendo o adb reverse ativo.
#  Útil quando o Metro já está rodando e o emulador reiniciou.
#  Uso: ./adb-reverse-watch.sh &
# =============================================================================
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export PATH="$PATH:$ANDROID_HOME/platform-tools"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}[adb-watch]${NC} Iniciando monitor de adb reverse..."

while true; do
  DEVICES=$(adb devices 2>/dev/null | grep -c "device$" || true)

  if [ "$DEVICES" -gt 0 ]; then
    adb reverse tcp:8000 tcp:8000 > /dev/null 2>&1 && \
      echo -e "${GREEN}[adb-watch]${NC} $(date '+%H:%M:%S') ✔ :8000 ativo"
    adb reverse tcp:8081 tcp:8081 > /dev/null 2>&1
  else
    echo -e "${YELLOW}[adb-watch]${NC} $(date '+%H:%M:%S') Aguardando emulador..."
  fi

  sleep 15
done
