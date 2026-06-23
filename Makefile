# =============================================================================
#  Cronuz / Horus B2B — Makefile
#  Uso:
#    make dev        → Inicia tudo (backend + emulador + metro + app)
#    make backend    → Só o backend
#    make mobile     → Só metro + app (emulador já deve estar rodando)
#    make adb        → Reconfigura adb reverse
#    make logs       → Tail dos logs do backend
#    make kill       → Para tudo
# =============================================================================

ANDROID_HOME ?= $(HOME)/Library/Android/sdk
JAVA_HOME    ?= /Library/Java/JavaVirtualMachines/zulu-17.jdk/Contents/Home
MOBILE_DIR    = mobile
BACKEND_DIR   = backend
AVD_NAME      = Pixel_9

export ANDROID_HOME
export JAVA_HOME
export PATH := $(PATH):$(ANDROID_HOME)/emulator:$(ANDROID_HOME)/platform-tools

# Variáveis do app
export EXPO_PUBLIC_API_URL    = http://10.0.2.2:8000
export EXPO_PUBLIC_APP_NAME   = Horus B2B
export EXPO_PUBLIC_TENANT_ID  = horus

.PHONY: dev backend mobile adb logs kill emulator frontend

## ── Tudo ──────────────────────────────────────────────────────────────────────
dev:
	@echo "🚀 Iniciando ambiente completo..."
	@bash dev.sh

## ── Só Backend ────────────────────────────────────────────────────────────────
backend:
	@echo "🐍 Iniciando backend..."
	@pkill -f uvicorn 2>/dev/null || true
	@sleep 1
	@cd $(BACKEND_DIR) && source venv/bin/activate && \
	  uvicorn main:app --host 0.0.0.0 --port 8000 --reload

## ── Só Frontend Web ───────────────────────────────────────────────────────────
frontend:
	@echo "🌐 Iniciando frontend Next.js..."
	@cd frontend && npm run dev

## ── Só Mobile (Metro + App) ───────────────────────────────────────────────────
mobile: adb
	@echo "📱 Iniciando Metro + App..."
	@cd $(MOBILE_DIR) && \
	  REACT_NATIVE_PACKAGER_HOSTNAME=localhost \
	  EXPO_PUBLIC_API_URL=$(EXPO_PUBLIC_API_URL) \
	  EXPO_PUBLIC_APP_NAME="$(EXPO_PUBLIC_APP_NAME)" \
	  EXPO_PUBLIC_TENANT_ID=$(EXPO_PUBLIC_TENANT_ID) \
	  npx expo run:android

## ── Emulador ──────────────────────────────────────────────────────────────────
emulator:
	@echo "📲 Iniciando emulador $(AVD_NAME)..."
	@$(ANDROID_HOME)/emulator/emulator -avd $(AVD_NAME) -no-snapshot-load -gpu host &
	@echo "Aguardando boot..."
	@while [ "$$(adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" != "1" ]; do \
	  printf "."; sleep 2; \
	done
	@echo ""
	@echo "✔ Emulador pronto!"
	@$(MAKE) adb

## ── adb reverse ───────────────────────────────────────────────────────────────
adb:
	@echo "🔌 Configurando adb reverse..."
	@adb reverse tcp:8000 tcp:8000 && echo "  ✔ :8000 OK"
	@adb reverse tcp:8081 tcp:8081 && echo "  ✔ :8081 OK"

## ── Logs ──────────────────────────────────────────────────────────────────────
logs:
	@tail -f /tmp/cronuz-backend.log

## ── Para tudo ─────────────────────────────────────────────────────────────────
kill:
	@echo "🛑 Parando processos..."
	@pkill -f uvicorn 2>/dev/null && echo "  Backend parado" || true
	@kill $$(lsof -ti:8081 2>/dev/null) 2>/dev/null && echo "  Metro parado" || true
	@pkill -f "emulator" 2>/dev/null && echo "  Emulador parado" || true
	@echo "Tudo parado."

## ── Status ────────────────────────────────────────────────────────────────────
status:
	@echo "=== Backend ===" && lsof -i :8000 | grep LISTEN | awk '{print "  PID:"$$2, $$1}' || echo "  OFF"
	@echo "=== Metro ===" && lsof -i :8081 | grep LISTEN | awk '{print "  PID:"$$2, $$1}' || echo "  OFF"
	@echo "=== Emulador ===" && adb devices | grep emulator || echo "  Nenhum"
	@echo "=== adb reverse ===" && adb reverse --list 2>/dev/null || echo "  Nenhum"
