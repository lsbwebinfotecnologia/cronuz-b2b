# Roteiro de Deploy — Link Secundário de Capas (`cover_image_secondary_base_url`)

## 1. Alteração no Banco de Dados PostgreSQL (`cmp_settings`)

Adiciona a coluna `cover_image_secondary_base_url` na tabela `cmp_settings` para armazenar a URL Base do Servidor Secundário de Capas (Fallback).

### Comando SQL para Produção:
```sql
ALTER TABLE cmp_settings
ADD COLUMN IF NOT EXISTS cover_image_secondary_base_url VARCHAR(500);
```

### Execução no Servidor de Produção (`64.23.182.183`):
```bash
PGPASSWORD=cronuz_password_123 psql -U cronuz_admin -h localhost -d cronuz_b2b -c "ALTER TABLE cmp_settings ADD COLUMN IF NOT EXISTS cover_image_secondary_base_url VARCHAR(500);"
```

## 2. Comportamento Implementado
1. **Primário (`cover_image_base_url`)**: Tenta carregar a capa primeiro em `<cover_image_base_url>/<isbn>.jpg`.
2. **Secundário (`cover_image_secondary_base_url`)**: Caso o link primário não possua a capa (erro 404 / falha de carregamento), tenta automaticamente `<cover_image_secondary_base_url>/<isbn>.jpg`.
3. **Sem Capa**: Apenas se não existir nem no primário nem no secundário (nem no diretório local de uploads), exibe o ícone de "Sem Capa".
