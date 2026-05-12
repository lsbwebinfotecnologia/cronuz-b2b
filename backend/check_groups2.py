import psycopg2
conn = psycopg2.connect("postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b")
cur = conn.cursor()
cur.execute("SELECT * FROM crm_customer_group;")
print("Groups:", cur.fetchall())
