#!/usr/bin/env bash
# =============================================================================
#  Cronuz / Horus B2B — Dev Start Script
#  Uso: ./dev.sh
#  O que faz:
#    1. Sobe o backend (FastAPI/uvicorn) na porta 8000
#    2. Inicia o emulador Android (Pixel_9) se não estiver rodando
#    3. Aguarda o emulador ficar pronto
#    4. Configura adb reverse (8000 + 8081)
#    5. Inicia o Metro Bundler com as variáveis corretas
#    6. Abre o app no emulador
# =============================================================================
set -euo pipefail

# ── Configurações ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
MOBILE_DIR="$SCRIPT_DIR/mobile"
AVD_NAME="Pixel_9"

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export JAVA_HOME="${JAVA_HOME:-/Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home}"
export PATH="$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools:$ANDROID_HOME/tools"

EXPO_PUBLIC_API_URL="http://10.0.2.2:8000"
EXPO_PUBLIC_APP_NAME="Horus B2B"
EXPO_PUBLIC_TENANT_ID="horus"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[DEV]${NC} $*"; }
ok()   { echo -e "${GREEN}[✔]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[✗]${NC} $*"; }

echo ""
echo -e "${BLUE}╔══════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     Cronuz / Horus B2B — Dev Startup     ║${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════╝${NC}"
echo ""

# ── PASSO 1: Mata processos antigos ──────────────────────────────────────────
log "Limpando processos antigos..."
pkill -f uvicorn 2>/dev/null && warn "uvicorn anterior parado" || true
kill "$(lsof -ti:8081 2>/dev/null)" 2>/dev/null && warn "Metro anterior parado" || true
sleep 2

# ── PASSO 2: Sobe o Backend ───────────────────────────────────────────────────
log "Iniciando backend (FastAPI)..."
cd "$BACKEND_DIR"
source venv/bin/activate

nohup uvicorn main:app \
  --host 0.0.0.0 \
  --port 8000 \
  --reload \
  >> /tmp/cronuz-backend.log 2>&1 &
BACKEND_PID=$!

# Aguarda o backend responder
log "Aguardando backend na porta 8000..."
for i in $(seq 1 20); do
  if curl -s http://localhost:8000/ > /dev/null 2>&1; then
    ok "Backend rodando (PID $BACKEND_PID)"
    break
  fi
  sleep 1
  if [ "$i" -eq 20 ]; then
    err "Backend não respondeu em 20s. Verifique /tmp/cronuz-backend.log"
    exit 1
  fi
done

# ── PASSO 3: Emulador ─────────────────────────────────────────────────────────
log "Verificando emulador Android..."
EMULATOR_RUNNING=$(adb devices 2>/dev/null | grep -c "emulator.*device" || true)

if [ "$EMULATOR_RUNNING" -eq 0 ]; then
  log "Iniciando emulador '$AVD_NAME'..."
  nohup "$ANDROID_HOME/emulator/emulator" \
    -avd "$AVD_NAME" \
    -no-snapshot-load \
    -gpu host \
    >> /tmp/cronuz-emulator.log 2>&1 &

  log "Aguardando emulador inicializar (~30-60s)..."
  for i in $(seq 1 90); do
    BOOT=$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')
    if [ "$BOOT" = "1" ]; then
      ok "Emulador pronto!"
      break
    fi
    printf "."
    sleep 2
    if [ "$i" -eq 90 ]; then
      err "Emulador não inicializou em 3min."
      exit 1
    fi
  done
  echo ""
else
  ok "Emulador já está rodando"
fi

sleep 3

# ── PASSO 4: adb reverse ──────────────────────────────────────────────────────
log "Configurando adb reverse..."
adb reverse tcp:8000 tcp:8000 && ok "adb reverse :8000 → localhost:8000"
adb reverse tcp:8081 tcp:8081 && ok "adb reverse :8081 → localhost:8081"

# ── PASSO 5: Metro + App ──────────────────────────────────────────────────────
log "Iniciando Metro Bundler e abrindo app..."
cd "$MOBILE_DIR"

# REACT_NATIVE_PACKAGER_HOSTNAME=localhost força Metro a usar localhost
# O emulador acessa via adb reverse (localhost:8081 -> host:8081)
REACT_NATIVE_PACKAGER_HOSTNAME=localhost \
EXPO_PUBLIC_API_URL="$EXPO_PUBLIC_API_URL" \
EXPO_PUBLIC_APP_NAME="$EXPO_PUBLIC_APP_NAME" \
EXPO_PUBLIC_TENANT_ID="$EXPO_PUBLIC_TENANT_ID" \
npx expo run:android 2>&1

# Fallback: se expo run:android sair, mantém Metro vivo com adb reverse
log "Mantendo adb reverse ativo em loop (Ctrl+C para sair)..."
while true; do
  sleep 30
  adb reverse tcp:8000 tcp:8000 2>/dev/null || true
  adb reverse tcp:8081 tcp:8081 2>/dev/null || true
done
