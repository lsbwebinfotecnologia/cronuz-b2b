import requests

url = "http://localhost:8000/subscriptions/hotsite/domain"
try:
    print("Testing without token...")
    resp = requests.get(url)
    print("Without token:", resp.status_code, resp.text)
except Exception as e:
    print("Error:", e)

