import requests
import json
import uuid
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class BancoInterClient:
    def __init__(self, client_id: str, client_secret: str, cert_path: str = None, key_path: str = None, cert_content: str = None, key_content: str = None, sandbox: bool = True, account_number: str = None, api_version: str = 'V2'):
        self.client_id = client_id
        self.client_secret = client_secret
        self.sandbox = sandbox
        self.account_number = account_number
        self.api_version = api_version
        self.base_url = "https://cdpj-sandbox.partners.uatinter.co" if sandbox else "https://cdpj.partners.bancointer.com.br"
        
        self.token = None
        self.token_expiry = None
        
        self.temp_cert_file = None
        self.temp_key_file = None
        
        if cert_content and key_content:
            import tempfile
            self.temp_cert_file = tempfile.NamedTemporaryFile(mode="w", suffix=".crt", delete=False)
            self.temp_cert_file.write(cert_content)
            self.temp_cert_file.close()
            
            self.temp_key_file = tempfile.NamedTemporaryFile(mode="w", suffix=".key", delete=False)
            self.temp_key_file.write(key_content)
            self.temp_key_file.close()
            
            self.cert_path = self.temp_cert_file.name
            self.key_path = self.temp_key_file.name
        else:
            self.cert_path = self._resolve_path(cert_path)
            self.key_path = self._resolve_path(key_path)

    def _resolve_path(self, path: str) -> str:
        if not path:
            return path
        
        import os
        from pathlib import Path
        
        if os.path.exists(path):
            return path
            
        if "certs/inter/" in path:
            parts = path.split("certs/inter/")
            relative_part = "certs/inter/" + parts[-1]
            project_root = Path(__file__).parent.parent.parent.parent
            local_path = project_root / relative_part
            if local_path.exists():
                return str(local_path.absolute())
                
        return path

    def __del__(self):
        self.cleanup()

    def cleanup(self):
        import os
        if hasattr(self, 'temp_cert_file') and self.temp_cert_file and os.path.exists(self.temp_cert_file.name):
            try:
                os.remove(self.temp_cert_file.name)
            except Exception:
                pass
        if hasattr(self, 'temp_key_file') and self.temp_key_file and os.path.exists(self.temp_key_file.name):
            try:
                os.remove(self.temp_key_file.name)
            except Exception:
                pass

    def get_token(self):
        if self.token and self.token_expiry and datetime.now() < self.token_expiry:
            return self.token

        url = f"{self.base_url}/oauth/v2/token"
        headers = {
            "Content-Type": "application/x-www-form-urlencoded"
        }
        scopes_to_try = [
            "boleto-cobranca.read boleto-cobranca.write extrato.read",
            "boleto-cobranca.read boleto-cobranca.write"
        ]
        
        cert = (self.cert_path, self.key_path) if self.cert_path and self.key_path else None
        import urllib3
        if self.sandbox:
            urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

        last_err = None
        for scope in scopes_to_try:
            data = {
                "client_id": self.client_id,
                "client_secret": self.client_secret,
                "grant_type": "client_credentials",
                "scope": scope
            }
            try:
                response = requests.post(url, headers=headers, data=data, cert=cert, verify=not self.sandbox, timeout=15)
                if response.status_code == 200:
                    resp_data = response.json()
                    self.token = resp_data.get("access_token")
                    expires_in = resp_data.get("expires_in", 3600)
                    self.token_expiry = datetime.now() + timedelta(seconds=expires_in - 60)
                    return self.token
                last_err = response.text
            except requests.exceptions.RequestException as e:
                last_err = e.response.text if hasattr(e, 'response') and e.response else str(e)

        logger.error(f"Banco Inter Token Error: {last_err}")
        raise Exception(f"Erro de Autenticação com Banco Inter: {last_err}")

    def emit_boleto(self, installment_data, customer_data):
        token = self.get_token()
        
        endpoint = "v3/cobrancas" if self.api_version == "V3" else "v2/boletos"
        url = f"{self.base_url}/cobranca/{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        if self.account_number:
            import re
            clean_account = re.sub(r'\D', '', self.account_number)
            if self.api_version == "V3":
                headers["x-conta-corrente"] = clean_account.lstrip('0') or "1"
            else:
                headers["x-inter-conta-corrente"] = self.account_number
        
        # CPF/CNPJ only digits
        import re
        doc_cpf_cnpj = re.sub(r'\D', '', customer_data.get("document", ""))
        
        # Determine tipoPessoa
        tipo_pessoa = "FISICA" if len(doc_cpf_cnpj) <= 11 else "JURIDICA"
        
        payload = {
            "seuNumero": str(installment_data['id']),
            "valorNominal": float(installment_data['amount']),
            "dataVencimento": installment_data['due_date'].strftime("%Y-%m-%d"),
            "numDiasAgenda": 60,
            "pagador": {
                "tipoPessoa": tipo_pessoa,
                "nome": customer_data.get("name")[:100] if customer_data.get("name") else "Não Informado",
                "endereco": customer_data.get("address", "Avenida Teste")[:90] or "Endereco Generico",
                "cidade": customer_data.get("city", "São Paulo")[:60] or "Sao Paulo",
                "uf": customer_data.get("uf", "SP")[:2] or "SP",
                "cep": re.sub(r'\D', '', customer_data.get("zipcode", "01001000")) or "01001000",
                "numero": (lambda n: n if n and re.match(r"^[1-9]\d*$", n) else "1")(re.sub(r"\D", "", customer_data.get("number", "1"))),
                "bairro": customer_data.get("neighborhood", "Centro")[:60] or "Centro",
                "cpfCnpj": doc_cpf_cnpj
            }
        }
        
        if "mensagem" in installment_data:
            payload["mensagem"] = installment_data["mensagem"]
        
        try:
            cert = (self.cert_path, self.key_path) if self.cert_path and self.key_path else None
            response = requests.post(url, headers=headers, json=payload, cert=cert, verify=not self.sandbox, timeout=15)
            response.raise_for_status()
            
            return response.json()  # Returns { nossoNumero, codigoBarras, linhaDigitavel }
            
        except requests.exceptions.RequestException as e:
            if hasattr(e, 'response') and e.response is not None:
                try:
                    err_details = e.response.json()
                    viols = ""
                    title = err_details.get("title", "")
                    mensagem = err_details.get("mensagem", "") or err_details.get("detail", "")
                    
                    details = []
                    if "violacoes" in err_details:
                        details = [f"{v.get('propriedade', 'CampoDesconhecido')}: {v.get('razao', '')}" for v in err_details["violacoes"]]
                    
                    if details:
                        viols = f"{title} - {mensagem} - " + ", ".join(details)
                    else:
                        viols = f"{title} - {mensagem}" if title and mensagem else title or mensagem or "Erro Desconhecido"
                        
                    if viols:
                        raise Exception(f"Erro no Inter: {viols}")
                    raise Exception(f"Erro Banco Inter: {err_details}")
                except Exception as ex:
                    if "Erro no Inter" in str(ex) or "Erro Banco Inter" in str(ex):
                        raise ex
                    raise Exception(f"Erro ao emitir boleto Banco Inter HTTP {e.response.status_code}: {e.response.text}")
            raise Exception(f"Erro crítico de rede com o Banco Inter: {str(e)}")
            
    def get_boleto_pdf(self, nosso_numero: str):
        token = self.get_token()
        endpoint = f"v3/cobrancas/{nosso_numero}/pdf" if self.api_version == "V3" else f"v2/boletos/{nosso_numero}/pdf"
        url = f"{self.base_url}/cobranca/{endpoint}"
        
        headers = {
            "Authorization": f"Bearer {token}"
        }
        if self.account_number:
            import re
            clean_account = re.sub(r'\D', '', self.account_number)
            if self.api_version == "V3":
                headers["x-conta-corrente"] = clean_account.lstrip('0') or "1"
            else:
                headers["x-inter-conta-corrente"] = self.account_number
        
        try:
            cert = (self.cert_path, self.key_path) if self.cert_path and self.key_path else None
            response = requests.get(url, headers=headers, cert=cert, verify=not self.sandbox, timeout=15)
            response.raise_for_status()
            
            # API returns a json with "pdf" key holding base64 content
            return response.json().get("pdf")
            
        except requests.exceptions.RequestException as e:
            err_details = e.response.text if hasattr(e, 'response') and e.response else str(e)
            logger.error(f"Banco Inter Get PDF Error: {err_details}")
            raise Exception("Erro ao resgatar PDF do Banco Inter")


    def find_nosso_numero_v3(self, codigo_solicitacao: str, timeout: int = 4) -> str:
        import time
        token = self.get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        if self.account_number:
            import re
            clean_account = re.sub(r'\D', '', self.account_number)
            headers["x-conta-corrente"] = clean_account.lstrip('0') or "1" 
            
        url = f"{self.base_url}/cobranca/v3/cobrancas/{codigo_solicitacao}"
        cert = (self.cert_path, self.key_path) if self.cert_path and self.key_path else None
        
        attempts = 0
        while attempts < timeout:
            time.sleep(1)
            attempts += 1
            try:
                res = requests.get(url, headers=headers, cert=cert, verify=not self.sandbox)
                print(f"DEBUG INTER V3: {res.status_code} - {res.text}", flush=True)
                if res.status_code == 200:
                    data = res.json()
                    cobranca = data.get("cobranca", data)
                    situacao = cobranca.get("situacao")
                    
                    if situacao != "EM_PROCESSAMENTO":
                        nosso_numero = cobranca.get("nossoNumero")
                        if not nosso_numero and data.get("boleto"):
                            nosso_numero = data.get("boleto", {}).get("nossoNumero")
                        
                        if nosso_numero:
                            return nosso_numero
            except Exception as e:
                logger.error(f"Exc in find_nosso_numero_v3: {e}")
                
        return None

    def get_extrato_recebimentos_boletos(self, data_inicio: str = None, data_fim: str = None) -> dict:
        """
        Consulta o extrato bancário do Banco Inter (GET /banking/v2/extrato) e mapeia
        todos os créditos de liquidação de boletos pelo Nosso Número.
        Serve como fallback de alta confiabilidade caso o endpoint V3 de cobrança
        demore a atualizar a situação para RECEBIDO (mantendo ATRASADO/A_RECEBER).
        """
        import re
        if hasattr(self, "_extrato_cache") and self._extrato_cache is not None and not data_inicio and not data_fim:
            return self._extrato_cache

        token = self.get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        if self.account_number:
            clean_account = re.sub(r'\D', '', self.account_number)
            headers["x-conta-corrente"] = clean_account.lstrip('0') or "1"

        today = datetime.now().date()
        dt_fim = data_fim or today.strftime("%Y-%m-%d")
        dt_ini = data_inicio or (today - timedelta(days=60)).strftime("%Y-%m-%d")

        url = f"{self.base_url}/banking/v2/extrato?dataInicio={dt_ini}&dataFim={dt_fim}"
        cert = (self.cert_path, self.key_path) if self.cert_path and self.key_path else None

        recebimentos = {}
        try:
            res = requests.get(url, headers=headers, cert=cert, verify=not self.sandbox, timeout=15)
            if res.status_code == 200:
                transacoes = res.json().get("transacoes", [])
                for tx in transacoes:
                    if tx.get("tipoOperacao") == "C":
                        desc = str(tx.get("descricao") or "")
                        # Padrão Inter: "RECEBIMENTO TITULO - 112/90879229840"
                        match = re.search(r'RECEBIMENTO\s+TITULO.*?(\d{10,12})', desc, re.IGNORECASE)
                        if not match and tx.get("tipoTransacao") == "BOLETO_COBRANCA":
                            match = re.search(r'(\d{10,12})', desc)
                        if match:
                            nn = match.group(1).strip()
                            try:
                                val = float(tx.get("valor") or 0.0)
                            except Exception:
                                val = 0.0
                            recebimentos[nn] = {
                                "status": "RECEBIDO",
                                "dataSituacao": tx.get("dataEntrada"),
                                "dataHoraPagamento": tx.get("dataEntrada"),
                                "valorPago": val,
                                "descricaoExtrato": desc,
                            }
        except Exception as e:
            logger.warning(f"Inter Extrato fallback warning: {e}")

        if not data_inicio and not data_fim:
            self._extrato_cache = recebimentos
        return recebimentos

    def get_cobranca_v3_status(self, codigo_solicitacao: str, nosso_numero: str = None, check_extrato_fallback: bool = True) -> dict:
        token = self.get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        if self.account_number:
            import re
            clean_account = re.sub(r'\D', '', self.account_number)
            headers["x-conta-corrente"] = clean_account.lstrip('0') or "1" 
            
        url = f"{self.base_url}/cobranca/v3/cobrancas/{codigo_solicitacao}"
        cert = (self.cert_path, self.key_path) if self.cert_path and self.key_path else None
        
        try:
            res = requests.get(url, headers=headers, cert=cert, verify=not self.sandbox, timeout=15)
            if res.status_code == 200:
                data = res.json()
                cobranca = data.get("cobranca", data)
                boleto = data.get("boleto", {})
                situacao = cobranca.get("situacao")
                data_situacao = cobranca.get("dataSituacao")
                valor_pago = cobranca.get("valorTotalRecebido") or cobranca.get("valorPago")
                data_hora_pgto = cobranca.get("dataHoraPagamento") or data_situacao
                resolved_nn = nosso_numero or boleto.get("nossoNumero") or cobranca.get("nossoNumero")

                # Se a API V3 de Cobrança ainda reporta ATRASADO ou A_RECEBER,
                # verifica no extrato bancário oficial se o título já foi liquidado/creditado.
                if check_extrato_fallback and situacao not in ["RECEBIDO", "MARCADO_RECEBIDO", "PAGO", "CANCELADO", "EXPIRADO"] and resolved_nn:
                    extrato_map = self.get_extrato_recebimentos_boletos()
                    nn_clean = str(resolved_nn).strip()
                    if nn_clean in extrato_map:
                        hit = extrato_map[nn_clean]
                        situacao = "RECEBIDO"
                        data_situacao = hit.get("dataSituacao") or data_situacao
                        data_hora_pgto = hit.get("dataHoraPagamento") or data_hora_pgto
                        valor_pago = hit.get("valorPago") or valor_pago

                return {
                    "status": situacao,
                    "dataSituacao": data_situacao,
                    "valorPago": valor_pago,
                    "dataHoraPagamento": data_hora_pgto,
                    "cobranca": cobranca,
                    "boleto": boleto,
                    "raw": data
                }
            res.raise_for_status()
        except requests.exceptions.RequestException as e:
            err_details = e.response.text if hasattr(e, 'response') and e.response else str(e)
            logger.error(f"Inter V3 Get Status Error: {err_details}")
            raise Exception("Erro ao resgatar Status do Banco Inter")

    def configure_webhook(self, webhook_url: str) -> dict:
        token = self.get_token()
        headers = {
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
        if self.account_number:
            import re
            clean_account = re.sub(r'\D', '', self.account_number)
            headers["x-conta-corrente"] = clean_account.lstrip('0') or "1" 
            
        url = f"{self.base_url}/cobranca/v3/cobrancas/webhook"
        cert = (self.cert_path, self.key_path) if self.cert_path and self.key_path else None
        
        try:
            res = requests.put(url, headers=headers, json={"webhookUrl": webhook_url}, cert=cert, verify=not self.sandbox)
            res.raise_for_status()
            return {"status": "success", "message": "Webhook configurado com sucesso!"}
        except requests.exceptions.RequestException as e:
            err_details = e.response.text if hasattr(e, 'response') and e.response else str(e)
            logger.error(f"Inter V3 Webhook Setup Error: {err_details}")
            raise Exception("Erro ao configurar Webhook do Banco Inter")
            
    def get_webhook(self) -> dict:
        token = self.get_token()
        headers = {
            "Authorization": f"Bearer {token}",
        }
        if self.account_number:
            import re
            clean_account = re.sub(r'\D', '', self.account_number)
            headers["x-conta-corrente"] = clean_account.lstrip('0') or "1" 
            
        url = f"{self.base_url}/cobranca/v3/cobrancas/webhook"
        cert = (self.cert_path, self.key_path) if self.cert_path and self.key_path else None
        
        try:
            res = requests.get(url, headers=headers, cert=cert, verify=not self.sandbox)
            res.raise_for_status()
            return res.json()
        except requests.exceptions.HTTPError as e:
            if e.response.status_code == 404:
                return {"webhookUrl": None, "criacao": None}
            raise Exception(f"Erro ao recuperar Webhook: {e.response.text}")
        except Exception as e:
            raise Exception(f"Erro ao recuperar Webhook: {str(e)}")
