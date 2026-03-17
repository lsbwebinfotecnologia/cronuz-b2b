import os
from gerencianet import Gerencianet
from dotenv import load_dotenv

load_dotenv()

class EFIPayIntegration:
    """
    Service class to handle Subscriptions payments via the EFI (Gerencianet) SDK.
    """
    
    def __init__(self):
        # Credentials should be scoped by environment variables or database settings
        # For this prototype we will use ENV standard practices
        self.client_id = os.getenv("EFI_CLIENT_ID", "dummy_client_id")
        self.client_secret = os.getenv("EFI_CLIENT_SECRET", "dummy_secret")
        self.sandbox = os.getenv("EFI_SANDBOX", "true").lower() == "true"
        
        # Need a Valid path to the certificate (.p12) for PIX API
        self.certificate_path = os.getenv("EFI_PIX_CERTIFICATE_PATH", "")

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
