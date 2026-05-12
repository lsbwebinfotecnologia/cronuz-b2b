import requests
import psycopg2

conn = psycopg2.connect("postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b")
cur = conn.cursor()
cur.execute("SELECT id, email, password_hash FROM cmp_user WHERE type = 'MASTER' LIMIT 1;")
user = cur.fetchone()

# Can't easily login without password. Let's just create a small fastAPI script to call the function directly!
