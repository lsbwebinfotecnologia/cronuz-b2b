import requests
import sys

# Get token
token_res = requests.post("http://localhost:8000/login", data={"username":"admin@cronuz.com.br", "password":"password123"})
if token_res.status_code != 200:
    print("Could not login:", token_res.status_code)
    # We don't know the password, let's bypass auth if we want to trace. 
    # Actually, uvicorn terminal prints stack traces for 500!
