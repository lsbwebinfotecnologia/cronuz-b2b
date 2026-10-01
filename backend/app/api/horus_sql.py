"""
horus_sql.py
------------
Endpoints de gestao do modulo Horus SQL Direct.

DRIVER: pytds (pure Python TDS) — compativel com SQL Server Windows via NAT.
  pymssql usa FreeTDS (lib C do SO) que falha handshake TLS com SQL Server moderno no Linux/Mac.
  pytds implementa TDS em Python puro, igual ao driver Microsoft SQLSRV usado pelo PHP no Windows.

SEGURANCA:
  horus_sql_password NUNCA retornado em plaintext — mascara "SET" ou null.
  Acesso restrito a usuarios autenticados (get_current_user).
"""
import logging
from app.core.utils import parse_host_port, assert_company_ownership
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.db.session import get_db
from app.core.dependencies import get_current_user

router = APIRouter()
log = logging.getLogger(__name__)


# ── Helpers ──────────────────────────────────────────────────────────────────
# [REFACTOR] parse_host_port e assert_company_ownership centralizados em app/core/utils.py

def _get_settings_or_404(db: Session, company_id: int):
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(
        CompanySettings.company_id == company_id
    ).first()
    if not settings:
        raise HTTPException(status_code=404, detail="Configuracoes da empresa nao encontradas.")
    return settings


def _assert_ownership(current_user, company_id: int) -> None:
    """[SEC] Delegado para assert_company_ownership centralizado."""
    assert_company_ownership(current_user, company_id)


def _mask_password(settings) -> Optional[str]:
    """Retorna 'SET' se houver senha configurada, None caso contrario. Nunca expoe o cipher."""
    return "SET" if settings.horus_sql_password else None


# ── Schemas ───────────────────────────────────────────────────────────────────

class HorusSQLSettingsUpdate(BaseModel):
    horus_sql_enabled: Optional[bool] = None
    horus_sql_host: Optional[str] = None
    horus_sql_port: Optional[str] = None
    horus_sql_database: Optional[str] = None
    horus_sql_username: Optional[str] = None
    horus_sql_password: Optional[str] = None  # plaintext — criptografado antes de persistir
    horus_sql_cod_empresa: Optional[str] = None
    horus_sql_cod_filial: Optional[str] = None

    # Parâmetros Bancários Horus (Borderô)
    horus_banco_forma_pagto: Optional[str] = None
    horus_banco_codigo: Optional[str] = None
    horus_banco_agencia: Optional[str] = None
    horus_banco_conta: Optional[str] = None
    horus_banco_carteira: Optional[str] = None

    # Parâmetros de Vendas
    horus_vendas_metodo: Optional[str] = None


class HorusSQLTestLivePayload(BaseModel):
    """Credenciais para teste ao vivo — nao persistidas, apenas para validar a conexao."""
    host: str
    port: Optional[str] = "1433"
    database: str
    username: str
    password: str  # plaintext — descartado apos o teste


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/companies/{company_id}/horus-sql/settings")
def get_horus_sql_settings(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Retorna as configuracoes do Horus SQL Direct e parametros bancarios e de vendas.
    horus_sql_password retorna 'SET' se configurado — NUNCA o valor real.
    """
    _assert_ownership(current_user, company_id)  # [SEC]
    settings = _get_settings_or_404(db, company_id)
    return {
        "horus_sql_enabled":       settings.horus_sql_enabled,
        "horus_sql_host":          settings.horus_sql_host,
        "horus_sql_port":          settings.horus_sql_port or "1433",
        "horus_sql_database":      settings.horus_sql_database,
        "horus_sql_username":      settings.horus_sql_username,
        "horus_sql_password":      _mask_password(settings),
        "horus_sql_cod_empresa":    settings.horus_sql_cod_empresa,
        "horus_sql_cod_filial":     settings.horus_sql_cod_filial,
        "horus_banco_forma_pagto": settings.horus_banco_forma_pagto,
        "horus_banco_codigo":      settings.horus_banco_codigo,
        "horus_banco_agencia":     settings.horus_banco_agencia,
        "horus_banco_conta":       settings.horus_banco_conta,
        "horus_banco_carteira":    settings.horus_banco_carteira,
        "horus_vendas_metodo":     settings.horus_vendas_metodo,
    }


@router.put("/companies/{company_id}/horus-sql/settings")
def update_horus_sql_settings(
    company_id: int,
    payload: HorusSQLSettingsUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Salva configuracoes do Horus SQL Direct e parametros bancarios.
    Se horus_sql_password vier preenchido em plaintext, criptografa antes de persistir.
    Se vier None ou 'SET', mantem o valor atual no banco.
    Ao alterar credenciais, invalida o pool de conexoes do seller.
    """
    _assert_ownership(current_user, company_id)  # [SEC]
    from app.core.horus_sql_crypto import encrypt_sql_credential, is_already_encrypted
    from app.integrators.horus_sql_client import _CONNECTION_POOL, _POOL_LOCK

    settings = _get_settings_or_404(db, company_id)

    if payload.horus_sql_enabled is not None:
        settings.horus_sql_enabled = payload.horus_sql_enabled
    if payload.horus_sql_host is not None:
        settings.horus_sql_host = payload.horus_sql_host.strip() or None
    if payload.horus_sql_port is not None:
        settings.horus_sql_port = payload.horus_sql_port.strip() or "1433"
    if payload.horus_sql_database is not None:
        settings.horus_sql_database = payload.horus_sql_database.strip() or None
    if payload.horus_sql_username is not None:
        settings.horus_sql_username = payload.horus_sql_username.strip() or None
    if payload.horus_sql_cod_empresa is not None:
        settings.horus_sql_cod_empresa = payload.horus_sql_cod_empresa.strip() or None
    if payload.horus_sql_cod_filial is not None:
        settings.horus_sql_cod_filial = payload.horus_sql_cod_filial.strip() or None

    # Parâmetros bancários
    if payload.horus_banco_forma_pagto is not None:
        settings.horus_banco_forma_pagto = payload.horus_banco_forma_pagto.strip() or None
    if payload.horus_banco_codigo is not None:
        settings.horus_banco_codigo = payload.horus_banco_codigo.strip() or None
    if payload.horus_banco_agencia is not None:
        settings.horus_banco_agencia = payload.horus_banco_agencia.strip() or None
    if payload.horus_banco_conta is not None:
        settings.horus_banco_conta = payload.horus_banco_conta.strip() or None
    if payload.horus_banco_carteira is not None:
        settings.horus_banco_carteira = payload.horus_banco_carteira.strip() or None

    # Parâmetros de vendas
    if payload.horus_vendas_metodo is not None:
        settings.horus_vendas_metodo = payload.horus_vendas_metodo.strip() or None

    credentials_changed = False
    if payload.horus_sql_password and payload.horus_sql_password not in ("SET", ""):
        if not is_already_encrypted(payload.horus_sql_password):
            settings.horus_sql_password = encrypt_sql_credential(payload.horus_sql_password)
            credentials_changed = True

    db.commit()
    db.refresh(settings)

    if credentials_changed:
        with _POOL_LOCK:
            entry = _CONNECTION_POOL.pop(company_id, None)
            if entry:
                try:
                    entry["conn"].close()
                except Exception:
                    pass

    return {
        "success": True,
        "message": "Configuracoes Horus SQL salvas com sucesso.",
        "horus_sql_enabled": settings.horus_sql_enabled,
    }


@router.post("/companies/{company_id}/horus-sql/test")
def test_horus_sql_connection(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Testa a conexao usando credenciais JA SALVAS no banco.
    """
    _assert_ownership(current_user, company_id)  # [SEC]
    try:
        from app.integrators.horus_sql_client import HorusSQLClient, HorusSQLConfigError
        client = HorusSQLClient(db, company_id)
        result = client.test_connection()
        if result["status"] == "connected":
            return result
        raise HTTPException(status_code=400, detail=result.get("message", "Falha na conexao SQL."))
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/companies/{company_id}/horus-sql/test-live")
def test_horus_sql_connection_live(
    company_id: int,
    payload: HorusSQLTestLivePayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Testa conexao com credenciais fornecidas diretamente no body (sem salvar antes).
    Usa pytds (pure Python TDS) — compativel com SQL Server Windows via NAT.

    SEGURANCA:
      - Senha usada apenas para o teste e descartada imediatamente (password = '').
      - Nao persistida no banco, nao entra no pool de conexoes.
    """
    import pytds

    _assert_ownership(current_user, company_id)  # [SEC]
    host, port = parse_host_port(payload.host, payload.port or "1433")
    database = payload.database.strip()
    username = payload.username.strip()
    password = payload.password

    if not all([host, database, username, password]):
        raise HTTPException(
            status_code=400,
            detail="Preencha todos os campos obrigatorios: servidor, banco, usuario e senha."
        )

    log.info(f"[HorusSQLTestLive] Testando: {username}@{host}:{port}/{database} (company={company_id})")

    conn = None
    try:
        conn = pytds.connect(
            server=host,
            port=port,
            user=username,
            password=password,
            database=database,
            login_timeout=10,
            as_dict=True,
        )
        cur = conn.cursor()
        cur.execute("SELECT @@VERSION AS version, DB_NAME() AS database_name, GETDATE() AS server_time")
        row = cur.fetchone()

        return {
            "status": "connected",
            "host_resolved": f"{host}:{port}",
            "database": row.get("database_name") if row else database,
            "server_time": str(row.get("server_time")) if row else None,
            "sql_version": str(row.get("version", ""))[:80] if row else None,
            "message": "Conexao ao SQL Server do Horus estabelecida com sucesso!",
        }

    except pytds.DatabaseError as e:
        raw = str(e)
        log.warning(f"[HorusSQLTestLive] Erro auth {host}:{port}: {raw}")
        if "18456" in raw or "Falha de logon" in raw or "Login failed" in raw:
            raise HTTPException(status_code=400, detail=f"Usuario ou senha incorretos para {host}:{port}.")
        if "4060" in raw or "Cannot open database" in raw:
            raise HTTPException(status_code=400, detail=f"Banco '{database}' nao encontrado ou sem permissao em {host}:{port}.")
        raise HTTPException(status_code=400, detail=f"Erro SQL em {host}:{port}: {raw}")

    except Exception as e:
        raw = str(e)
        log.warning(f"[HorusSQLTestLive] Erro conexao {host}:{port}: {raw}")
        if "timeout" in raw.lower() or "timed out" in raw.lower():
            raise HTTPException(status_code=400, detail=f"Timeout ao conectar em {host}:{port}. Verifique IP, porta e NAT do roteador.")
        if "refused" in raw.lower():
            raise HTTPException(status_code=400, detail=f"Conexao recusada em {host}:{port}. SQL Server nao esta aceitando conexoes.")
        raise HTTPException(status_code=400, detail=f"Erro ao conectar em {host}:{port}: {raw}")

    finally:
        password = ""  # limpar da memoria
        if conn:
            try:
                conn.close()
            except Exception:
                pass


@router.get("/companies/{company_id}/horus-sql/status")
def get_horus_sql_module_status(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Retorna status do modulo Horus SQL (habilitado/desabilitado + conexao ativa no pool).
    """
    _assert_ownership(current_user, company_id)  # [SEC]
    from app.integrators.horus_sql_client import _CONNECTION_POOL

    settings = _get_settings_or_404(db, company_id)
    has_pool_connection = company_id in _CONNECTION_POOL

    return {
        "module_enabled": settings.horus_sql_enabled,
        "configured": bool(
            settings.horus_sql_host and settings.horus_sql_database
            and settings.horus_sql_username and settings.horus_sql_password
        ),
        "has_active_connection": has_pool_connection,
    }


# ── Sub-funcionalidades do Horus SQL (habilitadas pelo Master por seller) ──────

class HorusSQLFeaturesUpdate(BaseModel):
    """Payload para ativar/desativar sub-funcionalidades do modulo Horus SQL Direct."""
    horus_sql_feature_vindi_baixa: Optional[bool] = None
    horus_sql_feature_pedidos: Optional[bool] = None
    horus_sql_feature_dbm: Optional[bool] = None


@router.get("/companies/{company_id}/horus-sql/features")
def get_horus_sql_features(
    company_id: int,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Retorna quais sub-funcionalidades do Horus SQL Direct estao habilitadas para o seller.
    Usado pela tela de Modulos do Master para renderizar os toggles.
    """
    _assert_ownership(current_user, company_id)  # [SEC]
    settings = _get_settings_or_404(db, company_id)
    from app.models.company import Company
    company = db.query(Company).filter(Company.id == company_id).first()
    is_module_active = (company.module_horus_sql if company else False) or settings.horus_sql_enabled

    is_sql_configured = bool(
        settings.horus_sql_host and settings.horus_sql_database
        and settings.horus_sql_username and settings.horus_sql_password
    )
    return {
        "sql_configured": is_sql_configured,          # credenciais SQL configuradas (pre-requisito)
        "module_horus_sql": is_module_active,
        "features": {
            "vindi_baixa": getattr(settings, "horus_sql_feature_vindi_baixa", False),
            "pedidos": getattr(settings, "horus_sql_feature_pedidos", False),
            "dbm": getattr(settings, "horus_sql_feature_dbm", False),
        }
    }


@router.patch("/companies/{company_id}/horus-sql/features")
def update_horus_sql_features(
    company_id: int,
    payload: HorusSQLFeaturesUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Ativa ou desativa sub-funcionalidades do Horus SQL Direct para um seller.
    Exclusivo do Master — controla o que aparece no painel do seller.
    """
    _assert_ownership(current_user, company_id)  # [SEC]
    settings = _get_settings_or_404(db, company_id)
    from app.models.company import Company
    company = db.query(Company).filter(Company.id == company_id).first()
    is_module_active = (company.module_horus_sql if company else False) or settings.horus_sql_enabled

    if not is_module_active:
        raise HTTPException(
            status_code=400,
            detail="O modulo Horus SQL Direct precisa estar ativo antes de habilitar sub-funcionalidades."
        )

    changed = False
    if payload.horus_sql_feature_vindi_baixa is not None:
        settings.horus_sql_feature_vindi_baixa = payload.horus_sql_feature_vindi_baixa
        changed = True

    if payload.horus_sql_feature_pedidos is not None:
        settings.horus_sql_feature_pedidos = payload.horus_sql_feature_pedidos
        changed = True

    if payload.horus_sql_feature_dbm is not None:
        settings.horus_sql_feature_dbm = payload.horus_sql_feature_dbm
        changed = True

    if changed:
        db.commit()
        db.refresh(settings)

    return {
        "success": True,
        "features": {
            "vindi_baixa": getattr(settings, "horus_sql_feature_vindi_baixa", False),
            "pedidos": getattr(settings, "horus_sql_feature_pedidos", False),
            "dbm": getattr(settings, "horus_sql_feature_dbm", False),
        }
    }


# ── Busca e Sincronização de Itens (Tabela Itens_estoque_geral + EDITORAS) ──────

class HorusItemImportPayload(BaseModel):
    items: list[dict]


@router.get("/companies/{company_id}/horus-sql/items-estoque-geral")
def get_items_estoque_geral(
    company_id: int,
    search: Optional[str] = None,
    limit: int = 500,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Consulta o acervo de produtos no SQL Server do Horus a partir da tabela
    Itens_estoque_geral com relacionamento em EDITORAS.
    Respeita a configuração de OFFSET/LIMIT e cruza com a base local para indicar
    se o item já foi cadastrado no Cronuz.
    """
    _assert_ownership(current_user, company_id)
    settings = _get_settings_or_404(db, company_id)

    from app.integrators.horus_sql_client import HorusSQLClient, HorusSQLConfigError
    from app.models.product import Product

    limit = min(max(1, limit), 500)
    offset = max(0, offset)

    try:
        sql_client = HorusSQLClient(db, company_id)
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))

    cod_filial = int(sql_client.cod_filial) if str(sql_client.cod_filial).isdigit() else 2

    where_clauses = ["1=1"]
    params = []

    if search and search.strip():
        term = f"%{search.strip()}%"
        where_clauses.append(
            "(I.NOM_ITEM LIKE %s OR I.COD_BARRA_ITEM LIKE %s OR I.COD_ISBN_ITEM LIKE %s OR CAST(I.COD_ITEM AS VARCHAR) LIKE %s OR ED.NOM_FANTASIA LIKE %s OR ED.NOM_EDITORA LIKE %s OR G.NOM_GENERO LIKE %s)"
        )
        params.extend([term, term, term, term, term, term, term])

    where_sql = " AND ".join(where_clauses)
    legacy_pagination = getattr(settings, "horus_legacy_pagination", False)

    if legacy_pagination:
        sql = f"""
            SELECT TOP ({limit})
                I.COD_ITEM AS cod_item,
                ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, '')) AS isbn,
                I.NOM_ITEM AS nome_item,
                ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')) AS editora,
                ISNULL(PA.VLR_CAPA, ISNULL(I.VLR_CAPA, 0.0)) AS preco,
                ISNULL(S.saldo_disponivel, 0) AS estoque,
                ISNULL(G.NOM_GENERO, '') AS assunto,
                ISNULL(I.DESC_SINOPSE, '') AS sinopse
            FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
            LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
            LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
            LEFT JOIN ITENS_ESTPRECO_ATUAL PA WITH (NOLOCK) ON PA.COD_ITEM = I.COD_ITEM
            LEFT JOIN VW_SALDO_ITENS S WITH (NOLOCK) ON S.cod_item = I.COD_ITEM AND S.cod_filial = {cod_filial}
            WHERE {where_sql}
            ORDER BY I.COD_ITEM ASC
        """
    else:
        sql = f"""
            SELECT 
                I.COD_ITEM AS cod_item,
                ISNULL(I.COD_BARRA_ITEM, ISNULL(I.COD_ISBN_ITEM, '')) AS isbn,
                I.NOM_ITEM AS nome_item,
                ISNULL(ED.NOM_FANTASIA, ISNULL(ED.NOM_EDITORA, '')) AS editora,
                ISNULL(PA.VLR_CAPA, ISNULL(I.VLR_CAPA, 0.0)) AS preco,
                ISNULL(S.saldo_disponivel, 0) AS estoque,
                ISNULL(G.NOM_GENERO, '') AS assunto,
                ISNULL(I.DESC_SINOPSE, '') AS sinopse
            FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
            LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
            LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
            LEFT JOIN ITENS_ESTPRECO_ATUAL PA WITH (NOLOCK) ON PA.COD_ITEM = I.COD_ITEM
            LEFT JOIN VW_SALDO_ITENS S WITH (NOLOCK) ON S.cod_item = I.COD_ITEM AND S.cod_filial = {cod_filial}
            WHERE {where_sql}
            ORDER BY I.COD_ITEM ASC
            OFFSET {offset} ROWS
            FETCH NEXT {limit} ROWS ONLY
        """

    try:
        rows = sql_client.query(sql, tuple(params) if params else None, max_rows=limit)
    except Exception as e:
        log.warning(f"[HorusSQL] Falha na consulta Itens_estoque_geral: {e}")
        return {
            "items": [],
            "total": 0,
            "offset": offset,
            "limit": limit,
            "error_detail": str(e),
            "message": f"Falha na consulta ao Horus SQL Server: {e}"
        }

    # Busca SKUs locais para sinalizar itens já importados
    local_products = db.query(Product.id, Product.sku, Product.ean_gtin, Product.horus_cod_item).filter(
        Product.company_id == company_id
    ).all()
    local_skus = {str(p.sku): p.id for p in local_products if p.sku}
    local_eans = {str(p.ean_gtin): p.id for p in local_products if p.ean_gtin}
    local_horus_codes = {int(p.horus_cod_item): p.id for p in local_products if p.horus_cod_item}

    enriched_items = []
    for r in rows:
        raw_cod = r.get("cod_item")
        cod_str = str(raw_cod or "")
        cod_int = int(raw_cod) if str(raw_cod).isdigit() else None
        isbn_str = str(r.get("isbn") or "")
        already_imported = False
        local_id = None

        if cod_int is not None and cod_int in local_horus_codes:
            already_imported = True
            local_id = local_horus_codes[cod_int]
        elif cod_str in local_skus:
            already_imported = True
            local_id = local_skus[cod_str]
        elif isbn_str and isbn_str in local_eans:
            already_imported = True
            local_id = local_eans[isbn_str]

        enriched_items.append({
            "cod_item": cod_str,
            "isbn": isbn_str,
            "nome_item": str(r.get("nome_item") or ""),
            "editora": str(r.get("editora") or ""),
            "preco": float(r.get("preco") or 0.0),
            "estoque": int(r.get("estoque") or 0),
            "assunto": str(r.get("assunto") or ""),
            "sinopse": str(r.get("sinopse") or ""),
            "already_imported": already_imported,
            "local_product_id": local_id,
        })

    return {
        "items": enriched_items,
        "total": len(enriched_items),
        "offset": offset,
        "limit": limit,
    }


@router.post("/companies/{company_id}/horus-sql/import-items")
def import_items_from_horus(
    company_id: int,
    payload: HorusItemImportPayload,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Importa/Sincroniza os itens selecionados (flegados) do Horus SQL na tabela prd_product do Cronuz.
    Salva o horus_cod_item na tabela prd_product para cruzamento e relatórios analíticos futuros.
    Cria ou associa editora (Brand) e categoria (Gênero) correspondentes.
    """
    _assert_ownership(current_user, company_id)

    from app.models.product import Product
    from app.models.catalog_support import Brand, Category

    imported_count = 0
    updated_count = 0

    try:
        for item in payload.items:
            cod_item = str(item.get("cod_item") or "").strip()
            if not cod_item:
                continue

            horus_code_int = int(cod_item) if cod_item.isdigit() else None
            nome = str(item.get("nome_item") or "").strip() or f"Produto #{cod_item}"
            isbn = str(item.get("isbn") or "").strip()
            
            try:
                preco = float(item.get("preco") or 0.0)
            except (ValueError, TypeError):
                preco = 0.0

            try:
                estoque = int(float(item.get("estoque") or 0))
            except (ValueError, TypeError):
                estoque = 0

            editora_nome = str(item.get("editora") or "").strip()[:100]
            assunto_nome = str(item.get("assunto") or "").strip()[:100]
            sinopse = str(item.get("sinopse") or "").strip()

            # Vincula ou cria Editora / Marca
            brand_id = None
            if editora_nome:
                brand = db.query(Brand).filter(
                    Brand.company_id == company_id,
                    Brand.name == editora_nome
                ).first()
                if not brand:
                    brand = Brand(company_id=company_id, name=editora_nome)
                    db.add(brand)
                    db.flush()
                brand_id = brand.id

            # Vincula ou cria Categoria / Assunto (Gênero)
            category_id = None
            if assunto_nome:
                cat = db.query(Category).filter(
                    Category.company_id == company_id,
                    Category.name == assunto_nome
                ).first()
                if not cat:
                    cat = Category(company_id=company_id, name=assunto_nome)
                    db.add(cat)
                    db.flush()
                category_id = cat.id

            # Verifica se já existe produto com esse horus_cod_item ou SKU para esta empresa
            existing_product = None
            if horus_code_int is not None:
                existing_product = db.query(Product).filter(
                    Product.company_id == company_id,
                    Product.horus_cod_item == horus_code_int
                ).first()

            if not existing_product:
                existing_product = db.query(Product).filter(
                    Product.company_id == company_id,
                    Product.sku == cod_item
                ).first()

            if not existing_product and isbn:
                existing_product = db.query(Product).filter(
                    Product.company_id == company_id,
                    Product.ean_gtin == isbn
                ).first()

            if existing_product:
                existing_product.name = nome
                if isbn:
                    existing_product.ean_gtin = isbn
                existing_product.base_price = preco
                existing_product.stock_quantity = estoque
                existing_product.horus_cod_item = horus_code_int
                if brand_id:
                    existing_product.brand_id = brand_id
                if category_id:
                    existing_product.category_id = category_id
                if sinopse:
                    existing_product.long_description = sinopse
                updated_count += 1
            else:
                new_prod = Product(
                    company_id=company_id,
                    sku=cod_item,
                    name=nome,
                    ean_gtin=isbn,
                    base_price=preco,
                    stock_quantity=estoque,
                    horus_cod_item=horus_code_int,
                    brand_id=brand_id,
                    category_id=category_id,
                    long_description=sinopse if sinopse else None,
                    status="ACTIVE"
                )
                db.add(new_prod)
                imported_count += 1

        db.commit()

        return {
            "success": True,
            "imported_count": imported_count,
            "updated_count": updated_count,
            "total_processed": len(payload.items)
        }
    except Exception as e:
        db.rollback()
        log.error(f"[HorusSQL] Erro ao importar itens: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao importar produtos: {str(e)}")
