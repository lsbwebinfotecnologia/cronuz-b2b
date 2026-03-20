import os
from gerencianet import Gerencianet
from dotenv import load_dotenv

load_dotenv()

class EFIPayIntegration:
    """
    Service class to handle Subscriptions payments via the EFI (Gerencianet) SDK.
    """
    
    def __init__(self, client_id=None, client_secret=None, sandbox=None, certificate_path=None, pix_key=None):
        # Credentials should be scoped by environment variables or database settings
        self.client_id = client_id or os.getenv("EFI_CLIENT_ID", "dummy_client_id")
        self.client_secret = client_secret or os.getenv("EFI_CLIENT_SECRET", "dummy_secret")
        
        if sandbox is not None:
            self.sandbox = sandbox
        else:
            self.sandbox = os.getenv("EFI_SANDBOX", "true").lower() == "true"
            
        self.certificate_path = certificate_path or os.getenv("EFI_PIX_CERTIFICATE_PATH", "")
        self.pix_key = pix_key or os.getenv("EFI_PIX_KEY", "minhachave@pix.com")

        self.options = {
            'client_id': self.client_id,
            'client_secret': self.client_secret,
            'sandbox': self.sandbox
        }
        
    def _get_pix_client(self):
        pix_options = {**self.options, 'certificate': self.certificate_path}
        return Gerencianet(pix_options)

    def _get_charges_client(self):
        return Gerencianet(self.options)
        
    def create_credit_card_charge(self, amount: float, customer_name: str, customer_document: str,
                                  customer_email: str, customer_phone: str, 
                                  payment_token: str, billing_address: dict):
        gn = self._get_charges_client()
        
        # MOCK for tests without real valid credentials
        if self.client_id == "dummy_client_id":
             import uuid
             return {
                 "data": {
                     "status": "paid",
                     "charge_id": f"CC-MOCK-{uuid.uuid4().hex[:8]}"
                 }
             }
        
        # 1. Create Charge Profile
        charge_body = {
            'items': [{
                'name': 'Assinatura Recorrente Digital',
                'amount': 1,
                'value': int(amount * 100) # value in cents
            }]
        }
        res_charge = gn.create_charge(body=charge_body)
        charge_id = res_charge['data']['charge_id']
        
        # 2. Pay Charge
        cpf = ''.join(filter(str.isdigit, customer_document))
        phone = ''.join(filter(str.isdigit, customer_phone))
        
        payment_body = {
            'payment': {
                'credit_card': {
                    'installments': 1,
                    'payment_token': payment_token,
                    'billing_address': { 
                        'street': billing_address.get('street', 'Rua Padrão'),
                        'number': billing_address.get('number', 'S/N'),
                        'neighborhood': billing_address.get('neighborhood', 'Bairro'),
                        'zipcode': billing_address.get('zipcode', '01001000'),
                        'city': billing_address.get('city', 'São Paulo'),
                        'state': billing_address.get('state', 'SP')
                    },
                    'customer': {
                        'name': customer_name,
                        'email': customer_email,
                        'cpf': cpf if len(cpf) <= 11 else "", # Efi requires strictly cpf or cnpj object
                        'phone_number': phone
                    }
                }
            }
        }
        
        if len(cpf) > 11:
             del payment_body['payment']['credit_card']['customer']['cpf']
             payment_body['payment']['credit_card']['customer']['cnpj'] = cpf
             payment_body['payment']['credit_card']['customer']['juridical_person'] = {
                 'corporate_name': customer_name,
                 'cnpj': cpf
             }
             
        res_pay = gn.pay_charge(params={'id': charge_id}, body=payment_body)
        return res_pay

    def create_pix_charge(self, amount: float, customer_name: str, customer_document: str):
        """
        Creates an immediate Pix Charge (Cobrança PIX Imediata)
        amount: Final value to be charged
        """
        gn = self._get_pix_client()
        
        # Pix value must be a string formatted with 2 decimal places
        str_amount = f"{amount:.2f}"
        
        body = {
            'calendario': {
                'expiracao': 3600 # 1 hour
            },
            'devedor': {
                'cpf': ''.join(filter(str.isdigit, customer_document)), # Ensure only digits
                'nome': customer_name
            },
            'valor': {
                'original': str_amount
            },
            'chave': os.getenv("EFI_PIX_KEY", "minhachave@pix.com"),
            'solicitacaoPagador': 'Assinatura Coleção'
        }

        try:
            # We skip real API calls if we're missing the certificate in dev
            if not self.certificate_path or self.certificate_path == "":
                 print("[EFI MOCK] PIX Created:", body)
                 return {
                     "txid": "mock_txid_12345",
                     "loc": { "id": 1 },
                     "status": "ATIVA",
                     "mock": True
                 }
                
            response = gn.pix_create_immediate_charge(body=body)
            return response
        except Exception as e:
            # Format generic exception
            raise Exception(f"Erro na integração EFI PIX: {str(e)}")
            
    def generate_pix_qrcode(self, loc_id: int):
        """
        Generates the QR Code Image and Copy/Paste string based on the loc_id 
        returned by the create_pix_charge method.
        """
        if not self.certificate_path:
             return { "qrcode": "mock_qrcode_base64", "imagemQrcode": "mock" }
             
        gn = self._get_pix_client()
        params = {
            'id': loc_id
        }

        try:
            response = gn.pix_generate_qrcode(params=params)
            return response
        except Exception as e:
            raise Exception(f"Erro na Geração de QRCode EFI: {str(e)}")

efi_service = EFIPayIntegration()
