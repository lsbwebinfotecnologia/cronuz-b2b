import unittest
from app.api.master_sessions import _parse_device, _format_document

class TestMasterSessionsHelpers(unittest.TestCase):
    def test_parse_device(self):
        self.assertEqual(_parse_device(None), 'Desconhecido')
        self.assertEqual(_parse_device('okhttp/4.9.2 (CronuzMobile Android 13)'), 'App Mobile Cronuz')
        self.assertEqual(_parse_device('Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1'), 'iOS / Safari')
        self.assertEqual(_parse_device('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36 Edg/115.0.1901.188'), 'Microsoft Edge')
        self.assertEqual(_parse_device('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36'), 'Google Chrome')
        self.assertEqual(_parse_device('Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:109.0) Gecko/20100101 Firefox/115.0'), 'Mozilla Firefox')

    def test_format_document(self):
        self.assertIsNone(_format_document(None))
        self.assertEqual(_format_document('12345678901'), '123.456.789-01')
        self.assertEqual(_format_document('12345678000195'), '12.345.678/0001-95')
        self.assertEqual(_format_document('123'), '123')

if __name__ == '__main__':
    unittest.main()
