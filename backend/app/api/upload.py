from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional
import io
import json
import os
import shutil
import uuid
import re
import httpx
from pathlib import Path
from PIL import Image, ImageOps

from app.db.session import get_db
from app.core.dependencies import get_current_user
from app.models.user import User
from app.models.product import Product
from app.models.global_setting import GlobalSetting
from app.models.integrator import Integrator
from app.core.upload_security import validate_file_size_and_extension, sanitize_filename, read_file_safely

router = APIRouter(prefix="/upload", tags=["upload"])

# Directory to store uploaded covers/images
# This saves the files internally to be served by FastAPI's StaticFiles under /uploads
UPLOADS_DIR = Path(__file__).parent.parent.parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

STATIC_DIR = UPLOADS_DIR / "covers"
STATIC_DIR.mkdir(parents=True, exist_ok=True)

# Padrão oficial de tamanho de capa de livro no Cronuz (600x900 px)
COVER_TARGET_WIDTH = 600
COVER_TARGET_HEIGHT = 900


def _standardize_and_save_cover_bytes(
    raw_bytes: bytes,
    company_id: int,
    clean_isbn: str,
    ext: str = "jpg",
) -> str:
    """
    Redimensiona/padroniza a imagem de capa para no máximo 600x900px preservando proporção,
    salva com o nome do ISBN (<ISBN>.jpg ou <ISBN>.png) dentro de uploads/covers/<company_id>/
    e retorna a URL relativa (/uploads/covers/<company_id>/<ISBN>.<ext>).
    """
    company_dir = STATIC_DIR / str(company_id)
    company_dir.mkdir(parents=True, exist_ok=True)

    ext_clean = "png" if ext.lower().replace(".", "") == "png" else "jpg"
    target_path = company_dir / f"{clean_isbn}.{ext_clean}"
    jpg_fallback_path = company_dir / f"{clean_isbn}.jpg"

    try:
        with Image.open(io.BytesIO(raw_bytes)) as img:
            img = ImageOps.exif_transpose(img)
            # Padroniza tamanho máximo para 600x900 mantendo aspect ratio
            img.thumbnail((COVER_TARGET_WIDTH, COVER_TARGET_HEIGHT), Image.Resampling.LANCZOS)

            if ext_clean == "png":
                if img.mode not in ("RGB", "RGBA"):
                    img = img.convert("RGBA")
                img.save(target_path, format="PNG", optimize=True)
                # Também garante cópia .jpg para compatibilidade com rotas que buscam <isbn>.jpg
                rgb_img = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "RGBA":
                    rgb_img.paste(img, mask=img.split()[3])
                else:
                    rgb_img.paste(img)
                rgb_img.save(jpg_fallback_path, format="JPEG", quality=88, optimize=True)
            else:
                if img.mode in ("RGBA", "LA", "P"):
                    rgba = img.convert("RGBA")
                    rgb_img = Image.new("RGB", rgba.size, (255, 255, 255))
                    rgb_img.paste(rgba, mask=rgba.split()[3])
                    img = rgb_img
                elif img.mode != "RGB":
                    img = img.convert("RGB")
                img.save(target_path, format="JPEG", quality=88, optimize=True)
    except Exception:
        # Fallback caso o formato não seja processável pelo Pillow
        with target_path.open("wb") as buffer:
            buffer.write(raw_bytes)

    return f"/uploads/covers/{company_id}/{clean_isbn}.{ext_clean}"


@router.post("/cover")
async def upload_cover(
    file: UploadFile = File(...),
    isbn: str = Form(...),
    product_id: Optional[int] = Form(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada.")
        
    validate_file_size_and_extension(file, category="image")

    clean_isbn = re.sub(r"[^a-zA-Z0-9_\-]", "", isbn.strip())
    if not clean_isbn:
        clean_isbn = "cover"

    orig_name = (file.filename or "").lower()
    content_type = (file.content_type or "").lower()
    ext = "png" if (orig_name.endswith(".png") or "png" in content_type) else "jpg"
    
    try:
        content = await read_file_safely(file, max_size_bytes=5 * 1024 * 1024)
        relative_url = _standardize_and_save_cover_bytes(
            raw_bytes=content,
            company_id=current_user.company_id,
            clean_isbn=clean_isbn,
            ext=ext,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar arquivo: {str(e)}")

    # Atualizar cover_url no produto caso exista na tabela prd_product
    prod = None
    if product_id:
        prod = db.query(Product).filter(
            Product.id == product_id,
            Product.company_id == current_user.company_id
        ).first()
    if not prod and clean_isbn != "cover":
        prod = db.query(Product).filter(
            Product.company_id == current_user.company_id,
            Product.ean_gtin == clean_isbn
        ).first()
    if prod:
        prod.cover_url = relative_url
        db.commit()

    return {
        "message": f"Imagem de capa salva e padronizada ({COVER_TARGET_WIDTH}x{COVER_TARGET_HEIGHT}px) com sucesso.",
        "url": relative_url,
        "isbn": clean_isbn,
        "format": ext.upper(),
    }


class BookinfoCoverCollectRequest(BaseModel):
    isbn: str
    product_id: Optional[int] = None


async def collect_bookinfo_cover_for_company(
    db: Session,
    company_id: int,
    isbn: str,
    product_id: Optional[int] = None,
) -> dict:
    """
    Consulta a API da Bookinfo Metadados pelo ISBN, baixa a imagem de capa,
    padroniza (600x900px) e salva localmente em uploads/covers/<company_id>/<ISBN>.jpg.
    Também retorna sinopse e metadados caso disponíveis.
    """
    clean_isbn = re.sub(r"\D", "", (isbn or "").strip())
    if not clean_isbn:
        raise HTTPException(status_code=400, detail="Informe um ISBN válido (apenas números) para buscar na Bookinfo.")

    token = ""
    env = "prod"

    # 1. Tentar token específico do Seller
    seller_integ = db.query(Integrator).filter(
        Integrator.company_id == company_id,
        Integrator.platform == "BOOKINFO",
        Integrator.active == True,
    ).first()
    if seller_integ and seller_integ.credentials:
        try:
            creds = json.loads(seller_integ.credentials) if isinstance(seller_integ.credentials, str) else seller_integ.credentials
            seller_token = creds.get("TokenMetadados") or creds.get("token_metadados")
            if seller_token and str(seller_token).strip():
                token = str(seller_token).strip()
                env = str(creds.get("Ambiente", "PROD")).lower()
        except Exception:
            pass

    # 2. Fallback para Token Global do Master
    if not token:
        token_setting = db.query(GlobalSetting).filter(GlobalSetting.key == "bookinfo_default_metadata_token").first()
        env_setting = db.query(GlobalSetting).filter(GlobalSetting.key == "bookinfo_default_metadata_env").first()
        if token_setting and token_setting.value and token_setting.value.strip():
            token = token_setting.value.strip()
            if env_setting and env_setting.value:
                env = env_setting.value.strip().lower()

    if not token:
        raise HTTPException(
            status_code=400,
            detail="Token da Bookinfo Metadados não configurado no sistema. Configure no painel Master ou nas integrações.",
        )

    base_url = (
        "https://api.bookinfometadados.com.br/api/v1.5"
        if env == "prod"
        else "https://sandbox.bookinfometadados.com.br/api/v1.5"
    )
    lookup_url = f"{base_url}/book"

    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        res = await client.get(
            lookup_url,
            params={"isbn": clean_isbn},
            headers={
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json",
                "Accept": "application/json",
            },
        )
        if res.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Bookinfo Metadados retornou status HTTP {res.status_code} ao consultar o ISBN {clean_isbn}.",
            )

        data = res.json()
        books = data.get("books", []) if isinstance(data, dict) else []
        if not books:
            raise HTTPException(
                status_code=404,
                detail=f"Nenhuma obra encontrada na Bookinfo Metadados para o ISBN {clean_isbn}.",
            )

        book = books[0]
        imgs = book.get("imagens", {}) if isinstance(book.get("imagens"), dict) else {}
        p_capa = imgs.get("imagem_primeira_capa", {})
        remote_cover_url = None
        if isinstance(p_capa, dict):
            remote_cover_url = p_capa.get("grande") or p_capa.get("media") or p_capa.get("pequena")
        elif isinstance(p_capa, str):
            remote_cover_url = p_capa

        if not remote_cover_url:
            raise HTTPException(
                status_code=404,
                detail=f"O ISBN {clean_isbn} foi localizado na Bookinfo, porém não possui imagem de capa cadastrada.",
            )

        img_res = await client.get(remote_cover_url)
        if img_res.status_code != 200 or not img_res.content:
            raise HTTPException(
                status_code=502,
                detail="Não foi possível baixar o arquivo de imagem da URL fornecida pela Bookinfo.",
            )

        ext = "png" if ".png" in remote_cover_url.lower() else "jpg"
        relative_url = _standardize_and_save_cover_bytes(
            raw_bytes=img_res.content,
            company_id=company_id,
            clean_isbn=clean_isbn,
            ext=ext,
        )

        # Extrair metadados úteis caso o produto precise complementar
        synopsis = (book.get("sinopse") or "").strip()
        medidas = book.get("medidas") if isinstance(book.get("medidas"), dict) else {}
        peso_g = float(medidas.get("peso") or 0)
        weight_kg = round(peso_g / 1000.0, 3) if peso_g > 5 else (peso_g if peso_g > 0 else None)
        width_cm = float(medidas.get("largura") or 0) or None
        height_cm = float(medidas.get("altura") or 0) or None
        length_cm = float(medidas.get("espessura") or medidas.get("comprimento") or 0) or None

        prod = None
        if product_id:
            prod = db.query(Product).filter(Product.id == product_id, Product.company_id == company_id).first()
        if not prod:
            prod = db.query(Product).filter(Product.company_id == company_id, Product.ean_gtin == clean_isbn).first()
        if prod:
            prod.cover_url = relative_url
            if synopsis and not prod.long_description:
                prod.long_description = synopsis
            if synopsis and not prod.short_description:
                prod.short_description = synopsis[:300]
            if weight_kg and not prod.weight_kg:
                prod.weight_kg = weight_kg
            if width_cm and not prod.width_cm:
                prod.width_cm = width_cm
            if height_cm and not prod.height_cm:
                prod.height_cm = height_cm
            if length_cm and not prod.length_cm:
                prod.length_cm = length_cm
            db.commit()

        return {
            "message": f"Capa coletada na Bookinfo e salva como {clean_isbn}.{ext}!",
            "url": relative_url,
            "remote_url": remote_cover_url,
            "isbn": clean_isbn,
            "synopsis": synopsis,
            "weight_kg": weight_kg,
            "width_cm": width_cm,
            "height_cm": height_cm,
            "length_cm": length_cm,
        }


@router.post("/cover/bookinfo")
async def collect_cover_from_bookinfo(
    payload: BookinfoCoverCollectRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if not current_user.company_id:
        raise HTTPException(status_code=400, detail="Usuário sem empresa vinculada.")
    return await collect_bookinfo_cover_for_company(
        db=db,
        company_id=current_user.company_id,
        isbn=payload.isbn,
        product_id=payload.product_id,
    )


@router.post("/image")
async def upload_image(
    file: UploadFile = File(...),
    company_id: Optional[int] = Form(None),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint de uso geral para upload de imagens diversas (ex: Hotsite, Banners, Backgrounds de Login).
    Opcional usar em conjunto com UUID para previnir conflitos.
    """
    target_company_id = company_id or current_user.company_id
    
    if not target_company_id:
        raise HTTPException(status_code=400, detail="Empresa não informada ou Usuário sem empresa vinculada.")
        
    from app.models.user import UserRole
    if current_user.type != UserRole.MASTER and target_company_id != current_user.company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito. Você só pode enviar arquivos para a sua própria empresa.")
        
    validate_file_size_and_extension(file, category="image")

    # Diretorio para imagens gerais
    images_dir = UPLOADS_DIR / "images" / str(target_company_id)
    images_dir.mkdir(parents=True, exist_ok=True)
    
    # Manter a extensao original com base no content type ou nome do file
    clean_name = sanitize_filename(file.filename or "")
    extension = Path(clean_name).suffix.lower() if clean_name else ".jpg"
    unique_filename = f"{uuid.uuid4().hex}{extension}"
    
    file_path = images_dir / unique_filename
    
    try:
        content = await read_file_safely(file, max_size_bytes=5 * 1024 * 1024)
        with file_path.open("wb") as buffer:
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar o arquivo: {str(e)}")
        
    relative_url = f"/uploads/images/{target_company_id}/{unique_filename}"
    
    return {"message": "Imagem enviada com sucesso.", "url": relative_url}

@router.post("/certificate")
async def upload_certificate(
    file: UploadFile = File(...),
    company_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint para envio do certificado .p12 ou .pem da Efí.
    Salva fora da pasta pública para maior segurança.
    """
    from app.models.user import UserRole
    if current_user.type != UserRole.SELLER or current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    validate_file_size_and_extension(file, category="cert")

    certs_dir = Path(__file__).parent.parent.parent.parent / "certs" / str(company_id)
    certs_dir.mkdir(parents=True, exist_ok=True)
    
    unique_filename = f"efi_cert_{uuid.uuid4().hex}{Path(file.filename).suffix}"
    file_path = certs_dir / unique_filename
    
    try:
        content = await read_file_safely(file, max_size_bytes=10 * 1024 * 1024)
        with file_path.open("wb") as buffer:
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar o certificado: {str(e)}")
        
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        settings = CompanySettings(company_id=company_id)
        db.add(settings)
    
    settings.efi_certificate_path = str(file_path.absolute())
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erro ao salvar no banco.")
        
    return {"message": "Certificado enviado e configurado com sucesso.", "path": settings.efi_certificate_path}

@router.post("/nfse-certificate")
async def upload_nfse_certificate(
    file: UploadFile = File(...),
    company_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Endpoint para envio do certificado A1 (.pfx) da NFS-e Nacional.
    Salva isolado na pasta de certificados da aplicação backend.
    """
    from app.models.user import UserRole
    if current_user.type != UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    validate_file_size_and_extension(file, category="cert")

    certs_dir = Path(__file__).parent.parent.parent.parent / "certs" / "nfse" / str(company_id)
    certs_dir.mkdir(parents=True, exist_ok=True)
    
    unique_filename = f"nfse_cert_{uuid.uuid4().hex}{Path(file.filename).suffix}"
    file_path = certs_dir / unique_filename
    
    try:
        content = await read_file_safely(file, max_size_bytes=10 * 1024 * 1024)
        with file_path.open("wb") as buffer:
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar o certificado: {str(e)}")
        
    from app.models.company import Company
    company = db.query(Company).filter(Company.id == company_id).first()
    if not company:
        raise HTTPException(status_code=404, detail="Empresa não localizada.")
    
    company.cert_path = str(file_path.absolute())
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erro ao salvar no banco.")
        
    return {"message": "Certificado digital enviado e atrelado com sucesso ao emissor.", "path": company.cert_path}


@router.post("/inter-certificates")
async def upload_inter_certificates(
    cert_file: UploadFile = File(...),
    key_file: UploadFile = File(...),
    company_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Upload MTLS certificates (.crt and .key) for Banco Inter.
    """
    from app.models.user import UserRole
    if current_user.type != UserRole.MASTER and current_user.company_id != company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    validate_file_size_and_extension(cert_file, category="cert")
    validate_file_size_and_extension(key_file, category="cert")

    certs_dir = Path(__file__).parent.parent.parent.parent / "certs" / "inter" / str(company_id)
    certs_dir.mkdir(parents=True, exist_ok=True)
    
    cert_path = certs_dir / f"inter_cert_{uuid.uuid4().hex}{Path(cert_file.filename).suffix}"
    key_path = certs_dir / f"inter_key_{uuid.uuid4().hex}{Path(key_file.filename).suffix}"
    
    try:
        await cert_file.seek(0)
        await key_file.seek(0)
        cert_bytes = await cert_file.read()
        key_bytes = await key_file.read()
        
        cert_content_str = cert_bytes.decode("utf-8", errors="ignore")
        key_content_str = key_bytes.decode("utf-8", errors="ignore")
        
        with cert_path.open("wb") as buffer:
            buffer.write(cert_bytes)
        with key_path.open("wb") as buffer:
            buffer.write(key_bytes)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar os certificados: {str(e)}")
        
    from app.models.company_settings import CompanySettings
    settings = db.query(CompanySettings).filter(CompanySettings.company_id == company_id).first()
    if not settings:
        settings = CompanySettings(company_id=company_id)
        db.add(settings)
    
    settings.inter_cert_path = str(cert_path.absolute())
    settings.inter_key_path = str(key_path.absolute())
    settings.inter_cert_content = cert_content_str
    settings.inter_key_content = key_content_str
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erro ao salvar no banco.")
        
    return {"message": "Certificados do Inter enviados e configurados com sucesso."}

@router.post("/service-order-invoice")
async def upload_service_order_invoice(
    file: UploadFile = File(...),
    order_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Faz upload do PDF da Nota Fiscal de uma Ordem de Serviço.
    """
    from app.models.service import ServiceOrder
    
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    validate_file_size_and_extension(file, category="doc")
        
    order = db.query(ServiceOrder).filter(
        ServiceOrder.id == order_id,
        ServiceOrder.company_id == current_user.company_id
    ).first()
    
    if not order:
        raise HTTPException(status_code=404, detail="Ordem de serviço não encontrada.")

    invoices_dir = UPLOADS_DIR / "invoices" / str(current_user.company_id)
    invoices_dir.mkdir(parents=True, exist_ok=True)
    
    unique_filename = f"nfse_os_{order.id}_{uuid.uuid4().hex}.pdf"
    file_path = invoices_dir / unique_filename
    
    try:
        content = await read_file_safely(file, max_size_bytes=10 * 1024 * 1024)
        with file_path.open("wb") as buffer:
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar o PDF: {str(e)}")
        
    relative_url = f"/uploads/invoices/{current_user.company_id}/{unique_filename}"
    order.invoice_pdf_url = relative_url
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erro ao atualizar a O.S.")
        
    return {"message": "PDF anexado com sucesso.", "url": relative_url}

@router.post("/financial-invoice")
async def upload_financial_invoice(
    file: UploadFile = File(...),
    transaction_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Faz upload do PDF da Nota Fiscal a partir de uma transação financeira,
    amarrando o arquivo à Ordem de Serviço correspondente, se houver.
    """
    from app.models.financial import FinancialTransaction
    from app.models.service import ServiceOrder
    
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    validate_file_size_and_extension(file, category="doc")
        
    trans = db.query(FinancialTransaction).filter(
        FinancialTransaction.id == transaction_id,
        FinancialTransaction.company_id == current_user.company_id
    ).first()
    
    if not trans:
        raise HTTPException(status_code=404, detail="Transação financeira não encontrada.")

    # Try to find the related ServiceOrder
    order = None
    if trans.description and "OS #" in trans.description:
        import re
        match = re.search(r'OS #(\d+)', trans.description)
        if match:
            order_id = int(match.group(1))
            order = db.query(ServiceOrder).filter(
                ServiceOrder.id == order_id,
                ServiceOrder.company_id == current_user.company_id
            ).first()

    if not order:
        raise HTTPException(status_code=400, detail="Esta transação não parece estar vinculada a uma Ordem de Serviço.")

    invoices_dir = UPLOADS_DIR / "invoices" / str(current_user.company_id)
    invoices_dir.mkdir(parents=True, exist_ok=True)
    
    unique_filename = f"nfse_os_{order.id}_{uuid.uuid4().hex}.pdf"
    file_path = invoices_dir / unique_filename
    
    try:
        content = await read_file_safely(file, max_size_bytes=10 * 1024 * 1024)
        with file_path.open("wb") as buffer:
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar o PDF: {str(e)}")
        
    relative_url = f"/uploads/invoices/{current_user.company_id}/{unique_filename}"
    order.invoice_pdf_url = relative_url
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erro ao atualizar a O.S.")
        
    return {"message": "PDF anexado com sucesso. Ele foi vinculado automaticamente à O.S correspondente.", "url": relative_url}

@router.post("/financial-installment-boleto")
async def upload_financial_installment_boleto(
    file: UploadFile = File(...),
    installment_id: int = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Faz upload do PDF do boleto amarrando à parcela financeira especificada.
    """
    from app.models.financial import FinancialInstallment, FinancialTransaction
    
    if not current_user.company_id:
        raise HTTPException(status_code=403, detail="Acesso restrito.")
        
    validate_file_size_and_extension(file, category="doc")
        
    inst = db.query(FinancialInstallment).join(FinancialTransaction).filter(
        FinancialInstallment.id == installment_id,
        FinancialTransaction.company_id == current_user.company_id
    ).first()
    
    if not inst:
        raise HTTPException(status_code=404, detail="Parcela financeira não encontrada.")

    boletos_dir = UPLOADS_DIR / "boletos" / str(current_user.company_id)
    boletos_dir.mkdir(parents=True, exist_ok=True)
    
    unique_filename = f"boleto_inst_{inst.id}_{uuid.uuid4().hex}.pdf"
    file_path = boletos_dir / unique_filename
    
    try:
        content = await read_file_safely(file, max_size_bytes=10 * 1024 * 1024)
        with file_path.open("wb") as buffer:
            buffer.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao salvar o PDF: {str(e)}")
        
    relative_url = f"/uploads/boletos/{current_user.company_id}/{unique_filename}"
    inst.bank_slip_pdf_url = relative_url
    
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail="Erro ao atualizar a parcela.")
        
    return {"message": "PDF do boleto anexado com sucesso.", "url": relative_url}
