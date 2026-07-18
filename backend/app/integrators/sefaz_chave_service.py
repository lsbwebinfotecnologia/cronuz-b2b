"""
sefaz_chave_service.py
Serviço para consulta de NF-e / NFC-e por chave de acesso (44 dígitos)
via NFeConsultaProtocolo4.

A chave de acesso codifica:
  [cUF(2)] [AAMM(4)] [CNPJ(14)] [mod(2)] [serie(3)] [nNF(9)] [tpEmis(1)] [cNF(8)] [cDV(1)]

O endpoint correto é determinado por (cUF, modelo):
- Cada estado pode usar seu próprio servidor ou um dos ambientes virtuais:
    SVAN = SEFAZ Virtual Ambiente Nacional (Receita Federal)
    SVRS = SEFAZ Virtual Rio Grande do Sul (compartilhado por vários estados)
    SVC-AN = contingência AN
"""

import io
import re
import logging
import zipfile
import tempfile
import os
import base64
from datetime import datetime
from typing import List, Tuple, Dict, Optional
from lxml import etree

import requests
from cryptography.hazmat.primitives.serialization import Encoding, PrivateFormat, NoEncryption
from cryptography.hazmat.primitives.serialization.pkcs12 import load_key_and_certificates

from app.integrators.sefaz_sp_service import TempCertContext  # reutiliza o gerenciador de certificados

logger = logging.getLogger(__name__)

# ─────────────────────────────────────────────────────────────────────────────
# Namespaces
# ─────────────────────────────────────────────────────────────────────────────

NS_NF    = "http://www.portalfiscal.inf.br/nfe"
NS_WSDL4 = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4"
NS_SOAP  = "http://www.w3.org/2003/05/soap-envelope"
NS_XSD   = "http://www.w3.org/2001/XMLSchema"
NS_XSI   = "http://www.w3.org/2001/XMLSchema-instance"

SOAP_ACTION_CONSULTA = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeConsultaProtocolo4/nfeConsultaNF"

# ─────────────────────────────────────────────────────────────────────────────
# Mapa de endpoints NFeConsultaProtocolo4 por cUF
# Fonte: Manual de Orientação do Contribuinte (MOC) v7.0 + SVRS
# ─────────────────────────────────────────────────────────────────────────────

# SEFAZ Virtual Ambiente Nacional (Receita Federal) — maioria dos estados
_SVAN_PRD = "https://www.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx"
_SVAN_HML = "https://homologacao.sefazvirtual.fazenda.gov.br/NFeConsultaProtocolo4/NFeConsultaProtocolo4.asmx"

# SEFAZ Virtual RS — compartilhado com vários estados
_SVRS_PRD = "https://nfe.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx"
_SVRS_HML = "https://nfe-homologacao.svrs.rs.gov.br/ws/NfeConsulta/NfeConsulta4.asmx"

# NFC-e por SVRS
_SVRS_NFCE_PRD = "https://nfce.svrs.rs.gov.br/ws/NfceConsulta/NfceConsulta.asmx"
_SVRS_NFCE_HML = "https://nfce-homologacao.svrs.rs.gov.br/ws/NfceConsulta/NfceConsulta.asmx"

# SEFAZ própria SP
_SP_NFE_PRD  = "https://nfe.fazenda.sp.gov.br/ws/nfeconsulta2.asmx"
_SP_NFE_HML  = "https://homologacao.nfe.fazenda.sp.gov.br/ws/nfeconsulta2.asmx"
_SP_NFCE_PRD = "https://nfce.fazenda.sp.gov.br/ws/NfceConsulta/NfceConsulta2.asmx"
_SP_NFCE_HML = "https://homologacao.nfce.fazenda.sp.gov.br/ws/NfceConsulta/NfceConsulta2.asmx"

# SEFAZ própria MG
_MG_NFE_PRD = "https://nfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4"
_MG_NFE_HML = "https://hnfe.fazenda.mg.gov.br/nfe2/services/NFeConsultaProtocolo4"

# SEFAZ própria PR
_PR_NFE_PRD = "https://nfe.fazenda.pr.gov.br/nfe/NFeConsultaProtocolo4"
_PR_NFE_HML = "https://homologacao.nfe.fazenda.pr.gov.br/nfe/NFeConsultaProtocolo4"

# Mapa: (cUF, modelo) -> (url_producao, url_homologacao)
# modelo: '55' = NF-e | '65' = NFC-e
ENDPOINT_MAP: Dict[Tuple[str, str], Tuple[str, str]] = {
    # SP — servidor próprio para ambos os modelos
    ("35", "55"): (_SP_NFE_PRD,  _SP_NFE_HML),
    ("35", "65"): (_SP_NFCE_PRD, _SP_NFCE_HML),

    # MG — servidor próprio NF-e; NFC-e via SVRS
    ("31", "55"): (_MG_NFE_PRD, _MG_NFE_HML),
    ("31", "65"): (_SVRS_NFCE_PRD, _SVRS_NFCE_HML),

    # PR — servidor próprio
    ("41", "55"): (_PR_NFE_PRD, _PR_NFE_HML),
    ("41", "65"): (_SVRS_NFCE_PRD, _SVRS_NFCE_HML),

    # RS — SVRS
    ("43", "55"): (_SVRS_PRD, _SVRS_HML),
    ("43", "65"): (_SVRS_NFCE_PRD, _SVRS_NFCE_HML),

    # SC — SVRS
    ("42", "55"): (_SVRS_PRD, _SVRS_HML),
    ("42", "65"): (_SVRS_NFCE_PRD, _SVRS_NFCE_HML),

    # PE — SVRS
    ("26", "55"): (_SVRS_PRD, _SVRS_HML),
    ("26", "65"): (_SVRS_NFCE_PRD, _SVRS_NFCE_HML),

    # ES — SVRS
    ("32", "55"): (_SVRS_PRD, _SVRS_HML),
    ("32", "65"): (_SVRS_NFCE_PRD, _SVRS_NFCE_HML),

    # RO — SVRS
    ("11", "55"): (_SVRS_PRD, _SVRS_HML),
    ("11", "65"): (_SVRS_NFCE_PRD, _SVRS_NFCE_HML),

    # TO — SVRS
    ("17", "55"): (_SVRS_PRD, _SVRS_HML),
    ("17", "65"): (_SVRS_NFCE_PRD, _SVRS_NFCE_HML),

    # AP — SVRS
    ("16", "55"): (_SVRS_PRD, _SVRS_HML),
    ("16", "65"): (_SVRS_NFCE_PRD, _SVRS_NFCE_HML),

    # RR — SVRS
    ("14", "55"): (_SVRS_PRD, _SVRS_HML),
    ("14", "65"): (_SVRS_NFCE_PRD, _SVRS_NFCE_HML),

    # AL — SVRS
    ("27", "55"): (_SVRS_PRD, _SVRS_HML),
    ("27", "65"): (_SVRS_NFCE_PRD, _SVRS_NFCE_HML),

    # Demais estados — SVAN (Receita Federal)
    # RJ(33), AM(13), BA(29), CE(23), DF(53), GO(52), MA(21), MS(50),
    # MT(51), PA(15), PB(25), PI(22), RN(24), SE(28), AC(12)
}

# cUFs que usam SVAN como padrão
_SVAN_CUFS = {"12","13","15","21","22","23","24","25","28","29","33","50","51","52","53"}

def _get_endpoint(c_uf: str, modelo: str, ambiente: str) -> str:
    key = (c_uf, modelo)
    if key in ENDPOINT_MAP:
        prd_url, hml_url = ENDPOINT_MAP[key]
        return prd_url if ambiente == "PRODUCAO" else hml_url

    # Fallback: SVAN para NF-e; SVRS NFC-e para outros
    if modelo == "65":
        return _SVRS_NFCE_PRD if ambiente == "PRODUCAO" else _SVRS_NFCE_HML
    return _SVAN_PRD if ambiente == "PRODUCAO" else _SVAN_HML


# ─────────────────────────────────────────────────────────────────────────────
# Parse da chave de acesso
# ─────────────────────────────────────────────────────────────────────────────

UF_NOME = {
    "12": "AC", "27": "AL", "16": "AP", "13": "AM", "29": "BA",
    "23": "CE", "53": "DF", "32": "ES", "52": "GO", "21": "MA",
    "51": "MT", "50": "MS", "31": "MG", "15": "PA", "25": "PB",
    "41": "PR", "26": "PE", "22": "PI", "33": "RJ", "24": "RN",
    "43": "RS", "11": "RO", "14": "RR", "42": "SC", "35": "SP",
    "28": "SE", "17": "TO",
}

def parse_chave_acesso(chave: str) -> dict:
    """
    Parseia a chave de acesso (44 dígitos) e extrai todos os campos.
    Lança ValueError se a chave for inválida.
    """
    digits = re.sub(r"\D", "", chave)
    if len(digits) != 44:
        raise ValueError(f"Chave inválida: esperado 44 dígitos, recebido {len(digits)} — '{chave[:20]}...'")

    c_uf   = digits[0:2]
    aamm   = digits[2:6]
    modelo = digits[20:22]

    try:
        data_emissao = datetime.strptime(aamm, "%y%m").strftime("%m/%Y")
    except Exception:
        data_emissao = aamm

    return {
        "chave":           digits,
        "c_uf":            c_uf,
        "uf":              UF_NOME.get(c_uf, f"UF{c_uf}"),
        "data_emissao":    data_emissao,
        "cnpj_emitente":   digits[6:20],
        "modelo":          modelo,
        "tipo":            "NFC-e" if modelo == "65" else "NF-e",
        "serie":           digits[22:25].lstrip("0") or "0",
        "numero":          digits[25:34].lstrip("0") or "0",
        "tp_emis":         digits[34:35],
        "c_dv":            digits[43:44],
    }


# ─────────────────────────────────────────────────────────────────────────────
# Construção do SOAP NFeConsultaProtocolo4
# ─────────────────────────────────────────────────────────────────────────────

def _build_consulta_soap(chave: str, ambiente: str) -> bytes:
    tp_amb = "1" if ambiente == "PRODUCAO" else "2"
    envelope = f"""<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope
  xmlns:xsi="{NS_XSI}"
  xmlns:xsd="{NS_XSD}"
  xmlns:soap12="{NS_SOAP}">
  <soap12:Body>
    <nfeConsultaNF xmlns="{NS_WSDL4}">
      <nfeDadosMsg>
        <consSitNFe xmlns="{NS_NF}" versao="4.00">
          <tpAmb>{tp_amb}</tpAmb>
          <xServ>CONSULTAR</xServ>
          <chNFe>{chave}</chNFe>
        </consSitNFe>
      </nfeDadosMsg>
    </nfeConsultaNF>
  </soap12:Body>
</soap12:Envelope>"""
    return envelope.encode("utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# Chamada HTTP
# ─────────────────────────────────────────────────────────────────────────────

def _call_consulta_ws(
    soap_body: bytes,
    endpoint: str,
    cert_path: str,
    key_path: str,
    timeout: int = 30,
) -> etree._Element:
    content_type = f'application/soap+xml; charset=utf-8; action="{SOAP_ACTION_CONSULTA}"'
    headers = {"Content-Type": content_type}

    response = requests.post(
        endpoint,
        data=soap_body,
        headers=headers,
        cert=(cert_path, key_path),
        verify=True,
        timeout=timeout,
    )

    if response.status_code != 200:
        raise RuntimeError(
            f"HTTP {response.status_code} em {endpoint}: {response.text[:300]}"
        )
    return etree.fromstring(response.content)


# ─────────────────────────────────────────────────────────────────────────────
# Parse da resposta consSitNFe
# ─────────────────────────────────────────────────────────────────────────────

def _parse_consulta_response(root: etree._Element, chave: str) -> Optional[bytes]:
    """
    Extrai o XML do documento (procNFe / procEventoNFe) da resposta.
    Retorna None se não encontrado ou rejeitado.
    cStat 100 = autorizado | 101 = cancelado | 110/150 = denegado
    """
    ret = root.find(f".//{{{NS_NF}}}retConsSitNFe")
    if ret is None:
        raise RuntimeError(f"Chave {chave[:10]}...: retConsSitNFe não encontrado na resposta.")

    c_stat  = ret.findtext(f"{{{NS_NF}}}cStat", "")
    x_motivo = ret.findtext(f"{{{NS_NF}}}xMotivo", "")

    # Statuses de sucesso: 100=autorizado, 101=cancelado, 110=denegado, 150=autorizado fora prazo
    status_ok = {"100", "101", "110", "150"}

    if c_stat not in status_ok:
        logger.warning(f"Chave {chave[:10]}... cStat={c_stat}: {x_motivo}")
        return None

    # Tenta extrair procNFe ou procEventoNFe
    proc = ret.find(f"{{{NS_NF}}}protNFe") or ret.find(f".//{{{NS_NF}}}procNFe")

    # Serializa o retConsSitNFe completo como XML — contém NF-e + protocolo
    xml_bytes = etree.tostring(ret, encoding="utf-8", xml_declaration=True)
    return xml_bytes


# ─────────────────────────────────────────────────────────────────────────────
# Função principal: download por lista de chaves
# ─────────────────────────────────────────────────────────────────────────────

def download_xmls_por_chave(
    chaves: List[str],
    pfx_base64: str,
    cert_password: str,
    ambiente: str,
) -> Tuple[bytes, int, List[dict]]:
    """
    Consulta cada chave de acesso na SEFAZ e retorna os XMLs em ZIP.

    Retorna:
        (zip_bytes, total_encontrados, erros)
        erros = lista de {'chave': ..., 'motivo': ...}
    """
    parsed = []
    erros = []

    for raw in chaves:
        try:
            info = parse_chave_acesso(raw)
            parsed.append(info)
        except ValueError as e:
            erros.append({"chave": raw, "motivo": str(e)})

    zip_buffer = io.BytesIO()
    total = 0

    with TempCertContext(pfx_base64, cert_password) as (cert_path, key_path):
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            for info in parsed:
                chave   = info["chave"]
                c_uf    = info["c_uf"]
                modelo  = info["modelo"]
                endpoint = _get_endpoint(c_uf, modelo, ambiente)

                try:
                    soap_body = _build_consulta_soap(chave, ambiente)
                    root = _call_consulta_ws(soap_body, endpoint, cert_path, key_path)
                    xml_bytes = _parse_consulta_response(root, chave)

                    if xml_bytes:
                        tipo = info["tipo"].lower().replace("-", "")
                        nome = f"{tipo}_{chave}.xml"
                        zf.writestr(nome, xml_bytes)
                        total += 1
                        logger.info(f"Chave {chave[:10]}... OK ({info['uf']} {info['tipo']})")
                    else:
                        erros.append({"chave": chave, "motivo": "Documento não encontrado ou status inválido na SEFAZ"})

                except Exception as e:
                    logger.error(f"Chave {chave[:10]}... ERRO: {e}")
                    erros.append({"chave": chave, "motivo": str(e)})

    zip_buffer.seek(0)
    return zip_buffer.read(), total, erros
