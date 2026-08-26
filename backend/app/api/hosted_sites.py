import os
import re
import shutil
import zipfile
import mimetypes
from pathlib import Path
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status, Request
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.db.session import get_db
from app.core.dependencies import require_master_user
from app.models.user import User
from app.models.hosted_site import HostedSite
from app.schemas.hosted_site import (
    HostedSiteCreate,
    HostedSiteUpdate,
    HostedSiteResponse,
    HostedSiteDetailResponse,
    HostedSiteFileNode
)

router = APIRouter(prefix="/hosted-sites", tags=["hosted-sites"])

# Base directory for hosted static sites
BASE_DIR = Path(__file__).resolve().parent.parent.parent
SITES_DIR = BASE_DIR / "sites"
UPLOADS_ZIP_DIR = SITES_DIR / "_uploads"

SITES_DIR.mkdir(parents=True, exist_ok=True)
UPLOADS_ZIP_DIR.mkdir(parents=True, exist_ok=True)


def sanitize_slug(slug_raw: str) -> str:
    """Sanitiza o slug permitindo apenas letras minúsculas, números e hífens."""
    slug = slug_raw.strip().lower()
    slug = re.sub(r'[^a-z0-9_-]', '-', slug)
    slug = re.sub(r'-+', '-', slug)
    slug = slug.strip('-')
    if not slug:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Slug inválido. Use apenas letras, números e hífens."
        )
    return slug


def build_site_response(site: HostedSite, req: Optional[Request] = None) -> dict:
    domain_host = site.custom_domain or f"{site.slug}.site.cronuzb2b.com.br"
    public_url = f"https://{domain_host}"
    preview_url = f"/api/v1/hosted-sites/preview/{site.slug}/"

    return {
        "id": site.id,
        "company_id": site.company_id,
        "title": site.title,
        "slug": site.slug,
        "description": site.description,
        "custom_domain": site.custom_domain,
        "status": site.status,
        "zip_filename": site.zip_filename,
        "zip_size_bytes": site.zip_size_bytes,
        "has_index": site.has_index,
        "files_count": site.files_count,
        "storage_path": site.storage_path,
        "public_url": public_url,
        "preview_url": preview_url,
        "last_deployed_at": site.last_deployed_at,
        "created_at": site.created_at,
        "updated_at": site.updated_at,
    }


def list_files_tree(directory: Path, max_depth: int = 3, current_depth: int = 0) -> List[HostedSiteFileNode]:
    """Retorna árvore hierárquica de arquivos para inspeção no painel."""
    nodes: List[HostedSiteFileNode] = []
    if not directory.exists() or current_depth > max_depth:
        return nodes

    try:
        entries = sorted(list(directory.iterdir()), key=lambda e: (not e.is_dir(), e.name.lower()))
        for entry in entries:
            # Ignora arquivos/pastas de sistema ocultos
            if entry.name.startswith('.') or entry.name == '__MACOSX':
                continue

            if entry.is_dir():
                children = list_files_tree(entry, max_depth=max_depth, current_depth=current_depth + 1)
                nodes.append(HostedSiteFileNode(
                    name=entry.name,
                    path=str(entry.relative_to(directory.parent.parent)),
                    is_dir=True,
                    children=children
                ))
            else:
                nodes.append(HostedSiteFileNode(
                    name=entry.name,
                    path=str(entry.relative_to(directory.parent.parent)),
                    is_dir=False,
                    size=entry.stat().st_size
                ))
    except Exception:
        pass
    return nodes


@router.get("", response_model=List[HostedSiteResponse])
def get_hosted_sites(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    """Lista todos os sites institucionais cadastrados (exclusivo para MASTER)."""
    sites = db.query(HostedSite).order_by(desc(HostedSite.created_at)).all()
    return [build_site_response(s) for s in sites]


@router.post("", response_model=HostedSiteResponse, status_code=status.HTTP_201_CREATED)
def create_hosted_site(
    site_in: HostedSiteCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    """Cria um novo registro de site com slug único (exclusivo para MASTER)."""
    clean_slug = sanitize_slug(site_in.slug)
    
    # Valida duplicidade
    existing = db.query(HostedSite).filter(HostedSite.slug == clean_slug).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"O identificador (slug) '{clean_slug}' já está em uso por outro site."
        )

    site_dir = SITES_DIR / clean_slug
    site_dir.mkdir(parents=True, exist_ok=True)

    new_site = HostedSite(
        company_id=site_in.company_id,
        title=site_in.title.strip(),
        slug=clean_slug,
        description=site_in.description,
        custom_domain=site_in.custom_domain.strip() if site_in.custom_domain else None,
        status="pending_upload",
        storage_path=f"sites/{clean_slug}",
        has_index=False,
        files_count=0
    )
    db.add(new_site)
    db.commit()
    db.refresh(new_site)

    return build_site_response(new_site)


@router.get("/{site_id}", response_model=HostedSiteDetailResponse)
def get_hosted_site_detail(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    """Retorna os detalhes de um site, incluindo sua árvore de arquivos."""
    site = db.query(HostedSite).filter(HostedSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")

    res = build_site_response(site)
    site_dir = SITES_DIR / site.slug
    res["files"] = list_files_tree(site_dir) if site_dir.exists() else []
    return res


@router.put("/{site_id}", response_model=HostedSiteResponse)
def update_hosted_site(
    site_id: int,
    site_in: HostedSiteUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    """Atualiza informações básicas de um site."""
    site = db.query(HostedSite).filter(HostedSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")

    if site_in.title is not None:
        site.title = site_in.title.strip()
    if site_in.description is not None:
        site.description = site_in.description
    if site_in.custom_domain is not None:
        site.custom_domain = site_in.custom_domain.strip() if site_in.custom_domain else None

    db.commit()
    db.refresh(site)
    return build_site_response(site)


@router.post("/{site_id}/upload-zip", response_model=HostedSiteResponse)
async def upload_site_zip(
    site_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    """Faz upload do arquivo ZIP compactado com os arquivos do site."""
    site = db.query(HostedSite).filter(HostedSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")

    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Formato inválido. Por favor envie um arquivo com extensão .zip contendo os arquivos do site."
        )

    zip_dest = UPLOADS_ZIP_DIR / f"{site.slug}.zip"
    total_bytes = 0

    try:
        with open(zip_dest, "wb") as buffer:
            while chunk := await file.read(1024 * 1024):  # 1MB chunks
                buffer.write(chunk)
                total_bytes += len(chunk)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erro ao salvar o arquivo ZIP: {str(e)}"
        )

    site.zip_filename = file.filename
    site.zip_size_bytes = total_bytes
    site.status = "pending_extract"
    db.commit()
    db.refresh(site)

    return build_site_response(site)


@router.post("/{site_id}/extract", response_model=HostedSiteResponse)
def extract_site_zip(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    """Extrai o ZIP enviado para a pasta do site com desaninamento inteligente e validações."""
    site = db.query(HostedSite).filter(HostedSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")

    zip_path = UPLOADS_ZIP_DIR / f"{site.slug}.zip"
    if not zip_path.exists():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nenhum arquivo ZIP foi enviado para este site ainda. Faça o upload primeiro."
        )

    target_dir = SITES_DIR / site.slug
    site.status = "extracting"
    db.commit()

    try:
        # Se a pasta de destino já existir, limpa o conteúdo antigo
        if target_dir.exists():
            shutil.rmtree(target_dir, ignore_errors=True)
        target_dir.mkdir(parents=True, exist_ok=True)

        temp_extract_dir = SITES_DIR / f"_tmp_{site.slug}"
        if temp_extract_dir.exists():
            shutil.rmtree(temp_extract_dir, ignore_errors=True)
        temp_extract_dir.mkdir(parents=True, exist_ok=True)

        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            # Proteção contra Zip Slip (path traversal)
            for member in zip_ref.namelist():
                filename = os.path.normpath(member)
                if filename.startswith("..") or os.path.isabs(filename):
                    raise Exception(f"Arquivo malicioso detectado no ZIP: {member}")
            zip_ref.extractall(temp_extract_dir)

        # Tratar desaninamento: Se dentro do zip tudo estiver em uma única pasta raiz
        extracted_items = [p for p in temp_extract_dir.iterdir() if p.name != '__MACOSX' and not p.name.startswith('.')]
        if len(extracted_items) == 1 and extracted_items[0].is_dir():
            root_subfolder = extracted_items[0]
            for child in root_subfolder.iterdir():
                dest_child = target_dir / child.name
                if dest_child.exists():
                    if dest_child.is_dir():
                        shutil.rmtree(dest_child)
                    else:
                        dest_child.unlink()
                shutil.move(str(child), str(target_dir))
        else:
            for item in temp_extract_dir.iterdir():
                if item.name == '__MACOSX' or item.name.startswith('.'):
                    continue
                dest_item = target_dir / item.name
                if dest_item.exists():
                    if dest_item.is_dir():
                        shutil.rmtree(dest_item)
                    else:
                        dest_item.unlink()
                shutil.move(str(item), str(target_dir))

        # Limpa temp
        if temp_extract_dir.exists():
            shutil.rmtree(temp_extract_dir, ignore_errors=True)

        # Valida se existe index.html ou index.htm
        has_index = (target_dir / "index.html").exists() or (target_dir / "index.htm").exists()
        
        # Conta arquivos
        all_files = [f for f in target_dir.rglob("*") if f.is_file() and not f.name.startswith('.')]
        files_count = len(all_files)

        site.has_index = has_index
        site.files_count = files_count
        site.status = "ready" if has_index else "missing_index"
        site.last_deployed_at = datetime.utcnow()
        site.storage_path = f"sites/{site.slug}"
        db.commit()
        db.refresh(site)

        return build_site_response(site)

    except Exception as e:
        site.status = "error"
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Falha ao extrair o site: {str(e)}"
        )


@router.delete("/{site_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_hosted_site(
    site_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_master_user)
):
    """Exclui o site e remove os arquivos da hospedagem."""
    site = db.query(HostedSite).filter(HostedSite.id == site_id).first()
    if not site:
        raise HTTPException(status_code=404, detail="Site não encontrado.")

    # Remove pasta física do site
    site_dir = SITES_DIR / site.slug
    if site_dir.exists():
        shutil.rmtree(site_dir, ignore_errors=True)

    # Remove ZIP se houver
    zip_path = UPLOADS_ZIP_DIR / f"{site.slug}.zip"
    if zip_path.exists():
        try:
            zip_path.unlink()
        except Exception:
            pass

    db.delete(site)
    db.commit()
    return None


@router.get("/preview/{slug}/{file_path:path}")
def preview_hosted_site(
    slug: str,
    file_path: str = ""
):
    """Endpoint de preview local que serve os arquivos estáticos do site."""
    clean_slug = sanitize_slug(slug)
    site_dir = (SITES_DIR / clean_slug).resolve()

    if not site_dir.exists():
        raise HTTPException(status_code=404, detail="Site ou pasta não encontrada.")

    if not file_path or file_path.endswith("/"):
        file_path = f"{file_path}index.html".lstrip("/")

    target_file = (site_dir / file_path).resolve()

    # Previne path traversal
    if not str(target_file).startswith(str(site_dir)):
        raise HTTPException(status_code=403, detail="Acesso negado.")

    if not target_file.exists() or not target_file.is_file():
        # Tenta fallback com index.html caso seja uma SPA
        index_fallback = site_dir / "index.html"
        if index_fallback.exists():
            target_file = index_fallback
        else:
            raise HTTPException(status_code=404, detail=f"Arquivo '{file_path}' não encontrado no site.")

    content_type, _ = mimetypes.guess_type(str(target_file))
    if not content_type:
        if target_file.suffix.lower() == ".html":
            content_type = "text/html; charset=utf-8"
        elif target_file.suffix.lower() == ".css":
            content_type = "text/css; charset=utf-8"
        elif target_file.suffix.lower() == ".js":
            content_type = "application/javascript; charset=utf-8"
        else:
            content_type = "application/octet-stream"

    return FileResponse(
        path=str(target_file),
        media_type=content_type,
        headers={"Cache-Control": "no-cache, no-store, must-revalidate"}
    )
