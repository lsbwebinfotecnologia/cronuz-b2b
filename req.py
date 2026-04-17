import requests
import os
token = os.popen("sqlite3 /Users/licivandosilva/.gemini/antigravity/scratch/cronuz-b2b/backend/test.db 'select token from something'").read()
# just do it via db
