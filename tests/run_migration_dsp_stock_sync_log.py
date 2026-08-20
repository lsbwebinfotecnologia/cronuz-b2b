#!/usr/bin/env python3
"""
Script de migration: cria a tabela dsp_stock_sync_log no banco local.
Uso: python3 tests/run_migration_dsp_stock_sync_log.py
"""
import psycopg2

DSN = "postgresql://cronuz_admin:cronuz_password_123@localhost:5432/cronuz_b2b"

SQL_MIGRATION = """
CREATE TABLE IF NOT EXISTS dsp_stock_sync_log (
    id             SERIAL PRIMARY KEY,
    company_id     INTEGER NOT NULL REFERENCES cmp_company(id),
    triggered_by   VARCHAR(20) NOT NULL DEFAULT 'manual',
    status         VARCHAR(20) NOT NULL,
    data_ini       VARCHAR(30),
    data_fim       VARCHAR(30),
    skus_sent      INTEGER NOT NULL DEFAULT 0,
    items_payload  JSONB,
    hub_response   JSONB,
    error_msg      TEXT,
    executed_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dsp_stock_sync_log_company    ON dsp_stock_sync_log(company_id);
CREATE INDEX IF NOT EXISTS idx_dsp_stock_sync_log_executed_at ON dsp_stock_sync_log(executed_at);
"""

def main():
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    cur = conn.cursor()

    print("Executando migration dsp_stock_sync_log...")
    cur.execute(SQL_MIGRATION)
    print("Migration aplicada com sucesso!\n")

    print("--- Verificando colunas via information_schema ---")
    cur.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'dsp_stock_sync_log'
        ORDER BY ordinal_position;
    """)
    rows = cur.fetchall()
    print(f"Total de colunas: {len(rows)}\n")
    print(f"{'COLUNA':<20} {'TIPO':<25} {'NULLABLE':<10} DEFAULT")
    print("-" * 90)
    for r in rows:
        print(f"{r[0]:<20} {r[1]:<25} {r[2]:<10} {str(r[3] or '')[:40]}")

    print("\n--- Verificando índices ---")
    cur.execute("""
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'dsp_stock_sync_log';
    """)
    for idx in cur.fetchall():
        print(f"  {idx[0]}:\n    {idx[1]}")

    cur.close()
    conn.close()
    print("\nConexão encerrada. Migration concluída com sucesso.")

if __name__ == "__main__":
    main()
