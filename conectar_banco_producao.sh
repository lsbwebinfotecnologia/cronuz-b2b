#!/bin/bash

echo "================================================================"
echo "          TUNELAMENTO PARA O BANCO DE DADOS DE PRODUÇÃO         "
echo "================================================================"
echo ""
echo "Este script abrirá um túnel SSH seguro conectando o seu"
echo "computador local diretamente ao banco de dados PostgreSQL"
echo "do servidor de produção (Cronuz B2B)."
echo ""
echo "Enquanto esta janela estiver aberta, a porta 5433 local"
echo "baterá no banco de produção!"
echo ""
echo "PASSO 1: Mantenha esta janela do terminal ativa."
echo "PASSO 2: Edite o arquivo backend/.env e deixe-o assim:"
echo "DATABASE_URL=postgresql://cronuz_admin:cronuz_password_123@localhost:5433/cronuz_b2b"
echo "PASSO 3: Inicie seu backend (uvicorn) normalmente em outro terminal."
echo ""
echo "CUIDADO: QUALQUER EDIÇÃO/EXCLUSÃO NO BACKEND LOCAL AFETARÁ A PRODUÇÃO!"
echo ""
echo "Pressione [ENTER] para abrir a conexão (Para sair depois, use Ctrl+C)..."
read

echo "Iniciando túnel na porta 5433..."
ssh -L 5433:localhost:5432 root@64.23.182.183 -N
