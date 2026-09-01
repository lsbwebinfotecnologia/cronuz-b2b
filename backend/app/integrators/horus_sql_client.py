"""
horus_sql_client.py
-------------------
Cliente de conexao direta ao SQL Server do Horus ERP via pytds (pure Python TDS).

POR QUE pytds E NAO pymssql?
  pymssql usa FreeTDS (biblioteca C do sistema operacional).
  FreeTDS no Linux/Mac falha na negociacao TLS com SQL Server Windows moderno (erro 20002).
  pytds e uma implementacao pura Python do protocolo TDS — funciona identico ao driver
  Microsoft SQLSRV usado pelo PHP no Windows, sem dependencia de libs nativas do SO.

ESTRATEGIA DE PERFORMANCE:
  Pool de conexoes por seller (company_id) com TTL de 10 minutos de inatividade.
  Jobs de coleta reutilizam a conexao do pool — evitam overhead de handshake TCP+TDS.
  Conexao verificada (ping) antes de reutilizar; se morta, reconecta automaticamente.

SEGURANCA:
  A senha e descriptografada apenas em runtime via decrypt_sql_credential().
  Nunca persiste em plaintext em memoria apos o uso.
"""
import logging
import threading
import time
from typing import Any, Dict, List, Optional
from sqlalchemy.orm import Session
from app.core.utils import parse_host_port

logger = logging.getLogger(__name__)

# ── Pool de conexoes por seller ──────────────────────────────────────────────
_CONNECTION_POOL: Dict[int, Dict[str, Any]] = {}
_POOL_LOCK = threading.Lock()
_POOL_TTL_SECONDS = 600  # 10 minutos de inatividade => fecha conexao


class HorusSQLConfigError(Exception):
    """Raised quando Horus SQL nao esta configurado ou ativo para o seller."""
    pass


# [REFACTOR] parse_host_port centralizada em app/core/utils.py

class HorusSQLClient:
    """
    Cliente de conexao direta ao SQL Server do Horus via pytds (pure Python).
    Gerencia um pool de conexoes por seller para alta performance.
    """

    def __init__(self, db: Session, company_id: int):
        self.db = db
        self.company_id = company_id
        self._settings = self._load_settings()
        self._conn_key = company_id

    def _load_settings(self):
        from app.models.company_settings import CompanySettings
        settings = self.db.query(CompanySettings).filter(
            CompanySettings.company_id == self.company_id
        ).first()

        if not settings:
            raise HorusSQLConfigError(
                f"Nenhuma configuracao encontrada para company_id={self.company_id}."
            )
        if not settings.horus_sql_enabled:
            raise HorusSQLConfigError(
                f"Horus SQL Direct nao esta ativo para company_id={self.company_id}."
            )
        if not all([settings.horus_sql_host, settings.horus_sql_database,
                    settings.horus_sql_username, settings.horus_sql_password]):
            raise HorusSQLConfigError(
                f"Configuracao SQL incompleta para company_id={self.company_id}. "
                "Preencha host, banco, usuario e senha."
            )
        return settings

    def _decrypt_password(self) -> str:
        from app.core.horus_sql_crypto import decrypt_sql_credential
        plain = decrypt_sql_credential(self._settings.horus_sql_password)
        if not plain:
            raise HorusSQLConfigError(
                "Falha ao descriptografar senha SQL. Verifique HORUS_SQL_ENCRYPTION_KEY no .env."
            )
        return plain

    def _get_connection(self):
        """
        Retorna conexao do pool (ou cria nova se nao existir / expirada / morta).
        Thread-safe via _POOL_LOCK.
        """
        import pytds
        now = time.time()

        with _POOL_LOCK:
            entry = _CONNECTION_POOL.get(self._conn_key)

            if entry:
                if now - entry["last_used"] > _POOL_TTL_SECONDS:
                    logger.info("[HorusSQLPool] Conexao expirada para company={self.company_id}. Reconectando.")
                    try:
                        entry["conn"].close()
                    except Exception:
                        pass
                    entry = None
                else:
                    try:
                        cur = entry["conn"].cursor()
                        cur.execute("SELECT 1")
                        entry["last_used"] = now
                        return entry["conn"]
                    except Exception:
                        logger.warning(f"[HorusSQLPool] Conexao morta para company={self.company_id}. Reconectando.")
                        try:
                            entry["conn"].close()
                        except Exception:
                            pass
                        entry = None

            # Criar nova conexao
            raw_host = self._settings.horus_sql_host.strip()
            raw_port = (self._settings.horus_sql_port or "1433").strip()
            host, port = parse_host_port(raw_host, raw_port)
            database = self._settings.horus_sql_database.strip()
            username = self._settings.horus_sql_username.strip()
            password = self._decrypt_password()

            logger.info("[HorusSQLPool] Criando nova conexao (pytds): {username}@{host}:{port}/{database}")

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
                _CONNECTION_POOL[self._conn_key] = {
                    "conn": conn,
                    "last_used": now,
                }
                logger.info("[HorusSQLPool] Conexao estabelecida para company={self.company_id}")
                return conn
            finally:
                password = ""  # limpar da memoria

    def test_connection(self) -> dict:
        """
        Testa conectividade TCP + autenticacao + selecao do banco.
        """
        try:
            conn = self._get_connection()
            with conn.cursor() as cur:  # [M1] cursor fechado via context manager
                cur.execute("SELECT @@VERSION AS version, DB_NAME() AS database_name, GETDATE() AS server_time")
                row = cur.fetchone()
            return {
                "status": "connected",
                "database": row.get("database_name") if row else self._settings.horus_sql_database,
                "server_time": str(row.get("server_time")) if row else None,
                "message": "Conexao ao SQL Server do Horus estabelecida com sucesso.",
            }
        except HorusSQLConfigError as e:
            return {"status": "config_error", "message": str(e)}
        except Exception as e:
            with _POOL_LOCK:
                _CONNECTION_POOL.pop(self._conn_key, None)
            logger.error("[HorusSQLClient] Falha no test_connection company={self.company_id}: {e}")
            return {"status": "error", "message": str(e)}

    def query(self, sql: str, params: Optional[tuple] = None, max_rows: int = 2000) -> List[Dict[str, Any]]:
        """
        Executa uma query SELECT e retorna lista de dicionarios.
        Apenas SELECTs — nao execute DDL ou DML por este metodo.

        [PERF] max_rows limita retorno para evitar estourar memoria com queries sem LIMIT.
        [M1]   Cursor fechado via context manager — evita acumulo de cursores no pool.
        """
        try:
            conn = self._get_connection()
            with conn.cursor() as cur:  # [M1] context manager garante fechamento do cursor
                if params:
                    cur.execute(sql, params)
                else:
                    cur.execute(sql)
                rows = cur.fetchmany(max_rows) if max_rows else cur.fetchall()
            with _POOL_LOCK:
                if self._conn_key in _CONNECTION_POOL:
                    _CONNECTION_POOL[self._conn_key]["last_used"] = time.time()
            return rows or []
        except Exception as e:
            logger.error("[HorusSQLClient] Erro na query company=%s: %s", self.company_id, e)
            with _POOL_LOCK:
                _CONNECTION_POOL.pop(self._conn_key, None)
            raise

    def close(self):
        """Nao fecha imediatamente — retorna ao pool para reutilizacao."""
        pass

    def invalidate(self):
        """Fecha e remove do pool. Use em caso de erro grave ou troca de configuracao."""
        with _POOL_LOCK:
            entry = _CONNECTION_POOL.pop(self._conn_key, None)
            if entry:
                try:
                    entry["conn"].close()
                except Exception:
                    pass
                logger.info("[HorusSQLPool] Conexao invalidada para company={self.company_id}")

    @property
    def cod_empresa(self) -> str:
        return (self._settings.horus_sql_cod_empresa or "1").strip()

    @property
    def cod_filial(self) -> str:
        return (self._settings.horus_sql_cod_filial or "1").strip()


def cleanup_expired_pool_connections():
    """
    Limpa conexoes expiradas do pool global.
    Chamado pelo scheduler a cada 15 minutos.
    """
    now = time.time()
    with _POOL_LOCK:
        expired = [
            cid for cid, entry in _CONNECTION_POOL.items()
            if now - entry["last_used"] > _POOL_TTL_SECONDS
        ]
        for cid in expired:
            try:
                _CONNECTION_POOL[cid]["conn"].close()
            except Exception:
                pass
            del _CONNECTION_POOL[cid]
            logger.info("[HorusSQLPool] Conexao expirada removida: company_id={cid}")
