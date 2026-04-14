import requests
import sys

BASE_URL = "http://localhost:8000"

def login():
    res = requests.post(
        f"{BASE_URL}/token",
        data={"username": "admin@cronuz.com", "password": "123", "grant_type": "password"}
    )
    if not res.ok:
        # maybe password is '123456'
        res = requests.post(
            f"{BASE_URL}/token",
            data={"username": "admin@cronuz.com", "password": "123456", "grant_type": "password"}
        )
    if not res.ok:
        print("Login falhou:", res.text)
        sys.exit(1)
    return res.json()["access_token"]

def main():
    token = login()
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    
    # 1. Fetch Print Points for the company to know which one to pick
    # Company is injected via JWT
    
    res = requests.get(f"{BASE_URL}/print_points", headers=headers)
    if not res.ok:
        print("Failed to get print points:", res.text)
        sys.exit(1)
        
    pts = res.json()
    if not pts:
        print("No print points found.")
        sys.exit(1)
        
    pid = pts[0]["id"]
    print(f"Using Print Point ID: {pid}")

    # Forcing OS 21 to NOT_ISSUED first via API bypass, or just try billing it again if needed.
    # Actually, just hitting the issue endpoint directly.
    payload = {
        "order_ids": [21],
        "print_point_id": pid
    }
    
    print("Enviando requisição de Emissão...")
    res = requests.post(f"{BASE_URL}/service-orders/bulk/issue-nf", json=payload, headers=headers)
    
    print("Status Code:", res.status_code)
    print("Response JSON:", res.text)

if __name__ == "__main__":
    main()
