import requests

url = "http://localhost:8000/companies/3/horus/customers/09.586.600/0001-58/consignment/summary"

response = requests.get(url)
print('STATUS CODE:', response.status_code)
print('RESPONSE:', response.text)
