import unittest
from datetime import date

class TestServicesProjection(unittest.TestCase):
    def test_series_length_and_labels(self):
        PT_MONTHS = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
        target_year = 2026
        today = date(2026, 10, 5)

        series = []
        for m in range(1, 13):
            m_date = date(target_year, m, 1)
            key = m_date.strftime("%Y-%m")
            prev_key = f"{target_year - 1}-{m:02d}"
            label = f"{PT_MONTHS[m]}/{str(target_year)[2:]}"
            is_current = (key == today.strftime("%Y-%m"))
            series.append({
                "key": key,
                "prev_key": prev_key,
                "label": label,
                "is_current": is_current
            })

        # Exatamente 12 meses (Jan a Dez) do ano selecionado
        self.assertEqual(len(series), 12)
        self.assertEqual(series[0]["key"], "2026-01")
        self.assertEqual(series[0]["prev_key"], "2025-01")
        self.assertEqual(series[0]["label"], "Jan/26")
        
        self.assertEqual(series[9]["key"], "2026-10")
        self.assertEqual(series[9]["prev_key"], "2025-10")
        self.assertEqual(series[9]["label"], "Out/26")
        self.assertTrue(series[9]["is_current"])
        
        self.assertEqual(series[11]["key"], "2026-12")
        self.assertEqual(series[11]["prev_key"], "2025-12")
        self.assertEqual(series[11]["label"], "Dez/26")

if __name__ == '__main__':
    unittest.main()
