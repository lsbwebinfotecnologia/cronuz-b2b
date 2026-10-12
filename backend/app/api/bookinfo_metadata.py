import re
import json
import httpx
import logging
from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Depends, HTTPException, Query, Body
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.global_setting import GlobalSetting
from app.models.integrator import Integrator

logger = logging.getLogger("cronuz.bookinfo_metadata")

router = APIRouter(tags=["bookinfo-metadata"])


class MetadataConfigPayload(BaseModel):
    token: str
    environment: str = "prod"


class MetadataTestPayload(BaseModel):
    token: str
    environment: str = "prod"
    test_isbn: str = "9788532511010"


def _get_base_url(env: str) -> str:
    return "https://api.bookinfometadados.com.br/api/v1.5" if (env or "").lower() == "prod" else "https://sandbox.bookinfometadados.com.br/api/v1.5"


def _format_book(b: dict) -> dict:
    authors = []
    for c in b.get("contribuicao", []):
        nm = f"{c.get('nome', '')} {c.get('sobrenome', '')}".strip()
        if nm:
            authors.append(nm)

    author_str = ", ".join(authors) if authors else ""
    pub_name = b.get("editora", {}).get("nome_fantasia") or b.get("editora", {}).get("nome_editora") or ""
    selo_name = b.get("selo", {}).get("nome_do_selo_editorial") or ""

    cover = None
    imgs = b.get("imagens", {})
    if isinstance(imgs, dict):
        p_capa = imgs.get("imagem_primeira_capa", {})
        if isinstance(p_capa, dict):
            cover = p_capa.get("grande") or p_capa.get("media") or p_capa.get("pequena")
        elif isinstance(p_capa, str):
            cover = p_capa

    price_val = float(b.get("preco") or 0.0)
    synopsis_val = b.get("sinopse") or ""
    pages_val = b.get("medidas", {}).get("paginas") if isinstance(b.get("medidas"), dict) else None

    return {
        "isbn": b.get("isbn") or "",
        "barcode": b.get("codigo_de_barras") or b.get("isbn") or "",
        "title": b.get("titulo") or "",
        "subtitle": b.get("subtitulo") or "",
        "authors": author_str,
        "publisher": pub_name,
        "seal": selo_name,
        "cover_url": cover,
        "price": price_val,
        "estimated_price": price_val,
        "synopsis": synopsis_val,
        "pages": pages_val,
        "format": b.get("formato"),
        "category": b.get("nome_area"),
        "source": "BOOKINFO",
        "source_api": "Bookinfo Metadados",
    }


# ──────────────────────────────────────────────────────────────────────────────
# 1. Configuração Master do Token Global
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/master/bookinfo-metadata/config")
def get_global_bookinfo_metadata_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.type != "MASTER":
        raise HTTPException(status_code=403, detail="Apenas administradores Master podem acessar esta configuração.")

    token_setting = db.query(GlobalSetting).filter(GlobalSetting.key == "bookinfo_default_metadata_token").first()
    env_setting = db.query(GlobalSetting).filter(GlobalSetting.key == "bookinfo_default_metadata_env").first()

    return {
        "token": token_setting.value if token_setting and token_setting.value else "",
        "environment": env_setting.value if env_setting and env_setting.value else "prod",
        "updated_at": token_setting.updated_at if token_setting else None,
    }


@router.put("/master/bookinfo-metadata/config")
def update_global_bookinfo_metadata_config(
    payload: MetadataConfigPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if current_user.type != "MASTER":
        raise HTTPException(status_code=403, detail="Apenas administradores Master podem alterar esta configuração.")

    token_val = payload.token.strip()
    env_val = payload.environment.strip().lower()
    if env_val not in ("prod", "sandbox"):
        env_val = "prod"

    # Upsert token
    token_setting = db.query(GlobalSetting).filter(GlobalSetting.key == "bookinfo_default_metadata_token").first()
    if not token_setting:
        token_setting = GlobalSetting(
            key="bookinfo_default_metadata_token",
            value=token_val,
            description="Token padrao global da Bookinfo para consulta de metadados de livros"
        )
        db.add(token_setting)
    else:
        token_setting.value = token_val

    # Upsert env
    env_setting = db.query(GlobalSetting).filter(GlobalSetting.key == "bookinfo_default_metadata_env").first()
    if not env_setting:
        env_setting = GlobalSetting(
            key="bookinfo_default_metadata_env",
            value=env_val,
            description="Ambiente padrao da API de metadados Bookinfo (prod ou sandbox)"
        )
        db.add(env_setting)
    else:
        env_setting.value = env_val

    db.commit()
    return {"success": True, "message": "Configuração global da Bookinfo salva com sucesso!"}


@router.post("/master/bookinfo-metadata/test")
async def test_bookinfo_metadata_connection(
    payload: MetadataTestPayload,
    current_user: User = Depends(get_current_user),
):
    if current_user.type != "MASTER":
        raise HTTPException(status_code=403, detail="Acesso restrito a Master.")

    token = payload.token.strip()
    if not token:
        raise HTTPException(status_code=400, detail="Informe um token para testar a conexão.")

    clean_isbn = re.sub(r'\D', '', payload.test_isbn) or "9788535902778"
    base_url = _get_base_url(payload.environment)
    url = f"{base_url}/book?isbn={clean_isbn}"

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                    "Accept": "application/json",
                }
            )

            if res.status_code == 401 or res.status_code == 403:
                return {
                    "success": False,
                    "status_code": res.status_code,
                    "message": "Token rejeitado pela Bookinfo (HTTP 401/403). Verifique se o token é válido para a API de Metadados.",
                    "book": None
                }

            if res.status_code == 200:
                data = res.json()
                books = data.get("books", [])
                if books:
                    formatted = _format_book(books[0])
                    return {
                        "success": True,
                        "status_code": 200,
                        "message": f"Conexão com a Bookinfo validada com sucesso! Obra: \"{formatted.get('title')}\"",
                        "book": formatted,
                    }

                status_obj = data.get("status")
                if isinstance(status_obj, list) and status_obj:
                    status_obj = status_obj[0]
                elif not isinstance(status_obj, dict):
                    status_obj = {}

                msg = status_obj.get("message") or "Nenhum registro retornado"
                return {
                    "success": True,
                    "status_code": 200,
                    "message": f"Token autenticado com sucesso na Bookinfo! ({msg}).",
                    "book": None,
                }

            return {
                "success": False,
                "status_code": res.status_code,
                "message": f"Bookinfo retornou código HTTP {res.status_code}.",
                "book": None
            }
    except Exception as e:
        logger.error(f"[BookinfoTest] Erro ao testar Bookinfo: {e}")
        return {
            "success": False,
            "status_code": 500,
            "message": f"Falha de conexão com a Bookinfo: {str(e)}",
            "book": None
        }


# ──────────────────────────────────────────────────────────────────────────────
# 2. Resolução do Token e Consulta por ISBN, Nome/Título, Autor ou Editora
# ──────────────────────────────────────────────────────────────────────────────
@router.get("/product-search/bookinfo-lookup")
async def bookinfo_lookup(
    isbn: Optional[str] = Query(None, description="ISBN ou código de barras"),
    query: Optional[str] = Query(None, description="Termo de busca genérico"),
    search_type: Optional[str] = Query("AUTO", description="Tipo de busca: AUTO, ISBN, TITULO, AUTOR, EDITORA"),
    titulo: Optional[str] = Query(None, description="Nome da obra / título"),
    autor: Optional[str] = Query(None, description="Nome do autor"),
    editora: Optional[str] = Query(None, description="Nome da editora"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    params: Dict[str, str] = {}
    term = query.strip() if isinstance(query, str) else ""
    stype = (search_type if isinstance(search_type, str) else "AUTO").upper()

    clean_isbn = None
    if isinstance(isbn, str) and isbn.strip():
        clean_isbn = re.sub(r'\D', '', isbn)
    elif stype == "ISBN" and term:
        clean_isbn = re.sub(r'\D', '', term)

    if clean_isbn:
        params["isbn"] = clean_isbn
    elif (isinstance(titulo, str) and titulo.strip()) or stype == "TITULO":
        val = (titulo if isinstance(titulo, str) and titulo.strip() else term).strip()
        if val:
            params["titulo"] = val
    elif (isinstance(autor, str) and autor.strip()) or stype == "AUTOR":
        val = (autor if isinstance(autor, str) and autor.strip() else term).strip()
        if val:
            params["contribuicao"] = val
    elif (isinstance(editora, str) and editora.strip()) or stype == "EDITORA":
        val = (editora if isinstance(editora, str) and editora.strip() else term).strip()
        if val:
            params["nome_fantasia_da_editora"] = val
    elif stype == "SELO":
        val = term.strip()
        if val:
            params["nome_do_selo_editorial"] = val
    elif stype == "AUTO" and term:
        clean_digits = re.sub(r'\D', '', term)
        if clean_digits and len(clean_digits) in (10, 13):
            params["isbn"] = clean_digits
        else:
            params["titulo"] = term

    if not params:
        raise HTTPException(
            status_code=400,
            detail="Informe ao menos um parâmetro válido para busca na Bookinfo (ISBN, Título, Autor ou Editora)."
        )

    token = ""
    env = "prod"
    token_origin = ""

    # 1. Tentar token de metadados específico do Seller
    if current_user.company_id:
        seller_integ = db.query(Integrator).filter(
            Integrator.company_id == current_user.company_id,
            Integrator.platform == "BOOKINFO",
            Integrator.active == True,
        ).first()

        if seller_integ and seller_integ.credentials:
            try:
                creds = json.loads(seller_integ.credentials) if isinstance(seller_integ.credentials, str) else seller_integ.credentials
                seller_token = creds.get("TokenMetadados") or creds.get("token_metadados")
                if seller_token and str(seller_token).strip():
                    token = str(seller_token).strip()
                    token_origin = "SELLER"
                    env = creds.get("Ambiente", "PROD").lower()
            except Exception:
                pass

    # 2. Se o seller não tem token próprio de metadados, busca o Token Global do Master
    if not token:
        token_setting = db.query(GlobalSetting).filter(GlobalSetting.key == "bookinfo_default_metadata_token").first()
        env_setting = db.query(GlobalSetting).filter(GlobalSetting.key == "bookinfo_default_metadata_env").first()
        if token_setting and token_setting.value and token_setting.value.strip():
            token = token_setting.value.strip()
            token_origin = "GLOBAL_MASTER"
            if env_setting and env_setting.value:
                env = env_setting.value.strip().lower()

    if not token:
        return {
            "found": False,
            "total": 0,
            "token_configured": False,
            "items": [],
            "detail": "Nenhum token da Bookinfo Metadados configurado. Configure no Master ou nas integrações da empresa.",
        }

    base_url = _get_base_url(env)
    url = f"{base_url}/book"

    # Parâmetros de paginação (conforme documentação oficial da Bookinfo API v1.5)
    # Apenas 'page' é aceito pela Bookinfo para páginas > 1; 'limit' não existe na API.
    page_num = page if isinstance(page, int) else 1
    if page_num > 1:
        params["page"] = str(page_num)

    req_headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
        "Accept": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=20.0) as client:
            res = await client.get(url, params=params, headers=req_headers)

            if res.status_code != 200:
                logger.warning(f"[BookinfoLookup] HTTP {res.status_code} para params {params}")
                if res.status_code in (522, 524, 502, 503, 504):
                    return {
                        "found": False,
                        "total": 0,
                        "token_configured": True,
                        "items": [],
                        "detail": "Servidor da Bookinfo Metadados temporariamente indisponível (Cloudflare 522: Connection timed out). O servidor da Bookinfo está fora do ar ou em manutenção no momento.",
                    }

                err_msg = f"Bookinfo retornou HTTP {res.status_code}."
                try:
                    err_data = res.json()
                    status_info = err_data.get("status")
                    if isinstance(status_info, dict) and status_info.get("message"):
                        err_msg = status_info["message"]
                    elif isinstance(status_info, list) and status_info and status_info[0].get("message"):
                        err_msg = status_info[0]["message"]
                except Exception:
                    pass

                return {
                    "found": False,
                    "total": 0,
                    "token_configured": True,
                    "items": [],
                    "detail": err_msg,
                }

            data = res.json()
            raw_books = data.get("books", [])

            # Se não encontrou por editora, tenta automaticamente por selo editorial
            if not raw_books and stype == "EDITORA" and "nome_fantasia_da_editora" in params:
                params_fb = dict(params)
                val_ed = params_fb.pop("nome_fantasia_da_editora")
                params_fb["nome_do_selo_editorial"] = val_ed
                try:
                    res_fb = await client.get(url, params=params_fb, headers=req_headers)
                    if res_fb.status_code == 200:
                        data_fb = res_fb.json()
                        raw_books = data_fb.get("books", [])
                except Exception:
                    pass

            if not raw_books:
                return {
                    "found": False,
                    "total": 0,
                    "token_configured": True,
                    "items": [],
                    "detail": "Nenhuma obra localizada no catálogo da Bookinfo com os filtros informados.",
                }

            if stype == "EDITORA" and term:
                term_lower = term.lower()
                raw_books.sort(
                    key=lambda b: 0 if (
                        term_lower in (b.get("editora", {}).get("nome_fantasia") or "").lower()
                        or term_lower in (b.get("selo", {}).get("nome_do_selo_editorial") or "").lower()
                    ) else 1
                )

            items = [_format_book(b) for b in raw_books]

            return {
                "found": True,
                "total": len(items),
                "token_configured": True,
                "token_origin": token_origin,
                "items": items,
                "data": items[0] if items else None,
            }
    except httpx.TimeoutException:
        logger.warning(f"[BookinfoLookup] Timeout ao consultar Bookinfo para {params}")
        return {
            "found": False,
            "total": 0,
            "token_configured": True,
            "items": [],
            "detail": "Tempo limite de conexão com a Bookinfo esgotado. Tente novamente em instantes.",
        }
    except Exception as e:
        logger.error(f"[BookinfoLookup] Erro ao consultar Bookinfo ({params}): {e}")
        return {
            "found": False,
            "total": 0,
            "token_configured": True,
            "items": [],
            "detail": f"Falha de comunicação com a Bookinfo: {str(e)}",
        }
