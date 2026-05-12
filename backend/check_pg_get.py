import requests
# Mock a login to get token
try:
    res = requests.post("http://localhost:8000/token", data={"username": "crz@seller.com.br", "password": "123"})
    print(res.text) # Probably fails since we don't have the right creds
except Exception as e:
    print(e)
