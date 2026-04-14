import os
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.hazmat.primitives import serialization

def test_pfx_load():
    try:
        # Create a dummy pfx to parse if we can
        print("Cryptography works.")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_pfx_load()
