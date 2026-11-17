# Deploy: Preferência de Menu Lateral Recolhido (`sidebar_collapsed`) por Usuário

## 1. Alteração no Banco de Dados (PostgreSQL)

Execute o comando DDL abaixo no banco `cronuz_b2b`:

```sql
ALTER TABLE usr_user
ADD COLUMN IF NOT EXISTS sidebar_collapsed BOOLEAN NOT NULL DEFAULT FALSE;
```

### Comando completo para Produção:
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -c "ALTER TABLE usr_user ADD COLUMN IF NOT EXISTS sidebar_collapsed BOOLEAN NOT NULL DEFAULT FALSE;"
```

---

## 2. Resumo das Alterações
- Adicionado campo `sidebar_collapsed` na tabela `usr_user` e endpoints `GET /users/me/ui-preferences` e `PATCH /users/me/ui-preferences`.
- Adicionado botão de recolher/expandir (`PanelLeftClose` / `PanelLeftOpen`) no topo da barra lateral (`Sidebar.tsx`), permitindo alternar entre o modo completo (`w-64`) e o modo compacto somente ícones (`w-[68px]`) com *flyout* flutuante de submenus ao passar o mouse.
- Persistência híbrida por usuário (`localStorage` + banco de dados PostgreSQL).
