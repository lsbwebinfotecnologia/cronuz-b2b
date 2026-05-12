import re
with open("backend/nohup.out", "r") as f:
    pass # Wait, uvicorn might log to terminal, nohup.out was not found earlier.
