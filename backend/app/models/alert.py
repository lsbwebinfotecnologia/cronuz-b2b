from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.sql import func
from app.db.session import Base


class StoreAlert(Base):
    __tablename__ = "str_alert"

    id = Column(Integer, primary_key=True, index=True)
    company_id = Column(Integer, ForeignKey("cmp_company.id", ondelete="CASCADE"), nullable=False, index=True)
    title = Column(String(120), nullable=False)
    message = Column(Text, nullable=False)
    type = Column(String(20), nullable=False, default="info")  # info | warning | success | urgent
    starts_at = Column(DateTime(timezone=True), nullable=True)   # NULL = imediato
    ends_at = Column(DateTime(timezone=True), nullable=True)     # NULL = sem expiração
    active = Column(Boolean, nullable=False, default=True)
    dismissible = Column(Boolean, nullable=False, default=True)  # cliente pode fechar?
    # ── ESCOPO E POSICIONAMENTO ──────────────────────────────────────────────
    # scope: 'all' = exibe em todas as páginas do store
    #        'home' = exibe apenas na homepage (pathname '/')
    # pin_to_top: False = inline (entre StoreHeader e conteúdo, dispensável)
    #             True  = faixa ACIMA do StoreHeader, sticky, sem botão fechar
    #                     Ideal para: instabilidade, manutenção, lançamentos críticos
    # ⚠️  Quando pin_to_top=True, o dismissible é ignorado — sempre non-dismissible
    # ────────────────────────────────────────────────────────────────────────
    scope = Column(String(20), nullable=False, default="all")       # 'all' | 'home'
    pin_to_top = Column(Boolean, nullable=False, default=False)
    created_by = Column(Integer, ForeignKey("usr_user.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
