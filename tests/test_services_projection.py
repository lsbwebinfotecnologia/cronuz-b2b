import unittest
from datetime import date
from dateutil.relativedelta import relativedelta

class TestServicesProjection(unittest.TestCase):
    def test_series_length_and_labels(self):
        PT_MONTHS = ["", "Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"]
        today = date(2026, 10, 5)
        current_month_start = today.replace(day=1)
        months_past = 3
        months_future = 12

        series = []
        for i in range(-months_past, months_future + 1):
            m_date = current_month_start + relativedelta(months=i)
            key = m_date.strftime("%Y-%m")
            label = f"{PT_MONTHS[m_date.month]}/{m_date.strftime('%y')}"
            is_current = (i == 0)
            is_past = (i < 0)
            is_future = (i > 0)
            series.append({
                "key": key,
                "label": label,
                "is_current": is_current,
                "is_past": is_past,
                "is_future": is_future
            })

        # Total de 3 anteriores + 1 atual + 12 futuros = 16 meses
        self.assertEqual(len(series), 16)
        self.assertEqual(series[0]["key"], "2026-07")
        self.assertEqual(series[0]["label"], "Jul/26")
        self.assertTrue(series[0]["is_past"])
        
        self.assertEqual(series[3]["key"], "2026-10")
        self.assertEqual(series[3]["label"], "Out/26")
        self.assertTrue(series[3]["is_current"])
        
        self.assertEqual(series[-1]["key"], "2027-10")
        self.assertEqual(series[-1]["label"], "Out/27")
        self.assertTrue(series[-1]["is_future"])

if __name__ == '__main__':
    unittest.main()
