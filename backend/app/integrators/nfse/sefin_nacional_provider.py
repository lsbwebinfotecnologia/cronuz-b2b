import os
from datetime import datetime
import json
import httpx
from lxml import etree
import logging

from app.integrators.nfse_crypto import NFSeCrypto
from app.models.company import Company
from app.models.service import ServiceOrder, Service
from app.models.customer import Customer, Address
from app.integrators.nfse.base_provider import BaseNfseProvider

logger = logging.getLogger(__name__)

class SefinNacionalProvider(BaseNfseProvider):
    def __init__(self, company: Company):
        super().__init__(company)
        # O Sefin Rest API Padrão Nacional
        if self.is_homologacao:
            self.base_url = "https://sefin.producaorestrita.nfse.gov.br/SefinNacional"
            self.tpAmb = "2"
        else:
            self.base_url = "https://sefin.nfse.gov.br/SefinNacional" # Endereço Nacional de Produção
            self.tpAmb = "1"
            
        # Initialize Crypto
        cert_absolute_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "storage", "certificates", self.company.cert_path
        ) if self.company.cert_path else ""
        
        # Assuming db stores cleartext or we have decrypter function. Let's assume cleartext password for now based on previous modules.
        passw = company.cert_password or ""
        
        self.crypto = NFSeCrypto(pfx_path=cert_absolute_path, password=passw)

    def _build_dps_xml(self, order: ServiceOrder, service: Service, customer: Customer, address: Address, print_point) -> etree._Element:
        """
        Constrói o XML da DPS conforme o Layout do Padrão Nacional (ABRASF/Serpro Rest).
        """
        # Prefixo Padrão Nacional DPS
        num_dps_int = print_point.current_number if print_point else self.company.nfse_next_number
        num_dps = str(num_dps_int).zfill(15)
        cnpj_emitente = "".join(filter(str.isdigit, self.company.document)).zfill(14)
        ibge_emitente = self.company.codigo_municipio_ibge or "0000000"
        
        if self.is_homologacao:
            serie = "900"
        else:
            serie = print_point.serie if print_point and getattr(print_point, 'serie', None) else "1"
        tp_emit = "1"
        
        # tpInsc: 1 para CPF, 2 para CNPJ. Se o emitente tem 14 dígitos, é CNPJ.
        tp_insc = "2" if len(cnpj_emitente) == 14 else "1"
        
        # Id: DPS + IBGE (7) + TpInsc (1) + CNPJ (14) + Serie (5) + NumDPS (15) = 45 posicoes
        ibge_clean_emit = "".join(filter(str.isdigit, ibge_emitente))
        if len(ibge_clean_emit) != 7:
            raise ValueError(f"O Código IBGE do Emitente (Sede) deve ter exatos 7 dígitos. Valor salvo: '{ibge_emitente}'.")
            
        id_dps = f"DPS{ibge_clean_emit}{tp_insc}{cnpj_emitente.zfill(14)}{serie.zfill(5)}{num_dps}"
        
        # Cleaned docs
        cnpj_tomador = "".join(filter(str.isdigit, customer.document)).zfill(14)
        ibge_tomador = address.ibge_code if address and address.ibge_code else "0000000"
        
        ibge_clean_tomador = "".join(filter(str.isdigit, ibge_tomador))
        if ibge_clean_tomador != "0000000" and len(ibge_clean_tomador) != 7:
            raise ValueError(f"O Código IBGE do Tomador (Cliente) deve ter exatos 7 dígitos. Valor atual: '{ibge_tomador}'. Por favor, edite o endereço do cliente.")
        
        nsmap = {None: "http://www.sped.fazenda.gov.br/nfse"}
        dps_root = etree.Element("DPS", nsmap=nsmap, versao="1.00")
        
        inf_dps = etree.SubElement(dps_root, "infDPS", Id=id_dps)
        
        import pytz
        from datetime import timedelta
        sp_tz = pytz.timezone('America/Sao_Paulo')
        now_sp = datetime.now(sp_tz) - timedelta(minutes=2)

        etree.SubElement(inf_dps, "tpAmb").text = self.tpAmb
        etree.SubElement(inf_dps, "dhEmi").text = now_sp.replace(microsecond=0).isoformat()
        etree.SubElement(inf_dps, "verAplic").text = "Cronuz-B2B-1.0"
        etree.SubElement(inf_dps, "serie").text = serie
        etree.SubElement(inf_dps, "nDPS").text = str(num_dps_int)
        etree.SubElement(inf_dps, "dCompet").text = now_sp.strftime("%Y-%m-%d")
        etree.SubElement(inf_dps, "tpEmit").text = tp_emit
        etree.SubElement(inf_dps, "cLocEmi").text = ibge_clean_emit
        
        # Prestador
        prest = etree.SubElement(inf_dps, "prest")
        etree.SubElement(prest, "CNPJ").text = cnpj_emitente
        # Sefin Nacional E0121 proíbe enviar xNome se tpEmit for 1 (Próprio Prestador)
        
        reg_trib = etree.SubElement(prest, "regTrib")
        is_simples = self.company.optante_simples_nacional
        sit_simples = getattr(self.company, "nfse_sit_simples_nacional", None) or "1"
        
        # 1 - Não Optante, 2 - MEI, 3 - ME/EPP
        if is_simples:
            etree.SubElement(reg_trib, "opSimpNac").text = sit_simples if sit_simples in ["2", "3"] else "3"
            etree.SubElement(reg_trib, "regApTribSN").text = "1" # 1 - Apuração SN, 2 - Apuração mista, etc
        else:
            etree.SubElement(reg_trib, "opSimpNac").text = "1"
            
        etree.SubElement(reg_trib, "regEspTrib").text = "0" # 0 - Nenhum, 1 - Microempresa municipal, etc
        
        # Tomador
        toma = etree.SubElement(inf_dps, "toma")
        if len(cnpj_tomador) == 14:
            etree.SubElement(toma, "CNPJ").text = cnpj_tomador
        else:
            etree.SubElement(toma, "CPF").text = cnpj_tomador
            
        etree.SubElement(toma, "xNome").text = customer.name
        
        if address:
            end = etree.SubElement(toma, "end")
            
            end_nac = etree.SubElement(end, "endNac")
            etree.SubElement(end_nac, "cMun").text = ibge_clean_tomador
            etree.SubElement(end_nac, "CEP").text = "".join(filter(str.isdigit, address.zip_code))
            
            etree.SubElement(end, "xLgr").text = address.street[:255] if address.street else "Nao Informado"
            etree.SubElement(end, "nro").text = address.number[:60] if address.number else "SN"
            if address.complement:
                etree.SubElement(end, "xCpl").text = address.complement[:60]
            if address.neighborhood:
                etree.SubElement(end, "xBairro").text = address.neighborhood[:60]
                
        # Contato do tomador (opcional, recomendável no B2B)
        if customer.email:
            email = customer.email.strip()
            if email:
                etree.SubElement(toma, "email").text = email[:80]
            
        # Serviço
        serv = etree.SubElement(inf_dps, "serv")
        loc_prest = etree.SubElement(serv, "locPrest")
        etree.SubElement(loc_prest, "cLocPrestacao").text = ibge_clean_emit # Presumindo executado no municipio do emitente
        
        c_serv = etree.SubElement(serv, "cServ")
        # Padrão Nacional TSCodTribNac is exactly 6 digits (e.g. 010700 for 1.07, 140100 for 14.01)
        lc116_raw = service.codigo_lc116 or "00.00"
        parts = lc116_raw.split(".")
        if len(parts) >= 2:
            item = parts[0].zfill(2)
            subitem = "".join(parts[1:]).ljust(4, '0')
            codigo_lc116 = (item + subitem)[:6]
        else:
            codigo_lc116 = lc116_raw.replace(".", "").ljust(6, '0')[:6]
            
        etree.SubElement(c_serv, "cTribNac").text = codigo_lc116
        
        desc_parts = [service.default_description or service.name]
        if order.custom_description:
            desc_parts.append(order.custom_description)
        if customer.nfse_notes:
            desc_parts.append(customer.nfse_notes)
            
        etree.SubElement(c_serv, "xDescServ").text = "\n".join(desc_parts)
        

        
        # Valores
        valores = etree.SubElement(inf_dps, "valores")
        v_serv_prest = etree.SubElement(valores, "vServPrest")
        
        val_str = f"{order.negotiated_value:.2f}"
        etree.SubElement(v_serv_prest, "vServ").text = val_str
        
        trib = etree.SubElement(valores, "trib")
        trib_mun = etree.SubElement(trib, "tribMun")
        etree.SubElement(trib_mun, "tribISSQN").text = "1" # 1 - Operação tributável
        etree.SubElement(trib_mun, "tpRetISSQN").text = "1" # 1 - Não Retido
        
        tot_trib = etree.SubElement(trib, "totTrib")
        p_tot_trib = etree.SubElement(tot_trib, "pTotTrib")
        etree.SubElement(p_tot_trib, "pTotTribFed").text = "0.00"
        etree.SubElement(p_tot_trib, "pTotTribEst").text = "0.00"
        etree.SubElement(p_tot_trib, "pTotTribMun").text = "0.00"
        
        # Aplica Assinatura sobre <DPS> usando infDPS como root_ref
        signed_root = self.crypto.sign_xml(dps_root, reference_uri=f"#{id_dps}")
        return signed_root

    async def emitir_nota(self, order: ServiceOrder, service: Service, customer: Customer, address: Address, print_point=None):
        cert_path, key_path = None, None
        try:
            # 1. Gera XML e assina
            signed_xml_element = self._build_dps_xml(order, service, customer, address, print_point)
            xml_bytes = etree.tostring(signed_xml_element, encoding="utf-8", xml_declaration=True)
            xml_str = xml_bytes.decode("utf-8")
            # 2. Prepara Certificados Temporarios (mTLS)
            cert_path, key_path = self.crypto.create_mtls_temp_files()
            # Simulador removido: agora o sistema vai bater na URL de Produção Restrita (Sefaz/Serpro real)
            

            import gzip
            import base64
            
            # Usar xml_bytes diretamente após a remoção do prefixo ds:
            xml_bytes_clean = xml_str.encode('utf-8')
            gz_bytes = gzip.compress(xml_bytes_clean)
            xml_b64 = base64.b64encode(gz_bytes).decode('ascii')
            
            payload = {
                "dpsXmlGZipB64": xml_b64
            }

            endpoint = f"{self.base_url}/nfse"
            headers = {"Content-Type": "application/json; charset=utf-8", "Accept": "application/json"}
            
            logger.info(f"[NFSe] Enviando DPS {order.id} compactado em GZip/B64 via mTLS para {endpoint}...")
            
            async with httpx.AsyncClient(cert=(cert_path, key_path), verify=False) as client:
                response = await client.post(endpoint, json=payload, headers=headers, timeout=30.0)
            
            logger.info(f"[NFSe Client POST] Serpro retornou HTTP {response.status_code}")
            logger.info(f"[NFSe Client POST] Resposta Bruta: {response.text}")
            
            if response.status_code in [200, 201, 202]:
                resp_json = response.json() if "application/json" in response.headers.get("Content-Type", "") else {"raw": response.text}
                
                # Sefin returns idDps and chaveAcesso automatically if 201
                return {
                    "success": True,
                    "xml": xml_str,  
                    "response": resp_json,
                    "protocol_id": resp_json.get("chaveAcesso", "") or f"SUCESS_DUMMY_{order.id}",
                    "pdf_url": "", # PDF url pode precisar ser consultada na ADN depois pela chave de acesso
                    "status_code": response.status_code,
                    "raw_body": response.text
                }
            else:
                resp_json = response.json() if "application/json" in response.headers.get("Content-Type", "") else {"raw": response.text}
                erros = resp_json.get("erros", [])
                error_msg = f"HTTP {response.status_code}: {response.text}"
                if erros:
                    error_msg = str(erros)
                    
                return {
                    "success": False,
                    "xml": xml_str,
                    "error": error_msg,
                    "status_code": response.status_code,
                    "raw_body": response.text
                }
                
        except Exception as e:
            logger.exception("Erro durante envio Serpro:")
            return {"success": False, "error": str(e), "status_code": 500, "raw_body": str(e), "xml": ""}
        finally:
            # Limpa temporarios
            if cert_path and os.path.exists(cert_path):
                os.remove(cert_path)
            if key_path and os.path.exists(key_path):
                os.remove(key_path)

    async def consultar_dps_por_protocolo(self, protocol_id: str) -> dict:
        """
        Consulta o recibo/DPS por protocolo após emissão no Padrão Nacional.
        """
        cert_path, key_path = None, None
        try:
            cert_path, key_path = self.crypto.create_mtls_temp_files()
            # Consulta de Homologação Real Ativada. Removido o bypass "TESTE_MOCK".
            

            endpoint = f"{self.base_url}/dps/protocolo/{protocol_id}"
            headers = {"Accept": "application/json"}
            
            logger.info(f"[NFSe] Consultando protocolo {protocol_id} em {endpoint}...")
            
            async with httpx.AsyncClient(cert=(cert_path, key_path), verify=False) as client:
                response = await client.get(endpoint, headers=headers, timeout=20.0)
            
            logger.info(f"[NFSe Client GET] Consulta via Serpro retornou HTTP {response.status_code}")
            logger.info(f"[NFSe Client GET] Resposta Bruta: {response.text}")
            
            if response.status_code in [200, 201]:
                try:
                    data = response.json()
                except Exception:
                    data = {"xml": response.text, "situacao": "Autorizada"} if "<?xml" in response.text else {}
                    
                situacao = data.get("situacao", "")
                
                if situacao == "Autorizada" or situacao == 3 or str(situacao) == "3" or "xml" in data:
                    xml_content = data.get("xml") or data.get("xmlAutorizado") or data.get("xmlNfse") or ""
                    if not xml_content and response.text.startswith("<?xml"):
                        xml_content = response.text
                    return {
                        "status_serpro": "Autorizada",
                        "success": True,
                        "xml": xml_content,
                        "response": data
                    }
                elif situacao == "Processando" or situacao == "Em Processamento" or situacao == 1 or str(situacao) == "1":
                    return {
                        "status_serpro": "Em Processamento",
                        "success": False,
                        "error": "Recibo ainda em processamento na Sefaz.",
                        "response": data
                    }
                else:
                    erros = data.get("erros", data.get("mensagens", []))
                    err_msgs = " | ".join([e.get("descricao", "Erro") for e in erros]) if isinstance(erros, list) else str(erros)
                    return {
                        "status_serpro": "Rejeitada",
                        "success": False,
                        "error": f"DPS Rejeitada: {err_msgs}",
                        "response": data
                    }
            else:
                return {
                    "status_serpro": "Erro HTTP",
                    "success": False,
                    "error": f"HTTP {response.status_code}: {response.text}"
                }
        except Exception as e:
            logger.exception("Erro na consulta Serpro DPS:")
            return {"success": False, "status_serpro": "Exception", "error": str(e)}
        finally:
            if cert_path and os.path.exists(cert_path):
                os.remove(cert_path)
            if key_path and os.path.exists(key_path):
                os.remove(key_path)

    async def consultar_nota_por_chave(self, chave_acesso: str) -> dict:
        cert_path, key_path = None, None
        try:
            cert_path, key_path = self.crypto.create_mtls_temp_files()
            url = f"{self.base_url}/nfse/{chave_acesso.strip()}"
            
            async with httpx.AsyncClient(cert=(cert_path, key_path), verify=False) as client:
                response = await client.get(url, headers={"Accept": "application/json"}, timeout=20.0)
                
            if response.status_code == 200:
                try:
                    data = response.json()
                except:
                    data = response.text
                
                xml_legivel = ""
                is_cancelled = False
                
                if isinstance(data, dict) and data.get("nfseXmlGZipB64"):
                    import base64
                    import gzip
                    import re
                    try:
                        b64_str = data.get("nfseXmlGZipB64")
                        xml_bytes_compressed = base64.b64decode(b64_str)
                        xml_bytes = gzip.decompress(xml_bytes_compressed)
                        xml_legivel = xml_bytes.decode('utf-8')
                        
                        # 1. Busca no Dicionário JSON (A API REST)
                        # 1. Busca no Dicionário JSON (A API REST)
                        json_tem_evento_cancelamento = False
                        data_str = str(data).lower()
                        if "cancelamento" in data_str or "'codigo': '2'" in data_str or "'codigo': 2" in data_str:
                            json_tem_evento_cancelamento = True
                            
                        # Passo B: Extrai os eventos em requisicao limpa
                        eventos_json = await self.consultar_eventos_nfse(chave_acesso.strip())
                        data["eventos_oficiais_sefaz"] = eventos_json
                        ev_str = str(eventos_json).lower()
                        if "cancelamento" in ev_str or "pedcanc" in ev_str or "retcanc" in ev_str or "'codigo': '2'" in ev_str or "'codigo': 2" in ev_str:
                            json_tem_evento_cancelamento = True

                            
                        # 2. Busca Profunda no XML (A Prova Real)
                        # Verifica indícios de cancelamento no Padrão Nacional, ignorando namespaces
                        xml_lower = xml_legivel.lower()
                        
                        # 3. A Regra Final do is_cancelled
                        is_cancelled = True if (
                            '<cancelamento>' in xml_lower or 
                            '<retcanc' in xml_lower or 
                            '<infcanc>' in xml_lower or 
                            '<pedcanc' in xml_lower or 
                            re.search(r'<[^>]*cSitNFSe[^>]*>2</[^>]*cSitNFSe>', xml_legivel) or
                            json_tem_evento_cancelamento
                        ) else False
                                
                    except Exception as e:
                        logger.error(f"Erro ao extrair XML GZip: {e}")
                        
                return {
                    "success": True, 
                    "status_serpro": "Consulta OK", 
                    "response": data, 
                    "xml_legivel": xml_legivel,
                    "is_cancelled": is_cancelled,
                    "status_code": 200
                }
            else:
                return {"success": False, "status_serpro": "Erro HTTP", "error": f"HTTP {response.status_code}: {response.text}", "status_code": response.status_code}
        except Exception as e:
            return {"success": False, "status_serpro": "Exception", "error": str(e)}
        finally:
            if cert_path and os.path.exists(cert_path):
                os.remove(cert_path)
            if key_path and os.path.exists(key_path):
                os.remove(key_path)

    async def consultar_eventos_nfse(self, chave_acesso: str) -> dict:
        cert_path, key_path = None, None
        try:
            cert_path, key_path = self.crypto.create_mtls_temp_files()
            if self.is_homologacao:
                host_adn = "https://adn.producaorestrita.nfse.gov.br/contribuintes"
            else:
                host_adn = "https://adn.nfse.gov.br/contribuintes"
                
            url_eventos = f"{host_adn}/NFSe/{chave_acesso.strip()}/Eventos"
            async with httpx.AsyncClient(cert=(cert_path, key_path), verify=False) as client:
                response = await client.get(url_eventos, headers={"Accept": "application/json"}, timeout=15.0)
            if response.status_code == 200:
                try: return response.json()
                except: return {"raw": response.text}
            else:
                return {"_error_status": response.status_code, "_error_text": response.text, "_url": url_eventos}
        except Exception as e:
            return {"_exception": str(e)}
        finally:
            if cert_path and os.path.exists(cert_path): os.remove(cert_path)
            if key_path and os.path.exists(key_path): os.remove(key_path)

    async def baixar_pdf_danfse(self, chave_acesso: str) -> dict:
        """
        Baixa o PDF do DANFSe diretamente do ADN (Ambiente de Dados Nacional).
        """
        chave_limpa = "".join(filter(str.isdigit, chave_acesso))
        if len(chave_limpa) != 50:
            return {"success": False, "error": "Chave de acesso inválida. O PDF só pode ser baixado para notas com a chave nacional de 50 dígitos.", "status_code": 400}
            
        cert_path, key_path = None, None
        try:
            cert_path, key_path = self.crypto.create_mtls_temp_files()
            host = "adn.producaorestrita.nfse.gov.br" if self.is_homologacao else "adn.nfse.gov.br"
            url = f"https://{host}/danfse/{chave_limpa}"
            
            async with httpx.AsyncClient(cert=(cert_path, key_path), verify=False) as client:
                response = await client.get(
                    url, 
                    headers={"Accept": "application/pdf"},
                    timeout=30.0
                )
                
            if response.status_code == 200:
                return {"success": True, "pdf_bytes": response.content, "status_code": 200}
            else:
                logger.error(f"[DANFSe ERRO] Sefaz retornou {response.status_code}: {response.text}")
                return {"success": False, "error": f"HTTP {response.status_code}: {response.text}", "status_code": response.status_code}
        except Exception as e:
            return {"success": False, "error": str(e)}
        finally:
            if cert_path and os.path.exists(cert_path):
                os.remove(cert_path)
            if key_path and os.path.exists(key_path):
                os.remove(key_path)

    async def cancelar_nota(self, chave_acesso: str, c_motivo: str, x_motivo: str) -> dict:
        chave_limpa = "".join(filter(str.isdigit, chave_acesso))
        if len(chave_limpa) != 50:
            return {"success": False, "error": f"Chave de acesso inválida ({len(chave_limpa)} dígitos). O cancelamento exige chave nacional de 50 dígitos.", "status_code": 400}
            
        cert_path, key_path = None, None
        try:
            cert_path, key_path = self.crypto.create_mtls_temp_files()
            url = f"{self.base_url}/nfse/{chave_limpa}/eventos"
            
            import datetime
            cnpj_autor = "".join(filter(str.isdigit, self.company.document)).zfill(14)
            
            # 1. Definições do Evento (Cancelamento pelo Emitente)
            tp_evento = "101101"
            
            # 2. Formação estrita do ID (ID + 6 digitos + 50 digitos + 3 digitos)
            id_evento = f"PRE{chave_limpa}{tp_evento}"

            # 3. Montagem do XML pedRegEvento
            nsmap = {None: "http://www.sped.fazenda.gov.br/nfse"}
            root = etree.Element("pedRegEvento", nsmap=nsmap, versao="1.00")

            inf_ped = etree.SubElement(root, "infPedReg", Id=id_evento)
            etree.SubElement(inf_ped, "tpAmb").text = self.tpAmb
            etree.SubElement(inf_ped, "verAplic").text = "Cronuz-1.0"
            etree.SubElement(inf_ped, "dhEvento").text = datetime.datetime.now(datetime.timezone.utc).astimezone().replace(microsecond=0).isoformat()
            etree.SubElement(inf_ped, "CNPJAutor").text = cnpj_autor
            etree.SubElement(inf_ped, "chNFSe").text = chave_limpa

            # 4. Detalhamento do Cancelamento
            e101101 = etree.SubElement(inf_ped, "e101101")
            etree.SubElement(e101101, "xDesc").text = "Cancelamento de NFS-e"
            etree.SubElement(e101101, "cMotivo").text = str(c_motivo)
            etree.SubElement(e101101, "xMotivo").text = str(x_motivo)[:255] # Limite seguro do XSD
            
            # Assinatura digital é obrigatória para cancelamento
            try:
                signed_element = self.crypto.sign_xml(root, reference_uri=f"#{id_evento}")
                if signed_element is None:
                    raise ValueError("A Assinatura Digital do Cancelamento falhou. Verifique o certificado.")
                signed_xml = etree.tostring(signed_element, encoding='utf-8', xml_declaration=True, method='xml').decode('utf-8')
            except Exception as e:
                logger.exception("Falha ao assinar pedido de Cancelamento:")
                return {"success": False, "error": f"Erro de Assinatura: {e}"}
                
            import gzip
            import base64
            import json
            
            xml_bytes = signed_xml.encode('utf-8')
            gzip_bytes = gzip.compress(xml_bytes)
            b64_str = base64.b64encode(gzip_bytes).decode('utf-8')
            
            payload = json.dumps({"pedidoRegistroEventoXmlGZipB64": b64_str})
                
            async with httpx.AsyncClient(cert=(cert_path, key_path), verify=False) as client:
                response = await client.post(
                    url,
                    content=payload.encode('utf-8'),
                    headers={
                        "Content-Type": "application/json",
                        "Accept": "application/json"
                    },
                    timeout=20.0
                )
            
            if response.status_code in [200, 201]:
                return {"success": True, "status_serpro": "Cancelamento Solicitado", "response": response.json() if "json" in response.headers.get("Content-Type", "") else response.text, "status_code": response.status_code}
            else:
                return {"success": False, "status_serpro": "Erro Cancelamento", "error": f"HTTP {response.status_code}: {response.text}", "status_code": response.status_code}
        except Exception as e:
            return {"success": False, "status_serpro": "Exception", "error": str(e)}
        finally:
            if cert_path and os.path.exists(cert_path):
                os.remove(cert_path)
            if key_path and os.path.exists(key_path):
                os.remove(key_path)
