#!/bin/bash
# =============================================================
# start-mobile-dev.sh — Inicia o ambiente de desenvolvimento
# do Cronuz B2B Mobile App
# =============================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
BACKEND_DIR="$PROJECT_ROOT/backend"
MOBILE_DIR="$PROJECT_ROOT/mobile"

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
RED='\033[0;31m'
RESET='\033[0m'

echo ""
echo -e "${CYAN}╔══════════════════════════════════════╗${RESET}"
echo -e "${CYAN}║     Cronuz B2B — Mobile Dev Setup    ║${RESET}"
echo -e "${CYAN}╚══════════════════════════════════════╝${RESET}"
echo ""

# ----- Descobre IP local -----
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")
echo -e "${GREEN}✔ IP local detectado: ${LOCAL_IP}${RESET}"

# ----- Atualiza .env.local com IP atual -----
ENV_FILE="$MOBILE_DIR/.env.local"
echo "EXPO_PUBLIC_API_URL=http://${LOCAL_IP}:8000" > "$ENV_FILE"
echo "EXPO_PUBLIC_APP_NAME=Cronuz B2B" >> "$ENV_FILE"
echo -e "${GREEN}✔ .env.local atualizado com IP: ${LOCAL_IP}${RESET}"

# ----- Verifica se backend está rodando -----
if lsof -i :8000 -sTCP:LISTEN > /dev/null 2>&1; then
  echo -e "${GREEN}✔ Backend já está rodando na porta 8000${RESET}"
else
  echo -e "${YELLOW}⚠ Backend não detectado — iniciando...${RESET}"
  cd "$BACKEND_DIR"
  source venv/bin/activate
  uvicorn main:app --reload --host 0.0.0.0 --port 8000 &
  BACKEND_PID=$!
  sleep 3
  if lsof -i :8000 -sTCP:LISTEN > /dev/null 2>&1; then
    echo -e "${GREEN}✔ Backend iniciado (PID: ${BACKEND_PID})${RESET}"
  else
    echo -e "${RED}✗ Falha ao iniciar o backend. Verifique os logs.${RESET}"
    exit 1
  fi
fi

# ----- Health check do backend -----
echo -e "${CYAN}→ Verificando health do backend...${RESET}"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:8000/" 2>/dev/null || echo "000")
if [ "$HTTP_STATUS" = "200" ] || [ "$HTTP_STATUS" = "422" ] || [ "$HTTP_STATUS" = "404" ]; then
  echo -e "${GREEN}✔ Backend respondendo (HTTP ${HTTP_STATUS})${RESET}"
else
  echo -e "${RED}✗ Backend não está respondendo (HTTP ${HTTP_STATUS})${RESET}"
fi

echo ""
echo -e "${CYAN}════════════════════════════════════════${RESET}"
echo -e "${GREEN}COMO TESTAR:${RESET}"
echo ""
echo -e "  ${YELLOW}📱 Celular físico (Expo Go):${RESET}"
echo -e "     1. Instale o app ${CYAN}Expo Go${RESET} no seu celular (App Store/Play Store)"
echo -e "     2. Conecte o celular na mesma rede Wi-Fi"
echo -e "     3. Escaneie o QR Code que aparecerá no terminal"
echo ""
echo -e "  ${YELLOW}🍎 iOS Simulator (requer Xcode completo):${RESET}"
echo -e "     Pressione ${CYAN}'i'${RESET} no terminal do Expo"
echo ""
echo -e "  ${YELLOW}🤖 Android Emulator (requer Android Studio):${RESET}"
echo -e "     Pressione ${CYAN}'a'${RESET} no terminal do Expo"
echo ""
echo -e "  ${YELLOW}🌐 Modo Tunnel (redes diferentes / VPN):${RESET}"
echo -e "     Pressione ${CYAN}'s'${RESET} no terminal e selecione 'Expo Go'"
echo ""
echo -e "${CYAN}════════════════════════════════════════${RESET}"
echo -e "${GREEN}API do app aponta para: http://${LOCAL_IP}:8000${RESET}"
echo -e "${CYAN}════════════════════════════════════════${RESET}"
echo ""

# ----- Inicia o Metro Bundler -----
echo -e "${GREEN}→ Iniciando Metro Bundler (Expo)...${RESET}"
cd "$MOBILE_DIR"
npx expo start
