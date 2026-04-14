import os
import tempfile
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives import serialization
from lxml import etree
import signxml
from signxml import XMLSigner

class NFSeCrypto:
    def __init__(self, pfx_path: str, password: str):
        self.pfx_path = pfx_path
        self.password = password.encode('utf-8')
        
        self.private_key = None
        self.certificate = None
        self._load_pfx()
        
    def _load_pfx(self):
        if not os.path.exists(self.pfx_path):
            raise FileNotFoundError(f"Certificado não encontrado em: {self.pfx_path}")
            
        with open(self.pfx_path, "rb") as f:
            pfx_data = f.read()

        # Extract cert and key
        # pkcs12.load_key_and_certificates returns (private_key, certificate, additional_certificates)
        private_key, certificate, additional_certificates = pkcs12.load_key_and_certificates(
            pfx_data,
            self.password
        )
        
        if not private_key or not certificate:
            raise ValueError("O PFX não contém a chave privada ou certificado válido.")
            
        self.private_key = private_key
        self.certificate = certificate
        
    def sign_xml(self, xml_element: etree._Element, reference_uri: str) -> etree._Element:
        """
        Assina a tag <infDPS> e envelopa na tag raiz
        """
        cert_pem = self.certificate.public_bytes(serialization.Encoding.PEM)
        key_pem = self.private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        
        # Padrão Nacional exige referência pelo atributo Id da infDPS (ex: "#DPS... ")
        # O XMLSigner do signxml processa as referências automaticamente se mapeadas
        
        signer = XMLSigner(
            method=signxml.methods.enveloped, 
            signature_algorithm="rsa-sha256", 
            digest_algorithm="sha256",
            c14n_algorithm="http://www.w3.org/2001/10/xml-exc-c14n#"
        )
        signer.namespaces = {None: signxml.namespaces.ds} # Força a assinatura a usar default namespace ao invés do prefixo ds:
        signed_root = signer.sign(xml_element, key=key_pem, cert=cert_pem, reference_uri=reference_uri)
        return signed_root

    def create_mtls_temp_files(self):
        """
        Retorna o contexto (cert_path, key_path) gerado no disco virtual local (/tmp) para injetar no httpx.
        Você DEVE apagar esses arquivos após a chamada (use um manager ou try/finally no worker).
        """
        cert_pem = self.certificate.public_bytes(serialization.Encoding.PEM)
        key_pem = self.private_key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption()
        )
        
        fd_cert, cert_path = tempfile.mkstemp(suffix=".pem")
        os.write(fd_cert, cert_pem)
        os.close(fd_cert)
        
        fd_key, key_path = tempfile.mkstemp(suffix=".pem")
        os.write(fd_key, key_pem)
        os.close(fd_key)
        
        return cert_path, key_path
