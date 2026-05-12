import os
import psycopg2

conn = psycopg2.connect(
    dbname=os.environ.get('DB_NAME', 'cronuz'),
    user=os.environ.get('DB_USER', 'postgres'),
    password=os.environ.get('DB_PASSWORD', 'admin123'),
    host=os.environ.get('DB_HOST', 'localhost'),
    port=os.environ.get('DB_PORT', '5432')
)
cur = conn.cursor()
cur.execute("SELECT xml_retorno FROM nfse_queues WHERE status='SUCCESS' ORDER BY id DESC LIMIT 1")
row = cur.fetchone()
if row and row[0]:
    with open('sample_nfse.xml', 'w') as f:
        f.write(row[0])
    print("Salvo em sample_nfse.xml")
else:
    print("Not found")
