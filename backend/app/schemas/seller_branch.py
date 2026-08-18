from pydantic import BaseModel, field_validator
from typing import Optional, List
from datetime import datetime


def _validar_cnpj(cnpj: str) -> str:
    """
    Valida CNPJ usando o algoritmo oficial de cálculo de dígitos verificadores.
    Aceita o CNPJ com ou sem formatação (pontos, barra, traço).
    Retorna o CNPJ formatado (XX.XXX.XXX/XXXX-XX) se válido.
    Lança ValueError se inválido.
    """
    if not cnpj:
        return cnpj

    # Remove formatação
    digits = "".join(filter(str.isdigit, cnpj))

    if len(digits) != 14:
        raise ValueError("CNPJ deve conter 14 dígitos.")

    # Rejeita CNPJs com todos os dígitos iguais (ex: 00000000000000)
    if len(set(digits)) == 1:
        raise ValueError("CNPJ inválido.")

    def calc_dv(digits_seq: str, weights: List[int]) -> int:
        total = sum(int(d) * w for d, w in zip(digits_seq, weights))
        remainder = total % 11
        return 0 if remainder < 2 else 11 - remainder

    # Primeiro dígito verificador
    w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    dv1 = calc_dv(digits[:12], w1)
    if dv1 != int(digits[12]):
        raise ValueError("CNPJ inválido (dígito verificador incorreto).")

    # Segundo dígito verificador
    w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    dv2 = calc_dv(digits[:13], w2)
    if dv2 != int(digits[13]):
        raise ValueError("CNPJ inválido (dígito verificador incorreto).")

    # Retorna formatado
    return f"{digits[:2]}.{digits[2:5]}.{digits[5:8]}/{digits[8:12]}-{digits[12:]}"


def _safe_validate_cnpj(v) -> Optional[str]:
    if not v:
        return v
    try:
        return _validar_cnpj(str(v))
    except ValueError:
        # Tenta preencher com zeros se tiver menos de 14 dígitos
        digits = "".join(filter(str.isdigit, str(v)))
        if len(digits) > 0 and len(digits) < 14:
            try:
                return _validar_cnpj(digits.zfill(14))
            except ValueError:
                pass
        return str(v)


class SellerBranchBase(BaseModel):
    nome: str
    cnpj: Optional[str] = None
    cod_empresa: str
    cod_filial: str
    cod_local: Optional[str] = None
    active: bool = True

    # SEFAZ Config
    sefaz_environment: str = 'HOMOLOGACAO'  # 'HOMOLOGACAO' or 'PRODUCAO'
    uf: str = 'SP'                           # UF da consulta SEFAZ
    sefaz_cert_password: Optional[str] = None
    cod_local_estoque: Optional[List[str]] = []
    sefaz_ultimo_nsu: Optional[str] = '0'

    @field_validator('cnpj', mode='before')
    @classmethod
    def validate_cnpj(cls, v):
        return _safe_validate_cnpj(v)

    @field_validator('sefaz_environment', mode='before')
    @classmethod
    def validate_ambiente(cls, v):
        if not v:
            return 'HOMOLOGACAO'
        v_str = str(v).upper().strip()
        if v_str not in ('HOMOLOGACAO', 'PRODUCAO'):
            return 'HOMOLOGACAO'
        return v_str

    @field_validator('uf', mode='before')
    @classmethod
    def validate_uf(cls, v):
        if not v:
            return 'SP'
        ufs_validas = {
            'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA',
            'MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN',
            'RS','RO','RR','SC','SP','SE','TO',
        }
        v_str = str(v).upper().strip()
        if v_str not in ufs_validas:
            return 'SP'
        return v_str


class SellerBranchCreate(SellerBranchBase):
    pass


class SellerBranchUpdate(BaseModel):
    nome: Optional[str] = None
    cnpj: Optional[str] = None
    cod_empresa: Optional[str] = None
    cod_filial: Optional[str] = None
    cod_local: Optional[str] = None
    active: Optional[bool] = None

    # SEFAZ Config
    sefaz_environment: Optional[str] = None
    uf: Optional[str] = None
    sefaz_cert_password: Optional[str] = None
    cod_local_estoque: Optional[List[str]] = None
    sefaz_ultimo_nsu: Optional[str] = None

    @field_validator('cnpj', mode='before')
    @classmethod
    def validate_cnpj(cls, v):
        return _safe_validate_cnpj(v)


class SellerBranchResponse(SellerBranchBase):
    id: int
    company_id: int
    created_at: datetime
    updated_at: datetime
    # Indica se o certificado está carregado (não expõe o conteúdo)
    has_sefaz_cert: bool = False

    class Config:
        from_attributes = True
