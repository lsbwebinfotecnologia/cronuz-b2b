import urllib.request
import json

try:
    with urllib.request.urlopen("http://localhost:8000/") as response:
        print("Connected to FastAPI:", response.read().decode())
except Exception as e:
    print("Cannot connect to generic endpoint:", e)

# How do I get a token to fetch orders?
# In test_db.py or something? No, I'll bypass auth just for this test!
# I can patch the endpoint manually.
