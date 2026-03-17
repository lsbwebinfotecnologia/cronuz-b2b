import psycopg2

conn = psycopg2.connect("postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b")
cur = conn.cursor()
try:
    cur.execute("ALTER TABLE ord_interaction ADD COLUMN IF NOT EXISTS read_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;")
    conn.commit()
    print("Column read_at added to ord_interaction.")
except Exception as e:
    print("Error:", e)
finally:
    cur.close()
    conn.close()
