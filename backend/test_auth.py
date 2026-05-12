import requests
import json

try:
    res = requests.post("http://localhost:8000/token", data={"username": "crz@seller.com.br", "password": "123"})
    token = res.json().get("access_token")
    if token:
        res2 = requests.get("http://localhost:8000/customers/groups", headers={"Authorization": f"Bearer {token}"})
        print(res2.status_code)
        print(res2.text)
    else:
        print("Login failed:", res.text)
except Exception as e:
    print(e)
