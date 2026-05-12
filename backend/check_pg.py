import psycopg2
conn = psycopg2.connect("postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b")
cur = conn.cursor()
cur.execute("SELECT id, default_group_id FROM crm_customer WHERE id = 46;")
print("Customer:", cur.fetchone())
cur.execute("SELECT * FROM crm_customer_group_link WHERE customer_id = 46;")
print("Links:", cur.fetchall())
