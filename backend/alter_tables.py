import sqlite3

conn = sqlite3.connect('cronuz_b2b.db')
c = conn.cursor()

try:
    c.execute("ALTER TABLE cmp_company ADD COLUMN nfse_default_print_point_id INTEGER REFERENCES cmp_print_point(id)")
    print("Added nfse_default_print_point_id to cmp_company")
except Exception as e:
    print(f"Skipped cmp_company: {e}")

try:
    c.execute("ALTER TABLE svc_nfse_queue ADD COLUMN print_point_id INTEGER REFERENCES cmp_print_point(id)")
    print("Added print_point_id to svc_nfse_queue")
except Exception as e:
    print(f"Skipped svc_nfse_queue: {e}")

conn.commit()
conn.close()
