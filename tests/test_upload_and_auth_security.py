import io
import asyncio
import unittest
from fastapi import UploadFile, HTTPException
from app.core.upload_security import (
    validate_file_size_and_extension,
    sanitize_filename,
    read_file_safely,
    MAX_IMAGE_SIZE_BYTES,
    MAX_SHEET_SIZE_BYTES,
)

class TestUploadSecurity(unittest.TestCase):
    def test_sanitize_filename(self):
        self.assertEqual(sanitize_filename("../../etc/passwd.jpg"), "passwd.jpg")
        self.assertEqual(sanitize_filename("..\\..\\malicious_script.php.png"), "malicious_script_php.png")
        self.assertEqual(sanitize_filename("meu arquivo de teste 123!@#.pdf"), "meu_arquivo_de_teste_123.pdf")
        self.assertEqual(sanitize_filename(""), "unnamed_file")

    def test_validate_image_extension_allowed(self):
        file = UploadFile(filename="foto_produto.webp", file=io.BytesIO(b"fake image data"))
        clean_name = validate_file_size_and_extension(file, category="image")
        self.assertEqual(clean_name, "foto_produto.webp")

    def test_validate_image_extension_rejected(self):
        file = UploadFile(filename="script.exe", file=io.BytesIO(b"fake data"))
        with self.assertRaises(HTTPException) as ctx:
            validate_file_size_and_extension(file, category="image")
        self.assertEqual(ctx.exception.status_code, 400)
        self.assertIn("Extensão de arquivo não permitida", ctx.exception.detail)

    def test_validate_file_size_exceeded_header(self):
        # 6MB (exceeds 5MB image limit)
        large_bytes = b"0" * (6 * 1024 * 1024)
        file = UploadFile(filename="capa.jpg", file=io.BytesIO(large_bytes), size=len(large_bytes))
        with self.assertRaises(HTTPException) as ctx:
            validate_file_size_and_extension(file, category="image")
        self.assertEqual(ctx.exception.status_code, 413)
        self.assertIn("limite máximo permitido", ctx.exception.detail)

    def test_read_file_safely_streaming_limit(self):
        async def _run():
            # 11MB stream (exceeds 10MB limit)
            oversized_data = b"X" * (11 * 1024 * 1024)
            file = UploadFile(filename="planilha_gigante.xlsx", file=io.BytesIO(oversized_data))
            with self.assertRaises(HTTPException) as ctx:
                await read_file_safely(file, max_size_bytes=MAX_SHEET_SIZE_BYTES)
            self.assertEqual(ctx.exception.status_code, 413)
            self.assertIn("ultrapassou o limite máximo", ctx.exception.detail)
        asyncio.run(_run())

if __name__ == "__main__":
    unittest.main()
