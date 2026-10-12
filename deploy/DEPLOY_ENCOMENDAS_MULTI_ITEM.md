# Roteiro de Deploy: Módulo Encomendas Multi-título e Logística (B2C/B2B)

**Data:** 2026-10-11  
**Módulo:** Encomendas do Cliente e Suprimentos com Ativação por Seller (Master Control)

---

## 🗄️ 1. Alterações no Banco de Dados (PostgreSQL)

Execute os scripts SQL no banco de produção:

```bash
# 1. Adição da flag do Módulo Encomendas na empresa (controle Master)
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/alter_cmp_company_add_module_encomendas.sql

# 2. Criação das tabelas de Encomenda do Cliente Multi-título e Itens
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -f /var/www/cronuz/deploy/create_customer_encomenda_tables.sql
```

### Estruturas Criadas / Modificadas:
- `cmp_company.module_encomendas`: Coluna booleana (default `false`) ativada pelo Master no gerenciamento de módulos do seller.
- `ord_customer_encomenda`: Cabeçalho do pedido da encomenda com cliente, entrega (Retirada no Balcão ou Entrega em Endereço), totais e status operacional.
- `ord_customer_encomenda_item`: Itens/títulos da encomenda com ISBN, quantidade, preço unitário, total e vínculo com fornecedor/catálogo.

---

## 🎯 2. Experiência Operacional Diferenciada

Ficou estritamente clara e organizada a separação entre:
1. **Encomenda do Cliente:** Pedido solicitado pelo consumidor final no balcão de atendimento ou Busca Preço com múltiplos livros, dados de contato e endereço de entrega/retirada, além de botão com link direto para notificação de chegada via **WhatsApp**.
2. **Compra com Fornecedor:** Etapa de abastecimento junto a editoras/distribuidoras (ERP Hórus ou Bookinfo).

---

## 🚀 3. Deploy da Aplicação

```bash
cd /var/www/cronuz && git pull origin main
cd /var/www/cronuz/frontend && npm run build
pm2 restart cronuz-frontend
systemctl restart cronuz-backend
```

---

## 🩺 4. Validação

```bash
curl -s -o /dev/null -w 'Backend: %{http_code}\n' http://localhost:8000/docs
curl -s -o /dev/null -w 'Frontend: %{http_code}\n' http://localhost:3000/encomendas
```

