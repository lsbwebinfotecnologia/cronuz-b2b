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
from typing import Any, Dict, Optional
from sqlalchemy.orm.attributes import flag_modified
from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.payments.catalog import get_company_reconciliation_profiles

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

    # Parâmetros Bancários Horus (Borderô Padrão)
    horus_banco_forma_pagto: Optional[str] = None
    horus_banco_codigo: Optional[str] = None
    horus_banco_agencia: Optional[str] = None
    horus_banco_conta: Optional[str] = None
    horus_banco_carteira: Optional[str] = None

    # Parâmetros Bancários Horus individuais por Tipo de Conciliação (TRAY_SHOPEE, TRAY_TIKTOK, TRAY_VINDI, VINDI_DIRECT)
    reconciliation_banks: Optional[Dict[str, Dict[str, Any]]] = None

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
    all_profiles = get_company_reconciliation_profiles(settings)
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
        "reconciliation_profiles": all_profiles,
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

    # Parâmetros bancários individuais por tipo de conciliação (salvos pelo Seller)
    if payload.reconciliation_banks and isinstance(payload.reconciliation_banks, dict):
        raw_cfg = dict(settings.b2c_showcases_config) if isinstance(settings.b2c_showcases_config, dict) else {}
        bank_reconciliations = (
            dict(raw_cfg.get("bank_reconciliations"))
            if isinstance(raw_cfg.get("bank_reconciliations"), dict)
            else {}
        )
        for prof_code, prof_bank in payload.reconciliation_banks.items():
            if not isinstance(prof_bank, dict):
                continue
            code_norm = str(prof_code).upper().strip()
            existing = (
                dict(bank_reconciliations.get(code_norm))
                if isinstance(bank_reconciliations.get(code_norm), dict)
                else {}
            )
            forma_pagto = str(prof_bank.get("forma_pagto") or "").strip()
            forma_pagto_credito_maior = str(
                prof_bank.get("forma_pagto_credito_maior")
                if "forma_pagto_credito_maior" in prof_bank
                else existing.get("forma_pagto_credito_maior") or ""
            ).strip()
            banco = str(prof_bank.get("banco") or "").strip()
            agencia = str(prof_bank.get("agencia") or "").strip()
            conta = str(prof_bank.get("conta") or "").strip()
            carteira = str(prof_bank.get("carteira") or "").strip()
            payment_date_mode = str(prof_bank.get("payment_date_mode") or existing.get("payment_date_mode") or "CHANNEL_DATE").upper().strip()
            if payment_date_mode not in ("CHANNEL_DATE", "SPECIFIC_DATE", "BORDERO_OPEN"):
                payment_date_mode = "CHANNEL_DATE"
            default_unify = code_norm in ("TRAY_SHOPEE", "TRAY_TIKTOK")
            if "unify_installments" in prof_bank and prof_bank.get("unify_installments") is not None:
                unify_installments = bool(prof_bank.get("unify_installments"))
            elif "unify_installments" in existing and existing.get("unify_installments") is not None:
                unify_installments = bool(existing.get("unify_installments"))
            else:
                unify_installments = default_unify

            if "split_excess_launch" in prof_bank and prof_bank.get("split_excess_launch") is not None:
                split_excess_launch = bool(prof_bank.get("split_excess_launch"))
            elif "split_excess_launch" in existing and existing.get("split_excess_launch") is not None:
                split_excess_launch = bool(existing.get("split_excess_launch"))
            else:
                split_excess_launch = True

            has_any = any(bool(x) for x in (forma_pagto, forma_pagto_credito_maior, banco, agencia, conta, carteira))

            existing.update({
                "use_custom_bank": has_any,
                "forma_pagto": forma_pagto,
                "forma_pagto_credito_maior": forma_pagto_credito_maior,
                "banco": banco,
                "agencia": agencia,
                "conta": conta,
                "carteira": carteira,
                "payment_date_mode": payment_date_mode,
                "unify_installments": unify_installments,
                "split_excess_launch": split_excess_launch,
            })
            bank_reconciliations[code_norm] = existing

        raw_cfg["bank_reconciliations"] = bank_reconciliations
        settings.b2c_showcases_config = raw_cfg
        flag_modified(settings, "b2c_showcases_config")

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
        # Se alguma feature do Horus SQL foi ativada, garante que usuários Seller com lista restrita enxerguem o módulo
        perms_to_add = []
        if payload.horus_sql_feature_pedidos is True or payload.horus_sql_feature_vindi_baixa is True:
            perms_to_add.append("horus_sql")
        if payload.horus_sql_feature_dbm is True:
            perms_to_add.extend(["horus_sql", "dbm"])
        if perms_to_add:
            from app.models.user import User, UserRole
            seller_users = db.query(User).filter(
                User.company_id == company_id,
                User.type == UserRole.SELLER,
            ).all()
            for su in seller_users:
                if isinstance(su.allowed_modules, list) and len(su.allowed_modules) > 0:
                    updated_list = list(su.allowed_modules)
                    changed_su = False
                    for p in perms_to_add:
                        if p not in updated_list:
                            updated_list.append(p)
                            changed_su = True
                    if changed_su:
                        su.allowed_modules = updated_list
                        flag_modified(su, "allowed_modules")
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
@router.get("/companies/{company_id}/horus-sql/estoque-geral")
def get_items_estoque_geral(
    company_id: int,
    search: Optional[str] = None,
    q: Optional[str] = None,
    editora: Optional[str] = None,
    only_not_imported: bool = False,
    only_imported: bool = False,
    limit: int = 5000,
    offset: int = 0,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """
    Consulta o acervo completo de produtos no SQL Server do Horus a partir da tabela
    Itens_estoque_geral com relacionamento em EDITORAS.
    Respeita a configuração de OFFSET/LIMIT e cruza com a base local para indicar
    se o item já foi cadastrado no Cronuz DBM.
    """
    _assert_ownership(current_user, company_id)
    settings = _get_settings_or_404(db, company_id)

    from app.integrators.horus_sql_client import HorusSQLClient, HorusSQLConfigError
    from app.models.product import Product

    limit = min(max(1, limit), 10000)
    offset = max(0, offset)

    try:
        sql_client = HorusSQLClient(db, company_id)
    except HorusSQLConfigError as e:
        raise HTTPException(status_code=400, detail=str(e))

    cod_filial = int(sql_client.cod_filial) if str(sql_client.cod_filial).isdigit() else 2

    where_clauses = ["1=1"]
    params = []

    effective_search = (search or q or "").strip()
    if effective_search:
        term = f"%{effective_search}%"
        where_clauses.append(
            "(I.NOM_ITEM LIKE %s OR I.COD_BARRA_ITEM LIKE %s OR I.COD_ISBN_ITEM LIKE %s OR CAST(I.COD_ITEM AS VARCHAR) LIKE %s OR ED.NOM_FANTASIA LIKE %s OR ED.NOM_EDITORA LIKE %s OR G.NOM_GENERO LIKE %s)"
        )
        params.extend([term, term, term, term, term, term, term])

    if editora and editora.strip():
        ed_term = f"%{editora.strip()}%"
        where_clauses.append("(ED.NOM_FANTASIA LIKE %s OR ED.NOM_EDITORA LIKE %s)")
        params.extend([ed_term, ed_term])

    where_sql = " AND ".join(where_clauses)
    legacy_pagination = getattr(settings, "horus_legacy_pagination", False)

    # Detecta coluna de data de lançamento disponível em ITENS_ESTOQUE_GERAL
    launch_col_expr = "I.DAT_VAL_ESTGRUPO"
    try:
        cols_res = sql_client.query(
            "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ITENS_ESTOQUE_GERAL' AND COLUMN_NAME IN ('DAT_LANCAMENTO', 'DAT_EXP_LANCTO', 'DAT_EDICAO', 'DAT_CADASTRO', 'DAT_VAL_ESTGRUPO')",
            max_rows=10
        )
        avail_cols = {str(c.get("COLUMN_NAME") or "").upper() for c in (cols_res or [])}
        coalesce_parts = [f"I.{c}" for c in ("DAT_LANCAMENTO", "DAT_EXP_LANCTO", "DAT_EDICAO", "DAT_CADASTRO", "DAT_VAL_ESTGRUPO") if c in avail_cols]
        if coalesce_parts:
            launch_col_expr = f"COALESCE({', '.join(coalesce_parts)})" if len(coalesce_parts) > 1 else coalesce_parts[0]
    except Exception:
        pass

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
                ISNULL(I.DESC_SINOPSE, '') AS sinopse,
                ISNULL(I.QTD_ITENS_CAIXA, 0) AS qtd_caixa,
                {launch_col_expr} AS data_lancamento
            FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
            LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
            LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
            LEFT JOIN (
                SELECT COD_ITEM, MAX(VLR_CAPA) AS VLR_CAPA
                FROM ITENS_ESTPRECO_ATUAL WITH (NOLOCK)
                GROUP BY COD_ITEM
            ) PA ON PA.COD_ITEM = I.COD_ITEM
            LEFT JOIN (
                SELECT cod_item, SUM(ISNULL(saldo_disponivel, 0)) AS saldo_disponivel
                FROM VW_SALDO_ITENS WITH (NOLOCK)
                WHERE cod_filial = {cod_filial}
                GROUP BY cod_item
            ) S ON S.cod_item = I.COD_ITEM
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
                ISNULL(I.DESC_SINOPSE, '') AS sinopse,
                ISNULL(I.QTD_ITENS_CAIXA, 0) AS qtd_caixa,
                {launch_col_expr} AS data_lancamento
            FROM ITENS_ESTOQUE_GERAL I WITH (NOLOCK)
            LEFT JOIN EDITORA ED WITH (NOLOCK) ON ED.COD_EDITORA = I.COD_EDITORA
            LEFT JOIN TABELA_GENERO G WITH (NOLOCK) ON G.COD_GENERO = I.COD_GENERO
            LEFT JOIN (
                SELECT COD_ITEM, MAX(VLR_CAPA) AS VLR_CAPA
                FROM ITENS_ESTPRECO_ATUAL WITH (NOLOCK)
                GROUP BY COD_ITEM
            ) PA ON PA.COD_ITEM = I.COD_ITEM
            LEFT JOIN (
                SELECT cod_item, SUM(ISNULL(saldo_disponivel, 0)) AS saldo_disponivel
                FROM VW_SALDO_ITENS WITH (NOLOCK)
                WHERE cod_filial = {cod_filial}
                GROUP BY cod_item
            ) S ON S.cod_item = I.COD_ITEM
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
            "total_count": 0,
            "total_all": 0,
            "total_imported": 0,
            "total_not_imported": 0,
            "offset": offset,
            "limit": limit,
            "error_detail": str(e),
            "message": f"Falha na consulta ao Horus SQL Server: {e}"
        }

    # Busca SKUs locais para sinalizar itens já importados
    local_products = db.query(
        Product.id,
        Product.sku,
        Product.ean_gtin,
        Product.horus_cod_item,
        Product.additional_isbns
    ).filter(
        Product.company_id == company_id
    ).all()
    local_skus = {str(p.sku): p.id for p in local_products if p.sku}
    local_eans = {str(p.ean_gtin): p.id for p in local_products if p.ean_gtin}
    local_horus_codes = {int(p.horus_cod_item): p.id for p in local_products if p.horus_cod_item}
    local_extra_isbns = {p.id: (p.additional_isbns or "") for p in local_products}

    enriched_items = []
    seen_cods = set()
    for r in rows:
        raw_cod = r.get("cod_item")
        cod_str = str(raw_cod or "").strip()
        if not cod_str or cod_str in seen_cods:
            continue
        seen_cods.add(cod_str)

        cod_int = int(raw_cod) if cod_str.isdigit() else None
        isbn_str = str(r.get("isbn") or "").strip()
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

        raw_dt = r.get("data_lancamento")
        dt_iso = raw_dt.isoformat() if hasattr(raw_dt, "isoformat") else (str(raw_dt) if raw_dt else None)

        enriched_items.append({
            "cod_item": cod_str,
            "isbn": isbn_str,
            "nome_item": str(r.get("nome_item") or ""),
            "editora": str(r.get("editora") or ""),
            "preco": float(r.get("preco") or 0.0),
            "estoque": int(r.get("estoque") or 0),
            "assunto": str(r.get("assunto") or ""),
            "sinopse": str(r.get("sinopse") or ""),
            "qtd_caixa": int(r.get("qtd_caixa") or 0),
            "data_lancamento": dt_iso,
            "already_imported": already_imported,
            "local_product_id": local_id,
            "additional_isbns": local_extra_isbns.get(local_id, "") if local_id else "",
        })

    total_all = len(enriched_items)
    total_imported = sum(1 for x in enriched_items if x["already_imported"])
    total_not_imported = total_all - total_imported

    if only_not_imported:
        filtered_items = [x for x in enriched_items if not x["already_imported"]]
    elif only_imported:
        filtered_items = [x for x in enriched_items if x["already_imported"]]
    else:
        filtered_items = enriched_items

    return {
        "items": filtered_items,
        "total": len(filtered_items),
        "total_count": len(filtered_items),
        "total_all": total_all,
        "total_imported": total_imported,
        "total_not_imported": total_not_imported,
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
    Salva o horus_cod_item e launch_date na tabela prd_product para cruzamento e relatórios analíticos futuros.
    Cria ou associa editora (Brand) e categoria (Gênero) correspondentes.
    """
    _assert_ownership(current_user, company_id)

    from datetime import datetime
    from app.models.product import Product
    from app.models.catalog_support import Brand, Category

    def _parse_launch_dt(val) -> Optional[datetime]:
        if not val:
            return None
        if isinstance(val, datetime):
            return val
        s = str(val).strip()
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d", "%d/%m/%Y"):
            try:
                return datetime.strptime(s[:19] if "T" in fmt or ":" in fmt else s[:10], fmt)
            except Exception:
                continue
        return None

    imported_count = 0
    updated_count = 0
    synced_product_ids = []

    def _merge_isbns(existing_str: Optional[str], new_str: Optional[str], primary_isbn: str = "") -> Optional[str]:
        parts = []
        for src in (existing_str or "", new_str or ""):
            for raw in src.replace(";", ",").replace("\n", ",").split(","):
                cleaned = "".join(ch for ch in raw.strip() if ch.isdigit() or ch.upper() == "X")
                if cleaned and cleaned != primary_isbn and cleaned not in parts:
                    parts.append(cleaned)
        return ", ".join(parts) if parts else None

    try:
        for item in payload.items:
            cod_item = str(item.get("cod_item") or "").strip()
            if not cod_item:
                continue

            horus_code_int = int(cod_item) if cod_item.isdigit() else None
            nome = str(item.get("nome_item") or "").strip() or f"Produto #{cod_item}"
            isbn = str(item.get("isbn") or "").strip()
            raw_additional_isbns = str(item.get("additional_isbns") or "").strip()
            
            try:
                preco = float(item.get("preco") or 0.0)
            except (ValueError, TypeError):
                preco = 0.0

            try:
                estoque = int(float(item.get("estoque") or 0))
            except (ValueError, TypeError):
                estoque = 0

            try:
                qtd_caixa = int(float(item.get("qtd_caixa") or 0)) if item.get("qtd_caixa") else None
            except (ValueError, TypeError):
                qtd_caixa = None

            editora_nome = str(item.get("editora") or "").strip()[:100]
            assunto_nome = str(item.get("assunto") or "").strip()[:100]
            sinopse = str(item.get("sinopse") or "").strip()
            status_horus = str(item.get("status") or "").strip().upper()
            is_esgotado = "ESGOTADO" in status_horus or "FORA DE LINHA" in status_horus
            upper_nome_assunto = f"{nome} {assunto_nome}".upper()
            is_ebook_detected = (
                bool(item.get("is_ebook"))
                or "[E-BOOK]" in upper_nome_assunto
                or "[EBOOK]" in upper_nome_assunto
                or "E-BOOK" in upper_nome_assunto
                or "EBOOK" in upper_nome_assunto
            )
            launch_dt = _parse_launch_dt(item.get("data_lancamento") or item.get("launch_date"))

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
                    if not existing_product.barcode:
                        existing_product.barcode = isbn
                existing_product.base_price = preco
                existing_product.stock_quantity = estoque
                existing_product.horus_cod_item = horus_code_int
                if not existing_product.cod_dbm:
                    existing_product.cod_dbm = str(existing_product.id or cod_item)
                if qtd_caixa is not None:
                    existing_product.units_per_box = qtd_caixa
                if launch_dt:
                    existing_product.launch_date = launch_dt
                    if not existing_product.launch_month:
                        existing_product.launch_month = launch_dt.month
                    if not existing_product.launch_year:
                        existing_product.launch_year = launch_dt.year
                if brand_id:
                    existing_product.brand_id = brand_id
                if editora_nome and not existing_product.brand:
                    existing_product.brand = editora_nome
                if category_id:
                    existing_product.category_id = category_id
                if assunto_nome and not existing_product.subject:
                    existing_product.subject = assunto_nome
                if sinopse:
                    existing_product.long_description = sinopse
                if is_esgotado:
                    existing_product.is_out_of_print = True
                if is_ebook_detected:
                    existing_product.is_ebook = True
                if raw_additional_isbns:
                    existing_product.additional_isbns = _merge_isbns(
                        existing_product.additional_isbns, raw_additional_isbns, isbn
                    )
                db.flush()
                synced_product_ids.append(existing_product.id)
                updated_count += 1
            else:
                merged_extra_isbns = _merge_isbns(None, raw_additional_isbns, isbn)
                new_prod = Product(
                    company_id=company_id,
                    sku=cod_item,
                    name=nome,
                    ean_gtin=isbn,
                    barcode=isbn if isbn else None,
                    cod_dbm=cod_item,
                    base_price=preco,
                    stock_quantity=estoque,
                    horus_cod_item=horus_code_int,
                    units_per_box=qtd_caixa,
                    launch_date=launch_dt,
                    launch_month=launch_dt.month if launch_dt else None,
                    launch_year=launch_dt.year if launch_dt else None,
                    brand_id=brand_id,
                    brand=editora_nome if editora_nome else None,
                    category_id=category_id,
                    subject=assunto_nome if assunto_nome else None,
                    long_description=sinopse if sinopse else None,
                    is_out_of_print=is_esgotado,
                    is_ebook=is_ebook_detected,
                    additional_isbns=merged_extra_isbns,
                    binding_finish="E-book" if is_ebook_detected else "Brochura",
                    royalty_rule="Sem Royalties",
                    status="ACTIVE"
                )
                db.add(new_prod)
                db.flush()
                synced_product_ids.append(new_prod.id)
                imported_count += 1

        db.commit()

        return {
            "success": True,
            "imported_count": imported_count,
            "updated_count": updated_count,
            "total_processed": len(payload.items),
            "synced_product_ids": synced_product_ids
        }
    except Exception as e:
        db.rollback()
        log.error(f"[HorusSQL] Erro ao importar itens: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Erro interno ao importar produtos: {str(e)}")

