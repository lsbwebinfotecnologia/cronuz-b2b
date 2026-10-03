from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc, func, or_, and_
from datetime import datetime, timedelta, timezone

from app.db.session import get_db
from app.core.dependencies import require_master_user
from app.models.user_session import UserSession
from app.models.user import User
from app.models.customer import Customer
from app.models.company import Company

router = APIRouter(prefix="/master/sessions", tags=["master_sessions"])

def _parse_device(ua: Optional[str]) -> str:
    if not ua:
        return "Desconhecido"
    ua_lower = ua.lower()
    if "cronuzmobile" in ua_lower or "okhttp" in ua_lower or "dart" in ua_lower or "expo" in ua_lower:
        return "App Mobile Cronuz"
    if "iphone" in ua_lower or "ipad" in ua_lower:
        return "iOS / Safari"
    if "android" in ua_lower:
        return "Android / Chrome"
    if "edg/" in ua_lower or "edge/" in ua_lower:
        return "Microsoft Edge"
    if "firefox/" in ua_lower:
        return "Mozilla Firefox"
    if "chrome/" in ua_lower:
        return "Google Chrome"
    if "safari/" in ua_lower:
        return "Apple Safari"
    return "Navegador Web"

def _format_document(doc: Optional[str]) -> Optional[str]:
    if not doc:
        return None
    clean = "".join(filter(str.isdigit, doc))
    if len(clean) == 11:
        return f"{clean[:3]}.{clean[3:6]}.{clean[6:9]}-{clean[9:]}"
    if len(clean) == 14:
        return f"{clean[:2]}.{clean[2:5]}.{clean[5:8]}/{clean[8:12]}-{clean[12:]}"
    return doc

class RevokeAllRequest(BaseModel):
    user_id: Optional[int] = None
    customer_id: Optional[int] = None

@router.get("/metrics")
def get_sessions_metrics(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    fifteen_min_ago = now - timedelta(minutes=15)
    today_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Condição de estar online agora (< 15 min de atividade recente e ativa)
    online_cond = and_(
        UserSession.is_active == True,
        UserSession.expires_at > now,
        or_(
            UserSession.last_activity_at >= fifteen_min_ago,
            and_(UserSession.last_activity_at.is_(None), UserSession.login_at >= fifteen_min_ago)
        )
    )

    total_online = db.query(UserSession).filter(online_cond).count()
    master_online = db.query(UserSession).filter(online_cond, UserSession.role == "MASTER").count()
    sellers_online = db.query(UserSession).filter(online_cond, UserSession.role.in_(["SELLER", "AGENT"])).count()
    customers_online = db.query(UserSession).filter(online_cond, UserSession.role == "CUSTOMER").count()

    logins_today = db.query(UserSession).filter(UserSession.login_at >= today_midnight).count()
    active_sessions_count = db.query(UserSession).filter(UserSession.is_active == True, UserSession.expires_at > now).count()

    return {
        "total_online": total_online,
        "master_online": master_online,
        "sellers_online": sellers_online,
        "customers_online": customers_online,
        "logins_today": logins_today,
        "active_sessions_count": active_sessions_count,
        "timestamp": now.isoformat()
    }

@router.get("")
def list_sessions(
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
    role: Optional[str] = Query(None),
    status: Optional[str] = Query("all"),
    company_id: Optional[int] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
) -> Dict[str, Any]:
    now = datetime.now(timezone.utc)
    fifteen_min_ago = now - timedelta(minutes=15)

    query = (
        db.query(
            UserSession,
            User.name.label("user_name"),
            User.email.label("user_email"),
            User.document.label("user_doc"),
            User.company_id.label("user_company_id"),
            Customer.name.label("cust_name"),
            Customer.corporate_name.label("cust_corp"),
            Customer.email.label("cust_email"),
            Customer.document.label("cust_doc"),
            Customer.company_id.label("cust_company_id"),
            Company.name.label("company_name")
        )
        .outerjoin(User, UserSession.user_id == User.id)
        .outerjoin(Customer, UserSession.customer_id == Customer.id)
        .outerjoin(Company, or_(User.company_id == Company.id, Customer.company_id == Company.id))
    )

    # Filtro por Role
    if role and role != "all":
        if role == "SELLER":
            query = query.filter(UserSession.role.in_(["SELLER", "AGENT"]))
        else:
            query = query.filter(UserSession.role == role.upper())

    # Filtro por Status
    if status == "online":
        query = query.filter(
            UserSession.is_active == True,
            UserSession.expires_at > now,
            or_(
                UserSession.last_activity_at >= fifteen_min_ago,
                and_(UserSession.last_activity_at.is_(None), UserSession.login_at >= fifteen_min_ago)
            )
        )
    elif status == "active":
        query = query.filter(UserSession.is_active == True, UserSession.expires_at > now)
    elif status == "inactive":
        query = query.filter(
            or_(UserSession.is_active == False, UserSession.expires_at <= now)
        )

    # Filtro por Empresa
    if company_id:
        query = query.filter(or_(User.company_id == company_id, Customer.company_id == company_id))

    # Busca textual
    if search and search.strip():
        term = f"%{search.strip()}%".lower()
        query = query.filter(
            or_(
                func.lower(User.name).like(term),
                func.lower(User.email).like(term),
                User.document.like(term),
                func.lower(Customer.name).like(term),
                func.lower(Customer.corporate_name).like(term),
                func.lower(Customer.email).like(term),
                Customer.document.like(term),
                func.lower(Company.name).like(term),
                UserSession.ip_address.like(term)
            )
        )

    # Contagem total
    total = query.count()

    # Paginação e ordenação decrescente (sessões mais recentes primeiro)
    items_raw = (
        query.order_by(
            desc(func.coalesce(UserSession.last_activity_at, UserSession.login_at))
        )
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    results = []
    for row in items_raw:
        s = row.UserSession
        # Determina nome e e-mail dependendo do vínculo
        is_user = s.user_id is not None
        name = row.user_name if is_user else (row.cust_name or row.cust_corp or "Cliente B2B")
        email = row.user_email if is_user else (row.cust_email or "-")
        raw_doc = row.user_doc if is_user else row.cust_doc
        doc_formatted = _format_document(raw_doc)
        
        comp_id = row.user_company_id if is_user else row.cust_company_id
        comp_name = row.company_name or ("Sede Master Cronuz" if s.role == "MASTER" else "-")

        # Label amigável do papel
        role_label = {
            "MASTER": "Master",
            "SELLER": "Seller (Lojista)",
            "AGENT": "Vendedor / Rep",
            "CUSTOMER": "Cliente B2B (Loja)"
        }.get(s.role, s.role)

        # Checagem de Online
        last_act = s.last_activity_at or s.login_at
        is_online = (
            s.is_active is True and
            s.expires_at is not None and
            s.expires_at > now and
            last_act is not None and
            (now - (last_act if last_act.tzinfo else last_act.replace(tzinfo=timezone.utc))).total_seconds() <= 900
        )

        results.append({
            "id": s.id,
            "role": s.role,
            "role_label": role_label,
            "user_id": s.user_id,
            "customer_id": s.customer_id,
            "name": name,
            "email": email,
            "document": doc_formatted,
            "company_id": comp_id,
            "company_name": comp_name,
            "ip_address": s.ip_address or "-",
            "user_agent": s.user_agent,
            "device_info": _parse_device(s.user_agent),
            "login_at": s.login_at.isoformat() if s.login_at else None,
            "last_activity_at": s.last_activity_at.isoformat() if s.last_activity_at else (s.login_at.isoformat() if s.login_at else None),
            "expires_at": s.expires_at.isoformat() if s.expires_at else None,
            "is_active": s.is_active,
            "is_online": is_online
        })

    return {
        "items": results,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size)
    }

@router.post("/{session_id}/revoke")
def revoke_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
) -> Dict[str, Any]:
    session_record = db.query(UserSession).filter(UserSession.id == session_id).first()
    if not session_record:
        raise HTTPException(status_code=404, detail="Sessão não encontrada.")

    session_record.is_active = False
    db.commit()

    return {
        "success": True,
        "message": "Sessão encerrada com sucesso. O usuário foi desconectado.",
        "session_id": session_id
    }

@router.post("/revoke-all")
def revoke_all_user_sessions(
    payload: RevokeAllRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
) -> Dict[str, Any]:
    if not payload.user_id and not payload.customer_id:
        raise HTTPException(status_code=400, detail="Informe user_id ou customer_id.")

    query = db.query(UserSession).filter(UserSession.is_active == True)
    if payload.user_id:
        query = query.filter(UserSession.user_id == payload.user_id)
    elif payload.customer_id:
        query = query.filter(UserSession.customer_id == payload.customer_id)

    count = query.update({"is_active": False}, synchronize_session=False)
    db.commit()

    return {
        "success": True,
        "message": f"{count} sessão(ões) ativa(s) foram encerradas.",
        "revoked_count": count
    }
