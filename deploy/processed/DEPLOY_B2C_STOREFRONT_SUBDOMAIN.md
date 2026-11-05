# Roteiro de Deploy — Correção da Vitrine B2C & Subdomínio Padrão (`b2c.{seller}.horusb2b.com.br` / `b2c.{seller}.cronuzb2b.com.br`)

## 1. Causa do Erro em Produção (`https://app.horusb2b.com.br/loja/movimento-literario`)
- No componente [`B2COpenStorefront.tsx`](../frontend/src/app/domain/[hostname]/_components/B2COpenStorefront.tsx), a constante `isVindiExpressLink` (linha 869) referenciava `differenceToPay` antes de sua declaração (`const differenceToPay` na linha 1020), disparando `ReferenceError: Cannot access 'differenceToPay' before initialization` no navegador ao montar a loja.
- **Correção aplicada**: As constantes financeiras (`discountApplied`, `differenceToPay` e `remainingCouponBalance`) foram movidas para o topo do escopo do componente, logo após `totalCart`, eliminando a exceção client-side.

## 2. Padrão de Subdomínio Multi-Tenant B2C (`b2c.{seller}.horusb2b.com.br` e `b2c.{seller}.cronuzb2b.com.br`)
- **Nenhum domínio ou configuração existente foi alterado** (`app.horusb2b.com.br`, `app.cronuzb2b.com.br`, `autores.{seller}.cronuzb2b.com.br` e domínios B2B permanecem intocados).
- **Frontend Middleware (`frontend/src/middleware.ts`)**:
  - Adicionado suporte nativo para `b2c.{seller}.horusb2b.com.br`, `b2c.{seller}.cronuzb2b.com.br` e `b2c.{seller}.localhost`, reescrevendo de forma transparente para `/loja/{seller}`.
- **Backend (`backend/app/api/b2c_storefront.py` e `backend/app/api/storefront.py`)**:
  - `GET /b2c/public/resolve-slug` e `GET /storefront/domain/{domain_name}` agora resolvem automaticamente tanto `/loja/{slug}` quanto `b2c.{slug}.horusb2b.com.br`, `b2c.{slug}.cronuzb2b.com.br` e domínios próprios (`b2c_custom_domain`) apontados via CNAME.
- **SSL Wildcard & Nginx (`backend/app/core/ssl_authors.py`)**:
  - O vhost isolado `/etc/nginx/sites-available/cronuz-author-portal` passa a aceitar `~^(autores|b2c)\..+\.(cronuzb2b|horusb2b)\.com\.br$` e inclui automaticamente empresas com `module_b2c_storefront = True` na emissão wildcard `*.{slug}.cronuzb2b.com.br`.

## 3. Como Apontar o DNS (Registro DNS / Domínio Próprio)
1. **Para usar `b2c.{seller}.cronuzb2b.com.br` ou `b2c.{seller}.horusb2b.com.br`**:
   - No gerenciador DNS do domínio base (`horusb2b.com.br` / `cronuzb2b.com.br`), basta ter um registro `A` para `b2c.<slug>` (ex: `b2c.movimento-literario` -> `64.23.182.183`) ou wildcard `*.<slug>` -> `64.23.182.183`.
2. **Para o Seller usar um domínio próprio (ex: `loja.movimentoliterario.com.br`)**:
   - No DNS do cliente, criar um registro **CNAME** de `loja` apontando para `b2c.movimento-literario.horusb2b.com.br` (ou `b2c.movimento-literario.cronuzb2b.com.br`), e informar `loja.movimentoliterario.com.br` no campo **Domínio Próprio da Loja** no painel B2C.
