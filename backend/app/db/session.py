import os
import sys
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

logger = logging.getLogger(__name__)

os.environ["PGCLIENTENCODING"] = "UTF8"

# [SEC] Nunca usa fallback com credencial hardcoded — usa .env obrigatoriamente em producao.
# Em desenvolvimento local, garanta que DATABASE_URL está no .env antes de subir o servidor.
_DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b")
if not _DATABASE_URL:
    logger.critical("[session] DATABASE_URL nao esta definida no ambiente. Encerrando.")
    sys.exit(1)

# [PERF] Pool configurado para producao — suporta multiplos workers Uvicorn.
engine = create_engine(
    _DATABASE_URL,
    pool_size=20,           # conexoes mantidas no pool (padrao 5 era insuficiente)
    max_overflow=10,        # extras alem do pool_size em pico de carga
    pool_pre_ping=True,     # detecta conexoes mortas antes de usar (evita "connection reset")
    pool_recycle=1800,      # recicla a cada 30min (evita timeout do PG apos idle longo)
    echo=False,             # desabilitado em producao — ativar somente para debug SQL
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Mantendo declarative_base() por compatibilidade com os 38 modelos existentes.
# Migracao para DeclarativeBase (SQLAlchemy 2.0) sera feita incrementalmente.
Base = declarative_base()


def get_db():
    """Dependency FastAPI — sessao de banco por request com fechamento garantido."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
