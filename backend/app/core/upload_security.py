import os
import re
from pathlib import Path
from fastapi import HTTPException, UploadFile, status

# Limites Mandatórios (em bytes)
MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024       # 5 MB
MAX_SHEET_SIZE_BYTES = 10 * 1024 * 1024     # 10 MB
MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
MAX_ABSOLUTE_SIZE_BYTES = 15 * 1024 * 1024  # 15 MB

ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}
ALLOWED_SHEET_EXTENSIONS = {".xlsx", ".csv", ".ods"}
ALLOWED_DOCUMENT_EXTENSIONS = {".pdf", ".xml", ".txt"}
ALLOWED_CERT_EXTENSIONS = {".pfx", ".p12", ".pem", ".crt", ".key"}


def sanitize_filename(filename: str) -> str:
    """
    Remove caminhos relativos (Path Traversal como ../ ou ..\\) e caracteres especiais
    inseguros do nome do arquivo, preservando apenas caracteres alfanuméricos, hifens e underlines.
    """
    if not filename:
        return "unnamed_file"
    
    # Extrai estritamente o basename (evita diretórios injetados)
    base_name = os.path.basename(filename).strip()
    
    # Separa nome e extensão
    suffix = Path(base_name).suffix.lower()
    stem = Path(base_name).stem
    
    # Sanitiza o stem
    clean_stem = re.sub(r"[^a-zA-Z0-9_\-]", "_", stem)
    clean_stem = re.sub(r"_+", "_", clean_stem).strip("_")
    
    if not clean_stem:
        clean_stem = "file"
        
    return f"{clean_stem}{suffix}"


def validate_file_size_and_extension(
    file: UploadFile,
    category: str = "image", # "image", "sheet", "doc", "cert", "generic"
    custom_max_size: int = None,
) -> str:
    """
    Valida tamanho de arquivo e extensão de acordo com as diretrizes de segurança.
    Levanta HTTPException (400 ou 413) em caso de violação.
    Retorna o nome do arquivo sanitizado.
    """
    raw_filename = file.filename or ""
    clean_filename = sanitize_filename(raw_filename)
    extension = Path(clean_filename).suffix.lower()
    
    if category == "image":
        max_limit = custom_max_size or MAX_IMAGE_SIZE_BYTES
        allowed_exts = ALLOWED_IMAGE_EXTENSIONS
        cat_desc = "de imagem (JPG, PNG, WEBP)"
    elif category == "sheet":
        max_limit = custom_max_size or MAX_SHEET_SIZE_BYTES
        allowed_exts = ALLOWED_SHEET_EXTENSIONS
        cat_desc = "de planilha (XLSX, CSV, ODS)"
    elif category == "doc":
        max_limit = custom_max_size or MAX_DOCUMENT_SIZE_BYTES
        allowed_exts = ALLOWED_DOCUMENT_EXTENSIONS
        cat_desc = "de documento (PDF, XML, TXT)"
    elif category == "cert":
        max_limit = custom_max_size or MAX_DOCUMENT_SIZE_BYTES
        allowed_exts = ALLOWED_CERT_EXTENSIONS
        cat_desc = "de certificado digital (.pfx, .p12, .crt, .key, .pem)"
    else:
        max_limit = custom_max_size or MAX_ABSOLUTE_SIZE_BYTES
        allowed_exts = set()
        cat_desc = "enviado"
        
    # Garante teto absoluto
    if max_limit > MAX_ABSOLUTE_SIZE_BYTES:
        max_limit = MAX_ABSOLUTE_SIZE_BYTES

    # 1. Validação de Extensão
    if allowed_exts and extension not in allowed_exts:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Extensão de arquivo não permitida para este tipo {cat_desc}. Aceitas: {', '.join(sorted(allowed_exts))}"
        )

    # 2. Validação Rápida via file.size (quando disponibilizado pelo ASGI server)
    limit_mb = max_limit // (1024 * 1024)
    if file.size and file.size > max_limit:
        raise HTTPException(
            status_code=status.HTTP_413_CONTENT_TOO_LARGE,
            detail=f"O arquivo excede o limite máximo permitido de {limit_mb}MB para este tipo de envio."
        )

    return clean_filename


async def read_file_safely(file: UploadFile, max_size_bytes: int = MAX_ABSOLUTE_SIZE_BYTES) -> bytes:
    """
    Lê o arquivo em chunks controlados para evitar consumo abusivo de memória RAM.
    Se o arquivo ultrapassar `max_size_bytes` durante o streaming, a leitura é abortada imediatamente.
    """
    chunk_size = 64 * 1024 # 64KB por bloco
    total_read = 0
    chunks = []
    
    # Reseta cursor para leitura segura
    await file.seek(0)
    
    while True:
        chunk = await file.read(chunk_size)
        if not chunk:
            break
        total_read += len(chunk)
        if total_read > max_size_bytes:
            limit_mb = max_size_bytes // (1024 * 1024)
            raise HTTPException(
                status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                detail=f"O arquivo ultrapassou o limite máximo de {limit_mb}MB durante o recebimento e foi bloqueado."
            )
        chunks.append(chunk)
        
    await file.seek(0)
    return b"".join(chunks)
