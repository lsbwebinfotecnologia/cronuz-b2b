-- ==============================================================================
-- Deploy Script: Módulo Portal do Autor
-- ==============================================================================

-- 1. Coluna de ativação do módulo no Seller
ALTER TABLE cmp_company 
ADD COLUMN IF NOT EXISTS modulo_autores_ativo BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Tabela de autores vinculados aos Sellers
CREATE TABLE IF NOT EXISTS aut_author (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL REFERENCES cmp_company(id) ON DELETE CASCADE,
    
    -- Identificadores no Horus ERP
    cod_empresa INTEGER,
    cod_filial INTEGER,
    cod_fornecedor INTEGER NOT NULL,
    id_guid VARCHAR(100) NOT NULL,
    id_doc VARCHAR(50) NOT NULL, -- CPF ou CNPJ
    
    -- Dados Cadastrais
    nome VARCHAR(255) NOT NULL,
    nome_fantasia VARCHAR(255),
    cnpj VARCHAR(30),
    cpf VARCHAR(30),
    insc_estadual VARCHAR(50),
    num_telefone VARCHAR(50),
    end_email VARCHAR(255),
    
    -- Acesso B2B / Portal do Autor
    emailb2b VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'PENDENTE_ATIVACAO', -- PENDENTE_ATIVACAO, ATIVO, INATIVO
    classificacao_autor VARCHAR(100) NOT NULL DEFAULT 'Autor Principal',
    
    -- Flags de Permissão do Horus
    b2b_mostrar_vendas VARCHAR(1) NOT NULL DEFAULT 'S', -- 'S' ou 'N'
    b2b_mostrar_da VARCHAR(1) NOT NULL DEFAULT 'N',     -- 'S' ou 'N'
    
    -- Token de Ativação / Primeiro Acesso (Hash + Validade 24h)
    activation_token_hash VARCHAR(255),
    activation_token_expires_at TIMESTAMP WITH TIME ZONE,
    
    -- Token de Recuperação de Senha
    reset_token_hash VARCHAR(255),
    reset_token_expires_at TIMESTAMP WITH TIME ZONE,
    
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT uq_company_author_email UNIQUE (company_id, emailb2b),
    CONSTRAINT uq_company_author_guid UNIQUE (company_id, id_guid)
);

CREATE INDEX IF NOT EXISTS idx_aut_author_company ON aut_author(company_id);
CREATE INDEX IF NOT EXISTS idx_aut_author_email ON aut_author(emailb2b);
CREATE INDEX IF NOT EXISTS idx_aut_author_id_guid ON aut_author(id_guid);
