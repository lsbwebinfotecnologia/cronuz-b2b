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
    Retorna as configuracoes do Horus SQL Direct e parametros bancarios.
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
            "vindi_baixa": settings.horus_sql_feature_vindi_baixa,
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

    if changed:
        db.commit()
        db.refresh(settings)

    return {
        "success": True,
        "features": {
            "vindi_baixa": settings.horus_sql_feature_vindi_baixa,
        }
    }
