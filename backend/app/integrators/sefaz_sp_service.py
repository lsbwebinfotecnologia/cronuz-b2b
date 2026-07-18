"""
sefaz_sp_service.py
====================
Integração com o Web Service da SEFAZ-SP para download de XMLs de NF-e e NFC-e.

Suporte a:
- NF-e (modelo 55): NFeDistribuicaoDFe — Web Service Nacional (por CNPJ emitente/destinatário)
- NFC-e (modelo 65): NFeDistribuicaoDFe — mesma infraestrutura nacional, filtrando modelo 65

Certificado: .pfx armazenado no banco de dados (base64).
Durante a requisição, é criado um arquivo temporário via tempfile e destruído logo após.

Limitações SEFAZ:
- Máximo 50 documentos por consulta (necessita paginação via nsu)
- Período retroativo: geralmente até 90-100 dias
"""

import base64
import gzip
import io
import os
import tempfile
import zipfile
import logging
from datetime import date, datetime, timedelta
from typing import List, Optional, Tuple
from lxml import etree
from cryptography.hazmat.primitives.serialization import pkcs12, Encoding, PrivateFormat, NoEncryption
from cryptography.hazmat.primitives.serialization import BestAvailableEncryption
import requests
import ssl

logger = logging.getLogger(__name__)


class SefazConsumoIndevidoError(RuntimeError):
    """
    cStat=656: SEFAZ bloqueou por consumo indevido.
    O caller deve persistir o ultNSU retornado e aguardar antes de tentar novamente.
    """
    def __init__(self, motivo: str, ultimo_nsu: str):
        super().__init__(motivo)
        self.ultimo_nsu = ultimo_nsu

# ─────────────────────────────────────────────────────────────────────────────
# Constantes — Endpoints SEFAZ
# ─────────────────────────────────────────────────────────────────────────────

SEFAZ_NFE_DIST_DFE = {
    "PRODUCAO": "https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
    "HOMOLOGACAO": "https://hom.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx",
}

# Para SOAP 1.2, a action é embutida no Content-Type (não como SOAPAction header separado)
SOAP_ACTION_DIST_DFE = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse"

# Namespaces XML
NS_NF   = "http://www.portalfiscal.inf.br/nfe"
NS_WSDL = "http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe"  # namespace do wrapper WSDL
NS_SOAP = "http://www.w3.org/2003/05/soap-envelope"
NS_XSD  = "http://www.w3.org/2001/XMLSchema"
NS_XSI  = "http://www.w3.org/2001/XMLSchema-instance"

# Mapa UF sigla -> código IBGE (cUF) usado no serviço SEFAZ
UF_CODIGO_IBGE = {
    "AC": "12", "AL": "27", "AP": "16", "AM": "13", "BA": "29",
    "CE": "23", "DF": "53", "ES": "32", "GO": "52", "MA": "21",
    "MT": "51", "MS": "50", "MG": "31", "PA": "15", "PB": "25",
    "PR": "41", "PE": "26", "PI": "22", "RJ": "33", "RN": "24",
    "RS": "43", "RO": "11", "RR": "14", "SC": "42", "SP": "35",
    "SE": "28", "TO": "17",
}

# ─────────────────────────────────────────────────────────────────────────────
# Helpers de Certificado
# ─────────────────────────────────────────────────────────────────────────────

class TempCertContext:
    """
    Context manager que recebe o conteúdo do .pfx em base64 e a senha,
    escreve arquivos temporários de cert/key (.pem) e os apaga ao sair.
    """

    def __init__(self, pfx_base64: str, password: str):
        self.pfx_base64 = pfx_base64
        self.password = password
        self._cert_file = None
        self._key_file = None

    def __enter__(self) -> Tuple[str, str]:
        pfx_bytes = base64.b64decode(self.pfx_base64)
        pwd_bytes = self.password.encode() if self.password else b""

        private_key, certificate, _ = pkcs12.load_key_and_certificates(pfx_bytes, pwd_bytes)

        # Extrai cert em PEM
        cert_pem = certificate.public_bytes(Encoding.PEM)
        # Extrai key em PEM sem criptografia (temporário, será destruído)
        key_pem = private_key.private_bytes(Encoding.PEM, PrivateFormat.TraditionalOpenSSL, NoEncryption())

        self._cert_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pem")
        self._cert_file.write(cert_pem)
        self._cert_file.flush()
        self._cert_file.close()

        self._key_file = tempfile.NamedTemporaryFile(delete=False, suffix=".pem")
        self._key_file.write(key_pem)
        self._key_file.flush()
        self._key_file.close()

        return self._cert_file.name, self._key_file.name

    def __exit__(self, *args):
        try:
            if self._cert_file and os.path.exists(self._cert_file.name):
                os.unlink(self._cert_file.name)
            if self._key_file and os.path.exists(self._key_file.name):
                os.unlink(self._key_file.name)
        except Exception as e:
            logger.warning(f"Falha ao remover arquivos temporários de certificado: {e}")


# ─────────────────────────────────────────────────────────────────────────────
# Construção do XML SOAP — distDFeInt
# ─────────────────────────────────────────────────────────────────────────────

def _build_dist_dfe_soap(cnpj: str, ultimo_nsu: str = "0", ambiente: str = "PRODUCAO", uf: str = "SP") -> bytes:
    """
    Monta o envelope SOAP 1.2 para NFeDistribuicaoDFe (distDFeInt).
    - nfeDistDFeInteresse usa namespace WSDL (não NS_NF)
    - distDFeInt usa namespace NS_NF com versao="1.01"
    - cUF derivado da UF configurada na filial
    """
    c_uf   = UF_CODIGO_IBGE.get(uf.upper(), "35")  # default SP
    tp_amb = "1" if ambiente == "PRODUCAO" else "2"
    nsu_pad = ultimo_nsu.zfill(15)

    envelope = f"""<?xml version="1.0" encoding="utf-8"?>
<soap12:Envelope
  xmlns:xsi="{NS_XSI}"
  xmlns:xsd="{NS_XSD}"
  xmlns:soap12="{NS_SOAP}">
  <soap12:Body>
    <nfeDistDFeInteresse xmlns="{NS_WSDL}">
      <nfeDadosMsg>
        <distDFeInt xmlns="{NS_NF}" versao="1.01">
          <tpAmb>{tp_amb}</tpAmb>
          <cUFAutor>{c_uf}</cUFAutor>
          <CNPJ>{cnpj}</CNPJ>
          <distNSU>
            <ultNSU>{nsu_pad}</ultNSU>
          </distNSU>
        </distDFeInt>
      </nfeDadosMsg>
    </nfeDistDFeInteresse>
  </soap12:Body>
</soap12:Envelope>"""

    return envelope.encode("utf-8")


# ─────────────────────────────────────────────────────────────────────────────
# Chamada ao Web Service
# ─────────────────────────────────────────────────────────────────────────────

def _call_sefaz_ws(
    soap_body: bytes,
    cert_path: str,
    key_path: str,
    ambiente: str = "PRODUCAO",
    timeout: int = 90,
) -> etree._Element:
    """
    Faz a chamada HTTPS mTLS ao Web Service da SEFAZ e retorna o XML da resposta.

    SOAP 1.2: a SOAPAction deve ser embutida no Content-Type como parâmetro 'action',
    NÃO como header HTTP separado (que era aceito apenas em SOAP 1.1).
    """
    url = SEFAZ_NFE_DIST_DFE[ambiente]

    # SOAP 1.2: action embutida no Content-Type
    content_type = f'application/soap+xml; charset=utf-8; action="{SOAP_ACTION_DIST_DFE}"'
    headers = {
        "Content-Type": content_type,
    }

    logger.info(f"Chamando SEFAZ [{ambiente}]: {url} | NSU a partir do 0")

    response = requests.post(
        url,
        data=soap_body,
        headers=headers,
        cert=(cert_path, key_path),
        verify=True,
        timeout=timeout,
    )

    logger.info(f"SEFAZ HTTP {response.status_code} | {len(response.content)} bytes")

    if response.status_code != 200:
        raise RuntimeError(
            f"SEFAZ retornou HTTP {response.status_code}: {response.text[:800]}"
        )

    root = etree.fromstring(response.content)
    return root


# ─────────────────────────────────────────────────────────────────────────────
# Parse da resposta — extrai XMLs compactados
# ─────────────────────────────────────────────────────────────────────────────

def _parse_dist_dfe_response(root: etree._Element) -> Tuple[List[dict], str, bool]:
    """
    Parseia a resposta do distDFeInt.
    Retorna:
      - lista de dicts: { chave, schema (nfeProc/procEventoNFe), xml_bytes }
      - ultimo_nsu: para paginação
      - fim_da_paginacao: True se não há mais registros
    """
    ns = {"nf": NS_NF}

    # Localizar retDistDFeInt na resposta SOAP
    ret = root.find(".//{%s}retDistDFeInt" % NS_NF)
    if ret is None:
        raise RuntimeError("Resposta SEFAZ inválida: retDistDFeInt não encontrado.")

    c_stat = ret.findtext("{%s}cStat" % NS_NF, "")
    x_motivo = ret.findtext("{%s}xMotivo" % NS_NF, "")

    # Extrair NSU mesmo em caso de erro, para persistir
    ultimo_nsu_raw = (
        ret.findtext(".//{%s}maxNSU" % NS_NF)
        or ret.findtext(".//{%s}ultNSU" % NS_NF)
        or "0"
    )
    ultimo_nsu = ultimo_nsu_raw.zfill(15)

    # 656 = Consumo Indevido — deve usar ultNSU nas próximas chamadas
    if c_stat == "656":
        raise SefazConsumoIndevidoError(
            f"SEFAZ bloqueou por consumo indevido (cStat=656). "
            f"Aguarde 1 hora antes de tentar novamente. "
            f"Próxima consulta deve partir do NSU: {ultimo_nsu}",
            ultimo_nsu=ultimo_nsu,
        )

    # 138 = Documento localizado, 137 = nenhum documento
    if c_stat not in ("137", "138"):
        raise RuntimeError(f"SEFAZ cStat={c_stat}: {x_motivo}")

    ult_nsu_resp = ret.findtext(".//{%s}ultNSU" % NS_NF, "0").zfill(15)
    fim_da_paginacao = (ultimo_nsu == ult_nsu_resp) or (c_stat == "137")

    documentos = []
    for doc_zip in ret.findall(".//{%s}docZip" % NS_NF):
        schema = doc_zip.get("schema", "")
        nsu = doc_zip.get("NSU", "")
        conteudo_gz = base64.b64decode(doc_zip.text or "")
        xml_bytes = gzip.decompress(conteudo_gz)
        documentos.append({
            "nsu": nsu,
            "schema": schema,
            "xml_bytes": xml_bytes,
        })

    return documentos, ultimo_nsu, fim_da_paginacao


# ─────────────────────────────────────────────────────────────────────────────
# Função Principal: Download de XMLs por período
# ─────────────────────────────────────────────────────────────────────────────

def download_xmls_sefaz(
    cnpj: str,
    pfx_base64: str,
    cert_password: str,
    ambiente: str,
    data_inicio: date,
    data_fim: date,
    modelos: List[str],
    uf: str = "SP",
    ultimo_nsu_inicial: str = "0",
) -> Tuple[bytes, int, str]:
    """
    Baixa XMLs da SEFAZ para o CNPJ informado no período dado.
    Retorna (zip_bytes, total_xmls, ultimo_nsu_final).

    - ultimo_nsu_inicial: NSU salvo da última consulta desta filial.
      DEVE ser persistido no banco e reutilizado para evitar cStat=656.
    - ultimo_nsu_final: NSU máximo retornado nesta rodada — deve ser salvo.
    """
    zip_buffer = io.BytesIO()
    total = 0
    ultimo_nsu = (ultimo_nsu_inicial or "0").strip().zfill(15)
    nsu_final = ultimo_nsu  # será atualizado a cada página

    with TempCertContext(pfx_base64, cert_password) as (cert_path, key_path):
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            while True:
                soap_body = _build_dist_dfe_soap(cnpj, ultimo_nsu, ambiente, uf)

                try:
                    root = _call_sefaz_ws(soap_body, cert_path, key_path, ambiente)
                except RuntimeError as e:
                    logger.error(f"Erro na chamada SEFAZ: {e}")
                    raise

                documentos, ultimo_nsu, fim = _parse_dist_dfe_response(root)
                nsu_final = ultimo_nsu  # atualiza a cada página bem-sucedida

                for doc in documentos:
                    schema = doc["schema"]
                    xml_bytes = doc["xml_bytes"]
                    nsu = doc["nsu"]

                    # Filtra por modelo
                    modelo_no_schema = ""
                    if "nfeProc" in schema or "NFe" in schema:
                        modelo_no_schema = "55"
                    elif "nfce" in schema.lower() or "NFCe" in schema:
                        modelo_no_schema = "65"
                    elif "procEventoNFe" in schema or "procEventoNFCe" in schema:
                        # Eventos (cancelamento) — tenta detectar pelo XML
                        if b"<mod>65</mod>" in xml_bytes:
                            modelo_no_schema = "65"
                        else:
                            modelo_no_schema = "55"

                    if modelo_no_schema not in modelos:
                        continue

                    # Filtra por data de emissão
                    data_emissao = _extract_data_emissao(xml_bytes)
                    if data_emissao is None or not (data_inicio <= data_emissao.date() <= data_fim):
                        continue

                    # Determina nome do arquivo
                    chave = _extract_chave_acesso(xml_bytes) or nsu
                    tipo = "evento" if "procEvento" in schema else "nfe"
                    nome_arquivo = f"{tipo}_{chave}.xml"

                    zf.writestr(nome_arquivo, xml_bytes)
                    total += 1

                if fim:
                    break

    zip_buffer.seek(0)
    return zip_buffer.read(), total, nsu_final


# ─────────────────────────────────────────────────────────────────────────────
# Helpers de Parse do XML de NF-e / Evento
# ─────────────────────────────────────────────────────────────────────────────

def _extract_data_emissao(xml_bytes: bytes) -> Optional[datetime]:
    """Extrai a data de emissão do XML da NF-e/NFC-e ou evento."""
    try:
        root = etree.fromstring(xml_bytes)
        # NF-e: //infNFe/ide/dhEmi
        dh_emi = root.findtext(".//{%s}dhEmi" % NS_NF) or root.findtext(".//{%s}dEmi" % NS_NF)
        if dh_emi:
            # Pode vir como "2024-01-15T10:30:00-03:00" ou "2024-01-15"
            dh_emi = dh_emi[:19]
            return datetime.strptime(dh_emi[:10], "%Y-%m-%d")
        # Evento de cancelamento: //infEvento/dhEvento
        dh_ev = root.findtext(".//{%s}dhEvento" % NS_NF)
        if dh_ev:
            return datetime.strptime(dh_ev[:10], "%Y-%m-%d")
    except Exception as e:
        logger.warning(f"Não foi possível extrair data de emissão: {e}")
    return None


def _extract_chave_acesso(xml_bytes: bytes) -> Optional[str]:
    """Extrai a chave de acesso (44 dígitos) do XML."""
    try:
        root = etree.fromstring(xml_bytes)
        # nfeProc/protNFe/infProt/chNFe
        chave = root.findtext(".//{%s}chNFe" % NS_NF)
        if not chave:
            # evento: //infEvento/chNFe
            chave = root.findtext(".//{%s}chNFe" % NS_NF)
        return chave
    except Exception:
        return None
